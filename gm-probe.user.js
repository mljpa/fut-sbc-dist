// ==UserScript==
// @name         FUT SBC — sonda GM (desechable)
// @namespace    fut-sbc-solver-probe
// @version      1.0.0
// @description  Responde una sola pregunta: ¿conviven @grant GM_xmlhttpRequest y @inject-into page? Borrar después de leer el resultado.
// @match        https://www.ea.com/*/ea-sports-fc/ultimate-team/web-app*
// @match        https://www.ea.com/ea-sports-fc/ultimate-team/web-app*
// @run-at       document-idle
// @inject-into  page
// @grant        GM_xmlhttpRequest
// @connect      r2.fut.gg
// @connect      www.fut.gg
// ==/UserScript==

/*
 * No toca nada de EA. Solo mira qué capacidades tiene y deja el resultado en
 * localStorage, que es el único canal que sobrevive tanto si el script queda en
 * el contexto de la página como si Tampermonkey lo mete en su sandbox.
 *
 * Preguntas que responde:
 *   1. ¿en qué contexto corre? (¿ve `services` de EA?)
 *   2. ¿existe GM_xmlhttpRequest?
 *   3. ¿esa función llega de verdad al bucket de fut.gg?
 */
(function () {
  "use strict";

  var KEY = "fut-sbc-solver:gm-probe";
  var out = {
    at: new Date().toISOString(),
    // 1. contexto
    veServicesDeEA: typeof services !== "undefined" || typeof window.services !== "undefined",
    hayUnsafeWindow: typeof unsafeWindow !== "undefined",
    esMismoWindow: typeof unsafeWindow !== "undefined" ? unsafeWindow === window : null,
    // 2. API
    tieneGM: typeof GM_xmlhttpRequest,
    tieneGMobj: typeof GM !== "undefined" && GM ? typeof GM.xmlHttpRequest : "sin GM",
    // 3. se completa abajo
    fetchFutgg: "pendiente",
  };

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(out)); } catch (e) { /* nada */ }
    try { window.__futProbe = out; } catch (e) { /* nada */ }
    console.info("[sonda GM]", out);
  }
  save();

  if (typeof GM_xmlhttpRequest !== "function") {
    out.fetchFutgg = "no aplica — GM_xmlhttpRequest no existe";
    save();
    return;
  }

  // ¿llega al bucket que sirve los precios?
  try {
    GM_xmlhttpRequest({
      method: "GET",
      url: "https://r2.fut.gg/26/manifest.json",
      timeout: 15000,
      onload: function (r) {
        out.fetchFutgg = {
          ok: true,
          status: r.status,
          bytes: (r.responseText || "").length,
          head: (r.responseText || "").slice(0, 160),
        };
        save();
      },
      onerror: function (e) { out.fetchFutgg = { ok: false, error: String(e && e.error || e) }; save(); },
      ontimeout: function () { out.fetchFutgg = { ok: false, error: "timeout" }; save(); },
    });
  } catch (e) {
    out.fetchFutgg = { ok: false, error: "throw: " + String(e && e.message || e) };
    save();
  }
})();
