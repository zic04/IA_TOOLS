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
import { esc } from "./text.mjs";

/**
 * Dates and versions of the screenshots used by the pages: { id: { captured?, version? } }, or null when no
 * screenshot carries one.
 * @param {object} data      site data (pages[].html contains <img data-img="id">)
 * @param {Record<string, object>} [captures]  normalised zone files, by id
 */
export function screenshotInfo(data, captures) {
  if (!captures) return null;
  const used = new Set();
  for (const page of Object.values(data.pages || {})) for (const m of String(page.html || "").matchAll(/data-img="([^"]+)"/g)) used.add(m[1]);
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
 * @param {Record<string, object>} [p.captures]  zone files by id (screenshot dates and versions)
 */
export function assemble({ template, app, markers, t, icon, data, themeKey, textVars = {}, captures }) {
  const screenshots = screenshotInfo(data, captures);
  if (screenshots && data.meta) data.meta.screenshots = screenshots;
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const values = { ...markers, DATA: json, APP: app.replace(/__THEME_KEY__/g, () => themeKey) };
  return template.replace(/\{\{(t:[\w.]+|ICON:[\w-]+|[A-Z_]+)\}\}/g, (m, key) => {
    if (key.startsWith("t:")) return esc(t(key.slice(2), textVars));
    if (key.startsWith("ICON:")) return icon(key.slice(5));
    if (!(key in values)) throw new Error(`unknown template marker: ${m}`);
    return values[key];
  });
}
