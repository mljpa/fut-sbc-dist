"use strict";
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// scripts/gallery-catalog-worker.mjs
var import_node_crypto2 = require("node:crypto");
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");

// src/gallery/catalog-schema.ts
var catalog_schema_exports = {};
__export(catalog_schema_exports, {
  CATALOG_SOURCE: () => CATALOG_SOURCE,
  MAX_CATALOG_BYTES: () => MAX_CATALOG_BYTES,
  catalogChanges: () => catalogChanges,
  validateCatalog: () => validateCatalog,
  validateManifest: () => validateManifest
});
var CATALOG_SOURCE = "https://www.fut.gg/fut-gallery";
var MAX_CATALOG_BYTES = 4e6;
var GRADES = ["D", "C", "B", "A", "S"];
var object = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var integer = (v, min = 0) => Number.isSafeInteger(v) && Number(v) >= min;
var date = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));
var string = (v) => typeof v === "string" && v.length > 0 && v.length <= 2e3;
function requireValid(condition, message) {
  if (!condition) throw new Error(`Cat\xE1logo inv\xE1lido: ${message}`);
}
function validateCatalog(value, updatedAt) {
  requireValid(object(value) && value.source === CATALOG_SOURCE, "fuente");
  const at = updatedAt ?? value.updatedAt;
  requireValid(date(at), "fecha");
  if (value.checkedAt !== void 0) requireValid(date(value.checkedAt) && Date.parse(value.checkedAt) >= Date.parse(at), "fecha de comprobaci\xF3n");
  requireValid(Array.isArray(value.sets) && value.sets.length > 0 && value.sets.length <= 2e3, "colecciones");
  const ids = /* @__PURE__ */ new Set();
  for (const raw of value.sets) {
    requireValid(object(raw) && integer(raw.id, 1) && !ids.has(raw.id), "ID de colecci\xF3n");
    ids.add(raw.id);
    requireValid(integer(raw.categoryId, 1) && string(raw.category) && string(raw.name) && string(raw.slug) && typeof raw.description === "string" && raw.description.length <= 2e3 && integer(raw.requiredCards, 1) && raw.requiredCards <= 250 && integer(raw.priority) && (raw.clubEaId === null || integer(raw.clubEaId, 1)) && integer(raw.totalTokens), `datos de ${raw.id}`);
    requireValid(Array.isArray(raw.candidateClubEaIds) && raw.candidateClubEaIds.every((id) => integer(id, 1)), "equipos");
    requireValid(Array.isArray(raw.grades) && raw.grades.length === 5, "grados");
    let previous = -1;
    let tokens = 0;
    const rewards = /* @__PURE__ */ new Map();
    const thresholds = /* @__PURE__ */ new Map();
    raw.grades.forEach((grade, index) => {
      requireValid(object(grade) && grade.name === GRADES[index] && integer(grade.threshold) && grade.threshold > previous && integer(grade.tokens), "orden de grados");
      previous = grade.threshold;
      tokens += grade.tokens;
      rewards.set(String(grade.name), tokens);
      thresholds.set(String(grade.name), grade.threshold);
    });
    requireValid(tokens === raw.totalTokens, "recompensas");
    const lineup = (v) => {
      requireValid(object(v) && GRADES.includes(String(v.grade)) && integer(v.tokens) && v.tokens === rewards.get(String(v.grade)) && integer(v.totalScore) && (v.baseScore === void 0 || integer(v.baseScore)) && v.totalScore >= thresholds.get(String(v.grade)) && Array.isArray(v.items) && v.items.length === raw.requiredCards, "alineaci\xF3n");
      const players = /* @__PURE__ */ new Set();
      for (const item of v.items) {
        requireValid(object(item) && integer(item.definitionId, 1) && !players.has(item.definitionId) && integer(item.score) && integer(item.clubEaId) && (item.price === null || integer(item.price)), "carta o precio");
        players.add(item.definitionId);
      }
    };
    if (raw.recommended !== void 0) lineup(raw.recommended);
    requireValid(Array.isArray(raw.costTiers) && raw.costTiers.length <= 5, "alternativas");
    const tiers = /* @__PURE__ */ new Set();
    for (const tier of raw.costTiers) {
      lineup(tier);
      requireValid(object(tier) && integer(tier.cost) && string(tier.status) && tier.status !== "unsolved" && !tiers.has(String(tier.grade)), "alternativa repetida o incompleta");
      tiers.add(String(tier.grade));
    }
  }
  const normalizeLineup = (lineup) => ({
    grade: lineup.grade,
    tokens: lineup.tokens,
    ...lineup.baseScore === void 0 ? {} : { baseScore: lineup.baseScore },
    totalScore: lineup.totalScore,
    items: lineup.items.map((item) => ({ definitionId: item.definitionId, score: item.score, clubEaId: item.clubEaId, price: item.price }))
  });
  return {
    source: CATALOG_SOURCE,
    updatedAt: at,
    ...typeof value.checkedAt === "string" ? { checkedAt: value.checkedAt } : {},
    sets: value.sets.map((set) => ({
      id: set.id,
      categoryId: set.categoryId,
      category: set.category,
      name: set.name,
      slug: set.slug,
      description: set.description,
      requiredCards: set.requiredCards,
      priority: set.priority,
      clubEaId: set.clubEaId,
      totalTokens: set.totalTokens,
      grades: set.grades.map((grade) => ({ name: grade.name, threshold: grade.threshold, tokens: grade.tokens })),
      ...set.recommended ? { recommended: normalizeLineup(set.recommended) } : {},
      candidateClubEaIds: [...set.candidateClubEaIds],
      costTiers: set.costTiers.map((tier) => ({ ...normalizeLineup(tier), cost: tier.cost, status: tier.status }))
    }))
  };
}
function validateManifest(value) {
  requireValid(object(value) && value.schemaVersion === 1 && value.season === "fc27", "versi\xF3n o temporada incompatible");
  requireValid(typeof value.revision === "string" && /^[a-f0-9]{64}$/.test(value.revision) && value.file === `${value.revision}.json`, "revisi\xF3n o ruta");
  requireValid(date(value.checkedAt) && date(value.updatedAt) && Date.parse(value.updatedAt) <= Date.parse(value.checkedAt) && Date.parse(value.checkedAt) <= Date.now() + 3e5, "fechas del manifiesto");
  requireValid(integer(value.bytes, 1) && value.bytes <= MAX_CATALOG_BYTES, "tama\xF1o");
  return value;
}
function catalogChanges(before, after) {
  const old = new Map(before.sets.map((set) => [set.id, set]));
  const changes = [];
  for (const set of after.sets) {
    const previous = old.get(set.id);
    if (!previous) changes.push(`${set.name}: colecci\xF3n nueva`);
    else if (JSON.stringify(previous) !== JSON.stringify(set)) changes.push(`${set.name}: datos actualizados`);
    old.delete(set.id);
  }
  for (const set of old.values()) changes.push(`${set.name}: retirada del cat\xE1logo`);
  return changes;
}

