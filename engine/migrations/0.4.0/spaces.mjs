// Migration 0.4.0 (engine/migrations/0.4.0.mjs), its pure part: a table of contents with the spaces of 0.3
// (`business`, `takeover`, and spaces of the project's own, which had no kind) rewritten with the four of 0.4
// (`use`, `product`, `admin`, `develop`, standard/spaces.json).
//   - a business section goes by its id (Use → use; Features, Rules, Roles, Processes → product; Configure,
//     Administer → admin), else by the types of its pages (feature, rules… → product; editor, recipe → admin),
//     else to use;
//   - a takeover section goes to develop, but for its pages for the administrators and operators (the technical
//     architecture document, the runbook, operations and deployment, variables, resources, access and ownership),
//     which move, with their sub-pages, to a new section "Operate the application" of the admin space;
//   - a page or a journey that names a space follows the same rules;
//   - a space of the project's own gets the kind of most of its typed pages (use when none is typed), its texts
//     kept; one whose id is now a standard space becomes that space, its texts kept;
//   - the texts a project gave to business go to use, those of takeover to develop.
// Only what the change of format requires is touched: a group or a section is removed only when the move emptied
// it. Decisions are taken on the source table of contents, then applied by id to each translated one, so that
// both keep the same structure (ARCHITECTURE.md §6.12). A table of contents already in the 0.4 format is returned
// unchanged (null): the migration runs once.

const ORDER = ["use", "product", "admin", "develop"];
const PRODUCT_TYPES = ["feature", "business-rules", "roles-matrix", "process", "release-notes"];
const ADMIN_TYPES = ["editor", "recipe"];
/** The kind of each page type, to give a space of the project's own its kind. */
const KIND_OF_TYPE = {
  screen: "use",
  ...Object.fromEntries(PRODUCT_TYPES.map((t) => [t, "product"])),
  ...Object.fromEntries(
    [...ADMIN_TYPES, "architecture", "runbook", "variables", "resources", "access-ownership"].map((t) => [t, "admin"]),
  ),
};
const developType = (t) => typeof t === "string" && !Object.hasOwn(KIND_OF_TYPE, t);
/** Business sections, by their usual ids (standard/structure.md, in English and French). */
const BUSINESS_SECTIONS = {
  use: ["use", "utiliser"],
  product: [
    ...["features", "fonctionnalites", "rules", "regles", "business-rules", "regles-de-gestion", "roles"],
    ...["process", "processes", "processus", "release-notes", "notes-de-version"],
  ],
  admin: ["configure", "configurer", "administer", "administrer", "settings", "reglages", "parametres"],
};
/** Takeover pages for the administrators and operators: their types, and the last part of their usual ids. */
const OPERATE_TYPES = ["architecture", "runbook", "variables", "resources", "access-ownership"];
const OPERATE_IDS = [
  ...["dat", "technical-architecture", "operations", "deployment", "exploitation", "deploiement", "runbook"],
  ...["manuel-exploitation", "variables", "resources", "ressources", "access-ownership", "acces-et-propriete"],
];
/** The section the operating pages move to. */
const OPERATE = {
  en: { id: "operate", title: "Operate the application", shortTitle: "Operate" },
  fr: { id: "exploiter", title: "Exploiter l'application", shortTitle: "Exploiter" },
};
/** The space whose texts a project's own texts of business / takeover go to. */
const TEXTS_TO = { business: "use", takeover: "develop" };

const idOf = (s) => (typeof s === "string" ? s : s?.id);
const operating = (p) => OPERATE_TYPES.includes(p.template) || OPERATE_IDS.includes(String(p.id).split("/").pop());
const pagesOf = (sec) => (sec.groups || []).flatMap((g) => g.pages || []);

/** The 0.4 space of a business page (by its type), or null when its type says nothing. */
function businessOfType(template) {
  if (PRODUCT_TYPES.includes(template)) return "product";
  if (ADMIN_TYPES.includes(template)) return "admin";
  if (template === "screen") return "use";
  return null;
}

