/*
  Site language (PT / EN / FR).

  Markup opts in through attributes, so no page wiring is needed:
    data-i18n="key"              -> element text ( <em> inside a string is kept )
    data-i18n-vars='{"a":"b"}'   -> values for {placeholders} in that string
    data-i18n-placeholder="key"  -> input placeholder
    data-i18n-label="key"        -> aria-label
    data-lang-picker             -> container that receives the PT/EN/FR switch

  For text built at runtime use I18n.setText(el, key, vars): it stores the key on
  the element, so the string follows later language changes on its own.
*/
(function (global) {
  "use strict";

  var STORAGE_KEY = "spelling-practice.lang";
  var FALLBACK = "en";

  var LANGUAGES = [
    { code: "pt", label: "PT", name: "Português" },
    { code: "en", label: "EN", name: "English" },
    { code: "fr", label: "FR", name: "Français" }
  ];

  var STRINGS = {
    en: {
      "nav.letters": "Letters",
      "nav.streets": "Streets",
      "lang.aria": "Site language",

      "btn.start": "Start",
      "btn.replay": "Replay",
      "btn.stop": "Stop",
      "btn.skip": "Skip",
      "btn.check": "Check",

      "stats.correct": "Correct",
      "stats.missed": "Missed",
      "stats.streak": "Streak",
      "stats.accuracy": "Accuracy",

      "common.pressStart": "Press Start to begin.",
      "common.correct": "Correct.",
      "common.stopped": "Stopped.",
      "common.stoppedScore": "Stopped — {correct} of {total} correct.",
      "common.warnNoEngine": "No speech engine is available, so no audio can play.",
      "common.speechError": "Speech service: {message}",

      "letters.title": "Letters — Spelling Practice",
      "letters.eyebrow": "Drill 01 — Alphabet",
      "letters.h1": "One letter at a time, until it <em>sticks</em>.",
      "letters.lead": "A letter is read aloud. Type what you hear and press Enter — the next one follows on its own.",
      "letters.inputLabel": "Letter you heard",
      "letters.prompt": "Which letter did you hear?",
      "letters.invalid": "Type a single letter from A to Z.",
      "letters.wrong": "It was {answer} — you typed {typed}.",

      "streets.title": "Streets — Spelling Practice",
      "streets.eyebrow": "Drill 02 — Street names",
      "streets.h1": "Heard once, then spelled <em>out loud</em>.",
      "streets.lead": "Each name is read, then spelled letter by letter. Write it down and press Enter — or skip to see the answer.",
      "streets.inputLabel": "Street name",
      "streets.placeholder": "Type what you heard",
      "streets.prompt": "Type the street name you heard.",
      "streets.empty": "Type what you heard first, or press Skip.",
      "streets.typed": "You typed “{typed}”.",
      "streets.skipped": "Skipped.",
      "streets.credit": "Street names from",

      "voice.panel": "Voice & speed",
      "voice.speed": "Speed",
      "voice.language": "Language",
      "voice.voice": "Voice",
      "voice.slower": "Slower",
      "voice.faster": "Faster",
      "voice.noteAzure": "{count} Azure neural voices available.",
      "voice.noteBrowser": "{count} browser voices available.",
      "voice.noteFail": "Could not reach the Azure Speech service, so no voices are listed.",
      "voice.noteNone": "No voices available from the current speech engine.",
      "voice.groupTested": "Clearest for spelling (tested)",
      "voice.groupOther": "Other voices (not tested)",
      "voice.testedNote": "The top group was measured reading single letters out loud; the rest were not checked."
    },

    pt: {
      "nav.letters": "Letras",
      "nav.streets": "Ruas",
      "lang.aria": "Idioma do site",

      "btn.start": "Começar",
      "btn.replay": "Repetir",
      "btn.stop": "Parar",
      "btn.skip": "Saltar",
      "btn.check": "Verificar",

      "stats.correct": "Certas",
      "stats.missed": "Erradas",
      "stats.streak": "Seguidas",
      "stats.accuracy": "Precisão",

      "common.pressStart": "Carregue em Começar para iniciar.",
      "common.correct": "Certo.",
      "common.stopped": "Parado.",
      "common.stoppedScore": "Parado — {correct} de {total} certas.",
      "common.warnNoEngine": "Não há motor de fala disponível, por isso não sai áudio.",
      "common.speechError": "Serviço de fala: {message}",

      "letters.title": "Letras — Spelling Practice",
      "letters.eyebrow": "Exercício 01 — Alfabeto",
      "letters.h1": "Uma letra de cada vez, até <em>fixar</em>.",
      "letters.lead": "Uma letra é lida em voz alta. Escreva o que ouvir e carregue em Enter — a seguinte vem sozinha.",
      "letters.inputLabel": "Letra que ouviu",
      "letters.prompt": "Que letra ouviu?",
      "letters.invalid": "Escreva uma única letra de A a Z.",
      "letters.wrong": "Era {answer} — escreveu {typed}.",

      "streets.title": "Ruas — Spelling Practice",
      "streets.eyebrow": "Exercício 02 — Nomes de ruas",
      "streets.h1": "Ouvido uma vez, depois soletrado <em>em voz alta</em>.",
      "streets.lead": "Cada nome é lido e depois soletrado letra a letra. Escreva-o e carregue em Enter — ou salte para ver a resposta.",
      "streets.inputLabel": "Nome da rua",
      "streets.placeholder": "Escreva o que ouviu",
      "streets.prompt": "Escreva o nome da rua que ouviu.",
      "streets.empty": "Escreva primeiro o que ouviu, ou carregue em Saltar.",
      "streets.typed": "Escreveu “{typed}”.",
      "streets.skipped": "Saltado.",
      "streets.credit": "Nomes de ruas de",

      "voice.panel": "Voz e velocidade",
      "voice.speed": "Velocidade",
      "voice.language": "Idioma",
      "voice.voice": "Voz",
      "voice.slower": "Mais devagar",
      "voice.faster": "Mais rápido",
      "voice.noteAzure": "{count} vozes neurais do Azure disponíveis.",
      "voice.noteBrowser": "{count} vozes do navegador disponíveis.",
      "voice.noteFail": "Não foi possível contactar o serviço Azure Speech, por isso não há vozes listadas.",
      "voice.noteNone": "Não há vozes disponíveis no motor de fala atual.",
      "voice.groupTested": "Mais claras a soletrar (testadas)",
      "voice.groupOther": "Outras vozes (não testadas)",
      "voice.testedNote": "O grupo de cima foi medido a ler letras isoladas; as restantes não foram verificadas."
    },

    fr: {
      "nav.letters": "Lettres",
      "nav.streets": "Rues",
      "lang.aria": "Langue du site",

      "btn.start": "Démarrer",
      "btn.replay": "Réécouter",
      "btn.stop": "Arrêter",
      "btn.skip": "Passer",
      "btn.check": "Vérifier",

      "stats.correct": "Correctes",
      "stats.missed": "Manquées",
      "stats.streak": "Série",
      "stats.accuracy": "Précision",

      "common.pressStart": "Appuyez sur Démarrer pour commencer.",
      "common.correct": "Correct.",
      "common.stopped": "Arrêté.",
      "common.stoppedScore": "Arrêté — {correct} sur {total} correctes.",
      "common.warnNoEngine": "Aucun moteur vocal n’est disponible, aucun son ne peut être joué.",
      "common.speechError": "Service vocal : {message}",

      "letters.title": "Lettres — Spelling Practice",
      "letters.eyebrow": "Exercice 01 — Alphabet",
      "letters.h1": "Une lettre à la fois, jusqu’à ce qu’elle <em>reste</em>.",
      "letters.lead": "Une lettre est lue à voix haute. Tapez ce que vous entendez et appuyez sur Entrée — la suivante arrive toute seule.",
      "letters.inputLabel": "Lettre entendue",
      "letters.prompt": "Quelle lettre avez-vous entendue ?",
      "letters.invalid": "Tapez une seule lettre de A à Z.",
      "letters.wrong": "C’était {answer} — vous avez tapé {typed}.",

      "streets.title": "Rues — Spelling Practice",
      "streets.eyebrow": "Exercice 02 — Noms de rues",
      "streets.h1": "Entendu une fois, puis épelé <em>à voix haute</em>.",
      "streets.lead": "Chaque nom est lu, puis épelé lettre par lettre. Écrivez-le et appuyez sur Entrée — ou passez pour voir la réponse.",
      "streets.inputLabel": "Nom de rue",
      "streets.placeholder": "Tapez ce que vous avez entendu",
      "streets.prompt": "Tapez le nom de rue que vous avez entendu.",
      "streets.empty": "Tapez d’abord ce que vous avez entendu, ou appuyez sur Passer.",
      "streets.typed": "Vous avez tapé « {typed} ».",
      "streets.skipped": "Passé.",
      "streets.credit": "Noms de rues de",

      "voice.panel": "Voix et vitesse",
      "voice.speed": "Vitesse",
      "voice.language": "Langue",
      "voice.voice": "Voix",
      "voice.slower": "Plus lent",
      "voice.faster": "Plus rapide",
      "voice.noteAzure": "{count} voix neuronales Azure disponibles.",
      "voice.noteBrowser": "{count} voix du navigateur disponibles.",
      "voice.noteFail": "Impossible de joindre le service Azure Speech, aucune voix n’est listée.",
      "voice.noteNone": "Aucune voix disponible dans le moteur vocal actuel.",
      "voice.groupTested": "Les plus claires pour épeler (testées)",
      "voice.groupOther": "Autres voix (non testées)",
      "voice.testedNote": "Le groupe du haut a été mesuré en lisant des lettres isolées ; les autres n’ont pas été vérifiées."
    }
  };

  var listeners = [];
  var current = detect();

  function supported(code) {
    return LANGUAGES.some(function (lang) { return lang.code === code; });
  }

  function detect() {
    var saved;
    try { saved = global.localStorage.getItem(STORAGE_KEY); } catch (err) { saved = null; }
    if (supported(saved)) return saved;
    var preferred = (global.navigator.languages || [global.navigator.language || ""]);
    for (var i = 0; i < preferred.length; i++) {
      var code = String(preferred[i]).slice(0, 2).toLowerCase();
      if (supported(code)) return code;
    }
    return FALLBACK;
  }

  function t(key, vars) {
    var table = STRINGS[current] || STRINGS[FALLBACK];
    var text = table[key];
    if (text === undefined) text = STRINGS[FALLBACK][key];
    if (text === undefined) return key;
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, function (match, name) {
      return vars[name] === undefined ? match : vars[name];
    });
  }

  // Builds the string as nodes so <em> survives without touching innerHTML.
  function renderInto(el, text) {
    el.textContent = "";
    String(text).split(/(<em>[\s\S]*?<\/em>)/).forEach(function (part) {
      if (!part) return;
      var emphasis = /^<em>([\s\S]*?)<\/em>$/.exec(part);
      if (emphasis) {
        var em = document.createElement("em");
        em.textContent = emphasis[1];
        el.appendChild(em);
      } else {
        el.appendChild(document.createTextNode(part));
      }
    });
  }

  function varsOf(el) {
    if (!el.dataset.i18nVars) return null;
    try { return JSON.parse(el.dataset.i18nVars); } catch (err) { return null; }
  }

  function translate(el) {
    renderInto(el, t(el.dataset.i18n, varsOf(el)));
  }

  function setText(el, key, vars) {
    if (!el) return;
    el.dataset.i18n = key;
    if (vars) el.dataset.i18nVars = JSON.stringify(vars);
    else delete el.dataset.i18nVars;
    translate(el);
  }

  function apply(root) {
    var scope = root || document;
    Array.prototype.forEach.call(scope.querySelectorAll("[data-i18n]"), translate);
    Array.prototype.forEach.call(scope.querySelectorAll("[data-i18n-placeholder]"), function (el) {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    Array.prototype.forEach.call(scope.querySelectorAll("[data-i18n-label]"), function (el) {
      el.setAttribute("aria-label", t(el.dataset.i18nLabel));
    });
    document.documentElement.lang = current;
  }

  function set(code) {
    if (!supported(code) || code === current) return;
    current = code;
    try { global.localStorage.setItem(STORAGE_KEY, code); } catch (err) { /* private mode */ }
    apply();
    listeners.forEach(function (fn) { fn(code); });
  }

  function mountPicker(container) {
    var group = document.createElement("div");
    group.className = "lang-picker";
    group.setAttribute("role", "group");
    group.dataset.i18nLabel = "lang.aria";

    LANGUAGES.forEach(function (lang) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = lang.label;
      button.title = lang.name;
      button.dataset.lang = lang.code;
      button.addEventListener("click", function () { set(lang.code); });
      group.appendChild(button);
    });

    container.appendChild(group);

    function sync() {
      Array.prototype.forEach.call(group.children, function (button) {
        button.setAttribute("aria-pressed", String(button.dataset.lang === current));
      });
    }
    listeners.push(sync);
    sync();
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-lang-picker]"), mountPicker);
    apply();
  }

  global.I18n = {
    t: t,
    apply: apply,
    setText: setText,
    set: set,
    get: function () { return current; },
    languages: LANGUAGES.slice(),
    onChange: function (fn) { listeners.push(fn); }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window);
