// ==UserScript==
// @name         FUT SBC Solver v2
// @namespace    https://github.com/mljpa/fut-sbc-solver-v2
// @version      0.1.0.1788385505
// @description  Userscript to solve EA SPORTS FC 26 SBCs with your own club
// @match        https://www.ea.com/*/ea-sports-fc/ultimate-team/web-app*
// @match        https://www.ea.com/ea-sports-fc/ultimate-team/web-app*
// @run-at       document-idle
// @inject-into  page
// @grant        none
// @updateURL    https://raw.githubusercontent.com/mljpa/fut-sbc-dist/main/fut-sbc.user.js
// @downloadURL  https://raw.githubusercontent.com/mljpa/fut-sbc-dist/main/fut-sbc.user.js
// ==/UserScript==

"use strict";
(() => {
  // src/ea/services.ts
  function getGlobal(name) {
    return globalThis[name];
  }
  function waitForServices(timeoutMs = 6e4) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        const s = getGlobal("services");
        if (s && s.Localization && s.SBC && s.Squad && s.Item && s.Club) {
          resolve(s);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          reject(new Error("waitForServices: timed out"));
          return;
        }
        setTimeout(tick, 1e3);
      };
      tick();
    });
  }
  function toPromise(obs) {
    return new Promise((resolve, reject) => {
      const o = obs;
      if (!o?.observe) {
        resolve({ data: obs, status: 200, success: true });
        return;
      }
      const ctx = {};
      const timer = setTimeout(() => {
        try {
          o.unobserve?.(ctx);
        } catch {
        }
        reject(new Error("EAObservable timeout"));
      }, 2e4);
      o.observe(ctx, (self, r) => {
        clearTimeout(timer);
        try {
          self.unobserve?.(ctx);
        } catch {
        }
        const res = r;
        resolve({
          data: res?.response ?? res?.data,
          status: res?.status,
          error: res?.error?.code ?? res?.error,
          success: res?.success !== false
        });
      });
    });
  }
  var delay = (ms) => new Promise((r) => setTimeout(r, ms));

  // src/ea/vc.ts
  var CHILD_KEYS = [
    "childViewControllers",
    "currentController",
    "gameflowControllers",
    "presentationController",
    "presentedViewController",
    "presentingViewController",
    "parentViewController"
  ];
  function getRootViewController() {
    const getAppMain = getGlobal(
      "getAppMain"
    );
    if (typeof getAppMain !== "function") return null;
    try {
      return getAppMain().getRootViewController?.() ?? null;
    } catch {
      return null;
    }
  }
  function constructorName(node) {
    try {
      return node?.constructor?.name ?? "";
    } catch {
      return "";
    }
  }
  function isInDom(vc) {
    try {
      const view = vc.getView?.();
      const el = view?.getRootElement?.();
      return !!el && typeof document !== "undefined" && document.contains(el);
    } catch {
      return false;
    }
  }
  function findViewControllers(match, root = getRootViewController()) {
    const hits = [];
    if (!root || typeof root !== "object") return hits;
    const seen = /* @__PURE__ */ new Set();
    const queue = [root];
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node || typeof node !== "object" || seen.has(node)) continue;
      seen.add(node);
      if (Array.isArray(node)) {
        for (const el of node) queue.push(el);
        continue;
      }
      const rec = node;
      try {
        if (match(rec)) hits.push(rec);
      } catch {
      }
      for (const key of CHILD_KEYS) {
        const child = rec[key];
        if (child && typeof child === "object") queue.push(child);
      }
    }
    return hits;
  }

  // src/ea/sbc.ts
  var SCOPE_BY_CODE = {
    0: "min",
    // GreaterOrEqual
    1: "max",
    // LessOrEqual
    2: "exact"
  };
  var TIER_BY_CODE = {
    1: "bronze",
    2: "silver",
    3: "gold"
  };
  function parseRequirements(challenge) {
    const ch = challenge ?? {};
    const slots = squadSlots(ch);
    const c = { slots, counted: [], unparsed: [] };
    const reqs = Array.isArray(ch.eligibilityRequirements) ? ch.eligibilityRequirements : [];
    for (const req of reqs) {
      const text = safeBuildString(req);
      const kv = readKv(req);
      if (!kv) {
        c.unparsed.push(text || "unreadable requirement (no kvPairs)");
        continue;
      }
      const scope = SCOPE_BY_CODE[Number(req.scope)] ?? "min";
      const countField = Number(req.count ?? -1);
      const v0 = kv.values[0] ?? 0;
      const label = text || `typeKey ${kv.typeKey}`;
      const add = (partial) => {
        c.counted.push({ ...partial, label });
      };
      switch (kv.typeKey) {
        case 19:
          c.teamRatingMin = v0;
          break;
        case 35:
          c.chemistryMin = v0;
          break;
        case 3:
          add({
            kind: "quality",
            value: TIER_BY_CODE[v0] ?? String(v0),
            count: slots || kv.values.length,
            scope
          });
          break;
        case 17:
          add({
            kind: "quality",
            value: TIER_BY_CODE[v0] ?? String(v0),
            count: countOrValue(countField, v0),
            scope
          });
          break;
        case 18:
          add({ kind: "rarity", value: v0, count: Math.max(countField, 0), scope });
          break;
        case 4:
          add({
            kind: "nation",
            value: null,
            count: countOrValue(countField, v0),
            scope
          });
          break;
        case 5:
          add({
            kind: "league",
            value: null,
            count: countOrValue(countField, v0),
            scope
          });
          break;
        case 6:
          add({
            kind: "club",
            value: null,
            count: countOrValue(countField, v0),
            scope
          });
          break;
        case 7:
          add({
            kind: "distinctNations",
            value: null,
            count: countOrValue(countField, v0),
            scope
          });
          break;
        case 8:
          add({
            kind: "distinctLeagues",
            value: null,
            count: countOrValue(countField, v0),
            scope
          });
          break;
        case 9:
          add({
            kind: "distinctClubs",
            value: null,
            count: countOrValue(countField, v0),
            scope
          });
          break;
        case 10:
        case 11:
        case 12: {
          const kind = kv.typeKey === 10 ? "nation" : kv.typeKey === 11 ? "league" : "club";
          if (kv.values.length > 1) {
            c.unparsed.push(`${label} [OR ${kind} ids: ${kv.values.join(", ")}]`);
          } else {
            add({ kind, value: v0, count: Math.max(countField, 0), scope });
          }
          break;
        }
        case 25:
          add({ kind: "group", value: v0, count: Math.max(countField, 0), scope });
          break;
        case 26:
        // Players with minimum OVR of X
        case 27:
        // Players with exact OVR of X
        case 28:
          if (countField <= 0 || slots > 0 && countField >= slots) {
            if (kv.typeKey === 26) c.minOvrPerPlayer = v0;
            else if (kv.typeKey === 27) c.exactOvr = v0;
            else c.maxOvrPerPlayer = v0;
          } else {
            const op = kv.typeKey === 26 ? ">=" : kv.typeKey === 27 ? "==" : "<=";
            c.unparsed.push(`${label} [${countField} players with OVR ${op} ${v0}]`);
          }
          break;
        default:
          c.unparsed.push(
            text || `unmapped typeKey ${kv.typeKey} = [${kv.values.join(", ")}]`
          );
      }
    }
    return c;
  }
  function countOrValue(count, value) {
    return count > 0 ? count : Math.max(value, 0);
  }
  function readKv(req) {
    const coll = req.kvPairs?._collection;
    if (!coll || typeof coll !== "object") return null;
    let entry;
    if (coll instanceof Map) {
      entry = [...coll.entries()][0];
    } else {
      entry = Object.entries(coll)[0];
    }
    if (!entry) return null;
    const typeKey = Number(entry[0]);
    if (!Number.isFinite(typeKey)) return null;
    const raw = entry[1];
    const values = Array.isArray(raw) ? raw.map((x) => Number(x)) : [Number(raw)];
    return { typeKey, values };
  }
  function safeBuildString(req) {
    try {
      return typeof req.buildString === "function" ? String(req.buildString() ?? "") : "";
    } catch {
      return "";
    }
  }
  function liveSquadOf(ch) {
    const own = ch.squad;
    if (own) return own;
    try {
      const hits = findViewControllers(
        (n) => constructorName(n) === "UTSBCSquadOverviewViewController" && !!n["_squad"] && Number(n["_challenge"]?.id) === Number(ch.id)
      );
      const vc = hits.find((h) => isInDom(h)) ?? hits[hits.length - 1];
      return vc?.["_squad"] ?? void 0;
    } catch {
      return void 0;
    }
  }
  function squadSlots(ch) {
    const sq = liveSquadOf(ch);
    if (!sq) return 0;
    try {
      const n = sq.getNumOfRequiredPlayers?.();
      if (typeof n === "number" && n > 0) return n;
    } catch {
    }
    try {
      const nb = sq.getNonBrickSlots?.();
      if (Array.isArray(nb) && nb.length > 0) return nb.length;
    } catch {
    }
    try {
      const fp = sq.getFieldPlayers?.();
      if (Array.isArray(fp) && fp.length > 0) return fp.length;
    } catch {
    }
    return 0;
  }
  async function getOpenChallenge() {
    const raw = findLiveChallenge() ?? await challengeFromRepository();
    if (!raw) return null;
    const constraints = parseRequirements(raw);
    const slotPositions = readSlotPositions(raw);
    if (slotPositions.length === constraints.slots) {
      constraints.slotPositions = slotPositions;
    }
    return {
      id: Number(raw.id ?? -1),
      setId: Number(raw.setId ?? -1),
      name: String(raw.name ?? ""),
      slots: constraints.slots,
      constraints,
      raw
    };
  }
  function readSlotPositions(ch) {
    const sq = liveSquadOf(ch);
    try {
      const slots = sq?.getNonBrickSlots?.() ?? [];
      return slots.map((s) => {
        const g = s.getGeneralPosition?.();
        return typeof g === "number" ? g : Number(s.position?.id ?? -1);
      });
    } catch {
      return [];
    }
  }
  function looksLikeChallenge(o) {
    if (!o || typeof o !== "object") return false;
    const c = o;
    return Array.isArray(c["eligibilityRequirements"]) && ("squad" in c || typeof c.isInProgress === "function");
  }
  var CHALLENGE_VC_NAMES = /* @__PURE__ */ new Set([
    "UTSBCSquadOverviewViewController",
    "UTSBCSquadDetailPanelViewController"
  ]);
  function findLiveChallenge() {
    const hits = findViewControllers(
      (n) => CHALLENGE_VC_NAMES.has(constructorName(n)) && looksLikeChallenge(n["_challenge"])
    );
    if (hits.length === 0) return null;
    const challengeOf = (h) => h["_challenge"];
    const inProgress = hits.find((h) => {
      try {
        return challengeOf(h).isInProgress?.() === true;
      } catch {
        return false;
      }
    });
    if (inProgress) return challengeOf(inProgress);
    const inDom = hits.find((h) => isInDom(h));
    if (inDom) return challengeOf(inDom);
    return challengeOf(hits[hits.length - 1]);
  }
  async function challengeFromRepository() {
    const services = getGlobal("services");
    const sbc = services?.["SBC"];
    const repo = sbc?.repository;
    if (!repo) return null;
    const ahead = [];
    const behind = [];
    try {
      for (const set of collectionValues(repo.sets)) {
        const chs = set.getChallenges?.() ?? [];
        for (const ch of chs) {
          if (!looksLikeChallenge(ch)) continue;
          const c = ch;
          if (!c.squad) continue;
          if (safeInProgress(c)) ahead.push(c);
          else behind.push(c);
        }
      }
    } catch {
    }
    return ahead[0] ?? behind[0] ?? null;
  }
  function safeInProgress(c) {
    try {
      return c.isInProgress?.() === true;
    } catch {
      return false;
    }
  }
  function collectionValues(coll) {
    if (!coll) return [];
    const inner = coll._collection ?? coll;
    if (inner instanceof Map) return [...inner.values()];
    if (Array.isArray(inner)) return inner;
    if (typeof inner === "object") return Object.values(inner);
    return [];
  }

  // src/ea/club.ts
  var PAGE_SIZE = 91;
  var MAX_PAGES = 60;
  async function fetchClubPlayers() {
    const players = [];
    const items = /* @__PURE__ */ new Map();
    const services = getGlobal("services");
    const club = services?.["Club"];
    const VM = getGlobal("UTBucketedItemSearchViewModel");
    if (!club?.search || typeof VM !== "function") return { players, items };
    try {
      if (club.getStats) await toPromise(club.getStats());
    } catch {
    }
    const criteria = new VM().searchCriteria;
    criteria["count"] = PAGE_SIZE;
    criteria["offset"] = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      let batch = [];
      let retrievedAll = false;
      try {
        const res = await toPromise(club.search(criteria));
        const data = res.data;
        batch = Array.isArray(data?.items) ? data.items : [];
        retrievedAll = data?.retrievedAll === true;
      } catch {
        break;
      }
      for (const raw of batch) {
        if (typeof raw.loans === "number" && raw.loans > -1) continue;
        const mapped = toSolverPlayer(raw);
        if (!mapped) continue;
        players.push(mapped);
        items.set(mapped.id, raw);
      }
      if (retrievedAll || batch.length === 0) break;
      criteria["offset"] = Number(criteria["offset"] ?? 0) + batch.length;
    }
    markDuplicates(players);
    return { players, items };
  }
  function rawItemToSolverPlayer(raw) {
    return toSolverPlayer(raw);
  }
  function toSolverPlayer(raw) {
    const definitionId = Number(raw.definitionId ?? 0);
    if (!definitionId) return null;
    const instanceId = Number(raw.id ?? 0);
    const rating = Number(raw.rating ?? raw._rating ?? 0);
    const untradeable = typeof raw.untradeableCount === "number" && raw.untradeableCount >= 1 || raw.untradeable === true || raw.tradable === false;
    return {
      id: instanceId || -definitionId,
      definitionId,
      rating,
      name: readName(raw),
      leagueId: Number(raw.leagueId ?? 0),
      nationId: Number(raw.nationId ?? raw.nation ?? 0),
      teamId: Number(raw.teamId ?? 0),
      quality: qualityFromRating(rating),
      rarityId: Number(raw.rareflag ?? 0),
      untradeable,
      concept: raw.concept === true,
      // duplicateId was 0 on every item in the 2026-09-01 dump; markDuplicates()
      // adds a definitionId-grouping pass on top. // TODO: trust duplicateId once
      // a club with real duplicates is inspected.
      isDuplicate: Number(raw.duplicateId ?? 0) > 0,
      inActiveSquad: false,
      // cross-checked by callers via squad.ts
      inAnySquad: false,
      inStorage: false,
      // TODO: verify via services.Item storage search (docs pendiente)
      isSpecial: isSpecial(raw),
      positions: readPositions(raw)
    };
  }
  function readPositions(raw) {
    const src = Array.isArray(raw.basePossiblePositions) && raw.basePossiblePositions || Array.isArray(raw.possiblePositions) && raw.possiblePositions || (typeof raw.preferredPosition === "number" ? [raw.preferredPosition] : []);
    return [...new Set(src.map((n) => Number(n)).filter((n) => Number.isFinite(n)))];
  }
  function qualityFromRating(rating) {
    if (rating >= 75) return "gold";
    if (rating >= 65) return "silver";
    return "bronze";
  }
  function readName(raw) {
    try {
      const s = raw.getStaticData?.();
      if (s?.name) return String(s.name);
    } catch {
    }
    try {
      if (raw.getName) return String(raw.getName());
    } catch {
    }
    return `#${raw.definitionId ?? "?"}`;
  }
  function isSpecial(raw) {
    try {
      if (raw.isEvolutions?.()) return true;
    } catch {
    }
    try {
      if (raw.isEnrolledInAcademy?.()) return true;
    } catch {
    }
    return Number(raw.rareflag ?? 0) > 1;
  }
  function markDuplicates(players) {
    const byDef = /* @__PURE__ */ new Map();
    for (const p of players) {
      const arr = byDef.get(p.definitionId) ?? [];
      arr.push(p);
      byDef.set(p.definitionId, arr);
    }
    for (const arr of byDef.values()) {
      if (arr.length > 1) for (const p of arr) p.isDuplicate = true;
    }
  }

  // src/ea/squad.ts
  function squadService() {
    const services = getGlobal("services");
    return services?.["Squad"];
  }
  async function squadById(id) {
    const Squad = squadService();
    if (!Squad?.requestSquadById) return null;
    try {
      const res = await toPromise(
        Squad.requestSquadById(id)
      );
      const data = res.data;
      if (!data) return null;
      return data.squad ?? data ?? null;
    } catch {
      return null;
    }
  }
  function collectInto(squad, into) {
    if (!squad) return;
    let slots = [];
    try {
      slots = squad.getFieldPlayers?.() ?? squad.getPlayers?.() ?? [];
    } catch {
      slots = [];
    }
    for (const slot of slots) {
      let it;
      try {
        it = slot.getItem?.() ?? slot.item;
      } catch {
        it = slot.item;
      }
      const inst = Number(it?.id ?? 0);
      const def = Number(it?.definitionId ?? 0);
      if (inst > 0) into.instanceIds.add(inst);
      if (def > 0) into.defIds.add(def);
    }
  }
  async function getActiveSquadCards() {
    const out = { instanceIds: /* @__PURE__ */ new Set(), defIds: /* @__PURE__ */ new Set() };
    const Squad = squadService();
    if (!Squad) return out;
    let id = 0;
    try {
      id = Number(Squad.getActiveSquadId?.() ?? 0);
    } catch {
      id = 0;
    }
    collectInto(await squadById(id), out);
    return out;
  }
  async function getAllSquadCards() {
    const out = { instanceIds: /* @__PURE__ */ new Set(), defIds: /* @__PURE__ */ new Set() };
    const Squad = squadService();
    if (Squad?.requestSquadList) {
      try {
        const res = await toPromise(
          Squad.requestSquadList()
        );
        const squads = res.data?.squads ?? [];
        for (const s of squads) {
          collectInto(await squadById(Number(s.id ?? 0)), out);
        }
      } catch {
      }
    }
    const active = await getActiveSquadCards();
    for (const x of active.instanceIds) out.instanceIds.add(x);
    for (const x of active.defIds) out.defIds.add(x);
    return out;
  }

  // src/ea/apply.ts
  function findLiveOverviewVC(challengeId) {
    const hits = findViewControllers(
      (n) => constructorName(n) === "UTSBCSquadOverviewViewController" && "_challenge" in n && !!n["_challenge"] && "_squad" in n && !!n["_squad"]
    );
    if (hits.length === 0) return null;
    if (challengeId != null) {
      const byId = hits.find((h) => Number(h._challenge?.id) === challengeId);
      if (byId) return byId;
    }
    const inDom = hits.find((h) => isInDom(h));
    return inDom ?? hits[hits.length - 1] ?? null;
  }
  async function applySolution(challenge, solution, clubItems) {
    const vc = findLiveOverviewVC(challenge.id);
    if (!vc) {
      return {
        ok: false,
        reason: "No se encontr\xF3 el UTSBCSquadOverviewViewController vivo del pitch."
      };
    }
    const eaChallenge = vc._challenge;
    const squad = eaChallenge.squad ?? vc._squad;
    if (squad !== vc._squad) vc._squad = squad;
    let slotIndices;
    try {
      const raw = squad.getNonBrickSlots?.() ?? [];
      slotIndices = raw.map((s) => {
        const idx = s?.index;
        return typeof idx === "number" ? idx : Number(s);
      });
    } catch (err) {
      return { ok: false, reason: `getNonBrickSlots() fall\xF3: ${errMsg(err)}` };
    }
    if (slotIndices.length === 0) {
      return {
        ok: false,
        reason: "La squad no expone slots utilizables (getNonBrickSlots vac\xEDo)."
      };
    }
    let arrLen;
    try {
      arrLen = squad.getFieldPlayers?.().length ?? 0;
    } catch {
      arrLen = 0;
    }
    if (arrLen <= Math.max(...slotIndices)) arrLen = Math.max(...slotIndices) + 1;
    const arr = new Array(arrLen).fill(null);
    const players = solution.players ?? [];
    const conceptDefs = [
      ...new Set(players.filter((p) => p.concept).map((p) => p.definitionId))
    ];
    const conceptItems = await fetchConceptItems(conceptDefs);
    for (let i = 0; i < players.length && i < slotIndices.length; i++) {
      const p = players[i];
      const slot = slotIndices[i];
      if (p.concept === true) {
        const real = conceptItems.get(p.definitionId);
        if (!real) {
          return {
            ok: false,
            reason: `No se encontr\xF3 la carta concept ${p.definitionId} ("${p.name}").`
          };
        }
        real["concept"] = true;
        arr[slot] = real;
      } else {
        const clubItem = clubItems.get(p.id);
        if (!clubItem) {
          return {
            ok: false,
            reason: `Falta el UTItemEntity real del club para "${p.name}" (id ${p.id}).`
          };
        }
        arr[slot] = clubItem;
      }
    }
    try {
      squad.removeAllItems?.();
      squad.setPlayers?.(arr, true);
    } catch (err) {
      return { ok: false, reason: `setPlayers() fall\xF3: ${errMsg(err)}` };
    }
    const services = getGlobal("services");
    const sbc = services?.SBC;
    if (typeof sbc?.saveChallenge !== "function") {
      return { ok: false, reason: "services.SBC.saveChallenge no disponible." };
    }
    let res;
    try {
      res = await toPromise(sbc.saveChallenge.call(sbc, eaChallenge));
    } catch (err) {
      return { ok: false, reason: `saveChallenge() fall\xF3: ${errMsg(err)}` };
    }
    if (res.status !== 200 || !res.success) {
      return {
        ok: false,
        reason: `saveChallenge devolvi\xF3 status=${res.status ?? "?"} success=${res.success}` + (res.error != null ? ` error=${String(res.error)}` : "")
      };
    }
    try {
      eaChallenge.onDataChange?.notify?.({ squad });
    } catch (err) {
      console.warn("[fut-sbc] onDataChange.notify fall\xF3", err);
    }
    try {
      vc._pushSquadToView?.(squad);
    } catch (err) {
      console.warn("[fut-sbc] _pushSquadToView fall\xF3", err);
    }
    return {
      ok: true,
      teamRating: safeNum(() => squad.getRating?.()),
      chemistry: safeNum(() => squad.getChemistry?.())
    };
  }
  async function fetchConceptItems(defIds) {
    const out = /* @__PURE__ */ new Map();
    const services = getGlobal("services");
    const DTO = getGlobal(
      "UTSearchCriteriaDTO"
    );
    const search2 = services?.Item?.searchConceptItems;
    if (typeof search2 !== "function" || typeof DTO !== "function") return out;
    for (const defId of defIds) {
      const c = new DTO();
      c["type"] = "player";
      c["defId"] = [defId];
      c["isExactSearch"] = true;
      c["maxBuy"] = 0;
      c["count"] = 20;
      try {
        const res = await toPromise(
          search2.call(services.Item, c)
        );
        const data = res.data;
        const items = Array.isArray(data) ? data : data?.items ?? [];
        const match = items.find(
          (it) => Number(it.definitionId) === defId
        ) ?? items[0];
        if (match) out.set(defId, match);
      } catch {
      }
    }
    return out;
  }
  function repaintPitch(challengeId) {
    const vc = findLiveOverviewVC(challengeId);
    if (!vc) return;
    const squad = vc._challenge?.squad ?? vc._squad;
    if (!squad) return;
    if (squad !== vc._squad) vc._squad = squad;
    try {
      vc._challenge.onDataChange?.notify?.({ squad });
    } catch {
    }
    try {
      vc._pushSquadToView?.(squad);
    } catch {
    }
  }
  function leaveChallengeView() {
    try {
      const buttons = Array.from(
        document.querySelectorAll("button.ut-navigation-button-control")
      );
      const back = buttons.find((b) => {
        const r2 = b.getBoundingClientRect();
        return r2.width > 0 && r2.height > 0 && r2.top < 120 && r2.left < 240;
      });
      if (!back) return;
      const r = back.getBoundingClientRect();
      const clientX = Math.round(r.left + r.width / 2);
      const clientY = Math.round(r.top + r.height / 2);
      const base = { bubbles: true, cancelable: true, composed: true, clientX, clientY };
      const pointer = (type) => {
        try {
          back.dispatchEvent(
            new PointerEvent(type, { ...base, pointerId: 1, isPrimary: true, pointerType: "touch" })
          );
        } catch {
        }
      };
      pointer("pointerdown");
      try {
        const touch = new Touch({ identifier: 1, target: back, clientX, clientY });
        back.dispatchEvent(
          new TouchEvent("touchstart", { ...base, touches: [touch], targetTouches: [touch], changedTouches: [touch] })
        );
        back.dispatchEvent(
          new TouchEvent("touchend", { ...base, touches: [], targetTouches: [], changedTouches: [touch] })
        );
      } catch {
        back.click();
      }
      pointer("pointerup");
    } catch {
    }
  }
  function safeNum(fn) {
    try {
      const n = fn();
      return typeof n === "number" && Number.isFinite(n) ? n : void 0;
    } catch {
      return void 0;
    }
  }
  function errMsg(err) {
    return err instanceof Error ? err.message : String(err);
  }

  // src/ea/market.ts
  var SEARCH_DELAY_MS = 550;
  var BID_DELAY_MS = 1200;
  var SOFT_BAN = /* @__PURE__ */ new Set([426, 429]);
  function itemService() {
    const services = getGlobal("services");
    return services?.["Item"];
  }
  function newCriteria() {
    const DTO = getGlobal("UTSearchCriteriaDTO");
    if (typeof DTO !== "function") return null;
    return new DTO();
  }
  var TIERS = [
    { level: "bronze", lo: 47, hi: 64 },
    { level: "silver", lo: 65, hi: 74 },
    { level: "gold", lo: 75, hi: 99 }
  ];
  var CALIBRATION_KEY = "fut-sbc-solver:concept-offsets";
  var CALIBRATION_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
  var PAGE_SIZE2 = 60;
  var CALIBRATION_PROBES = [
    0,
    250,
    500,
    1e3,
    1500,
    2e3,
    3e3,
    4e3,
    5e3,
    6e3,
    7e3,
    8e3
  ];
  function readCalibration() {
    try {
      const raw = localStorage.getItem(CALIBRATION_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed.at || Date.now() - parsed.at > CALIBRATION_TTL_MS) return {};
      return parsed.curves ?? {};
    } catch {
      return {};
    }
  }
  function writeCalibration(curves) {
    try {
      localStorage.setItem(
        CALIBRATION_KEY,
        JSON.stringify({ at: Date.now(), curves })
      );
    } catch {
    }
  }
  async function calibrate(Item, level, probeDelayMs) {
    const curve = [];
    for (const offset of CALIBRATION_PROBES) {
      const r = await ratingAt(Item, level, offset);
      await delay(probeDelayMs);
      if (r == null) break;
      curve.push([offset, r]);
    }
    return curve;
  }
  function guessOffset(curve, rating) {
    if (curve.length === 0) return 0;
    for (let i = 0; i < curve.length - 1; i++) {
      const [o1, r1] = curve[i];
      const [o2, r2] = curve[i + 1];
      if (rating <= r1 && rating >= r2) {
        if (r1 === r2) return o1;
        const t = (r1 - rating) / (r1 - r2);
        return Math.round(o1 + t * (o2 - o1));
      }
    }
    const [lastO, lastR] = curve[curve.length - 1];
    return rating >= curve[0][1] ? 0 : lastO;
  }
  async function ratingAt(Item, level, offset) {
    const c = newCriteria();
    if (!c) return null;
    c["type"] = "player";
    c["level"] = level;
    c["count"] = 1;
    c["offset"] = offset;
    try {
      const res = await toPromise(
        Item.searchConceptItems(c)
      );
      const data = res.data;
      const items = Array.isArray(data) ? data : data?.items ?? [];
      const r = items[0]?.rating;
      return typeof r === "number" ? r : null;
    } catch {
      return null;
    }
  }
  var MAX_NUDGES = 3;
  async function offsetOfRating(Item, level, curve, target, probeDelayMs) {
    let offset = Math.max(0, guessOffset(curve, target));
    const span = curve.length > 1 ? curve[curve.length - 1][0] - curve[0][0] : 1e3;
    const ratingSpan = curve.length > 1 ? Math.max(1, curve[0][1] - curve[curve.length - 1][1]) : 20;
    let step = Math.max(60, Math.round(span / ratingSpan));
    for (let i = 0; i < MAX_NUDGES; i++) {
      const r = await ratingAt(Item, level, offset);
      await delay(probeDelayMs);
      if (r == null) {
        offset = Math.max(0, offset - step);
        continue;
      }
      if (r === target) {
        return Math.max(0, offset - PAGE_SIZE2);
      }
      offset = r > target ? offset + step : Math.max(0, offset - step);
      step = Math.max(60, Math.round(step / 2));
    }
    return offset;
  }
  async function searchConceptCards(opts) {
    const Item = itemService();
    if (!Item?.searchConceptItems || !newCriteria()) return [];
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    const cap = opts.limit ?? 240;
    const PROBE_DELAY_MS = 120;
    const curves = readCalibration();
    let curvesDirty = false;
    const perRating = Math.max(8, Math.ceil(cap / (opts.ratingMax - opts.ratingMin + 1)));
    for (const tier2 of TIERS) {
      if (out.length >= cap) break;
      if (tier2.hi < opts.ratingMin || tier2.lo > opts.ratingMax) continue;
      let curve = curves[tier2.level];
      if (!curve || curve.length === 0) {
        curve = await calibrate(Item, tier2.level, PROBE_DELAY_MS);
        if (curve.length === 0) continue;
        curves[tier2.level] = curve;
        curvesDirty = true;
      }
      const top = Math.min(tier2.hi, opts.ratingMax);
      const bottom = Math.max(tier2.lo, opts.ratingMin);
      for (let rating = top; rating >= bottom && out.length < cap; rating--) {
        const start = await offsetOfRating(
          Item,
          tier2.level,
          curve,
          rating,
          PROBE_DELAY_MS
        );
        const c = newCriteria();
        if (!c) break;
        c["type"] = "player";
        c["level"] = tier2.level;
        if (opts.league) c["league"] = opts.league;
        if (opts.nation) c["nation"] = opts.nation;
        c["count"] = PAGE_SIZE2;
        c["offset"] = start;
        let batch = [];
        try {
          const res = await toPromise(
            Item.searchConceptItems(c)
          );
          const data = res.data;
          batch = Array.isArray(data) ? data : data?.items ?? [];
        } catch {
          break;
        }
        if (batch.length === 0) break;
        let taken = 0;
        for (const raw of batch) {
          if (taken >= perRating || out.length >= cap) break;
          const mapped = conceptToSolverPlayer(raw);
          if (!mapped || mapped.rating !== rating) continue;
          if (seen.has(mapped.definitionId)) continue;
          seen.add(mapped.definitionId);
          out.push(mapped);
          taken++;
        }
        await delay(SEARCH_DELAY_MS);
      }
    }
    if (curvesDirty) writeCalibration(curves);
    return out;
  }
  function conceptToSolverPlayer(raw) {
    const definitionId = Number(raw.definitionId ?? 0);
    if (!definitionId) return null;
    const rating = Number(raw.rating ?? 0);
    const positions = Array.isArray(raw.basePossiblePositions) && raw.basePossiblePositions.map(Number) || (typeof raw.preferredPosition === "number" ? [raw.preferredPosition] : []);
    let name = `#${definitionId}`;
    try {
      const s = raw.getStaticData?.();
      if (s?.name) name = String(s.name);
    } catch {
    }
    return {
      id: -definitionId,
      // synthetic — concept cards have no instance
      definitionId,
      rating,
      name,
      leagueId: Number(raw.leagueId ?? 0),
      nationId: Number(raw.nationId ?? raw.nation ?? 0),
      teamId: Number(raw.teamId ?? 0),
      quality: rating >= 75 ? "gold" : rating >= 65 ? "silver" : "bronze",
      rarityId: 0,
      untradeable: false,
      concept: true,
      isDuplicate: false,
      inActiveSquad: false,
      inAnySquad: false,
      inStorage: false,
      isSpecial: false,
      positions: [...new Set(positions)]
    };
  }
  async function buyFodder(requests, opts) {
    const report = {
      bought: [],
      spent: 0,
      failures: [],
      softBanned: false
    };
    const Item = itemService();
    const ItemPile = getGlobal("ItemPile");
    const clubPile = ItemPile?.["CLUB"] ?? 7;
    if (!Item?.searchTransferMarket || !Item.bid || !Item.move) {
      for (const r of requests)
        report.failures.push({
          definitionId: r.definitionId,
          got: 0,
          want: r.count,
          reason: "services.Item market API unavailable"
        });
      return report;
    }
    for (const req of requests) {
      let got = 0;
      for (let n = 0; n < req.count; n++) {
        if (report.softBanned) break;
        if (report.spent + req.maxPerCard > opts.maxSpend) {
          report.failures.push({
            definitionId: req.definitionId,
            got,
            want: req.count,
            reason: `budget: ${report.spent}/${opts.maxSpend} spent`
          });
          return report;
        }
        const listing = await findCheapestListing(req.definitionId, req.maxPerCard);
        if (listing.softBanned) {
          report.softBanned = true;
          break;
        }
        if (!listing.item) {
          report.failures.push({
            definitionId: req.definitionId,
            got,
            want: req.count,
            reason: listing.reason ?? "no listing under maxPerCard"
          });
          break;
        }
        await delay(BID_DELAY_MS);
        const bidRes = await toPromise(
          Item.bid(listing.item, listing.price)
        );
        if (SOFT_BAN.has(Number(bidRes.status))) {
          report.softBanned = true;
          break;
        }
        if (!bidRes.success) {
          report.failures.push({
            definitionId: req.definitionId,
            got,
            want: req.count,
            reason: `bid failed (status ${bidRes.status ?? "?"})`
          });
          break;
        }
        try {
          await toPromise(Item.move(listing.item, clubPile));
        } catch {
        }
        report.bought.push({
          definitionId: req.definitionId,
          price: listing.price
        });
        report.spent += listing.price;
        got++;
      }
      if (report.softBanned) break;
    }
    return report;
  }
  async function findCheapestListing(definitionId, maxBuy) {
    const Item = itemService();
    const c = newCriteria();
    if (!Item?.searchTransferMarket || !c) {
      return { price: 0, reason: "no market API", softBanned: false };
    }
    c["type"] = "player";
    c["defId"] = [definitionId];
    c["isExactSearch"] = true;
    c["maxBuy"] = maxBuy;
    c["sortBy"] = "current";
    c["count"] = 12;
    c["offset"] = 0;
    await delay(SEARCH_DELAY_MS);
    let items = [];
    let status = 200;
    try {
      const res = await toPromise(
        Item.searchTransferMarket(c, 1)
      );
      status = Number(res.status ?? 200);
      const data = res.data;
      items = Array.isArray(data) ? data : data?.items ?? [];
    } catch {
      return { price: 0, reason: "market search threw", softBanned: false };
    }
    if (SOFT_BAN.has(status)) return { price: 0, softBanned: true };
    let best = null;
    for (const it of items) {
      const a = it._auction ?? it.getAuctionData?.() ?? {};
      const buyNow = Number(a.buyNowPrice ?? 0);
      const price = buyNow > 0 ? buyNow : Number(a.currentBid ?? a.startingBid ?? 0);
      if (price <= 0 || price > maxBuy) continue;
      if (!best || price < best.price) best = { item: it, price };
    }
    if (!best) {
      return { price: 0, reason: "no listing under maxBuy", softBanned: false };
    }
    return { item: best.item, price: best.price, softBanned: false };
  }

  // src/ea/pools.ts
  function itemService2() {
    const services = getGlobal("services");
    return services?.["Item"];
  }
  async function fetchUnassignedPlayers() {
    const Item = itemService2();
    const players = [];
    const items = /* @__PURE__ */ new Map();
    if (!Item?.requestUnassignedItems) return { players, items };
    try {
      const res = await toPromise(
        Item.requestUnassignedItems()
      );
      const data = res.data;
      const raw = Array.isArray(data) ? data : data?.items ?? [];
      collect(raw, players, items);
    } catch {
    }
    return { players, items };
  }
  async function fetchStoragePlayers() {
    const Item = itemService2();
    const DTO = getGlobal(
      "UTSearchCriteriaDTO"
    );
    const players = [];
    const items = /* @__PURE__ */ new Map();
    if (!Item?.searchStorageItems || typeof DTO !== "function") {
      return { players, items };
    }
    for (let offset = 0; offset < 600; offset += 50) {
      const c = new DTO();
      c["count"] = 50;
      c["offset"] = offset;
      let raw = [];
      try {
        const res = await toPromise(
          Item.searchStorageItems(c)
        );
        const data = res.data;
        raw = Array.isArray(data) ? data : data?.items ?? [];
      } catch {
        break;
      }
      collect(raw, players, items);
      if (raw.length < 50) break;
    }
    return { players, items };
  }
  function collect(raw, players, items) {
    for (const it of raw) {
      if (typeof it.loans === "number" && it.loans > -1) {
        continue;
      }
      const mapped = rawItemToSolverPlayer(it);
      if (!mapped) continue;
      mapped.inStorage = true;
      players.push(mapped);
      items.set(mapped.id, it);
    }
  }

  // src/ea/submit.ts
  var SOFT_BAN2 = /* @__PURE__ */ new Set([426, 429]);
  var SUBMIT_DELAY_MS = 1800;
  var CHEM_RETRY_PRE_MS = 500;
  var CHEM_RETRY_POST_MS = 1e3;
  function sbcService() {
    const services = getGlobal("services");
    return services?.["SBC"];
  }
  function chemistryService() {
    const services = getGlobal("services");
    return services?.["Chemistry"];
  }
  var HOUR_MS = 36e5;
  var DAY_MS = 864e5;
  var MAX_PER_HOUR = 90;
  var MAX_PER_DAY = 300;
  var submitTimes = [];
  function rateLimitReason() {
    const now = Date.now();
    while (submitTimes.length > 0 && now - submitTimes[0] > DAY_MS) {
      submitTimes.shift();
    }
    const lastHour = submitTimes.filter((t) => now - t <= HOUR_MS).length;
    if (lastHour >= MAX_PER_HOUR) {
      return `L\xEDmite de EA alcanzado: ${lastHour} env\xEDos en la \xFAltima hora (m\xE1x ${MAX_PER_HOUR}).`;
    }
    if (submitTimes.length >= MAX_PER_DAY) {
      return `L\xEDmite de EA alcanzado: ${submitTimes.length} env\xEDos en 24 h (m\xE1x ${MAX_PER_DAY}).`;
    }
    return null;
  }
  function noteSubmit() {
    submitTimes.push(Date.now());
  }
  async function submitChallenge(challenge) {
    const blocked = rateLimitReason();
    if (blocked) return { ok: false, reason: blocked };
    const sbc = sbcService();
    if (typeof sbc?.submitChallenge !== "function") {
      return { ok: false, reason: "services.SBC.submitChallenge no disponible." };
    }
    const eaChallenge = liveChallengeObject(challenge);
    if (!eaChallenge) {
      return {
        ok: false,
        reason: `No se encontr\xF3 el objeto challenge de EA (id ${challenge.id}).`
      };
    }
    const set = await findSet(challenge.setId);
    if (!set) {
      return {
        ok: false,
        reason: `No se encontr\xF3 el set ${challenge.setId} en services.SBC.repository.`
      };
    }
    const chemEnabled = chemistryEnabled();
    let res;
    try {
      res = await runSubmit(sbc, eaChallenge, set, chemEnabled);
    } catch (err) {
      return { ok: false, reason: `submitChallenge() fall\xF3: ${errMsg2(err)}` };
    }
    if (SOFT_BAN2.has(Number(res.status))) {
      return {
        ok: false,
        softBanned: true,
        reason: `EA respondi\xF3 ${res.status} \u2014 soft-ban. No reintentar.`
      };
    }
    if (isChemistryMismatch(res.error)) {
      const stillBlocked = rateLimitReason();
      if (stillBlocked) {
        return { ok: false, reason: `${stillBlocked} (tras CHEMISTRY_VERSION_MISMATCH)` };
      }
      await delay(CHEM_RETRY_PRE_MS);
      await resetChemistry();
      await delay(CHEM_RETRY_POST_MS);
      try {
        res = await runSubmit(sbc, eaChallenge, set, chemEnabled);
      } catch (err) {
        return {
          ok: false,
          reason: `submitChallenge() fall\xF3 en el reintento de qu\xEDmica: ${errMsg2(err)}`
        };
      }
      if (SOFT_BAN2.has(Number(res.status))) {
        return {
          ok: false,
          softBanned: true,
          reason: `EA respondi\xF3 ${res.status} \u2014 soft-ban. No reintentar.`
        };
      }
    }
    const violations = readViolations(res);
    if (violations.length > 0) {
      return {
        ok: false,
        violations,
        reason: `EA rechaz\xF3 la squad: ${violations.join(" \xB7 ")}`
      };
    }
    if (res.status != null && res.status !== 200) {
      return {
        ok: false,
        reason: `submitChallenge devolvi\xF3 status=${res.status}${res.error != null ? ` error=${String(res.error)}` : ""}`
      };
    }
    if (!res.success) {
      return {
        ok: false,
        reason: `submitChallenge devolvi\xF3 success=false${res.error != null ? ` error=${String(res.error)}` : ""}`
      };
    }
    return { ok: true };
  }
  async function runSubmit(sbc, eaChallenge, set, chemEnabled) {
    const submit = sbc.submitChallenge;
    if (typeof submit !== "function") {
      throw new Error("services.SBC.submitChallenge no disponible.");
    }
    const obs = submit.call(sbc, eaChallenge, set, true, chemEnabled);
    noteSubmit();
    try {
      return await toPromise(obs);
    } finally {
      await delay(SUBMIT_DELAY_MS);
    }
  }
  function chemistryEnabled() {
    try {
      return chemistryService()?.isFeatureEnabled?.() === true;
    } catch {
      return false;
    }
  }
  function isChemistryMismatch(error) {
    if (error == null) return false;
    const codes = getGlobal("UtasErrorCode");
    const expected = codes?.["CHEMISTRY_VERSION_MISMATCH"];
    if (expected == null) return false;
    return String(error) === String(expected);
  }
  async function resetChemistry() {
    const chem = chemistryService();
    try {
      chem?.resetCustomProfiles?.();
    } catch (err) {
      console.warn("[fut-sbc] resetCustomProfiles fall\xF3", err);
    }
    try {
      const obs = chem?.requestChemistryProfiles?.();
      if (obs != null) await toPromise(obs);
    } catch (err) {
      console.warn("[fut-sbc] requestChemistryProfiles fall\xF3", err);
    }
  }
  function readViolations(res) {
    const buckets = [];
    buckets.push(res.data?.itemViolations);
    if (typeof res.error === "object" && res.error !== null) {
      buckets.push(res.error.itemViolations);
    }
    const out = [];
    for (const bucket of buckets) {
      if (!Array.isArray(bucket)) continue;
      for (const v of bucket) {
        const name = v?.name;
        const text = name != null ? String(name) : String(v);
        if (text && !out.includes(text)) out.push(text);
      }
    }
    return out;
  }
  function liveChallengeObject(challenge) {
    try {
      const vc = findLiveOverviewVC(challenge.id);
      const live = vc?._challenge;
      if (live && Number(live.id) === challenge.id) return live;
    } catch {
    }
    return challenge.raw ?? null;
  }
  var DISMISSABLE_VC = /(modal|dialog|popup|alert|reward|toast|overlay)/i;
  var DISMISS_METHODS = ["dismiss", "close", "hide"];
  var MODAL_SELECTORS = ".ut-navigation-button-control, .view-modal-container, .ea-dialog-view";
  var DISMISS_LABEL = /^(ok|continue|collect|claim)$/i;
  async function dismissPostSubmit() {
    try {
      const overlays = findViewControllers(
        (n) => DISMISSABLE_VC.test(constructorName(n)) && hasDismisser(n) && isInDom(n)
      );
      for (const vc of overlays) {
        if (callDismisser(vc)) {
          await delay(250);
          break;
        }
      }
    } catch (err) {
      console.warn("[fut-sbc] dismissPostSubmit: barrido de VCs fall\xF3", err);
    }
    if (!modalPresent()) return;
    try {
      if (clickDismissButton()) await delay(250);
    } catch (err) {
      console.warn("[fut-sbc] dismissPostSubmit: click de bot\xF3n fall\xF3", err);
    }
    if (!modalPresent()) return;
    try {
      pressEscape();
      await delay(250);
    } catch (err) {
      console.warn("[fut-sbc] dismissPostSubmit: Escape fall\xF3", err);
    }
  }
  function hasDismisser(node) {
    return DISMISS_METHODS.some((m) => typeof node[m] === "function");
  }
  function callDismisser(node) {
    for (const m of DISMISS_METHODS) {
      const fn = node[m];
      if (typeof fn !== "function") continue;
      try {
        fn.call(node);
        return true;
      } catch {
      }
    }
    return false;
  }
  function modalPresent() {
    try {
      if (typeof document === "undefined") return false;
      return document.querySelector(".view-modal-container, .ea-dialog-view") != null;
    } catch {
      return false;
    }
  }
  function clickDismissButton() {
    if (typeof document === "undefined") return false;
    const scopes = Array.from(document.querySelectorAll(MODAL_SELECTORS));
    for (const scope of scopes) {
      const candidates = [
        scope,
        ...Array.from(scope.querySelectorAll("button, .btn-standard, [role='button']"))
      ];
      for (const el of candidates) {
        const label = (el.textContent ?? "").trim();
        if (!DISMISS_LABEL.test(label)) continue;
        el.click?.();
        return true;
      }
    }
    return false;
  }
  function pressEscape() {
    if (typeof document === "undefined") return;
    const init = {
      key: "Escape",
      code: "Escape",
      bubbles: true,
      cancelable: true
    };
    Object.assign(init, { keyCode: 27, which: 27 });
    document.dispatchEvent(new KeyboardEvent("keydown", init));
    document.dispatchEvent(new KeyboardEvent("keyup", init));
  }
  async function reenterChallenge(setId, challengeId) {
    const sbc = sbcService();
    if (!sbc) return null;
    const set = await findSet(setId);
    if (!set) return null;
    let raw = pickChallenge(challengesOf(set), challengeId);
    if (!raw && typeof sbc.requestChallengesForSet === "function") {
      try {
        const res = await toPromise(
          sbc.requestChallengesForSet.call(sbc, set)
        );
        const list = res.data?.challenges;
        if (Array.isArray(list)) raw = pickChallenge(list, challengeId);
      } catch (err) {
        console.warn("[fut-sbc] requestChallengesForSet fall\xF3", err);
      }
    }
    if (!raw) return null;
    await loadChallengeSquad(sbc, raw, challengeId);
    try {
      const open = await getOpenChallenge();
      if (open && open.id === challengeId) return open;
    } catch (err) {
      console.warn("[fut-sbc] getOpenChallenge tras reenter fall\xF3", err);
    }
    if (!raw.squad) return null;
    const constraints = parseRequirements(raw);
    const positions = readSlotPositions2(raw);
    if (positions.length === constraints.slots) constraints.slotPositions = positions;
    return {
      id: Number(raw.id ?? challengeId),
      setId: Number(raw.setId ?? setId),
      name: String(raw.name ?? ""),
      slots: constraints.slots,
      constraints,
      raw
    };
  }
  async function loadChallengeSquad(sbc, raw, challengeId) {
    const inProgress = safeInProgress2(raw);
    if (typeof sbc.loadChallenge === "function") {
      try {
        const res = await toPromise(
          sbc.loadChallenge.call(sbc, raw)
        );
        attachSquad(raw, res.data?.squad);
      } catch (err) {
        console.warn("[fut-sbc] loadChallenge fall\xF3", err);
      }
    }
    if (raw.squad) return;
    const dao = sbc.sbcDAO;
    if (typeof dao?.loadChallenge === "function") {
      try {
        const res = await toPromise(
          dao.loadChallenge.call(dao, challengeId, inProgress)
        );
        attachSquad(raw, res.data?.squad);
      } catch (err) {
        console.warn("[fut-sbc] sbcDAO.loadChallenge fall\xF3", err);
      }
    }
  }
  function attachSquad(raw, squad) {
    if (raw.squad || squad == null) return;
    try {
      raw.squad = squad;
    } catch {
    }
  }
  function pickChallenge(list, challengeId) {
    for (const c of list) {
      if (!c || typeof c !== "object") continue;
      if (Number(c.id) === challengeId) return c;
    }
    return null;
  }
  function readSlotPositions2(raw) {
    const sq = raw.squad;
    try {
      const slots = sq?.getNonBrickSlots?.() ?? [];
      return slots.map((s) => {
        const g = s.getGeneralPosition?.();
        return typeof g === "number" ? g : Number(s.position?.id ?? -1);
      });
    } catch {
      return [];
    }
  }
  async function repeatability(setId) {
    const set = await findSet(setId);
    if (!set) return null;
    const mode2 = String(set.repeatabilityMode ?? "").trim() || "UNKNOWN";
    const repeats = safeNum2(() => Number(set.repeats)) ?? 0;
    const timesCompleted = safeNum2(() => Number(set.timesCompleted)) ?? 0;
    return {
      mode: mode2,
      repeats,
      timesCompleted,
      remaining: remainingRuns(mode2, repeats, timesCompleted)
    };
  }
  function remainingRuns(mode2, repeats, timesCompleted) {
    if (mode2 === "NON_REPEATABLE") return timesCompleted > 0 ? 0 : 1;
    if (repeats > 0) return Math.max(repeats - timesCompleted, 0);
    if (mode2 === "UNLIMITED" || mode2 === "REFRESH") return Number.POSITIVE_INFINITY;
    return 0;
  }
  async function findSet(setId) {
    const sbc = sbcService();
    if (!sbc || !Number.isFinite(setId)) return null;
    const direct = setFromRepository(sbc, setId);
    if (direct) return direct;
    if (typeof sbc.requestSets === "function") {
      try {
        const res = await toPromise(sbc.requestSets.call(sbc));
        const sets = res.data?.sets;
        if (Array.isArray(sets)) {
          const hit = sets.find((s) => Number(s.id) === setId);
          if (hit) return hit;
        }
      } catch (err) {
        console.warn("[fut-sbc] requestSets fall\xF3", err);
      }
    }
    return setFromRepository(sbc, setId);
  }
  function setFromRepository(sbc, setId) {
    const repo = sbc.repository;
    if (!repo) return null;
    try {
      const byId = repo.getSetById?.(setId);
      if (byId) return byId;
    } catch {
    }
    for (const s of collectionValues2(repo.sets)) {
      if (Number(s.id) === setId) return s;
    }
    return null;
  }
  function challengesOf(set) {
    try {
      const chs = set.getChallenges?.();
      return Array.isArray(chs) ? chs : [];
    } catch {
      return [];
    }
  }
  function collectionValues2(coll) {
    if (!coll) return [];
    const inner = coll._collection ?? coll;
    if (inner instanceof Map) return [...inner.values()];
    if (Array.isArray(inner)) return inner;
    if (typeof inner === "object") return Object.values(inner);
    return [];
  }
  function safeInProgress2(raw) {
    try {
      return raw.isInProgress?.() === true;
    } catch {
      return false;
    }
  }
  function safeNum2(fn) {
    try {
      const n = fn();
      return typeof n === "number" && Number.isFinite(n) ? n : void 0;
    } catch {
      return void 0;
    }
  }
  function errMsg2(err) {
    return err instanceof Error ? err.message : String(err);
  }

  // src/ui/result-card.ts
  function cardShell(headingText, onClose) {
    const el = document.createElement("div");
    el.className = "card";
    const head = document.createElement("div");
    head.className = "card-head";
    const heading = document.createElement("span");
    heading.textContent = headingText;
    const close = document.createElement("button");
    close.className = "icon-btn";
    close.type = "button";
    close.setAttribute("aria-label", "Cerrar");
    close.textContent = "\xD7";
    close.addEventListener("click", onClose);
    head.append(heading, close);
    const body = document.createElement("div");
    body.className = "card-body";
    el.append(head, body);
    return { el, body };
  }
  function createResultCard(solution, opts, unmet = []) {
    const { el, body } = cardShell(
      unmet.length > 0 ? "Soluci\xF3n parcial" : "Soluci\xF3n",
      opts.onClose
    );
    if (unmet.length > 0) {
      const warn = document.createElement("div");
      warn.className = "warn";
      const wh = document.createElement("div");
      wh.className = "buy-head";
      wh.textContent = "No cumple todav\xEDa";
      const wl = document.createElement("ul");
      for (const u of unmet) {
        const li = document.createElement("li");
        li.textContent = u;
        wl.append(li);
      }
      warn.append(wh, wl);
      body.append(warn);
    }
    const stats = document.createElement("div");
    stats.className = "stats";
    stats.append(
      stat("Media", String(solution.teamRating)),
      stat("Qu\xEDmica", solution.chemistry < 0 ? "\u2014" : String(solution.chemistry)),
      stat("Jugadores", String(solution.players.length))
    );
    body.append(stats);
    const list = document.createElement("ul");
    list.className = "player-list";
    for (const p of solution.players) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "p-name";
      name.textContent = p.name || `#${p.definitionId}`;
      if (p.concept) {
        const tag = document.createElement("span");
        tag.className = "p-tag";
        tag.textContent = "comprar";
        name.append(" ", tag);
      }
      const rating = document.createElement("span");
      rating.className = "p-rating";
      rating.textContent = String(p.rating);
      li.append(name, rating);
      list.append(li);
    }
    body.append(list);
    if (solution.toBuy.length > 0) {
      const buyWrap = document.createElement("div");
      buyWrap.className = "buy";
      const buyHead = document.createElement("div");
      buyHead.className = "buy-head";
      buyHead.textContent = "Falta comprar";
      const buyList = document.createElement("ul");
      for (const b of solution.toBuy) {
        const li = document.createElement("li");
        li.textContent = `${b.count}\xD7 rating ${b.rating} (carta ${b.definitionId})`;
        buyList.append(li);
      }
      buyWrap.append(buyHead, buyList);
      if (opts.onBuyAndApply) {
        const row = document.createElement("label");
        row.className = "field";
        const lbl = document.createElement("span");
        lbl.textContent = "Tope de gasto";
        const spend = document.createElement("input");
        spend.type = "number";
        spend.min = "0";
        spend.step = "500";
        spend.value = "0";
        row.append(lbl, spend);
        const buyBtn = document.createElement("button");
        buyBtn.className = "btn primary";
        buyBtn.type = "button";
        buyBtn.textContent = "Comprar y aplicar";
        buyBtn.title = "NO verificado contra EA \u2014 us\xE1 un tope bajo";
        buyBtn.addEventListener("click", () => {
          const cap = Math.max(0, Math.round(spend.valueAsNumber || 0));
          if (cap <= 0) {
            spend.focus();
            return;
          }
          if (window.confirm(
            `Comprar fodder gastando hasta ${cap} monedas y aplicar? (flujo NO verificado)`
          )) {
            opts.onBuyAndApply(solution, cap);
          }
        });
        buyWrap.append(row, buyBtn);
      }
      body.append(buyWrap);
    }
    const actions = document.createElement("div");
    actions.className = "card-actions";
    const applyBtn = document.createElement("button");
    applyBtn.className = "btn primary";
    applyBtn.type = "button";
    applyBtn.textContent = "Aplicar";
    applyBtn.addEventListener("click", () => opts.onApply(solution));
    const closeBtn = document.createElement("button");
    closeBtn.className = "btn";
    closeBtn.type = "button";
    closeBtn.textContent = "Cerrar";
    closeBtn.addEventListener("click", opts.onClose);
    actions.append(applyBtn, closeBtn);
    body.append(actions);
    return {
      el,
      destroy() {
        el.remove();
      }
    };
  }
  function createErrorCard(message, opts) {
    const { el, body } = cardShell("Error", opts.onClose);
    el.classList.add("card-error");
    const msg = document.createElement("p");
    msg.className = "err-msg";
    msg.textContent = message;
    body.append(msg);
    const hint = document.createElement("p");
    hint.className = "err-hint";
    hint.textContent = "Detalle en la consola y en window.__futErr";
    body.append(hint);
    const actions = document.createElement("div");
    actions.className = "card-actions";
    const closeBtn = document.createElement("button");
    closeBtn.className = "btn";
    closeBtn.type = "button";
    closeBtn.textContent = "Cerrar";
    closeBtn.addEventListener("click", opts.onClose);
    actions.append(closeBtn);
    body.append(actions);
    return {
      el,
      destroy() {
        el.remove();
      }
    };
  }
  function stat(label, value) {
    const wrap = document.createElement("div");
    wrap.className = "stat";
    const v = document.createElement("span");
    v.className = "stat-v";
    v.textContent = value;
    const l = document.createElement("span");
    l.className = "stat-l";
    l.textContent = label;
    wrap.append(v, l);
    return wrap;
  }

  // src/ui/settings.ts
  var STORAGE_KEY = "fut-sbc-solver:ui-settings";
  var STRATEGIES = [
    "solo-club",
    "club-y-concept",
    "priorizar-descarte",
    "optimizar-rating-bajo",
    "optimizar-quimica"
  ];
  var STRATEGY_LABELS = {
    "solo-club": "Solo club",
    "club-y-concept": "Club + concept",
    "priorizar-descarte": "Priorizar descarte",
    "optimizar-rating-bajo": "Rating m\xE1s bajo",
    "optimizar-quimica": "M\xE1xima qu\xEDmica"
  };
  var DEFAULT_SETTINGS = {
    strategy: "optimizar-rating-bajo",
    excludeActiveSquad: true,
    excludeAllSquads: false,
    multiCount: 3,
    dryRun: true,
    useUnassigned: true,
    useStorage: true,
    allowTradeable: false,
    allowSpecials: true,
    panelOpen: false,
    autoSubmit: false
  };
  function clampCount(n) {
    const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : DEFAULT_SETTINGS.multiCount;
    return Math.min(20, Math.max(1, v));
  }
  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      const strategy = typeof parsed.strategy === "string" && STRATEGIES.includes(parsed.strategy) ? parsed.strategy : DEFAULT_SETTINGS.strategy;
      return {
        strategy,
        excludeActiveSquad: typeof parsed.excludeActiveSquad === "boolean" ? parsed.excludeActiveSquad : DEFAULT_SETTINGS.excludeActiveSquad,
        excludeAllSquads: typeof parsed.excludeAllSquads === "boolean" ? parsed.excludeAllSquads : DEFAULT_SETTINGS.excludeAllSquads,
        multiCount: clampCount(parsed.multiCount),
        dryRun: bool(parsed.dryRun, DEFAULT_SETTINGS.dryRun),
        useUnassigned: bool(parsed.useUnassigned, DEFAULT_SETTINGS.useUnassigned),
        useStorage: bool(parsed.useStorage, DEFAULT_SETTINGS.useStorage),
        allowTradeable: bool(parsed.allowTradeable, DEFAULT_SETTINGS.allowTradeable),
        allowSpecials: bool(parsed.allowSpecials, DEFAULT_SETTINGS.allowSpecials),
        panelOpen: bool(parsed.panelOpen, DEFAULT_SETTINGS.panelOpen),
        autoSubmit: bool(parsed.autoSubmit, DEFAULT_SETTINGS.autoSubmit)
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
  function bool(v, fallback) {
    return typeof v === "boolean" ? v : fallback;
  }
  function saveSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
    }
  }
  function createSettingsPopover(opts) {
    let state = { ...opts.initial };
    const el = document.createElement("div");
    el.className = "card popover";
    const head = document.createElement("div");
    head.className = "card-head";
    const title = document.createElement("span");
    title.textContent = "Ajustes";
    const close = document.createElement("button");
    close.className = "icon-btn";
    close.type = "button";
    close.setAttribute("aria-label", "Cerrar");
    close.textContent = "\xD7";
    close.addEventListener("click", () => opts.onClose());
    head.append(title, close);
    const body = document.createElement("div");
    body.className = "card-body";
    const emit = () => opts.onChange({ ...state });
    const stratRow = document.createElement("label");
    stratRow.className = "field";
    const stratLabel = document.createElement("span");
    stratLabel.textContent = "Estrategia por defecto";
    const stratSelect = document.createElement("select");
    for (const s of STRATEGIES) {
      const o = document.createElement("option");
      o.value = s;
      o.textContent = STRATEGY_LABELS[s];
      stratSelect.append(o);
    }
    stratSelect.value = state.strategy;
    stratSelect.addEventListener("change", () => {
      state = { ...state, strategy: stratSelect.value };
      emit();
    });
    stratRow.append(stratLabel, stratSelect);
    const exclActive = checkboxField("Excluir once activo", state.excludeActiveSquad, (v) => {
      state = { ...state, excludeActiveSquad: v };
      emit();
    });
    const exclAll = checkboxField("Excluir todas las plantillas", state.excludeAllSquads, (v) => {
      state = { ...state, excludeAllSquads: v };
      emit();
    });
    const countRow = document.createElement("label");
    countRow.className = "field";
    const countLabel = document.createElement("span");
    countLabel.textContent = "Soluciones (\xD7N)";
    const countInput = document.createElement("input");
    countInput.type = "number";
    countInput.min = "1";
    countInput.max = "20";
    countInput.step = "1";
    countInput.value = String(state.multiCount);
    countInput.addEventListener("change", () => {
      const next = clampCount(countInput.valueAsNumber);
      countInput.value = String(next);
      state = { ...state, multiCount: next };
      emit();
    });
    countRow.append(countLabel, countInput);
    const dryRow = checkboxField("Dry-run (no aplicar solo)", state.dryRun, (v) => {
      state = { ...state, dryRun: v };
      emit();
    });
    const unassignedRow = checkboxField("Usar sin asignar", state.useUnassigned, (v) => {
      state = { ...state, useUnassigned: v };
      emit();
    });
    const storageRow = checkboxField("Usar almacenamiento SBC", state.useStorage, (v) => {
      state = { ...state, useStorage: v };
      emit();
    });
    const tradeableRow = checkboxField("Incluir transferibles", state.allowTradeable, (v) => {
      state = { ...state, allowTradeable: v };
      emit();
    });
    const specialsRow = checkboxField("Incluir cartas especiales", state.allowSpecials, (v) => {
      state = { ...state, allowSpecials: v };
      emit();
    });
    body.append(
      stratRow,
      exclActive.el,
      exclAll.el,
      unassignedRow.el,
      storageRow.el,
      tradeableRow.el,
      specialsRow.el,
      countRow,
      dryRow.el
    );
    el.append(head, body);
    return {
      el,
      destroy() {
        el.remove();
      }
    };
  }
  function checkboxField(label, checked, onChange) {
    const wrap = document.createElement("label");
    wrap.className = "field check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    const span = document.createElement("span");
    span.textContent = label;
    wrap.append(input, span);
    return { el: wrap };
  }

  // src/ui/toolbar.ts
  var STRATEGY_ORDER = [
    "solo-club",
    "club-y-concept",
    "priorizar-descarte",
    "optimizar-rating-bajo",
    "optimizar-quimica"
  ];
  var CSS = `
:host {
  all: initial;
  /* Anchored inside .ut-squad-pitch-view, like AutoSBC's #auto-sbc-button.
     Collapsed to a small chip by default so it never covers the requirements
     header or the pitch \u2014 the full bar only appears once you open it. */
  position: absolute;
  left: 64px;
  top: 8px;
  z-index: 60;
  --bg: #ffffff;
  --fg: #1b1b1b;
  --muted: #6b6b6b;
  --border: #d3d3d3;
  --field-bg: #f6f6f6;
  --accent: #1e7e34;
  --accent-fg: #ffffff;
  --danger: #c0392b;
  --shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: var(--fg);
}
@media (prefers-color-scheme: dark) {
  :host {
    --bg: #202124;
    --fg: #e8e8e8;
    --muted: #9aa0a6;
    --border: #3c4043;
    --field-bg: #2a2b2e;
    --accent: #2ea043;
    --shadow: 0 4px 16px rgba(0, 0, 0, 0.55);
  }
}
* { box-sizing: border-box; }

/* Collapsed: just a chip. Expanded: the chip plus the controls, stacked so the
   panel stays narrow and hugs the top-left corner instead of running across
   the requirements header. */
.wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
/* Chip + the one-click Resolver, always visible without opening the panel. */
.quick {
  display: flex;
  align-items: center;
  gap: 6px;
}
.quick .btn { box-shadow: var(--shadow); }

.chip {
  font: inherit;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg);
  color: var(--fg);
  box-shadow: var(--shadow);
  cursor: pointer;
  white-space: nowrap;
}
.chip:hover { border-color: var(--accent); }
.chip-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  flex: none;
}
.chip-caret { font-size: 10px; color: var(--muted); }

.bar {
  display: none;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  width: 300px;
  padding: 6px 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow);
}
.bar.open { display: flex; }
.bar-title {
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.02em;
  padding-right: 4px;
  white-space: nowrap;
}
.bar-sub {
  font-size: 11px;
  color: var(--muted);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn {
  font: inherit;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--field-bg);
  color: var(--fg);
  cursor: pointer;
}
.btn:hover:not(:disabled) { border-color: var(--accent); }
.btn:disabled { opacity: 0.5; cursor: default; }
.btn.primary {
  background: var(--accent);
  color: var(--accent-fg);
  border-color: var(--accent);
}
.icon-btn {
  font: inherit;
  line-height: 1;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--field-bg);
  color: var(--fg);
  cursor: pointer;
}
.icon-btn:disabled { opacity: 0.5; cursor: default; }

select, input[type="number"] {
  font: inherit;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--field-bg);
  color: var(--fg);
}
input[type="number"] { width: 56px; }

.toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  user-select: none;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: fut-spin 0.7s linear infinite;
}
.spinner.hidden { display: none; }
@keyframes fut-spin { to { transform: rotate(360deg); } }

.overlay {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.overlay:empty { display: none; }

/* Full-screen block while a \xD7N cycle runs \u2014 EA's own views stay untouchable so
   a stray click can't reorder the squad mid-submit. */
.blocker {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(2px);
}
.blocker.on { display: flex; }
.blocker-panel {
  width: min(420px, 86vw);
  max-height: 70vh;
  overflow: auto;
  padding: 16px;
  border-radius: 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
}
.blocker-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  margin-bottom: 10px;
}
.blocker-log {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.blocker-hint { margin: 10px 0 0; font-size: 11px; color: var(--muted); }
.blocker-actions { display: flex; justify-content: flex-end; margin-top: 12px; }

.card {
  width: 320px;
  max-height: 74vh;
  overflow: auto;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow);
}
.card-error { border-color: var(--danger); }

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
}
.card-body { padding: 10px; display: flex; flex-direction: column; gap: 10px; }

.stats { display: flex; gap: 8px; }
.stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 4px;
  background: var(--field-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.stat-v { font-size: 16px; font-weight: 700; }
.stat-l { font-size: 11px; color: var(--muted); }

.player-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.player-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 4px 2px;
  border-bottom: 1px solid var(--border);
}
.player-list li:last-child { border-bottom: none; }
.p-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.p-rating {
  flex: none;
  min-width: 26px;
  text-align: center;
  font-weight: 700;
  padding: 1px 5px;
  background: var(--field-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
}
.p-tag, .buy-head {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--muted);
}
.p-tag { border: 1px solid var(--border); border-radius: 4px; padding: 0 3px; }

.buy { border: 1px solid var(--border); border-radius: 6px; padding: 8px; }
.buy ul { margin: 4px 0 0; padding-left: 16px; }

.warn { border: 1px solid var(--danger); border-radius: 6px; padding: 8px; }
.warn ul { margin: 4px 0 0; padding-left: 16px; }
.warn .buy-head { color: var(--danger); }

.card-actions { display: flex; gap: 8px; }
.card-actions .btn { flex: 1; }

.err-msg { margin: 0; white-space: pre-wrap; word-break: break-word; }
.err-hint { margin: 0; font-size: 11px; color: var(--muted); }

.field { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.field.check { justify-content: flex-start; }
.field.check span { flex: 1; }
.popover .card-body { gap: 8px; }
`;
  function makeButton(label, variant) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = variant === "primary" ? "btn primary" : "btn";
    b.textContent = label;
    return b;
  }
  function errorMessage(e) {
    if (e instanceof Error) return e.message;
    if (typeof e === "string") return e;
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  function mountToolbar(host, actions, challengeName) {
    const mountHost = document.createElement("div");
    mountHost.className = "fut-sbc-toolbar-host";
    const shadow = mountHost.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    shadow.append(style);
    const wrap = document.createElement("div");
    wrap.className = "wrap";
    shadow.append(wrap);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    const chipDot = document.createElement("span");
    chipDot.className = "chip-dot";
    const chipLabel = document.createElement("span");
    chipLabel.textContent = "SBC Solver";
    const chipCaret = document.createElement("span");
    chipCaret.className = "chip-caret";
    chipCaret.textContent = "\u25BE";
    chip.append(chipDot, chipLabel, chipCaret);
    chip.setAttribute("aria-expanded", "false");
    const quick = document.createElement("div");
    quick.className = "quick";
    quick.append(chip);
    const bar = document.createElement("div");
    bar.className = "bar";
    wrap.append(quick, bar);
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    shadow.append(overlay);
    const blocker = document.createElement("div");
    blocker.className = "blocker";
    const blockerPanel = document.createElement("div");
    blockerPanel.className = "blocker-panel";
    const blockerHead = document.createElement("div");
    blockerHead.className = "blocker-head";
    const blockerSpinner = document.createElement("span");
    blockerSpinner.className = "spinner";
    const blockerTitle = document.createElement("span");
    blockerTitle.textContent = "Resolviendo y enviando\u2026";
    blockerHead.append(blockerSpinner, blockerTitle);
    const blockerLog = document.createElement("pre");
    blockerLog.className = "blocker-log";
    const blockerHint = document.createElement("p");
    blockerHint.className = "blocker-hint";
    blockerHint.textContent = "No toques nada hasta que termine el ciclo.";
    const blockerActions = document.createElement("div");
    blockerActions.className = "blocker-actions";
    const blockerClose = makeButton("Cerrar");
    blockerClose.style.display = "none";
    blockerActions.append(blockerClose);
    blockerPanel.append(blockerHead, blockerLog, blockerHint, blockerActions);
    blocker.append(blockerPanel);
    shadow.append(blocker);
    for (const ev of ["click", "mousedown", "pointerdown", "keydown", "wheel"]) {
      blocker.addEventListener(ev, (e) => e.stopPropagation());
    }
    blockerClose.addEventListener("click", () => {
      blocker.classList.remove("on");
      const fn = onBlockerClose;
      onBlockerClose = null;
      fn?.();
    });
    let settings = loadSettings();
    let busy = false;
    let popover = null;
    const solveBtn = makeButton("Resolver", "primary");
    const solveNBtn = makeButton(`Resolver \xD7${settings.multiCount}`);
    const excludeToggle = document.createElement("label");
    excludeToggle.className = "toggle";
    const excludeInput = document.createElement("input");
    excludeInput.type = "checkbox";
    excludeInput.checked = settings.excludeActiveSquad;
    const excludeText = document.createElement("span");
    excludeText.textContent = "Excluir once";
    excludeToggle.append(excludeInput, excludeText);
    const strategySelect = document.createElement("select");
    for (const s of STRATEGY_ORDER) {
      const o = document.createElement("option");
      o.value = s;
      o.textContent = STRATEGY_LABELS[s];
      strategySelect.append(o);
    }
    strategySelect.value = settings.strategy;
    const combosBtn = makeButton("Combos");
    const gearBtn = document.createElement("button");
    gearBtn.type = "button";
    gearBtn.className = "icon-btn";
    gearBtn.setAttribute("aria-label", "Ajustes");
    gearBtn.textContent = "\u2699";
    const spinner = document.createElement("span");
    spinner.className = "spinner hidden";
    const sub = document.createElement("span");
    sub.className = "bar-sub";
    sub.textContent = challengeName ?? "";
    quick.append(solveBtn);
    bar.append(
      sub,
      solveNBtn,
      excludeToggle,
      strategySelect,
      combosBtn,
      gearBtn,
      spinner
    );
    const controls = [
      solveBtn,
      solveNBtn,
      strategySelect,
      combosBtn,
      gearBtn,
      excludeInput
    ];
    function setBusy(next) {
      busy = next;
      spinner.classList.toggle("hidden", !next);
      for (const c of controls) c.disabled = next;
    }
    let onBlockerClose = null;
    function showProgress(lines, done, onClose) {
      blockerLog.textContent = lines.join("\n");
      blocker.classList.add("on");
      blockerSpinner.classList.toggle("hidden", done);
      blockerTitle.textContent = done ? "Ciclo terminado" : "Resolviendo y enviando\u2026";
      blockerHint.textContent = done ? "Al cerrar volv\xE9s a la lista de SBCs." : "No toques nada hasta que termine el ciclo.";
      blockerClose.textContent = done ? "Cerrar y volver a SBC" : "Cerrar";
      blockerClose.style.display = done ? "" : "none";
      onBlockerClose = onClose ?? null;
    }
    function clearOverlay() {
      if (popover) {
        popover.destroy();
        popover = null;
      }
      overlay.replaceChildren();
    }
    function showError(message) {
      window.__futErr = message;
      clearOverlay();
      overlay.append(createErrorCard(message, { onClose: clearOverlay }).el);
    }
    function showSolution(solution, unmet = []) {
      clearOverlay();
      const card = createResultCard(
        solution,
        {
          onClose: clearOverlay,
          onApply: (s) => {
            void run(() => actions.apply(s));
          },
          onBuyAndApply: (s, cap) => {
            void run(() => actions.buyAndApply(s, cap));
          }
        },
        unmet
      );
      overlay.append(card.el);
    }
    async function run(fn, opts = {}) {
      if (busy) return;
      setBusy(true);
      try {
        await fn();
        if (opts.closeOverlayOnSuccess) clearOverlay();
      } catch (e) {
        window.__futErr = e;
        showError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    }
    function currentExtras() {
      return {
        excludeActiveSquad: settings.excludeActiveSquad,
        excludeAllSquads: settings.excludeAllSquads,
        dryRun: settings.dryRun,
        useUnassigned: settings.useUnassigned,
        useStorage: settings.useStorage,
        allowTradeable: settings.allowTradeable,
        allowSpecials: settings.allowSpecials,
        autoSubmit: settings.autoSubmit
      };
    }
    function syncBarFromSettings() {
      solveNBtn.textContent = `Resolver \xD7${settings.multiCount}`;
      excludeInput.checked = settings.excludeActiveSquad;
      strategySelect.value = settings.strategy;
    }
    function setOpen(next) {
      bar.classList.toggle("open", next);
      chip.setAttribute("aria-expanded", String(next));
      chipCaret.textContent = next ? "\u25B4" : "\u25BE";
      settings = { ...settings, panelOpen: next };
      saveSettings(settings);
    }
    setOpen(settings.panelOpen);
    chip.addEventListener("click", () => {
      const next = !bar.classList.contains("open");
      if (!next) clearOverlay();
      setOpen(next);
    });
    solveBtn.addEventListener("click", () => {
      void run(() => actions.solve(settings.strategy, currentExtras()));
    });
    solveNBtn.addEventListener("click", () => {
      const n = settings.multiCount;
      const ok = window.confirm(
        `Resolver y ENVIAR este SBC ${n} ${n === 1 ? "vez" : "veces"}.

Cada vuelta arma la plantilla, la env\xEDa y vuelve a entrar. Consume las cartas que use. Esto NO se puede deshacer.

\xBFSeguir?`
      );
      if (!ok) return;
      void run(() => actions.solveMultiple(settings.strategy, n, currentExtras()));
    });
    combosBtn.addEventListener("click", () => {
      void run(() => actions.showCombos());
    });
    excludeInput.addEventListener("change", () => {
      settings = { ...settings, excludeActiveSquad: excludeInput.checked };
      saveSettings(settings);
    });
    strategySelect.addEventListener("change", () => {
      settings = { ...settings, strategy: strategySelect.value };
      saveSettings(settings);
    });
    gearBtn.addEventListener("click", () => {
      if (popover) {
        clearOverlay();
        return;
      }
      overlay.replaceChildren();
      popover = createSettingsPopover({
        initial: settings,
        onChange: (next) => {
          settings = next;
          saveSettings(next);
          syncBarFromSettings();
        },
        onClose: () => clearOverlay()
      });
      overlay.append(popover.el);
    });
    host.append(mountHost);
    return {
      destroy() {
        clearOverlay();
        mountHost.remove();
      },
      setBusy,
      showError,
      showSolution,
      showProgress
    };
  }

  // src/solver/rating.ts
  function squadRating(ratings) {
    const n = ratings.length;
    if (n === 0) return 0;
    const sum = ratings.reduce((a, b) => a + b, 0);
    const avg = sum / n;
    let excess = 0;
    for (const r of ratings) if (r > avg) excess += r - avg;
    return Math.floor((sum + excess) / n);
  }
  function shadowCost(rating, target) {
    const t = target ?? rating;
    return 1e3 * rating + 1e4 * Math.abs(t - rating);
  }

  // src/solver/chemistry.ts
  function inPosition(p, slotPos) {
    if (slotPos == null) return true;
    if (p.concept) return true;
    return p.positions.length === 0 || p.positions.includes(slotPos);
  }
  function estimateChemistry(players, slotPositions) {
    const active = players.map((p, i) => ({ p, ok: inPosition(p, slotPositions?.[i]) })).filter((x) => x.ok && !x.p.concept).map((x) => x.p);
    const club = /* @__PURE__ */ new Map();
    const league = /* @__PURE__ */ new Map();
    const nation = /* @__PURE__ */ new Map();
    for (const p of active) {
      bump(club, p.teamId);
      bump(league, p.leagueId);
      bump(nation, p.nationId);
    }
    let total = 0;
    for (const p of active) {
      const pts = tier(club.get(p.teamId) ?? 0, 2, 4, 7) + tier(league.get(p.leagueId) ?? 0, 3, 5, 8) + tier(nation.get(p.nationId) ?? 0, 2, 5, 8);
      total += Math.min(3, pts);
    }
    return Math.min(33, total);
  }
  function assignSlots(players, slotPositions, deadline = Infinity) {
    if (!slotPositions || slotPositions.length !== players.length) {
      return players.slice();
    }
    const n = players.length;
    const pool = players.slice();
    const slots = new Array(n).fill(null);
    const canFill = (pl, s) => inPosition(pl, slotPositions[s]);
    const order = [...slotPositions.keys()].sort(
      (a, b) => pool.filter((pl) => canFill(pl, a)).length - pool.filter((pl) => canFill(pl, b)).length
    );
    for (const s of order) {
      let best = null;
      let bestGain = -Infinity;
      for (const pl of pool) {
        if (slots.includes(pl)) continue;
        const fits = canFill(pl, s);
        const trial = slots.slice();
        trial[s] = pl;
        const gain = estimateChemistry(compact(trial), compactPos(trial, slotPositions)) + (fits ? 0 : -100);
        if (gain > bestGain) {
          bestGain = gain;
          best = pl;
        }
      }
      slots[s] = best;
    }
    let current = slots.map((p) => p ?? pool.find((x) => !slots.includes(x)));
    let bestChem = estimateChemistry(current, slotPositions);
    let improved = true;
    while (improved && Date.now() < deadline) {
      improved = false;
      for (let i = 0; i < n && Date.now() < deadline; i++) {
        for (let j = i + 1; j < n; j++) {
          const swapped = current.slice();
          [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
          const chem = estimateChemistry(swapped, slotPositions);
          if (chem > bestChem) {
            current = swapped;
            bestChem = chem;
            improved = true;
          }
        }
      }
    }
    return current;
  }
  function compact(arr) {
    return arr.filter((p) => p != null);
  }
  function compactPos(arr, pos) {
    return pos.filter((_, i) => arr[i] != null);
  }
  function bump(m, k) {
    if (k > 0) m.set(k, (m.get(k) ?? 0) + 1);
  }
  function tier(n, a, b, c) {
    if (n >= c) return 3;
    if (n >= b) return 2;
    if (n >= a) return 1;
    return 0;
  }

  // src/solver/constraints.ts
  var PER_PLAYER_KINDS = /* @__PURE__ */ new Set([
    "quality",
    "rarity",
    "league",
    "nation",
    "club",
    "group"
  ]);
  var DISTINCT_KINDS = /* @__PURE__ */ new Set([
    "distinctLeagues",
    "distinctNations",
    "distinctClubs"
  ]);
  function isPerPlayerKind(kind) {
    return PER_PLAYER_KINDS.has(kind);
  }
  function isDistinctKind(kind) {
    return DISTINCT_KINDS.has(kind);
  }
  function isGroupableKind(kind) {
    return kind === "league" || kind === "nation" || kind === "club";
  }
  function groupKey(kind, p) {
    if (kind === "league" || kind === "distinctLeagues") return p.leagueId;
    if (kind === "nation" || kind === "distinctNations") return p.nationId;
    return p.teamId;
  }
  function playerSatisfies(p, req) {
    switch (req.kind) {
      case "quality":
        return p.quality === String(req.value);
      case "rarity":
        return p.rarityId === Number(req.value);
      case "league":
        return req.value == null || p.leagueId === Number(req.value);
      case "nation":
        return req.value == null || p.nationId === Number(req.value);
      case "club":
        return req.value == null || p.teamId === Number(req.value);
      case "group":
        return true;
      default:
        return false;
    }
  }
  function passesOvrBounds(p, c) {
    if (c.exactOvr != null && p.rating !== c.exactOvr) return false;
    if (c.maxOvrPerPlayer != null && p.rating > c.maxOvrPerPlayer) return false;
    if (c.minOvrPerPlayer != null && p.rating < c.minOvrPerPlayer) return false;
    return true;
  }
  function passesExclusions(p, c) {
    for (const req of c.counted) {
      if (req.scope === "max" && req.count === 0 && isPerPlayerKind(req.kind) && playerSatisfies(p, req)) {
        return false;
      }
    }
    return true;
  }
  function isEligible(p, c) {
    return passesOvrBounds(p, c) && passesExclusions(p, c);
  }
  function countedProgress(players, req) {
    if (isDistinctKind(req.kind)) {
      return new Set(players.map((p) => groupKey(req.kind, p))).size;
    }
    if (req.value == null && isGroupableKind(req.kind)) {
      const counts = /* @__PURE__ */ new Map();
      for (const p of players) {
        const k = groupKey(req.kind, p);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      let max = 0;
      for (const v of counts.values()) if (v > max) max = v;
      return max;
    }
    return players.filter((p) => playerSatisfies(p, req)).length;
  }
  function countedSatisfied(players, req) {
    const have = countedProgress(players, req);
    switch (req.scope) {
      case "min":
        return have >= req.count;
      case "max":
        return have <= req.count;
      case "exact":
        return have === req.count;
    }
  }
  function requirementLabel(req) {
    return req.label || `${req.scope} ${req.count} ${req.kind}`;
  }
  function validate(players, c) {
    const unmet = [];
    if (players.length !== c.slots) {
      unmet.push(`slots filled ${players.length}/${c.slots}`);
    }
    const defIds = new Set(players.map((p) => p.definitionId));
    if (defIds.size !== players.length) {
      unmet.push("duplicate card (same definitionId used twice)");
    }
    const offender = players.find((p) => !passesOvrBounds(p, c));
    if (offender) {
      unmet.push(`OVR bounds violated by ${offender.name} (${offender.rating})`);
    }
    const excluded = players.find((p) => !passesExclusions(p, c));
    if (excluded) {
      unmet.push(`excluded card used: ${excluded.name}`);
    }
    if (c.teamRatingMin != null) {
      const r = squadRating(players.map((p) => p.rating));
      if (r < c.teamRatingMin) unmet.push(`team rating ${r} < ${c.teamRatingMin}`);
    }
    for (const req of c.counted) {
      if (!countedSatisfied(players, req)) unmet.push(requirementLabel(req));
    }
    return { ok: unmet.length === 0, unmet };
  }

  // src/solver/strategies.ts
  function strategyAllowsConcepts(s) {
    return s === "club-y-concept";
  }
  function discardRank(p) {
    if (p.isDuplicate) return 0;
    if (p.untradeable) return 1;
    if (p.inStorage) return 2;
    return 3;
  }
  function orderPool(pool, strategy, _constraints) {
    let out = pool.slice();
    if (!strategyAllowsConcepts(strategy)) {
      out = out.filter((p) => !p.concept);
    }
    switch (strategy) {
      case "solo-club":
        out = out.filter((p) => !p.inActiveSquad);
        out.sort((a, b) => a.rating - b.rating);
        break;
      case "club-y-concept":
        out.sort(
          (a, b) => Number(a.concept) - Number(b.concept) || a.rating - b.rating
        );
        break;
      case "priorizar-descarte":
        out.sort(
          (a, b) => discardRank(a) - discardRank(b) || a.rating - b.rating
        );
        break;
      case "optimizar-rating-bajo":
        out.sort((a, b) => a.rating - b.rating);
        break;
      case "optimizar-quimica":
        out.sort(
          (a, b) => a.teamId - b.teamId || a.nationId - b.nationId || a.leagueId - b.leagueId || a.rating - b.rating
        );
        break;
    }
    return out;
  }

  // src/solver/index.ts
  var DEFAULT_TIME_BUDGET_MS = 4e3;
  function solve(pool, constraints, opts) {
    const deadline = Date.now() + (opts.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
    const ordered = orderPool(pool, opts.strategy, constraints);
    const eligible = ordered.filter((p) => isEligible(p, constraints));
    if (eligible.length < constraints.slots) {
      return {
        ok: false,
        reason: `only ${eligible.length} eligible players for ${constraints.slots} slots`,
        unmet: [`slots filled 0/${constraints.slots}`]
      };
    }
    let best = null;
    for (const allowSpecial of [false, true]) {
      const sub = allowSpecial ? eligible : eligible.filter((p) => !p.isSpecial);
      if (sub.length < constraints.slots) continue;
      const attempt = search(sub, constraints, deadline);
      if (attempt.ok) return finalize(attempt.players, constraints, deadline);
      if (!best || attempt.players.length > best.players.length) {
        best = { players: attempt.players, unmet: attempt.unmet };
      }
      if (Date.now() > deadline) break;
    }
    const partial = best ?? { players: [], unmet: ["no candidates"] };
    return {
      ok: false,
      reason: "no valid squad within constraints / time budget",
      unmet: partial.unmet,
      solution: partial.players.length > 0 ? buildSolution(partial.players, constraints, deadline) : void 0
    };
  }
  function solveMultiple(pool, constraints, opts, n) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    let working = pool.slice();
    const perCall = Math.max(
      500,
      Math.floor((opts.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS) / Math.max(1, n))
    );
    for (let i = 0; i < n; i++) {
      if (working.length < constraints.slots) break;
      const r = solve(working, constraints, { ...opts, timeBudgetMs: perCall });
      if (!r.ok || !r.solution) break;
      if (!seen.has(r.solution.key)) {
        seen.add(r.solution.key);
        out.push(r.solution);
      }
      const lowest = r.solution.players.reduce(
        (a, b) => b.rating < a.rating ? b : a
      );
      working = working.filter((p) => p.id !== lowest.id);
    }
    return out;
  }
  function ratingCombos(target, slots) {
    if (slots <= 0 || target <= 0) return [];
    const combos = [];
    const seen = /* @__PURE__ */ new Set();
    const consider = (counts) => {
      let sum = 0;
      let high = 0;
      let over = 0;
      let top = 0;
      let total = 0;
      for (const [r, c] of counts) {
        if (c <= 0) continue;
        sum += r * c;
        total += c;
        top = Math.max(top, r);
        if (r > target) {
          high += c;
          over += (r - target) * c;
        }
      }
      if (total !== slots) return;
      const mean = sum / slots;
      if (mean < target) return;
      if (mean >= target + 1) return;
      const map = {};
      for (const [r, c] of [...counts.entries()].sort((a, b) => b[0] - a[0])) {
        if (c > 0) map[String(r)] = c;
      }
      const key = JSON.stringify(map);
      if (seen.has(key)) return;
      seen.add(key);
      combos.push({ map, high, over, top });
    };
    consider(/* @__PURE__ */ new Map([[target, slots]]));
    for (let h = target; h <= target + 5; h++) {
      for (let l = target - 6; l <= target; l++) {
        if (h === l) continue;
        for (let nh = 1; nh < slots; nh++) {
          consider(
            /* @__PURE__ */ new Map([
              [h, nh],
              [l, slots - nh]
            ])
          );
        }
      }
    }
    for (let h = target + 1; h <= target + 4; h++) {
      for (let l = target - 4; l <= target - 1; l++) {
        for (let nh = 1; nh <= slots - 2; nh++) {
          for (let nl = 1; nl <= slots - 1 - nh; nl++) {
            consider(
              /* @__PURE__ */ new Map([
                [h, nh],
                [l, nl],
                [target, slots - nh - nl]
              ])
            );
          }
        }
      }
    }
    combos.sort(
      (a, b) => a.high - b.high || a.over - b.over || a.top - b.top
    );
    return combos.slice(0, 12).map((c) => c.map);
  }
  function search(eligible, c, deadline) {
    const restrictions = distinctCapRestrictions(eligible, c);
    let best = { ok: false, players: [], unmet: ["infeasible"] };
    for (const pred of restrictions) {
      if (Date.now() > deadline) break;
      const sub = pred ? eligible.filter(pred) : eligible;
      if (sub.length < c.slots) continue;
      const r = greedyThenRating(sub, c, deadline);
      if (r.ok) return r;
      if (r.players.length > best.players.length) best = r;
    }
    return best;
  }
  function distinctCapRestrictions(pool, c) {
    const req = c.counted.find(
      (r) => isDistinctKind(r.kind) && (r.scope === "max" || r.scope === "exact")
    );
    if (!req) return [null];
    const counts = /* @__PURE__ */ new Map();
    for (const p of pool) {
      const k = groupKey(req.kind, p);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const values = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([v]) => v);
    const pick = Math.min(req.count, values.length);
    const sets = kCombinations(values, pick).slice(0, 20);
    if (sets.length === 0) return [null];
    return sets.map((set) => {
      const allow = new Set(set);
      return (p) => allow.has(groupKey(req.kind, p));
    });
  }
  function greedyThenRating(pool, c, deadline) {
    const picked = [];
    const usedDef = /* @__PURE__ */ new Set();
    const usedId = /* @__PURE__ */ new Set();
    const take = (p) => {
      picked.push(p);
      usedDef.add(p.definitionId);
      usedId.add(p.id);
    };
    const available = () => pool.filter((p) => !usedId.has(p.id) && !usedDef.has(p.definitionId));
    const target = c.teamRatingMin;
    const inWindow = (p) => target == null || p.rating >= target - 15 && p.rating <= target + 15;
    const wantsChem = (c.chemistryMin ?? 0) > 0;
    const needPositions = c.slotPositions ?? [];
    const hardUnmet = (sq) => validate(sq, c).unmet.filter((u) => !u.toLowerCase().includes("chem")).length;
    const domLeague = wantsChem ? dominant(pool, (p) => p.leagueId) : 0;
    const domNation = wantsChem ? dominant(pool, (p) => p.nationId) : 0;
    const chemRank = (p) => {
      if (!wantsChem || p.concept) return 1;
      return (p.leagueId === domLeague ? 0 : 1) + (p.nationId === domNation ? 0 : 1);
    };
    if (wantsChem && needPositions.includes(0) && pool.some((p) => p.positions.includes(0))) {
      const gk = available().filter((p) => p.positions.includes(0)).sort(
        (a, b) => chemRank(a) - chemRank(b) || (target != null ? shadowCost(a.rating, target) - shadowCost(b.rating, target) : a.rating - b.rating)
      )[0];
      if (gk) take(gk);
    }
    const counted = c.counted.filter((r) => (r.scope === "min" || r.scope === "exact") && r.count > 0).filter((r) => !isDistinctKind(r.kind)).sort((a, b) => {
      const ra = a.kind === "rarity" ? 0 : 1;
      const rb = b.kind === "rarity" ? 0 : 1;
      return ra - rb || b.count - a.count;
    });
    for (const req of counted) {
      if (picked.length >= c.slots) break;
      let group = null;
      if (req.value == null && isGroupableKind(req.kind)) {
        group = majorityGroup(req, [...picked, ...available()]);
      }
      const matches = (p) => group != null ? groupKey(req.kind, p) === group : playerSatisfies(p, req);
      let have = picked.filter(matches).length;
      const sub = available().filter(matches).sort(
        (a, b) => Number(inWindow(b)) - Number(inWindow(a)) || chemRank(a) - chemRank(b)
      );
      for (const p of sub) {
        if (have >= req.count || picked.length >= c.slots) break;
        take(p);
        have++;
      }
    }
    const remaining = c.slots - picked.length;
    if (remaining > 0) {
      const windowPool = available().filter((p) => target == null || inWindow(p)).sort((a, b) => chemRank(a) - chemRank(b));
      const fixedRatings = picked.map((p) => p.rating);
      let chosen = null;
      if (wantsChem) {
        const linked = windowPool.filter((p) => chemRank(p) <= 1);
        if (linked.length >= remaining) {
          chosen = chooseForRating(
            fixedRatings,
            linked,
            remaining,
            target,
            deadline
          );
        }
      }
      if (!chosen) {
        chosen = chooseForRating(
          fixedRatings,
          windowPool,
          remaining,
          target,
          deadline
        );
      }
      if (chosen) {
        for (const p of chosen) take(p);
      } else {
        const rest = available().slice().sort((a, b) => chemRank(a) - chemRank(b) || b.rating - a.rating).slice(0, remaining);
        for (const p of rest) take(p);
      }
    } else if (remaining < 0) {
      picked.sort((a, b) => a.rating - b.rating);
      picked.length = c.slots;
    }
    if (wantsChem && needPositions.length === c.slots && picked.length === c.slots) {
      for (let pass = 0; pass < 3 && Date.now() < deadline; pass++) {
        const ordered = assignSlots(picked, needPositions, deadline);
        let swapped = false;
        for (let i = 0; i < ordered.length; i++) {
          const cur = ordered[i];
          if (cur.concept || cur.positions.length === 0) continue;
          if (cur.positions.includes(needPositions[i])) continue;
          const alt = pool.filter(
            (p) => !picked.includes(p) && p.positions.includes(needPositions[i]) && (target == null || inWindow(p))
          ).sort((a, b) => chemRank(a) - chemRank(b) || b.rating - a.rating)[0];
          if (!alt) continue;
          const trial = picked.map((p) => p === cur ? alt : p);
          if (hardUnmet(trial) <= hardUnmet(picked)) {
            picked.splice(picked.indexOf(cur), 1, alt);
            usedId.delete(cur.id);
            usedDef.delete(cur.definitionId);
            usedId.add(alt.id);
            usedDef.add(alt.definitionId);
            swapped = true;
          }
        }
        if (!swapped) break;
      }
    }
    const v = validate(picked, c);
    if (wantsChem && picked.length === c.slots) {
      const ordered = assignSlots(picked, c.slotPositions, deadline);
      const chem = estimateChemistry(ordered, c.slotPositions);
      if (chem < c.chemistryMin) v.unmet.push(`chemistry ~${chem} < ${c.chemistryMin}`);
      return { ok: v.unmet.length === 0, players: ordered, unmet: v.unmet };
    }
    return { ok: v.ok, players: picked, unmet: v.unmet };
  }
  function dominant(players, key) {
    const counts = /* @__PURE__ */ new Map();
    for (const p of players) {
      if (p.concept) continue;
      const k = key(p);
      if (k > 0) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let bestK = 0;
    let bestC = 0;
    for (const [k, cnt] of counts) {
      if (cnt > bestC) {
        bestC = cnt;
        bestK = k;
      }
    }
    return bestK;
  }
  function majorityGroup(req, players) {
    const counts = /* @__PURE__ */ new Map();
    for (const p of players) {
      const k = groupKey(req.kind, p);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let bestK = null;
    let bestC = -1;
    for (const [k, cnt] of counts) {
      if (cnt > bestC) {
        bestC = cnt;
        bestK = k;
      }
    }
    return bestK;
  }
  function chooseForRating(fixed, pool, need, target, deadline) {
    if (need <= 0) return [];
    if (pool.length < need) return null;
    const bucket = /* @__PURE__ */ new Map();
    for (const p of pool) {
      const arr = bucket.get(p.rating);
      if (arr) arr.push(p);
      else bucket.set(p.rating, [p]);
    }
    const ratingsAsc = [...bucket.keys()].sort((a, b) => a - b);
    const allRatingsDesc = pool.map((p) => p.rating).sort((a, b) => b - a);
    let bestChosen = null;
    let bestCost = Infinity;
    const dfs = (i, chosen, costSoFar) => {
      if (Date.now() > deadline) return;
      if (costSoFar >= bestCost) return;
      if (chosen.length === need) {
        if (target != null && squadRating(fixed.concat(chosen)) < target) return;
        bestCost = costSoFar;
        bestChosen = chosen.slice();
        return;
      }
      if (i >= ratingsAsc.length) return;
      if (target != null) {
        const left = need - chosen.length;
        const top = allRatingsDesc.slice(0, left);
        if (top.length < left) return;
        if (squadRating(fixed.concat(chosen, top)) < target) return;
      }
      const rating = ratingsAsc[i];
      const maxTake = Math.min(bucket.get(rating).length, need - chosen.length);
      for (let k = maxTake; k >= 0; k--) {
        const next = chosen.slice();
        for (let x = 0; x < k; x++) next.push(rating);
        dfs(i + 1, next, costSoFar + k * rating);
      }
    };
    dfs(0, [], 0);
    if (!bestChosen) return null;
    const out = [];
    const cursor = /* @__PURE__ */ new Map();
    for (const rating of bestChosen) {
      const idx = cursor.get(rating) ?? 0;
      out.push(bucket.get(rating)[idx]);
      cursor.set(rating, idx + 1);
    }
    return out;
  }
  function kCombinations(items, k) {
    if (k <= 0) return [[]];
    if (k > items.length) return [];
    const [head, ...tail] = items;
    const withHead = kCombinations(tail, k - 1).map((c) => [head, ...c]);
    const withoutHead = kCombinations(tail, k);
    return [...withHead, ...withoutHead];
  }
  function buildSolution(players, c, deadline) {
    const ordered = assignSlots(players, c.slotPositions, deadline);
    const toBuy = /* @__PURE__ */ new Map();
    for (const p of ordered) {
      if (!p.concept) continue;
      const e = toBuy.get(p.definitionId);
      if (e) e.count++;
      else
        toBuy.set(p.definitionId, {
          definitionId: p.definitionId,
          rating: p.rating,
          count: 1
        });
    }
    const ids = ordered.map((p) => p.id).sort((a, b) => a - b);
    return {
      players: ordered,
      teamRating: squadRating(ordered.map((p) => p.rating)),
      // Position-aware estimate — apply layer overwrites with squad.getChemistry().
      chemistry: estimateChemistry(ordered, c.slotPositions),
      toBuy: [...toBuy.values()],
      key: ids.join(",")
    };
  }
  function finalize(players, c, deadline) {
    const solution = buildSolution(players, c, deadline);
    const v = validate(solution.players, c);
    if (c.chemistryMin != null && solution.chemistry < c.chemistryMin && !v.unmet.some((u) => u.toLowerCase().includes("chem"))) {
      v.unmet.push(`chemistry ~${solution.chemistry} < ${c.chemistryMin}`);
    }
    return v.unmet.length === 0 ? { ok: true, solution, unmet: [] } : { ok: false, reason: "post-check failed", unmet: v.unmet, solution };
  }

  // src/main.ts
  var LOG = "[fut-sbc]";
  var SOLVE_BUDGET_MS = 6e3;
  var poolCache = /* @__PURE__ */ new Map();
  var clubCache = null;
  async function getClub() {
    if (!clubCache) clubCache = await fetchClubPlayers();
    return clubCache;
  }
  async function getPool(extras) {
    const key = `${extras?.useUnassigned ? "u" : ""}${extras?.useStorage ? "s" : ""}`;
    const hit = poolCache.get(key);
    if (hit) return hit;
    const club = await getClub();
    const parts = [club];
    if (extras?.useUnassigned) parts.push(await fetchUnassignedPlayers());
    if (extras?.useStorage) parts.push(await fetchStoragePlayers());
    const players = [];
    const items = /* @__PURE__ */ new Map();
    const seenId = /* @__PURE__ */ new Set();
    for (const part of parts) {
      for (const p of part.players) {
        if (seenId.has(p.id)) continue;
        seenId.add(p.id);
        players.push(p);
      }
      for (const [k, v] of part.items) items.set(k, v);
    }
    const merged = { players, items };
    poolCache.set(key, merged);
    return merged;
  }
  function resetPoolCache() {
    poolCache = /* @__PURE__ */ new Map();
    clubCache = null;
    conceptCache = null;
  }
  var conceptCache = null;
  async function conceptPool(challenge, club) {
    if (conceptCache) return conceptCache;
    const c = challenge.constraints;
    let lo = 45;
    let hi = 92;
    if (c.exactOvr != null) lo = c.exactOvr, hi = c.exactOvr;
    else if (c.teamRatingMin != null) lo = c.teamRatingMin - 4, hi = c.teamRatingMin + 3;
    else if (c.maxOvrPerPlayer != null) lo = c.maxOvrPerPlayer - 10, hi = c.maxOvrPerPlayer;
    else if (c.minOvrPerPlayer != null) lo = c.minOvrPerPlayer, hi = c.minOvrPerPlayer + 8;
    const qual = c.counted.find((r) => r.kind === "quality");
    if (qual?.value === "bronze") lo = 40, hi = 64;
    else if (qual?.value === "silver") lo = 65, hi = 74;
    else if (qual?.value === "gold") lo = Math.max(lo, 75);
    const domLeague = mode(club.map((p) => p.leagueId));
    const domNation = mode(club.map((p) => p.nationId));
    const [byLeague, byNation, plain] = await Promise.all([
      domLeague ? searchConceptCards({ ratingMin: lo, ratingMax: hi, league: domLeague, limit: 120 }) : Promise.resolve([]),
      domNation ? searchConceptCards({ ratingMin: lo, ratingMax: hi, nation: domNation, limit: 120 }) : Promise.resolve([]),
      searchConceptCards({ ratingMin: lo, ratingMax: hi, limit: 120 })
    ]);
    const seen = /* @__PURE__ */ new Set();
    conceptCache = [...byLeague, ...byNation, ...plain].filter((p) => {
      if (seen.has(p.definitionId)) return false;
      seen.add(p.definitionId);
      return true;
    });
    return conceptCache;
  }
  function mode(xs) {
    const c = /* @__PURE__ */ new Map();
    for (const x of xs) if (x > 0) c.set(x, (c.get(x) ?? 0) + 1);
    let best = 0;
    let bestC = 0;
    for (const [k, n] of c) if (n > bestC) bestC = n, best = k;
    return best;
  }
  async function buildPool(challenge, strategy, extras) {
    const { players, items } = await getPool(extras);
    let fielded = /* @__PURE__ */ new Set();
    if (extras?.excludeAllSquads) fielded = (await getAllSquadCards()).instanceIds;
    else if (extras?.excludeActiveSquad ?? true)
      fielded = (await getActiveSquadCards()).instanceIds;
    const owned = players.filter((p) => {
      if (!items.has(p.id)) return false;
      if (fielded.has(p.id)) return false;
      if (!extras?.allowTradeable && !p.untradeable && !p.inStorage) return false;
      if (!extras?.allowSpecials && p.isSpecial) return false;
      if (extras?.maxRating != null && p.rating > extras.maxRating) return false;
      return true;
    });
    if (strategy !== "club-y-concept") return owned;
    const ownedDefs = new Set(owned.map((p) => p.definitionId));
    const concepts = (await conceptPool(challenge, owned)).filter(
      (p) => !ownedDefs.has(p.definitionId)
    );
    return [...owned, ...concepts];
  }
  function bootActions(challenge, handle) {
    let lastExtras;
    const run = async (fn) => {
      const h = handle();
      try {
        h?.setBusy(true);
        return await fn();
      } catch (err) {
        window.__futErr = err;
        console.error(LOG, err);
        h?.showError(err instanceof Error ? err.message : String(err));
        return void 0;
      } finally {
        h?.setBusy(false);
      }
    };
    return {
      async solve(strategy, extras) {
        await run(async () => {
          lastExtras = extras;
          const pool = await buildPool(challenge, strategy, extras);
          const result = solve(pool, challenge.constraints, {
            strategy,
            timeBudgetMs: SOLVE_BUDGET_MS
          });
          if (!result.solution) {
            handle()?.showError(
              `Sin soluci\xF3n. ${result.unmet.join(", ") || result.reason || ""}`.trim()
            );
            return;
          }
          handle()?.showSolution(result.solution, withChemNote(result.unmet));
          if (extras && extras.dryRun === false) await doApply(result.solution);
        });
      },
      /**
       * "Resolver ×N" = do the whole SBC N times: solve → apply → submit →
       * re-enter. The toolbar confirms once before calling this; there is no
       * dry-run variant, because a dry run is just what "Resolver" already does.
       */
      async solveMultiple(strategy, n, extras) {
        await run(async () => {
          lastExtras = extras;
          await repeatLoop(strategy, n, extras ?? {});
        });
      },
      async apply(solution) {
        await run(() => doApply(solution));
      },
      async buyAndApply(solution, maxSpend) {
        await run(async () => {
          if (!solution.toBuy.length) {
            await doApply(solution);
            return;
          }
          const requests = solution.toBuy.map((b) => ({
            definitionId: b.definitionId,
            count: b.count,
            // headroom over the estimated cheap price; tighten once verified live.
            maxPerCard: Math.max(600, Math.round(maxSpend / totalToBuy(solution)))
          }));
          console.warn(LOG, "buyFodder \u2014 UNVERIFIED path, maxSpend", maxSpend);
          const report = await buyFodder(requests, { maxSpend });
          window.__futBuy = report;
          handle()?.showError(buyReportText(report));
          resetPoolCache();
          if (report.failures.length === 0 && !report.softBanned) {
            await doApply(solution);
          }
        });
      },
      async showCombos() {
        await run(async () => {
          const target = challenge.constraints.teamRatingMin;
          if (!target) {
            handle()?.showError("Este SBC no pide media de equipo.");
            return;
          }
          const combos = ratingCombos(target, challenge.constraints.slots);
          const text = combos.map(
            (c) => Object.entries(c).map(([r, n]) => `${n}\xD7${r}`).join(" + ")
          ).join("\n");
          handle()?.showError(`Combos para media ${target}:
${text}`);
        });
      },
      getConstraints: () => challenge.constraints
    };
    function withChemNote(unmet) {
      const min = challenge.constraints.chemistryMin;
      if (min == null) return unmet;
      return [...unmet, `Qu\xEDmica m\xEDn. ${min} \u2014 se confirma al aplicar`];
    }
    function totalToBuy(solution) {
      return Math.max(
        1,
        solution.toBuy.reduce((n, b) => n + b.count, 0)
      );
    }
    function buyReportText(r) {
      const lines = [
        `Comprado: ${r.bought.length}  \xB7  gastado: ${r.spent}`,
        ...r.failures.map(
          (f) => `\u26A0 ${f.definitionId}: ${f.got}/${f.want} \u2014 ${f.reason}`
        )
      ];
      if (r.softBanned) lines.push("\u26D4 soft-ban de EA (426/429) \u2014 parado.");
      return lines.join("\n");
    }
    async function doApply(solution) {
      const { players, items } = await getPool(lastExtras);
      const ownedByDef = new Map(players.map((p) => [p.definitionId, p]));
      const hydrated = {
        ...solution,
        players: solution.players.map(
          (p) => p.concept && ownedByDef.has(p.definitionId) ? ownedByDef.get(p.definitionId) : p
        )
      };
      const res = await applySolution(challenge, hydrated, items);
      if (!res.ok) {
        handle()?.showError(res.reason ?? "No se pudo aplicar.");
        return;
      }
      console.info(LOG, "applied", res);
      const parts = [];
      if (res.teamRating != null) parts.push(`media ${res.teamRating}`);
      if (res.chemistry != null) parts.push(`qu\xEDmica ${res.chemistry}`);
      if (parts.length) handle()?.showError(`Aplicado \u2713  (${parts.join(" \xB7 ")})`);
    }
    async function repeatLoop(strategy, rounds, extras) {
      let current = challenge;
      const done = [];
      handle()?.showProgress(["Preparando\u2026"], false);
      const repeat = await repeatability(challenge.setId);
      const budget = repeat && Number.isFinite(repeat.remaining) ? Math.min(rounds, Math.max(0, repeat.remaining)) : rounds;
      if (budget === 0) {
        handle()?.showError("Este SBC ya no admite m\xE1s repeticiones.");
        return;
      }
      if (budget < rounds) {
        console.info(LOG, `set allows ${budget} more, trimming from ${rounds}`);
      }
      for (let round = 1; round <= budget; round++) {
        if (!current) {
          done.push(`\u2717 ronda ${round}: no se pudo re-entrar al challenge`);
          break;
        }
        resetPoolCache();
        const pool = await buildPool(current, strategy, extras);
        const result = solve(pool, current.constraints, {
          strategy,
          timeBudgetMs: SOLVE_BUDGET_MS
        });
        if (!result.solution || !result.ok) {
          done.push(
            `\u2717 ronda ${round}: sin soluci\xF3n${result.unmet.length ? ` \u2014 ${result.unmet.join(", ")}` : ""}`
          );
          break;
        }
        const { items } = await getPool(extras);
        const applied = await applySolution(current, result.solution, items);
        if (!applied.ok) {
          done.push(`\u2717 ronda ${round}: no se pudo aplicar \u2014 ${applied.reason ?? "?"}`);
          break;
        }
        const sent = await submitChallenge(current);
        if (sent.softBanned) {
          done.push(`\u26D4 ronda ${round}: soft-ban de EA (426/429) \u2014 parado.`);
          break;
        }
        if (!sent.ok) {
          const why = sent.violations?.length ? sent.violations.join(", ") : sent.reason ?? "?";
          done.push(`\u2717 ronda ${round}: EA rechaz\xF3 \u2014 ${why}`);
          break;
        }
        done.push(`\u2713 ronda ${round}: enviado (media ${applied.teamRating ?? "?"})`);
        handle()?.showProgress(done, false);
        await dismissPostSubmit();
        current = round < budget ? await reenterChallenge(challenge.setId, challenge.id) : null;
      }
      resetPoolCache();
      try {
        await reenterChallenge(challenge.setId, challenge.id);
      } catch {
      }
      repaintPitch(challenge.id);
      console.info(LOG, "repeat loop finished", done);
      handle()?.showProgress(done, true, leaveChallengeView);
    }
  }
  async function boot() {
    await waitForServices();
    console.info(LOG, "services ready");
    window.__fut = {
      getOpenChallenge,
      parseRequirements,
      fetchClubPlayers,
      getActiveSquadCards,
      getAllSquadCards,
      buildPool,
      solve,
      solveMultiple,
      ratingCombos,
      applySolution,
      findLiveOverviewVC,
      searchConceptCards,
      buyFodder,
      submitChallenge,
      dismissPostSubmit,
      reenterChallenge,
      repeatability,
      resetPoolCache
    };
    let handle = null;
    let mountedFor = -1;
    const check = async () => {
      const challenge = await getOpenChallenge().catch(() => null);
      window.__futChallenge = challenge;
      const pitch = document.querySelector(
        ".ut-squad-pitch-view.sbc, .ut-squad-pitch-view"
      );
      if (challenge && pitch && challenge.id !== mountedFor) {
        handle?.destroy();
        resetPoolCache();
        handle = mountToolbar(
          pitch,
          bootActions(challenge, () => handle),
          challenge.name
        );
        mountedFor = challenge.id;
        console.info(LOG, "toolbar mounted for challenge", challenge.id, challenge.name);
      } else if ((!challenge || !pitch) && handle) {
        handle.destroy();
        handle = null;
        mountedFor = -1;
        resetPoolCache();
      }
    };
    setInterval(() => {
      void check().catch((err) => {
        window.__futErr = err;
        console.error(LOG, err);
      });
    }, 2500);
  }
  boot().catch((err) => {
    window.__futErr = err;
    console.error(LOG, "boot failed", err);
  });
})();
