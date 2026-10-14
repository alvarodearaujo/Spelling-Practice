/*
  Voice controls: speed stepper, language picker, voice picker.
  Mount with SpeechSettings.mount(container, { onChange: fn }).
  Choices are persisted by speech.js; onChange fires so the page can re-speak.
*/
(function (global) {
  "use strict";

  var TEMPLATE =
    '<summary><span data-i18n="voice.panel"></span><span class="sign" aria-hidden="true">+</span></summary>' +
    '<div class="voice-fields">' +
    '  <div class="field">' +
    '    <label for="vp-rate"><span data-i18n="voice.speed"></span></label>' +
    '    <div class="stepper">' +
    '      <button type="button" data-step="-1" data-i18n-label="voice.slower">&minus;</button>' +
    '      <input type="range" id="vp-rate" min="0.5" max="1.5" step="0.05">' +
    '      <button type="button" data-step="1" data-i18n-label="voice.faster">+</button>' +
    '      <output for="vp-rate" id="vp-rate-out"></output>' +
    '    </div>' +
    '  </div>' +
    '  <div class="field">' +
    '    <label for="vp-lang"><span data-i18n="voice.language"></span></label>' +
    '    <select id="vp-lang" disabled><option>Loading…</option></select>' +
    '  </div>' +
    '  <div class="field">' +
    '    <label for="vp-voice"><span data-i18n="voice.voice"></span></label>' +
    '    <select id="vp-voice" disabled><option>Loading…</option></select>' +
    '    <p class="voice-note tested" id="vp-tested"></p>' +
    '  </div>' +
    '  <p class="voice-note" id="vp-note"></p>' +
    '</div>';

  /* Voices measured for how loudly they read isolated letters (worst peak of
     A, I and U), best first. Anything below ~0.15 is too faint to spell with:
     fr-FR-Alain scored 0.015. Voices absent here were simply not measured. */
  var TESTED = {
    "en-GB": ["en-GB-SoniaNeural", "en-GB-OliviaNeural", "en-GB-LibbyNeural", "en-GB-RyanNeural", "en-GB-ThomasNeural", "en-GB-AbbiNeural"],
    "pt-PT": ["pt-PT-FernandaNeural", "pt-PT-RaquelNeural", "pt-PT-DuarteNeural"],
    "fr-FR": ["fr-FR-VivienneMultilingualNeural", "fr-FR-DeniseNeural"]
  };

  var displayCache = {};

  // Locale names follow the site language, not the browser's.
  function localeLabel(locale) {
    var lang = global.I18n.get();
    if (!(lang in displayCache)) {
      try { displayCache[lang] = new Intl.DisplayNames([lang], { type: "language" }); } catch (err) { displayCache[lang] = null; }
    }
    if (!displayCache[lang]) return locale;
    try { return (displayCache[lang].of(locale) || locale) + " · " + locale; } catch (err) { return locale; }
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

  function fillGroups(select, groups, selectedValue) {
    select.textContent = "";
    var count = 0;
    groups.forEach(function (group) {
      if (!group.items.length) return;
      var parent = select;
      if (group.label) {
        parent = document.createElement("optgroup");
        parent.label = group.label;
        select.appendChild(parent);
      }
      group.items.forEach(function (item) {
        var option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        parent.appendChild(option);
        count++;
      });
    });
    select.value = selectedValue;
    if (select.selectedIndex < 0 && count) select.selectedIndex = 0;
    select.disabled = !count;
  }

  function mount(container, options) {
    var speech = global.Speech;
    if (!container || !speech) return;
    var onChange = (options && options.onChange) || function () {};

    var panel = document.createElement("details");
    panel.className = "voice-panel";
    panel.innerHTML = TEMPLATE;
    container.appendChild(panel);
    global.I18n.apply(panel);

    var rate = panel.querySelector("#vp-rate");
    var rateOut = panel.querySelector("#vp-rate-out");
    var langSelect = panel.querySelector("#vp-lang");
    var voiceSelect = panel.querySelector("#vp-voice");
    var testedNote = panel.querySelector("#vp-tested");
    var note = panel.querySelector("#vp-note");
    var limits = speech.rateLimits();
    var byLocale = {};
    var loaded = false;
    var pendingLocale = null;

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
      var order = {};
      (TESTED[locale] || []).forEach(function (id, index) { order[id] = index; });

      var tested = voices.filter(function (v) { return order[v.id] !== undefined; })
        .sort(function (a, b) { return order[a.id] - order[b.id]; });
      var rest = voices.filter(function (v) { return order[v.id] === undefined; });
      var toItem = function (v) { return { value: v.id, label: voiceLabel(v) }; };

      fillGroups(voiceSelect, [
        { label: tested.length ? global.I18n.t("voice.groupTested") : "", items: tested.map(toItem) },
        { label: tested.length ? global.I18n.t("voice.groupOther") : "", items: rest.map(toItem) }
      ], speech.getVoice());

      if (tested.length) global.I18n.setText(testedNote, "voice.testedNote");
      else { delete testedNote.dataset.i18n; testedNote.textContent = ""; }

      if (voiceSelect.value) speech.setVoice(voiceSelect.value);
    }

    function applyLocale(locale, preferred) {
      var voices = byLocale[locale];
      if (!voices) return;
      langSelect.value = locale;
      speech.setLanguage(locale);
      // Only override the stored voice when it does not belong to this locale.
      var keep = voices.some(function (v) { return v.id === speech.getVoice(); });
      if (!keep) {
        var usePreferred = preferred && voices.some(function (v) { return v.id === preferred; });
        speech.setVoice(usePreferred ? preferred : "");
      }
      renderVoices(locale);
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
        global.I18n.setText(note, speech.usingAzure() ? "voice.noteFail" : "voice.noteNone");
        return;
      }

      voices.forEach(function (voice) {
        (byLocale[voice.locale] = byLocale[voice.locale] || []).push(voice);
      });

      function renderLocales() {
        var locales = Object.keys(byLocale)
          .map(function (code) { return { value: code, label: localeLabel(code) }; })
          .sort(function (a, b) { return a.label.localeCompare(b.label); });
        fill(langSelect, locales, speech.getLanguage());
      }

      renderLocales();
      global.I18n.onChange(renderLocales);
      loaded = true;
      if (pendingLocale) applyLocale(pendingLocale.locale, pendingLocale.voice);
      speech.setLanguage(langSelect.value);
      renderVoices(langSelect.value);
      global.I18n.setText(note, speech.usingAzure() ? "voice.noteAzure" : "voice.noteBrowser", { count: voices.length });
    });

    return {
      // Lets a page follow the site language; queued until the voices arrive.
      selectLocale: function (locale, preferred) {
        if (!loaded) { pendingLocale = { locale: locale, voice: preferred }; return; }
        applyLocale(locale, preferred);
      }
    };
  }

  global.SpeechSettings = { mount: mount };
})(window);
