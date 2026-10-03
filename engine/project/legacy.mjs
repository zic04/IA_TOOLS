// Legacy formats (ARCHITECTURE.md §6.7): projects created before the kit use French keys. They are normalised
// here when READ, so an old project builds unchanged; `doc-kit migrate` rewrites the JSON files for good.
//   toc        contenu/sommaire.json → content/toc.json; espaces, espace, pendant → spaces, space, counterpart
//   glossary   glossaire.json (terme, motif, def) → glossary.json (term, pattern, def)
//   zones      images/zones/<id>.json (fichier, titre, largeur, hauteur, l, libelle, cote) → file, title…
//   plans      capture plan entries, actions and targets (JavaScript modules: normalised when read only); the
//              caption of a target (libelle → caption) is renamed wherever the target sits (zone, union member,
//              frame, mask, action), and stabiliser → settle
// Every function returns { value, legacy } where `legacy` tells whether a legacy key was found.
// When both spellings are present, the current (English) key wins and the legacy one is dropped.

export const LEGACY_FILES = Object.freeze({ toc: "sommaire.json", glossary: "glossaire.json" });
export const CURRENT_FILES = Object.freeze({ toc: "toc.json", glossary: "glossary.json" });

const TOC = { titre: "title", produit: "product", accroche: "tagline", parcours: "journeys", espaces: "spaces" };
const SECTION = { titre: "title", titre_court: "shortTitle", icone: "icon", sous_titre: "subtitle", points: "highlights", vedette: "featured", groupes: "groups", espace: "space" };
const GROUP = { titre: "title" };
const PAGE = { titre: "title", titre_menu: "menuTitle", resume: "summary", niveau: "level", droits: "permissions", gabarit: "template", fichier: "file", espace: "space", pendant: "counterpart" };
const JOURNEY = { titre: "title", desc: "description", etapes: "steps", espace: "space" };
const TERM = { terme: "term", motif: "pattern" };
const ZONE_FILE = { fichier: "file", titre: "title", largeur: "width", hauteur: "height", capture: "captured" };
const ZONE = { l: "w", libelle: "label", cote: "side" };
const SIDES = { coin: "corner", droit: "right", bas: "bottom", "droit-bas": "bottom-right" };
const ENTRY = { titre: "title", contexte: "context", vue: "view", stockage: "storage", delai: "delay", stabiliser: "settle", cadre: "frame", masques: "masks" };
const CONTEXTS = { bureau: "desktop" };
const ACTION = { clic: "click", survol: "hover", saisir: "type", choisir: "select", touche: "press", defiler: "scroll", attendre: "wait", molette: "wheel", valeur: "value" };
const WHEEL = { crans: "steps", sens: "direction" };
const TARGET = {
  nom: "name",
  texte: "text",
  champ: "field",
  bloc: "block",
  dans: "within",
  parent: "up",
  encadre: "framed",
  dernier: "last",
  filtre: "has",
  cote: "side",
  marge: "margin",
  margeV: "marginY",
  libelle: "caption",
};

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Renames the keys of `obj` according to `map`, keeping their order. */
function rename(obj, map, state) {
  if (!isObject(obj)) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k in map) {
      state.legacy = true;
      if (!(map[k] in obj)) out[map[k]] = v;
    } else out[k] = v;
  }
  return out;
}

const result = (fn) => (input) => {
  const state = { legacy: false };
  return { value: fn(input, state), legacy: state.legacy };
};

/** contenu/sommaire.json → toc. */
export const normalizeToc = result((raw, s) => {
  const toc = rename(raw, TOC, s);
  if (!isObject(toc)) return toc;
  if (Array.isArray(toc.sections))
    toc.sections = toc.sections.map((sec) => {
      const x = rename(sec, SECTION, s);
      if (isObject(x) && Array.isArray(x.groups))
        x.groups = x.groups.map((g) => {
          const y = rename(g, GROUP, s);
          if (isObject(y) && Array.isArray(y.pages)) y.pages = y.pages.map((p) => rename(p, PAGE, s));
          return y;
        });
      return x;
    });
  if (Array.isArray(toc.journeys)) toc.journeys = toc.journeys.map((j) => rename(j, JOURNEY, s));
  return toc;
});

/** glossaire.json → glossary. */
export const normalizeGlossary = result((raw, s) => (Array.isArray(raw) ? raw.map((t) => rename(t, TERM, s)) : raw));

/** images/zones/<id>.json. */
export const normalizeZones = result((raw, s) => {
  const z = rename(raw, ZONE_FILE, s);
  if (isObject(z) && Array.isArray(z.zones))
    z.zones = z.zones.map((zone) => {
      const x = rename(zone, ZONE, s);
      if (isObject(x) && x.side in SIDES) {
        s.legacy = true;
        x.side = SIDES[x.side];
      }
      return x;
    });
  return z;
});

function target(t, s) {
  if (Array.isArray(t)) return t.map((x) => target(x, s));
  if (!isObject(t)) return t;
  const x = rename(t, TARGET, s);
  if (x.side in SIDES) {
    s.legacy = true;
    x.side = SIDES[x.side];
  }
  if (x.within) x.within = target(x.within, s);
  if (Array.isArray(x.union)) x.union = x.union.map((u) => target(u, s));
  return x;
}

function action(a, s) {
  const x = rename(a, ACTION, s);
  if (!isObject(x)) return x;
  for (const k of ["click", "hover", "type", "select", "scroll"]) if (isObject(x[k])) x[k] = target(x[k], s);
  if (isObject(x.wait)) x.wait = target(x.wait, s);
  if (isObject(x.wheel)) x.wheel = rename(x.wheel, WHEEL, s);
  return x;
}

/** One capture plan entry (with its actions, frame, zones and masks). */
export const normalizePlanEntry = result((raw, s) => {
  const e = rename(raw, ENTRY, s);
  if (!isObject(e)) return e;
  if (e.context in CONTEXTS) {
    s.legacy = true;
    e.context = CONTEXTS[e.context];
  }
  if (Array.isArray(e.actions)) e.actions = e.actions.map((a) => action(a, s));
  if (e.frame) e.frame = target(e.frame, s);
  if (Array.isArray(e.zones)) e.zones = e.zones.map((z) => target(z, s));
  if (Array.isArray(e.masks)) e.masks = e.masks.map((m) => target(m, s));
  return e;
});
