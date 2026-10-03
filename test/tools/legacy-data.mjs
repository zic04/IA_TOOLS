// The site data of the older engine (and of the kit before 0.3.0) used French key names (titre, ordre, parcours…).
// The kit writes the names of toc.json (title, order, journeys…). `currentData` translates an older data object to
// the current names, record by record (never the keys of a map: a page id or an icon name may be "recherche"), so
// that the equivalence tools (equivalence.mjs, diff-html.mjs) can still compare a build with the older engine.

const RENAME = {
  top: {
    accueil_html: "homeHtml",
    glossaire: "glossary",
    icones: "icons",
    ordre: "order",
    parcours: "journeys",
    recherche: "search",
  },
  meta: { titre: "title", produit: "product", accroche: "tagline" },
  stats: { schemas: "diagrams" },
  section: {
    titre: "title",
    titre_court: "shortTitle",
    sous_titre: "subtitle",
    icone: "icon",
    vedette: "featured",
    points: "highlights",
    intro_html: "introHtml",
    groupes: "groups",
  },
  group: { titre: "title" },
  page: {
    titre: "title",
    titre_menu: "menuTitle",
    resume: "summary",
    groupe: "group",
    niveau: "level",
    droits: "permissions",
  },
  heading: { titre: "title", niveau: "level" },
  term: { terme: "term", motif: "pattern" },
  journey: { titre: "title", etapes: "steps" },
};

/** The id of the script that holds the site data: `site-data` now, `donnees` in older builds. */
export const DATA_SCRIPT = /<script type="application\/json" id="(?:site-data|donnees)">([\s\S]*?)<\/script>/;

const renamed = (obj, map) =>
  obj && typeof obj === "object" && !Array.isArray(obj)
    ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [map[k] ?? k, v]))
    : obj;

/** Site data with the current key names; a data object already current is returned unchanged. */
export function currentData(data) {
  if (!data || typeof data !== "object" || !("ordre" in data)) return data;
  const d = renamed(data, RENAME.top);
  d.meta = renamed(d.meta, RENAME.meta);
  if (d.meta?.stats) d.meta.stats = renamed(d.meta.stats, RENAME.stats);
  d.sections = (d.sections || []).map((s) => {
    const section = renamed(s, RENAME.section);
    return { ...section, groups: (section.groups || []).map((g) => renamed(g, RENAME.group)) };
  });
  d.pages = Object.fromEntries(
    Object.entries(d.pages || {}).map(([id, p]) => {
      const page = renamed(p, RENAME.page);
      return [id, { ...page, ...(page.toc ? { toc: page.toc.map((h) => renamed(h, RENAME.heading)) } : {}) }];
    }),
  );
  if (d.glossary) d.glossary = d.glossary.map((g) => renamed(g, RENAME.term));
  if (d.journeys) d.journeys = d.journeys.map((j) => renamed(j, RENAME.journey));
  return d;
}