// scripts/gallery-catalog-artifacts.mjs
var import_node_crypto = require("node:crypto");
function createCatalogArtifacts(catalog, previous = null, checkedAt = catalog.checkedAt ?? catalog.updatedAt, schema) {
  const valid = schema.validateCatalog(catalog);
  const text = `${JSON.stringify({ source: valid.source, sets: valid.sets })}
`;
  const revision = (0, import_node_crypto.createHash)("sha256").update(text).digest("hex");
  const manifest = schema.validateManifest({
    schemaVersion: 1,
    season: "fc27",
    revision,
    file: `${revision}.json`,
    checkedAt,
    updatedAt: previous?.revision === revision ? previous.updatedAt : valid.updatedAt,
    bytes: Buffer.byteLength(text)
  });
  return { text, manifest, manifestText: `${JSON.stringify(manifest, null, 2)}
` };
}

// scripts/gallery-catalog-fetch.mjs
var base = "https://www.fut.gg/fut-gallery";
var categories = ["premier-league", "laliga", "bundesliga", "ligue-1", "serie-a", "leagues", "rarities"];
async function fetchGalleryCatalog(previous, validateCatalog2) {
  const setPattern = /=\{id:(\d+),categoryId:(\d+),name:"([^"]+)",slug:"([^"]+)",description:"([^"]+)",requiredCards:(\d+),priority:(\d+),startTime:(\d+),grades:(.*?)\],clubEaId:(\d+|null),totalTokens:(\d+)\}/gs;
  const gradePattern = /name:"([DCBAS])",threshold:(\d+)/g;
  const detailedGradePattern = /name:"([DCBAS])",threshold:(\d+),level:\d+,rewards:\$R\[\d+\]=\[(.*?)\]\}/gs;
  const tokenPattern = /type:"event_token_1",value:(\d+)/g;
  const solutionPattern = /solution:\$R\[\d+\]=\{setId:(\d+),.*?items:\$R\[\d+\]=\[(.*?)\],baseGrade:(\d+),bonusGrade:(\d+),totalScore:(\d+),grade:"([DCBAS])",tokens:(\d+)/s;
  const itemPattern = /eaId:(\d+),playerEaId:\d+,score:(\d+),overall:\d+,gender:\d+,clubEaId:(\d+),nationEaId:\d+,rarityEaId:\d+,price:(\d+|null)/g;
  const tierPattern = /\{grade:"([DCBAS])",threshold:(\d+),tokens:(\d+),cost:(\d+),peakPrice:(\d+),status:"([^"]+)",items:\$R\[\d+\]=\[(.*?)\],totalScore:(\d+)/gs;
  const parseItems = (text) => [...text.matchAll(itemPattern)].map((item) => ({
    definitionId: Number(item[1]),
    score: Number(item[2]),
    clubEaId: Number(item[3]),
    price: item[4] === "null" ? null : Number(item[4])
  }));
  async function page(path) {
    const response = await fetch(`${base}/${path}`, { signal: AbortSignal.timeout(2e4) });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.text();
  }
  const index = await page("");
  const expectedSets = Number(index.match(/Browse\s+(\d+)\s+FC\s+27\s+Gallery/)?.[1]);
  if (!Number.isSafeInteger(expectedSets) || expectedSets < 1) throw new Error("FUT.GG no public\xF3 un total verificable de sets");
  const discovered = [...new Set([...index.matchAll(/href="\/fut-gallery\/([a-z0-9-]+)\/"/g)].map((match) => match[1]))].filter((category) => category !== "tags");
  if (discovered.some((category) => !categories.includes(category)))
    throw new Error(`Nueva categor\xEDa sin adaptador: ${discovered.filter((category) => !categories.includes(category)).join(", ")}`);
  const sets = [];
  for (const category of categories) {
    const html = await page(`${category}/`);
    const found = [...html.matchAll(setPattern)];
    if (found.length < (category === "leagues" ? 9 : category === "rarities" ? 5 : 15))
      throw new Error(`No se pudo leer la categor\xEDa ${category}: ${found.length} sets`);
    for (const match of found) {
      const [, id, categoryId, name, slug, description, requiredCards, priority, , rawGrades, clubEaId, totalTokens] = match;
      const grades = [...rawGrades.matchAll(gradePattern)].map((grade) => ({ name: grade[1], threshold: Number(grade[2]) }));
      if (grades.map((grade) => grade.name).join("") !== "DCBAS") throw new Error(`${category}/${slug}: grados inv\xE1lidos`);
      sets.push({
        id: Number(id),
        categoryId: Number(categoryId),
        category,
        name,
        slug,
        description,
        requiredCards: Number(requiredCards),
        priority: Number(priority),
        clubEaId: clubEaId === "null" ? null : Number(clubEaId),
        totalTokens: Number(totalTokens),
        grades
      });
    }
    console.log(`${category}: ${found.length} sets`);
  }
  let cursor = 0;
  async function enrich() {
    while (cursor < sets.length) {
      const set = sets[cursor++];
      await new Promise((done) => setTimeout(done, 500));
      const html = await page(`${set.category}/${set.slug}/`);
      const detail = [...html.matchAll(detailedGradePattern)].slice(0, 5);
      if (detail.map((grade) => grade[1]).join("") !== "DCBAS")
        throw new Error(`${set.category}/${set.slug}: recompensas inv\xE1lidas`);
      set.grades = detail.map((grade, index2) => {
        const threshold = Number(grade[2]);
        if (threshold !== set.grades[index2].threshold) throw new Error(`${set.name}: umbrales cambiaron durante la lectura`);
        return { name: grade[1], threshold, tokens: [...grade[3].matchAll(tokenPattern)].reduce((sum, token) => sum + Number(token[1]), 0) };
      });
      if (set.grades.reduce((sum, grade) => sum + grade.tokens, 0) !== set.totalTokens)
        throw new Error(`${set.name}: tokens no coinciden`);
      const solution = html.match(solutionPattern);
      if (solution && Number(solution[1]) === set.id) {
        const items = parseItems(solution[2]);
        if (items.length !== set.requiredCards) throw new Error(`${set.name}: alineaci\xF3n incompleta (${items.length}/${set.requiredCards})`);
        set.recommended = {
          grade: solution[6],
          tokens: Number(solution[7]),
          baseScore: Number(solution[3]),
          totalScore: Number(solution[5]),
          items
        };
      }
      const costTiers = [...html.matchAll(tierPattern)].flatMap((tier) => {
        const items = parseItems(tier[7]);
        if (tier[6] === "unsolved" || items.length !== set.requiredCards) return [];
        return [{
          grade: tier[1],
          tokens: Number(tier[3]),
          cost: Number(tier[4]),
          status: tier[6],
          totalScore: Number(tier[8]),
          items
        }];
      });
      set.candidateClubEaIds = [...new Set([
        set.clubEaId,
        ...set.recommended?.items.map((item) => item.clubEaId) ?? [],
        ...costTiers.flatMap((tier) => tier.items.map((item) => item.clubEaId))
      ].filter((id) => id !== null))];
      set.costTiers = costTiers;
    }
  }
  await Promise.all(Array.from({ length: 4 }, () => enrich()));
  if (new Set(sets.map((set) => set.id)).size !== sets.length) throw new Error("IDs de set duplicados");
  if (sets.length !== expectedSets) throw new Error(`Lectura incompleta: ${sets.length}/${expectedSets} sets`);
  const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
  const catalog = validateCatalog2({ source: base, updatedAt: checkedAt, checkedAt, sets });
  if (JSON.stringify(previous.sets) === JSON.stringify(catalog.sets)) catalog.updatedAt = previous.updatedAt;
  return catalog;
}