/** The 0.4 space of a business section: by its id, else by the types of its pages, else use. */
function businessSection(sec) {
  for (const [space, ids] of Object.entries(BUSINESS_SECTIONS)) if (ids.includes(sec.id)) return space;
  const count = { use: 0, product: 0, admin: 0 };
  for (const p of pagesOf(sec)) count[businessOfType(p.template) ?? "use"]++;
  return count.product && count.product >= count.use ? "product" : count.admin > count.use ? "admin" : "use";
}

/** The kind of a space of the project's own: the kind of most of its typed pages, use when none is typed. */
function ownKind(toc, id) {
  const count = { use: 0, product: 0, admin: 0, develop: 0 };
  for (const sec of toc.sections)
    for (const p of pagesOf(sec))
      if ((p.space ?? sec.space) === id && p.template)
        count[developType(p.template) ? "develop" : KIND_OF_TYPE[p.template]]++;
  return ORDER.reduce((best, k) => (count[k] > count[best] ? k : best), "use");
}

/** The spaces of the project's own that 0.4 needs a kind for (a standard id is its own kind). */
const kindless = (toc) =>
  (toc.spaces || [])
    .filter((s) => !ORDER.includes(idOf(s)) && !TEXTS_TO[idOf(s)])
    .filter((s) => typeof s === "string" || typeof s?.kind !== "string" || !ORDER.includes(s.kind))
    .map(idOf)
    .filter((id) => typeof id === "string");

/** The 0.4 space of a section. */
const sectionSpaceOf = (sec) =>
  sec.space === "business" ? businessSection(sec) : sec.space === "takeover" ? "develop" : sec.space;

/** The 0.4 space a page names, or null when it names none (or one that 0.4 keeps). */
function ownSpaceOf(p, sec) {
  if (p.space === "business") return businessOfType(p.template) ?? businessSection(sec);
  if (p.space === "takeover") return operating(p) ? "admin" : "develop";
  return null;
}

/** What happens to each section and page: its new space, the pages that move to the operating section. */
function decide(toc) {
  const sectionSpace = {};
  const pageSpace = {}; // page id → its own new space (only for pages that named one)
  const moved = []; // page ids that move to the operating section, in order
  const kept = new Set(); // the spaces of the sections that keep at least one page
  for (const sec of toc.sections) {
    sectionSpace[sec.id] = sectionSpaceOf(sec);
    for (const g of sec.groups || []) {
      // A sub-page follows the level-1 page above it in its group (ARCHITECTURE.md §6.1).
      let parentMoves = false;
      for (const p of g.pages || []) {
        const own = ownSpaceOf(p, sec);
        if (own) pageSpace[p.id] = own;
        // Only the pages of a takeover section move; a page that names its space stays where it is.
        const movable = sec.space === "takeover" && p.space === undefined;
        if (p.level !== 2) parentMoves = movable && operating(p);
        if (movable && parentMoves) moved.push(p.id);
        else kept.add(sectionSpace[sec.id]);
      }
    }
  }
  return { sectionSpace, pageSpace, moved, kept };
}

/**
 * The decisions, taken on the source table of contents.
 * @param {object} toc   source toc.json (parsed)
 * @param {string} language   the project's language (en, fr…): names the operating section
 * @returns {object|null}  null: nothing to migrate
 */
export function planSpaces(toc, language) {
  if (!Array.isArray(toc?.spaces) || !Array.isArray(toc.sections)) return null;
  const ids = toc.spaces.map(idOf);
  const kinds = Object.fromEntries(kindless(toc).map((id) => [id, ownKind(toc, id)]));
  if (!ids.includes("business") && !ids.includes("takeover") && !Object.keys(kinds).length) return null;
  const { sectionSpace, pageSpace, moved, kept } = decide(toc);
  const base = (OPERATE[language] ?? OPERATE.en).id;
  const operateId = toc.sections.some((x) => x.id === base) ? `${base}-admin` : base;
  const used = new Set([
    ...kept,
    ...Object.values(pageSpace),
    ...(moved.length ? ["admin"] : []),
    ...(toc.journeys || []).map((j) => journeySpace(j.space)),
  ]);
  return { sectionSpace, pageSpace, moved, operateId, used, kinds };
}

const journeySpace = (space) => (space === "business" ? "use" : space === "takeover" ? "develop" : space);

