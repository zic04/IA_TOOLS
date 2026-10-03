// Assembles the single file: template + style + JSON data + images + browser engine.
// The {{MARKERS}} of the template are replaced in ONE pass over the template only: content that itself
// contains "{{…}}" (documentation of a templating engine, for instance) is never re-interpreted.
//   {{NAME}}        value of `markers.NAME` (already escaped by the caller)
//   {{t:key}}       i18n text (template.*), escaped for HTML
//   {{ICON:name}}   SVG icon
// In app.js, `__THEME_KEY__` is replaced with the localStorage key of the theme (validated: [A-Za-z0-9_.-]).
//
// Screenshot dates: when `captures` (the zone files, by id) is given, the date and the application version of
// each screenshot used by a page (`captured`, `version`) are added as data.meta.screenshots, read by app.js for
// the "Screenshots taken on …, version …" line of the page footer. When no screenshot carries them, nothing is
// added and the output is unchanged.
//
// Languages (ARCHITECTURE.md §6.12): `languages` (one entry per OTHER declared language) fills the
// {{LANGUAGE_DATA}} marker with one <script id="site-data-<lang>"> per entry, each with its own meta.screenshots
// (computed from its own `captures`, since a translated screenshot may carry its own date and version). Empty
// without `languages` (the marker then resolves to ""); a template without the marker at all is unaffected (the
// replacement loop only ever acts on markers it finds in the template text).
import { esc } from "../core/text.mjs";
import { withContentSecurityPolicy } from "./csp.mjs";

/**
 * Dates and versions of the screenshots used by the pages: { id: { captured?, version? } }, or null when no
 * screenshot carries one.
 * @param {object} data      site data (pages[].html contains <img data-img="id">)
 * @param {Record<string, object>} [captures]  normalised zone files, by id
 */
export function screenshotInfo(data, captures) {
  if (!captures) return null;
  const used = new Set();
  for (const page of Object.values(data.pages || {}))
    for (const m of String(page.html || "").matchAll(/data-img="([^"]+)"/g)) used.add(m[1]);
  const info = {};
  for (const id of [...used].sort()) {
    const c = captures[id];
    if (!c) continue;
    const entry = {};
    if (typeof c.captured === "string" && c.captured) entry.captured = c.captured;
    if (typeof c.version === "string" && c.version) entry.version = c.version;
    if (Object.keys(entry).length) info[id] = entry;
  }
  return Object.keys(info).length ? info : null;
}

/** Serialises site data the way `#site-data` is: "<" escaped, so that a "</script>" inside a page's HTML can
 * never close the embedding tag early. */
const toJson = (data) => JSON.stringify(data).replace(/</g, "\\u003c");

/**
 * @param {object} p
 * @param {string} p.template   template.html
 * @param {string} p.app        app.js
 * @param {Record<string, string>} p.markers
 * @param {(key: string, vars?: object) => string} p.t
 * @param {(name: string) => string} p.icon
 * @param {object} p.data       site data (serialised as JSON, "<" escaped); meta.screenshots is added to it
 * @param {string} p.themeKey
 * @param {object} [p.textVars] variables of the template texts ({product}…)
 * @param {Record<string, object>} [p.captures]  zone files by id (screenshot dates and versions) of `data`
 * @param {Array<{ id: string, data: object, captures?: Record<string, object> }>} [p.languages]  ARCHITECTURE.md
 *   §6.12: one entry per OTHER declared language; fills {{LANGUAGE_DATA}}, each with its own screenshots
 */
export function assemble({ template, app, markers, t, icon, data, themeKey, textVars = {}, captures, languages = [] }) {
  const screenshots = screenshotInfo(data, captures);
  if (screenshots && data.meta) data.meta.screenshots = screenshots;
  for (const l of languages) {
    const s = screenshotInfo(l.data, l.captures);
    if (s && l.data.meta) l.data.meta.screenshots = s;
  }
  const languageData = languages
    .map((l) => `<script type="application/json" id="site-data-${esc(l.id)}">${toJson(l.data)}</script>`)
    .join("\n");
  const values = {
    ...markers,
    DATA: toJson(data),
    LANGUAGE_DATA: languageData,
    APP: app.replace(/__THEME_KEY__/g, () => themeKey),
  };
  const html = template.replace(/\{\{(t:[\w.]+|ICON:[\w-]+|[A-Z_]+)\}\}/g, (m, key) => {
    if (key.startsWith("t:")) return esc(t(key.slice(2), textVars));
    if (key.startsWith("ICON:")) return icon(key.slice(5));
    if (!(key in values)) throw new Error(`unknown template marker: ${m}`);
    return values[key];
  });
  // What the browser may run (AUDIT.md S9): computed on the final HTML, since the scripts' hashes depend on it.
  return withContentSecurityPolicy(html);
}