// scripts/gallery-catalog-worker.mjs
async function main() {
  const directory = (0, import_node_path.resolve)("gallery/fc27");
  const manifestPath = (0, import_node_path.resolve)(directory, "manifest.json");
  const pendingPath = (0, import_node_path.resolve)(".gallery-manifest-next.json");
  const hash = (text) => (0, import_node_crypto2.createHash)("sha256").update(text).digest("hex");
  async function verifyPublic(manifest, file, expected) {
    let last;
    for (let attempt = 0; attempt < 6; attempt++) {
      if (attempt) await new Promise((done) => setTimeout(done, 5e3));
      try {
        const url = `https://raw.githubusercontent.com/mljpa/fut-sbc-dist/main/gallery/fc27/${file}?checked=${encodeURIComponent(manifest.checkedAt)}&attempt=${attempt}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(2e4) });
        if (!res.ok || await res.text() !== expected) throw new Error(`La copia p\xFAblica de ${file} no coincide (${res.status})`);
        console.log(`Verificado: ${file}`);
        return;
      } catch (error) {
        last = error;
      }
    }
    throw last;
  }
  if (process.argv.includes("--verify-content")) {
    const manifest = validateManifest(JSON.parse((0, import_node_fs.readFileSync)(pendingPath, "utf8")));
    const text = (0, import_node_fs.readFileSync)((0, import_node_path.resolve)(directory, manifest.file), "utf8");
    if (hash(text) !== manifest.revision || Buffer.byteLength(text) !== manifest.bytes) throw new Error("Integridad incorrecta");
    await verifyPublic(manifest, manifest.file, text);
  } else if (process.argv.includes("--verify-manifest")) {
    const text = (0, import_node_fs.readFileSync)(manifestPath, "utf8");
    const manifest = validateManifest(JSON.parse(text));
    await verifyPublic(manifest, "manifest.json", text);
  } else {
    if (!(0, import_node_fs.existsSync)(manifestPath)) throw new Error("Publica el cat\xE1logo inicial antes de habilitar la actualizaci\xF3n diaria.");
    const previousManifest = validateManifest(JSON.parse((0, import_node_fs.readFileSync)(manifestPath, "utf8")));
    const previousText = (0, import_node_fs.readFileSync)((0, import_node_path.resolve)(directory, previousManifest.file), "utf8");
    if (hash(previousText) !== previousManifest.revision) throw new Error("El cat\xE1logo de respaldo no coincide con el manifiesto");
    const previous = validateCatalog(JSON.parse(previousText), previousManifest.updatedAt);
    const catalog = await fetchGalleryCatalog(previous, validateCatalog);
    const artifacts = createCatalogArtifacts(catalog, previousManifest, void 0, catalog_schema_exports);
    (0, import_node_fs.mkdirSync)(directory, { recursive: true });
    const path = (0, import_node_path.resolve)(directory, artifacts.manifest.file);
    if ((0, import_node_fs.existsSync)(path) && (0, import_node_fs.readFileSync)(path, "utf8") !== artifacts.text) throw new Error("La revisi\xF3n inmutable ya tiene otros datos");
    (0, import_node_fs.writeFileSync)(path, artifacts.text);
    (0, import_node_fs.writeFileSync)(`${pendingPath}.tmp`, artifacts.manifestText);
    (0, import_node_fs.renameSync)(`${pendingPath}.tmp`, pendingPath);
    console.log(`Preparados ${catalog.sets.length} sets \xB7 ${artifacts.manifest.revision.slice(0, 12)}`);
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