/** The `spaces` of a table of contents: the standard ones used, in the order of the audiences, then its own. */
function spacesOf(toc, plan, source) {
  const objectOf = {};
  for (const s of toc.spaces || []) {
    if (!s || typeof s !== "object") continue;
    const { id, ...texts } = s;
    const to = TEXTS_TO[id] ?? (ORDER.includes(id) ? id : null);
    if (to && Object.keys(texts).length) objectOf[to] = { ...objectOf[to], id: to, ...texts };
  }
  const standard = ORDER.filter((id) => plan.used.has(id) || (toc.spaces || []).some((s) => idOf(s) === id));
  const own = (toc.spaces || [])
    .filter((s) => !ORDER.includes(idOf(s)) && !TEXTS_TO[idOf(s)])
    .map((s) => {
      const kind = plan.kinds[idOf(s)];
      // The kind is not a text: only the source carries it (a translation takes it from the source, §6.12).
      if (!kind || !source) return s;
      return typeof s === "string" ? { id: s, kind } : { ...s, kind };
    });
  return [...standard.map((id) => objectOf[id] ?? id), ...own];
}

/**
 * The pages of a section rewritten (their own space) and the moving ones taken out, into `movedGroups` (merged by
 * group title). A group the move emptied is removed; true when the move emptied the whole section.
 */
function takeOut(sec, plan, movedGroups) {
  const movedSet = new Set(plan.moved);
  const before = pagesOf(sec).length;
  const groups = [];
  for (const g of sec.groups || []) {
    const stay = [];
    for (const p of g.pages || []) {
      if (p.space !== undefined && plan.pageSpace[p.id]) {
        p.space = plan.pageSpace[p.id];
        if (p.space === sec.space) delete p.space;
      }
      if (!movedSet.has(p.id)) {
        stay.push(p);
        continue;
      }
      let target = movedGroups.find((x) => x.title === g.title);
      if (!target) movedGroups.push((target = { ...(g.title !== undefined ? { title: g.title } : {}), pages: [] }));
      target.pages.push(p);
    }
    // Only what the move emptied goes: a group that was already empty stays.
    if (stay.length || !(g.pages || []).length) groups.push({ ...g, pages: stay });
  }
  sec.groups = groups;
  return before > 0 && !pagesOf(sec).length;
}

/** The section of the admin space the operating pages move to: after its last section, else before develop. */
function insertOperate(out, plan, movedGroups, language) {
  const texts = OPERATE[language] ?? OPERATE.en;
  const operate = {
    id: plan.operateId,
    ...(out.sections.some((s) => s.space !== undefined) ? { space: "admin" } : {}),
    title: texts.title,
    shortTitle: texts.shortTitle,
    groups: movedGroups,
  };
  const lastAdmin = out.sections.map((s) => plan.sectionSpace[s.id]).lastIndexOf("admin");
  const firstDevelop = out.sections.findIndex((s) => plan.sectionSpace[s.id] === "develop");
  const at = lastAdmin >= 0 ? lastAdmin + 1 : firstDevelop >= 0 ? firstDevelop : out.sections.length;
  out.sections.splice(at, 0, operate);
}

/**
 * A table of contents (the source, or one of its translations) rewritten with the decisions of planSpaces.
 * @param {object} toc
 * @param {object} plan   planSpaces() of the SOURCE
 * @param {string} language   the language of this table of contents (titles of the operating section)
 * @param {{ source?: boolean }} [o]   source: this is the source table of contents (it alone carries the kinds)
 */
export function applySpaces(toc, plan, language, { source = true } = {}) {
  const out = structuredClone(toc);
  out.spaces = spacesOf(toc, plan, source);
  const movedGroups = []; // [{ title?, pages }] in source order, merged by group title
  const emptied = new Set(); // the sections the move left without a page
  for (const sec of out.sections) {
    // A translation carries no `space` (its structure is the source's): only a field present is rewritten.
    if (sec.space !== undefined && plan.sectionSpace[sec.id] !== undefined) sec.space = plan.sectionSpace[sec.id];
    if (takeOut(sec, plan, movedGroups)) emptied.add(sec.id);
  }
  out.sections = out.sections.filter((s) => !emptied.has(s.id));
  if (movedGroups.length) insertOperate(out, plan, movedGroups, language);
  for (const j of out.journeys || []) if (j.space !== undefined) j.space = journeySpace(j.space);
  return out;
}
