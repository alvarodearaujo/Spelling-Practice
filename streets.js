/*
  Street names per site language.

  Real names come from OpenStreetMap through the Overpass API, one bounding box
  per language. That service is volunteer-run, slow (~5s) and rate limited, so:
  the bundled list answers immediately, the network result is cached for 30 days
  and swapped in through the onUpdate callback when it lands.

  Data: © OpenStreetMap contributors, ODbL.
*/
(function (global) {
  "use strict";

  // The main instance returns 504/429 often enough to need a mirror.
  var ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ];
  var CACHE_PREFIX = "spelling-practice.streets.";
  var CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  var MIN_USABLE = 25;
  var MAX_NAME = 34;

  var SOURCES = {
    pt: { bbox: "38.70,-9.16,38.73,-9.12", city: "Lisboa" },
    en: { bbox: "51.50,-0.14,51.52,-0.10", city: "London" },
    fr: { bbox: "48.85,2.32,48.87,2.36", city: "Paris" }
  };

  var FALLBACK = {
    pt: ["Rua Augusta","Rua da Prata","Rua do Ouro","Avenida da Liberdade","Rua Garrett","Rua do Carmo","Praça do Comércio","Rua da Conceição","Rua dos Fanqueiros","Travessa do Carmo","Rua de São Bento","Avenida Almirante Reis","Rua Castilho","Rua Braamcamp","Avenida da República","Rua Alexandre Herculano","Largo do Rato","Rua das Janelas Verdes","Rua da Boavista","Rua do Alecrim","Rua de Santa Catarina","Avenida de Roma","Rua Marquês de Fronteira","Rua Luís de Camões","Travessa da Glória","Calçada do Combro","Rua Nova do Almada","Rua do Salitre","Avenida Infante Santo","Rua Barata Salgueiro","Rua Rodrigo da Fonseca","Rua Dom Pedro V","Rua da Misericórdia","Largo de Camões","Rua Ivens","Rua Serpa Pinto","Avenida Duque de Loulé","Rua Viriato","Rua Tomás Ribeiro","Rua do Século"],
    en: ["Main Street","Maple Avenue","Oak Lane","Pine Street","Cedar Drive","Elm Street","Willow Court","Chestnut Street","Sycamore Road","Magnolia Boulevard","Walnut Avenue","Hickory Lane","Juniper Way","Birchwood Drive","Cypress Circle","Dogwood Trail","Rosewood Terrace","Lakeshore Drive","Riverside Avenue","Hillcrest Road","Sunset Boulevard","Park Place","Washington Street","Lincoln Avenue","Franklin Street","Madison Avenue","Oxford Street","Kensington Road","Wellington Avenue","Mulberry Lane","Orchard Street","Vineyard Road","Lighthouse Lane","Thistle Street","Granite Street","Goldfinch Lane","Nightingale Road","Mockingbird Lane","Windsor Terrace","Liberty Street"],
    fr: ["Rue de Rivoli","Boulevard Saint-Germain","Avenue des Champs-Élysées","Rue Saint-Honoré","Rue de la Paix","Boulevard Haussmann","Rue Mouffetard","Quai de Bourbon","Rue Oberkampf","Avenue Montaigne","Rue Lepic","Boulevard de Magenta","Rue du Bac","Rue de Vaugirard","Avenue de l'Opéra","Rue Montorgueil","Boulevard Voltaire","Rue des Rosiers","Place de la Concorde","Rue Cler","Rue de Belleville","Avenue Foch","Rue Daguerre","Boulevard Raspail","Rue de Charonne","Quai Voltaire","Rue Saint-Antoine","Avenue Victor Hugo","Rue Jacob","Rue de Seine","Boulevard Beaumarchais","Rue Caulaincourt","Avenue Rapp","Rue Saint-Dominique","Rue du Temple","Place des Vosges","Rue Monge","Avenue Kléber","Rue Lafayette","Rue de Turenne"]
  };

  var inFlight = {};

  // Keeps names a learner can actually spell: no digits, no codes, no essays.
  function usable(name) {
    return typeof name === "string" &&
      name.length >= 5 && name.length <= MAX_NAME &&
      !/\d/.test(name) &&
      /^[\p{L}\p{M}'’\- ]+$/u.test(name);
  }

  function readCache(lang) {
    try {
      var raw = global.localStorage.getItem(CACHE_PREFIX + lang);
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (!entry || !entry.names || Date.now() - entry.at > CACHE_TTL_MS) return null;
      return entry.names;
    } catch (err) {
      return null;
    }
  }

  function writeCache(lang, names) {
    try {
      global.localStorage.setItem(CACHE_PREFIX + lang, JSON.stringify({ at: Date.now(), names: names }));
    } catch (err) { /* storage full or private mode */ }
  }

  function askOverpass(query, index) {
    var endpoint = ENDPOINTS[index || 0];
    if (!endpoint) return Promise.reject(new Error("All Overpass endpoints failed."));
    return fetch(endpoint, {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }).catch(function () {
      return askOverpass(query, (index || 0) + 1);
    });
  }

  function fetchNames(lang) {
    var source = SOURCES[lang];
    if (!source) return Promise.reject(new Error("No street source for " + lang));
    if (inFlight[lang]) return inFlight[lang];

    var query = "[out:json][timeout:20];way(" + source.bbox + ")[\"highway\"][\"name\"];out tags 400;";
    inFlight[lang] = askOverpass(query, 0).then(function (data) {
      var seen = {};
      var names = (data.elements || []).map(function (el) {
        return el.tags && el.tags.name;
      }).filter(function (name) {
        if (!usable(name) || seen[name]) return false;
        seen[name] = true;
        return true;
      });
      if (names.length < MIN_USABLE) throw new Error("Overpass returned too few usable names.");
      writeCache(lang, names);
      return names;
    }).catch(function (err) {
      delete inFlight[lang];
      throw err;
    });

    return inFlight[lang];
  }

  /* Returns usable names right away; calls onUpdate later if the network wins. */
  function load(lang, onUpdate) {
    var cached = readCache(lang);
    if (cached) return cached;
    fetchNames(lang).then(function (names) {
      if (onUpdate) onUpdate(names);
    }).catch(function (err) {
      if (global.console) global.console.warn("[streets]", err.message);
    });
    return FALLBACK[lang] || FALLBACK.en;
  }

  global.Streets = { load: load, sources: SOURCES };
})(window);
