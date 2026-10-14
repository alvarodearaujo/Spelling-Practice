/*
  Speech service wrapper.

  When `window.SPEECH_CONFIG` has a region and a credential, Azure AI Speech is
  the only engine used: the voice list, the language list and playback all come
  from it, and failures are reported instead of silently switching engines.
  The browser's SpeechSynthesis is used only when Azure is not configured.

  API:
    Speech.isSupported()          -> boolean
    Speech.usingAzure()           -> boolean
    Speech.prime()                -> warms up the engine after a user gesture
    Speech.speak(text, opts)      -> Promise<boolean>, false when cancelled
                                     opts: {rate, asCharacters}
    Speech.speakSequence(parts)   -> one request for many parts; each part is
                                     {text, rate, asCharacters} or {pause: ms}
    Speech.cancel()               -> stops playback and settles pending speak()
    Speech.listVoices()           -> Promise<[{id, name, locale, gender}]>
    Speech.getRate() / setRate(n) -> global speed multiplier, 0.5-1.5
    Speech.getVoice() / setVoice(id)
    Speech.getLanguage() / setLanguage(locale)

  Voice, language and rate choices persist in localStorage.
*/
(function (global) {
  "use strict";

  var SDK_URL = "https://aka.ms/csspeech/jsbrowserpackageraw";
  var TOKEN_TTL_MS = 9 * 60 * 1000;
  var DEFAULT_VOICE = "en-US-JennyNeural";
  var DEFAULT_LANG = "en-US";
  var OBFUSCATION_PASS = "LetterListen";
  var PREFS_KEY = "spelling-practice.voice";
  var MIN_RATE = 0.5;
  var MAX_RATE = 1.5;

  var synth = global.speechSynthesis || null;
  var sdkPromise = null;
  var voicesPromise = null;
  var tokenPromise = null;
  var tokenExpiresAt = 0;
  var token = 0;          // bumped by cancel() so stale callbacks resolve false
  var player = null;      // active Azure speaker output
  var synthesizer = null;
  var activeFinish = null; // settles the in-flight Azure playback promise
  var prefs = loadPrefs();

  function config() { return global.SPEECH_CONFIG || {}; }

  function loadPrefs() {
    try {
      return JSON.parse(global.localStorage.getItem(PREFS_KEY)) || {};
    } catch (err) {
      return {};
    }
  }

  function savePrefs() {
    try {
      global.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (err) { /* private mode or storage full */ }
  }

  function currentVoice() { return prefs.voice || config().voice || DEFAULT_VOICE; }
  function currentLang() { return prefs.language || config().language || DEFAULT_LANG; }
  function currentRate() { return typeof prefs.rate === "number" ? prefs.rate : 1; }

  function clampRate(value) {
    return Math.min(MAX_RATE, Math.max(MIN_RATE, Number(value) || 1));
  }

  // Reversible XOR + base64 obfuscation: keeps the key out of plain sight only,
  // anyone with this file can recover it. Development use only.
  function decodeKey(encoded, passphrase) {
    var raw = global.atob(encoded);
    var pass = passphrase || OBFUSCATION_PASS;
    var out = "";
    for (var i = 0; i < raw.length; i++) {
      out += String.fromCharCode(raw.charCodeAt(i) ^ pass.charCodeAt(i % pass.length));
    }
    return out;
  }

  function subscriptionKey() {
    var c = config();
    if (c.subscriptionKey) return c.subscriptionKey;
    if (!c.subscriptionKeyEnc) return "";
    try {
      return decodeKey(c.subscriptionKeyEnc, c.keyPassphrase);
    } catch (err) {
      report(new Error("Could not decode subscriptionKeyEnc."));
      return "";
    }
  }

  function azureConfigured() {
    var c = config();
    return !!(c.region && (c.tokenEndpoint || c.subscriptionKey || c.subscriptionKeyEnc));
  }

  function report(err) {
    var c = config();
    if (typeof c.onError === "function") c.onError(err);
    else if (global.console) global.console.warn("[speech]", err && err.message ? err.message : err);
  }

  function loadSdk() {
    if (global.SpeechSDK) return Promise.resolve(global.SpeechSDK);
    if (!sdkPromise) {
      sdkPromise = new Promise(function (resolve, reject) {
        var el = document.createElement("script");
        el.src = config().sdkUrl || SDK_URL;
        el.async = true;
        el.onload = function () {
          if (global.SpeechSDK) resolve(global.SpeechSDK);
          else reject(new Error("Speech SDK loaded but did not register SpeechSDK."));
        };
        el.onerror = function () { reject(new Error("Could not download the Azure Speech SDK.")); };
        document.head.appendChild(el);
      }).catch(function (err) { sdkPromise = null; throw err; });
    }
    return sdkPromise;
  }

  function parseToken(body) {
    var text = String(body).trim();
    if (text.charAt(0) === "{") {
      var data = JSON.parse(text);
      text = String(data.token || data.access_token || "").trim();
    }
    if (!text) throw new Error("Token endpoint returned an empty token.");
    return text;
  }

  function getAuthToken() {
    var c = config();
    if (!c.tokenEndpoint) return Promise.resolve(null);
    if (tokenPromise && Date.now() < tokenExpiresAt) return tokenPromise;
    tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
    tokenPromise = fetch(c.tokenEndpoint, { method: "POST", credentials: c.tokenCredentials || "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("Token endpoint returned HTTP " + res.status + ".");
        return res.text();
      })
      .then(parseToken)
      .catch(function (err) { tokenPromise = null; tokenExpiresAt = 0; throw err; });
    return tokenPromise;
  }

  function buildSpeechConfig(SpeechSDK) {
    var c = config();
    return getAuthToken().then(function (authToken) {
      var sc = authToken
        ? SpeechSDK.SpeechConfig.fromAuthorizationToken(authToken, c.region)
        : SpeechSDK.SpeechConfig.fromSubscription(subscriptionKey(), c.region);
      sc.speechSynthesisVoiceName = currentVoice();
      sc.speechSynthesisLanguage = currentLang();
      return sc;
    });
  }

  var XML_ESCAPES = { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" };

  function partToSsml(part) {
    if (part.pause) return '<break time="' + Math.round(part.pause) + 'ms"/>';
    var percent = Math.round((clampRate((part.rate || 1) * currentRate()) - 1) * 100);
    var body = String(part.text).replace(/[<>&'"]/g, function (ch) { return XML_ESCAPES[ch]; });
    if (part.asCharacters) body = '<say-as interpret-as="characters">' + body + "</say-as>";
    return '<prosody rate="' + (percent >= 0 ? "+" : "") + percent + '%">' + body + "</prosody>";
  }

  function buildSsml(parts) {
    return '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="' + currentLang() + '">' +
      '<voice name="' + currentVoice() + '">' +
      parts.map(partToSsml).join("") +
      "</voice></speak>";
  }

  function speakAzure(parts, myToken) {
    return loadSdk()
      .then(buildSpeechConfig)
      .then(function (speechConfig) {
        if (myToken !== token) return false;
        return new Promise(function (resolve, reject) {
          var SpeechSDK = global.SpeechSDK;
          var dest = new SpeechSDK.SpeakerAudioDestination();
          var audioConfig = SpeechSDK.AudioConfig.fromSpeakerOutput(dest);
          var active = new SpeechSDK.SpeechSynthesizer(speechConfig, audioConfig);
          var settled = false;

          player = dest;
          synthesizer = active;

          function cleanup() {
            if (player === dest) player = null;
            if (synthesizer === active) synthesizer = null;
            if (activeFinish === finish) activeFinish = null;
            try { active.close(); } catch (e) { /* already closed */ }
          }
          function finish() { if (!settled) { settled = true; cleanup(); resolve(myToken === token); } }
          function fail(err) { if (!settled) { settled = true; cleanup(); reject(err); } }

          activeFinish = finish;
          dest.onAudioEnd = finish;

          active.speakSsmlAsync(buildSsml(parts), function (result) {
            if (result.reason === SpeechSDK.ResultReason.Canceled) {
              var details = SpeechSDK.CancellationDetails.fromResult(result);
              fail(new Error(details.errorDetails || "Azure cancelled the synthesis request."));
              return;
            }
            // onAudioEnd is the real end of playback; this is a safety net.
            setTimeout(finish, (result.audioDuration || 0) / 10000 + 600);
          }, function (err) { fail(new Error(String(err))); });
        });
      });
  }

  // The browser engine has no say-as, so letters are spelled phonetically.
  var LETTER_NAMES = {A:"ay",B:"bee",C:"see",D:"dee",E:"ee",F:"eff",G:"jee",H:"aitch",I:"eye",J:"jay",K:"kay",L:"ell",M:"em",N:"en",O:"oh",P:"pee",Q:"cue",R:"are",S:"ess",T:"tee",U:"you",V:"vee",W:"double you",X:"ex",Y:"why",Z:"zee"};

  function spellOut(text) {
    return String(text).toUpperCase().split("").map(function (ch) {
      return LETTER_NAMES[ch] || ch;
    }).join(", ");
  }

  function browserVoices() {
    return synth && synth.getVoices ? synth.getVoices() : [];
  }

  function speakUtterance(part, myToken) {
    return new Promise(function (resolve) {
      var utterance = new SpeechSynthesisUtterance(part.asCharacters ? spellOut(part.text) : part.text);
      var settled = false;
      var chosen = browserVoices().filter(function (v) { return v.name === currentVoice(); })[0];
      utterance.lang = currentLang();
      if (chosen) utterance.voice = chosen;
      utterance.rate = clampRate((part.rate || 1) * currentRate());
      utterance.onend = utterance.onerror = function () {
        if (!settled) { settled = true; resolve(myToken === token); }
      };
      synth.speak(utterance);
    });
  }

  // No SSML here, so the sequence is replayed one utterance at a time.
  function speakBrowser(parts, myToken) {
    if (!synth) return Promise.resolve(false);
    var index = 0;
    function next() {
      if (myToken !== token) return Promise.resolve(false);
      if (index >= parts.length) return Promise.resolve(true);
      var part = parts[index++];
      if (part.pause) {
        return new Promise(function (resolve) { setTimeout(resolve, part.pause); }).then(next);
      }
      return speakUtterance(part, myToken).then(function (finished) {
        return finished ? next() : false;
      });
    }
    return next();
  }

  /* One Azure request for the whole sequence; parts are {text, rate,
     asCharacters} or {pause: milliseconds}. */
  function speakSequence(parts) {
    var myToken = token;
    if (azureConfigured()) {
      return speakAzure(parts, myToken).catch(function (err) {
        report(err);
        return false;
      });
    }
    return speakBrowser(parts, myToken);
  }

  function speak(text, options) {
    return speakSequence([{
      text: text,
      rate: options && typeof options.rate === "number" ? options.rate : 1,
      asCharacters: !!(options && options.asCharacters)
    }]);
  }

  function cancel() {
    token++;
    if (player) {
      try { player.pause(); } catch (e) { /* no active audio */ }
      try { player.close(); } catch (e) { /* already closed */ }
      player = null;
    }
    if (synthesizer) {
      try { synthesizer.close(); } catch (e) { /* already closed */ }
      synthesizer = null;
    }
    // Without this the promise would wait for the whole clip's safety timer.
    if (activeFinish) {
      var settle = activeFinish;
      activeFinish = null;
      settle();
    }
    if (synth) synth.cancel();
  }

  function prime() {
    if (azureConfigured()) {
      loadSdk().then(function (SpeechSDK) { return buildSpeechConfig(SpeechSDK); }).catch(report);
    } else if (synth && synth.getVoices) {
      synth.getVoices();
    }
  }

  function azureVoices() {
    return loadSdk()
      .then(buildSpeechConfig)
      .then(function (speechConfig) {
        // A null audio config keeps this synthesizer silent; it only queries.
        var probe = new global.SpeechSDK.SpeechSynthesizer(speechConfig, null);
        return probe.getVoicesAsync().then(function (result) {
          probe.close();
          if (!result.voices || !result.voices.length) {
            throw new Error(result.errorDetails || "Azure returned no voices.");
          }
          return result.voices.map(function (v) {
            return { id: v.shortName, name: v.localName || v.shortName, locale: v.locale, gender: v.gender === 1 ? "female" : v.gender === 2 ? "male" : "" };
          });
        }, function (err) { probe.close(); throw new Error(String(err)); });
      });
  }

  function listBrowserVoices() {
    return new Promise(function (resolve) {
      var found = browserVoices();
      if (found.length) return resolve(found);
      // Chrome populates the list asynchronously on first call.
      var timer = setTimeout(done, 1500);
      function done() {
        clearTimeout(timer);
        synth.onvoiceschanged = null;
        resolve(browserVoices());
      }
      synth.onvoiceschanged = done;
    }).then(function (found) {
      return found.map(function (v) {
        return { id: v.name, name: v.name, locale: v.lang, gender: "" };
      });
    });
  }

  function listVoices() {
    if (voicesPromise) return voicesPromise;
    var wanted = azureConfigured()
      ? azureVoices().catch(function (err) { voicesPromise = null; report(err); return []; })
      : (synth ? listBrowserVoices() : Promise.resolve([]));
    voicesPromise = wanted.then(function (voices) {
      return voices.sort(function (a, b) {
        return a.locale.localeCompare(b.locale) || a.name.localeCompare(b.name);
      });
    });
    return voicesPromise;
  }

  global.Speech = {
    speak: speak,
    speakSequence: speakSequence,
    cancel: cancel,
    prime: prime,
    listVoices: listVoices,
    isSupported: function () { return azureConfigured() || !!synth; },
    usingAzure: azureConfigured,
    getRate: currentRate,
    setRate: function (value) { prefs.rate = clampRate(value); savePrefs(); return prefs.rate; },
    rateLimits: function () { return { min: MIN_RATE, max: MAX_RATE }; },
    getVoice: currentVoice,
    setVoice: function (id) { prefs.voice = id; savePrefs(); },
    getLanguage: currentLang,
    setLanguage: function (locale) { prefs.language = locale; savePrefs(); }
  };
})(window);
