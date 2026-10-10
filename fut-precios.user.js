// ==UserScript==
// @name         SbcAgent — precios
// @namespace    https://github.com/mljpa/fut-sbc-solver-v2
// @version      0.2.90
// @description  Complemento antiguo: los precios ahora están incluidos en el solver.
// @match        https://www.ea.com/*/ea-sports-fc/ultimate-team/web-app*
// @match        https://www.ea.com/ea-sports-fc/ultimate-team/web-app*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/mljpa/fut-sbc-dist/main/fut-precios.user.js
// @downloadURL  https://raw.githubusercontent.com/mljpa/fut-sbc-dist/main/fut-precios.user.js
// ==/UserScript==

"use strict";
(() => {
  // src/bootstrap/legacy-prices.ts
  console.info("[fut-precios] Los precios est\xE1n incluidos en SbcAgent. Puedes desactivar este complemento antiguo.");
})();
