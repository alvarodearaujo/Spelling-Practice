/*
  Voice controls: speed stepper, language picker, voice picker.
  Mount with SpeechSettings.mount(container, { onChange: fn }).
  Choices are persisted by speech.js; onChange fires so the page can re-speak.
*/
(function (global) {
  "use strict";

  var TEMPLATE =
    '<summary><span>Voice &amp; speed</span><span class="sign" aria-hidden="true">+</span></summary>' +
    '<div class="voice-fields">' +
    '  <div class="field">' +
    '    <label for="vp-rate"><span>Speed</span></label>' +
    '    <div class="stepper">' +
    '      <button type="button" data-step="-1" aria-label="Slower">&minus;</button>' +
    '      <input type="range" id="vp-rate" min="0.5" max="1.5" step="0.05">' +
    '      <button type="button" data-step="1" aria-label="Faster">+</button>' +
    '      <output for="vp-rate" id="vp-rate-out"></output>' +
    '    </div>' +
    '  </div>' +
    '  <div class="field">' +
    '    <label for="vp-lang"><span>Language</span></label>' +
    '    <select id="vp-lang" disabled><option>Loading…</option></select>' +
    '  </div>' +
    '  <div class="field">' +
    '    <label for="vp-voice"><span>Voice</span></label>' +
    '    <select id="vp-voice" disabled><option>Loading…</option></select>' +
    '  </div>' +
    '  <p class="voice-note" id="vp-note"></p>' +
    '</div>';

  var displayNames = null;
  if (global.Intl && Intl.DisplayNames) {
    try { displayNames = new Intl.DisplayNames(undefined, { type: "language" }); } catch (err) { displayNames = null; }
  }

  function localeLabel(locale) {
    if (!displayNames) return locale;
    try { return (displayNames.of(locale) || locale) + " · " + locale; } catch (err) { return locale; }
  }

  function voiceLabel(voice) {
    return voice.gender ? voice.name + " · " + voice.gender : voice.name;
  }

  function fill(select, items, selectedValue) {
    select.textContent = "";
    items.forEach(function (item) {
      var option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      select.appendChild(option);
    });
    select.value = selectedValue;
    if (select.selectedIndex < 0 && items.length) select.selectedIndex = 0;
    select.disabled = !items.length;
  }

  function mount(container, options) {
    var speech = global.Speech;
    if (!container || !speech) return;
    var onChange = (options && options.onChange) || function () {};

    var panel = document.createElement("details");
    panel.className = "voice-panel";
    panel.innerHTML = TEMPLATE;
    container.appendChild(panel);

    var rate = panel.querySelector("#vp-rate");
    var rateOut = panel.querySelector("#vp-rate-out");
    var langSelect = panel.querySelector("#vp-lang");
    var voiceSelect = panel.querySelector("#vp-voice");
    var note = panel.querySelector("#vp-note");
    var limits = speech.rateLimits();
    var byLocale = {};

    rate.min = limits.min;
    rate.max = limits.max;
    rate.value = speech.getRate();
    showRate();

    function showRate() {
      rateOut.textContent = Number(rate.value).toFixed(2) + "\u00d7";
    }

    function commitRate(value) {
      rate.value = speech.setRate(value);
      showRate();
      onChange();
    }

    rate.addEventListener("input", showRate);
    rate.addEventListener("change", function () { commitRate(rate.value); });

    panel.querySelectorAll(".stepper button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        commitRate(Number(rate.value) + Number(btn.dataset.step) * 0.1);
      });
    });

    function renderVoices(locale) {
      var voices = byLocale[locale] || [];
      fill(voiceSelect, voices.map(function (v) {
        return { value: v.id, label: voiceLabel(v) };
      }), speech.getVoice());
      if (voiceSelect.value) speech.setVoice(voiceSelect.value);
    }

    langSelect.addEventListener("change", function () {
      speech.setLanguage(langSelect.value);
      renderVoices(langSelect.value);
      onChange();
    });

    voiceSelect.addEventListener("change", function () {
      speech.setVoice(voiceSelect.value);
      onChange();
    });

    speech.listVoices().then(function (voices) {
      if (!voices.length) {
        langSelect.textContent = voiceSelect.textContent = "";
        note.textContent = speech.usingAzure()
          ? "Could not reach the Azure Speech service, so no voices are listed."
          : "No voices available from the current speech engine.";
        return;
      }

      voices.forEach(function (voice) {
        (byLocale[voice.locale] = byLocale[voice.locale] || []).push(voice);
      });

      var locales = Object.keys(byLocale)
        .map(function (code) { return { value: code, label: localeLabel(code) }; })
        .sort(function (a, b) { return a.label.localeCompare(b.label); });

      fill(langSelect, locales, speech.getLanguage());
      speech.setLanguage(langSelect.value);
      renderVoices(langSelect.value);
      note.textContent = speech.usingAzure()
        ? voices.length + " Azure neural voices available."
        : voices.length + " browser voices available.";
    });
  }

  global.SpeechSettings = { mount: mount };
})(window);
