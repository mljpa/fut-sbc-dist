// ==UserScript==
// @name         FUT SBC Solver — precios
// @namespace    https://github.com/mljpa/fut-sbc-solver-v2
// @version      0.1.0.1788618344
// @description  Baja precios de mercado de fut.gg y los deja para el solver. Complemento de FUT SBC Solver v2.
// @match        https://www.ea.com/*/ea-sports-fc/ultimate-team/web-app*
// @match        https://www.ea.com/ea-sports-fc/ultimate-team/web-app*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      r2.fut.gg
// @updateURL    https://raw.githubusercontent.com/mljpa/fut-sbc-dist/main/fut-precios.user.js
// @downloadURL  https://raw.githubusercontent.com/mljpa/fut-sbc-dist/main/fut-precios.user.js
// ==/UserScript==

"use strict";
(() => {
  // src/prices/decode.ts
  var PriceDecodeError = class extends Error {
  };
  var SUPPORTED_VERSIONS = /* @__PURE__ */ new Set([2]);
  function decodePriceFile(raw) {
    if (!raw || typeof raw !== "object") {
      throw new PriceDecodeError("el archivo de precios no es un objeto");
    }
    const file = raw;
    if (typeof file.v === "number" && !SUPPORTED_VERSIONS.has(file.v)) {
      throw new PriceDecodeError(
        `formato de precios v${file.v}, este decodificador entiende v${[...SUPPORTED_VERSIONS].join("/")}`
      );
    }
    const id0 = file.id0;
    const deltas = file.d;
    const values = file.p;
    if (typeof id0 !== "number" || !Number.isFinite(id0)) {
      throw new PriceDecodeError("falta id0");
    }
    if (!Array.isArray(deltas) || !Array.isArray(values)) {
      throw new PriceDecodeError("faltan los arrays d (deltas) o p (precios)");
    }
    if (deltas.length + 1 !== values.length) {
      throw new PriceDecodeError(
        `d y p no cuadran: ${deltas.length} deltas para ${values.length} precios (se esperaba exactamente uno menos)`
      );
    }
    const prices = /* @__PURE__ */ new Map();
    let id = id0;
    let priced = 0;
    for (let i = 0; i < values.length; i++) {
      if (i > 0) {
        const step = deltas[i - 1];
        if (typeof step !== "number" || !Number.isFinite(step) || step <= 0) {
          throw new PriceDecodeError(`delta inv\xE1lido en la posici\xF3n ${i - 1}`);
        }
        id += step;
      }
      const coins = values[i];
      if (typeof coins !== "number" || !Number.isFinite(coins) || coins < 0) continue;
      if (coins === 0) continue;
      prices.set(id, coins);
      priced++;
    }
    return { prices, priced, total: values.length };
  }

  // src/prices/cache.ts
  var KEY = "fut-sbc-solver:prices";
  var MANIFEST_POLL_MS = 15 * 60 * 1e3;
  var STALE_AFTER_MS = 6 * 60 * 60 * 1e3;
  function storage() {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  }
  function readSnapshot() {
    try {
      const raw = storage()?.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed.revision !== "string" || typeof parsed.fetchedAt !== "number" || !parsed.prices || typeof parsed.prices !== "object") {
        return null;
      }
      const prices = /* @__PURE__ */ new Map();
      for (const [id, coins] of Object.entries(parsed.prices)) {
        const key = Number(id);
        if (Number.isFinite(key) && typeof coins === "number" && coins > 0) {
          prices.set(key, coins);
        }
      }
      if (prices.size === 0) return null;
      return {
        platform: parsed.platform === "pc" ? "pc" : "console",
        fetchedAt: parsed.fetchedAt,
        revision: parsed.revision,
        prices
      };
    } catch {
      return null;
    }
  }
  function writeSnapshot(snapshot) {
    const store = storage();
    if (!store) return false;
    const flat = {};
    for (const [id, coins] of snapshot.prices) flat[String(id)] = coins;
    try {
      store.setItem(
        KEY,
        JSON.stringify({
          platform: snapshot.platform,
          fetchedAt: snapshot.fetchedAt,
          revision: snapshot.revision,
          prices: flat
        })
      );
      return true;
    } catch {
      return false;
    }
  }
  function freshness(snapshot, platform2, now = Date.now()) {
    if (!snapshot) return { fresh: false, shouldPoll: true, ageMs: null };
    if (snapshot.platform !== platform2) {
      return { fresh: false, shouldPoll: true, ageMs: null };
    }
    const ageMs = now - snapshot.fetchedAt;
    return {
      fresh: ageMs >= 0 && ageMs < STALE_AFTER_MS,
      shouldPoll: !(ageMs >= 0 && ageMs < MANIFEST_POLL_MS),
      ageMs
    };
  }
  function priceFileUrl(manifest, platform2) {
    const key = platform2 === "pc" ? "player-prices-pc" : "player-prices-ps5";
    const revision = manifest[key];
    const version = manifest["_version"];
    if (typeof revision !== "string" || !revision) return null;
    if (typeof version !== "number" && typeof version !== "string") return null;
    return {
      url: `https://r2.fut.gg/26/${key}.v${version}.${revision}.json`,
      revision
    };
  }

  // src/companion/main.ts
  var MANIFEST_URL = "https://r2.fut.gg/26/manifest.json";
  var LOG = "[fut-precios]";
  var PLATFORM_KEY = "fut-sbc-solver:platform";
  function platform() {
    try {
      return localStorage.getItem(PLATFORM_KEY) === "pc" ? "pc" : "console";
    } catch {
      return "console";
    }
  }
  function getJson(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        timeout: 3e4,
        onload: (r) => {
          if (r.status < 200 || r.status >= 300) {
            reject(new Error(`HTTP ${r.status}`));
            return;
          }
          try {
            resolve(JSON.parse(r.responseText));
          } catch {
            reject(new Error("respuesta no es JSON"));
          }
        },
        onerror: (e) => reject(new Error(String(e))),
        ontimeout: () => reject(new Error("timeout"))
      });
    });
  }
  async function refresh() {
    const want = platform();
    const have = readSnapshot();
    const state = freshness(have, want);
    if (!state.shouldPoll) {
      console.info(`${LOG} precios al d\xEDa (${Math.round((state.ageMs ?? 0) / 6e4)} min)`);
      return;
    }
    const manifest = await getJson(MANIFEST_URL);
    const target = priceFileUrl(manifest, want);
    if (!target) {
      console.warn(`${LOG} el manifest no trae el archivo de ${want}`);
      return;
    }
    if (have && have.revision === target.revision && have.platform === want) {
      writeSnapshot({ ...have, fetchedAt: Date.now() });
      console.info(`${LOG} sin cambios (${target.revision})`);
      return;
    }
    const raw = await getJson(target.url);
    const { prices, priced, total } = decodePriceFile(raw);
    const ok = writeSnapshot({
      platform: want,
      fetchedAt: Date.now(),
      revision: target.revision,
      prices
    });
    console.info(
      `${LOG} ${priced}/${total} cartas con precio (${want}, ${target.revision})` + (ok ? "" : " \u2014 no se pudo guardar, sin espacio")
    );
  }
  void (async () => {
    try {
      await refresh();
    } catch (e) {
      console.warn(`${LOG} sin precios esta vez \u2014`, e instanceof Error ? e.message : e);
    }
  })();
})();
