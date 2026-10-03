// Capture plans: loading, normalisation, validation and selection.
//
// ═══ Plan syntax ═══════════════════════════════════════════════════════════════════════════════════════════════
// A plan is a JavaScript module in the plans folder (capture.plans, default "captures/plans"; --plans or
// <PREFIX>_PLANS select another one, e.g. "captures/plans-prod"). Each file exports CAPTURES, a list of entries.
// Files are read in alphabetical order. An id that appears twice (in one file or in two) is an error.
//
//   export const CAPTURES = [
//     {
//       id: "use-orders-list",            identifier: images/<id>.webp + images/zones/<id>.json, cited in the Markdown
//                                        by :::screen{capture="<id>"}; letters, digits, ".", "_" and "-"
//       title: "Orders › list",           caption written in the zone file (shown above the screen)
//       route: "/orders?status=open",     path opened in the application (relative to app.url, starts with "/")
//       context: "desktop",               a key of capture.viewports ("desktop" by default, "mobile": touch screen)
//       viewport: { height: 2200 },       size override for this capture (a tall panel: no scrolling, no cut zone)
//       view: { lon, lat, zoom },         map framing, appended to the route with the URL parameters of capture.map:
//                                        lon/lat are converted to Web Mercator metres (EPSG:3857); { x, y, z } is
//                                        passed as is
//       storage: { tab: "lines" },        localStorage keys set before opening the page (on top of capture.storage;
//                                        "{version}" is replaced by the application version; non-strings → JSON)
//       delay: 0,                         minimum wait after loading, in ms (default 0: the kit waits until the page
//                                        is stable — network quiet, fonts, DOM still; a map drawn on a canvas: 3000)
//       actions: [ … ],                   steps played before the capture (below)
//       settle: 0,                        minimum wait after the actions, in ms (default 0: until stable again)
//       frame: target,                    element whose box delimits the image (default: the whole viewport);
//                                        margin: horizontal margin in px (default 34, room for the markers placed
//                                        left of the zones), marginY: vertical margin (default 10)
//       zones: [ zone, … ],               annotated elements, IN THE ORDER of the markers ①②③… (3 to 12)
//       masks: [ target, … ],             elements whose text is replaced by dots, every match unless nth or last
//                                        is given (on top of the automatic masking)
//     },
//   ];
//
// Actions (one key each):
//   { click: target, options? }   click (options: Playwright click options, e.g. { position: { x: 5, y: 5 } })
//   { hover: target }             hover
//   { type: target, value }       fill a field
//   { select: target, value }     choose an option of a <select> (value, label, or a list of them)
//   { press: "Escape" }           press a key (Playwright key name, e.g. "Control+K")
//   { scroll: target }            scroll the element into view
//   { wait: 500 } | { wait: target }   wait n ms, or until the element is visible (15 s at most)
//   { wheel: { x, y, steps: 1, direction: -1 } }   mouse wheel at (x, y): steps of 360 px, -1 = up / zoom in
//   { eval: () => … }             a function (or a string) evaluated in the page
//
// Targets (exactly one kind):
//   { role: "button", name: "Save" }   ARIA role and accessible name (string or RegExp)
//   { text: "Total" }                  visible text (string or RegExp)
//   { field: "Customer" }              a whole form field: the <label> that contains exactly this text
//   { label: "E-mail" }                the control associated with this label
//   { placeholder: "Search…" }         a field by its placeholder
//   { css: "main .toolbar" }           a CSS selector
//   { block: "Filters" }               a container matching capture.selectors.block, with a button or heading
//                                      whose name starts with this text (the last one wins)
// Target options:
//   exact: true          exact match of name / text / label / placeholder (default: substring, case-insensitive)
//   nth: 2 · last: true  which match (default: the first)
//   has: "text"          keep the matches that contain this text (string or RegExp)
//   within: target       search inside another target
//   up: 1                climb n parent elements
//   framed: true         the nearest bordered box that contains the element: the closest ancestor (or itself)
//                        matching capture.selectors.frame, or, when it is not set, with a border on its four sides
//   margin: 4            px around a zone (default 4); for a frame, horizontal margin (default 34)
//   marginY: 10          vertical margin of a frame (default 10)
//
// Zones: a target, or { union: [target, …] }, one marker over the bounding box of all its targets (several fields
// of one row). Zone options: caption (text written in the zone file as `label`), side (where the marker sits:
// "corner", "right", "bottom", "bottom-right"; by default on the left, or "corner" when there is no room), margin.
//
// Helpers for frequent targets: `doc-kit/targets` (field, toggle, card, button, link, tab, main, union).
//
// Legacy French plans (ARCHITECTURE.md §6.7) are normalised when read (titre, contexte, vue, stockage, delai,
// cadre, masques, clic, saisir, champ, texte…); `libelle` (caption, on any target) becomes `caption` and
// `stabiliser` becomes `settle`.
//
// Validation (schemas/capture-plan.schema.json) accepts what the engine executes: a negative margin tightens a
// zone or a frame, a negative nth counts from the last match, a viewport only needs whole pixels (a 150 px strip),
// wheel.steps may be 0. Every entry of every file is checked; the errors are listed together, each one with its
// file, its entry (id and index) and its path, and one invalid entry stops the command.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizePlanEntry } from "../project/legacy.mjs";
import { validate } from "../project/validate.mjs";
import { readSchema } from "../project/load.mjs";
import { KitError, EXIT } from "../project/errors.mjs";

const TARGET_KINDS = ["role", "text", "field", "label", "placeholder", "css", "block"];
const ACTION_KINDS = ["click", "hover", "type", "select", "press", "scroll", "wait", "wheel", "eval"];
const TARGET_ACTIONS = ["click", "hover", "type", "select", "scroll"];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof RegExp);

/**
 * Normalises one plan entry: legacy keys (§6.7) → current keys.
 * @returns {{ value: object, legacy: boolean }}
 */
export function normalizeEntry(raw) {
  return normalizePlanEntry(raw);
}

/** Checks the schema cannot express: exactly one kind per target and per action. */
function kindErrors(entry) {
  const errors = [];
  const target = (t, p, { zone = false } = {}) => {
    if (!isObject(t)) return;
    if (zone && Array.isArray(t.union)) {
      t.union.forEach((u, i) => target(u, `${p}.union[${i}]`));
      return;
    }
    const kinds = TARGET_KINDS.filter((k) => k in t);
    if (kinds.length !== 1) errors.push({ path: p, key: "target", vars: { found: kinds.join(", ") || "—", kinds: TARGET_KINDS.join(", ") } });
    if (isObject(t.within)) target(t.within, `${p}.within`);
  };
  (entry.actions || []).forEach((a, i) => {
    if (!isObject(a)) return;
    const kinds = ACTION_KINDS.filter((k) => k in a);
    const p = `actions[${i}]`;
    if (kinds.length !== 1) errors.push({ path: p, key: "action", vars: { found: kinds.join(", ") || "—", kinds: ACTION_KINDS.join(", ") } });
    for (const k of TARGET_ACTIONS) if (k in a) target(a[k], `${p}.${k}`);
    if (isObject(a.wait)) target(a.wait, `${p}.wait`);
    if ((a.type !== undefined || a.select !== undefined) && a.value === undefined) errors.push({ path: `${p}.value`, key: "required", vars: { key: "value" } });
  });
  if (entry.frame) target(entry.frame, "frame");
  (entry.zones || []).forEach((z, i) => target(z, `zones[${i}]`, { zone: true }));
  (entry.masks || []).forEach((m, i) => target(m, `masks[${i}]`));
  return errors;
}

/**
 * Validates a normalised entry against schemas/capture-plan.schema.json (+ one kind per target/action).
 * @returns {Array<{path: string, key: string, vars: object}>}
 */
export function validateEntry(entry) {
  const { errors } = validate(entry, readSchema("capture-plan"));
  return errors.length ? errors : kindErrors(entry);
}

/** How an entry is named in messages: its id when it has one, and its index in CAPTURES. */
function entryLabel(entry, index) {
  const id = isObject(entry) && typeof entry.id === "string" && entry.id ? entry.id : null;
  return id ? `${id} (CAPTURES[${index}])` : `CAPTURES[${index}]`;
}

/**
 * Loads every plan of a folder.
 * @param {{ folder: string, display?: string }} p   folder: absolute path; display: shown in messages
 * @returns {Promise<{ captures: object[], files: string[], legacy: string[] }>}
 *   each capture: the normalised entry + `file` (its plan file name)
 * @throws {KitError} exit code 2: missing folder, import error, no CAPTURES export, duplicate id, invalid entries
 *   (`capture.planInvalid`: every invalid entry of every file, each detail { file, entry, path, key, vars })
 */
export async function loadPlans({ folder, display = folder }) {
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new KitError(EXIT.USAGE, "capture.plansMissing", { folder: display });
  const files = fs
    .readdirSync(folder)
    .filter((f) => f.endsWith(".mjs") || f.endsWith(".js"))
    .sort();
  const captures = [];
  const legacy = [];
  const seen = new Map();
  const details = [];
  let duplicate = null;
  for (const f of files) {
    let mod;
    try {
      // Modification time and size in the URL: a plan edited during a long-running process is read again.
      const file = path.join(folder, f);
      const st = fs.statSync(file);
      mod = await import(`${pathToFileURL(file).href}?v=${st.mtimeMs}-${st.size}`);
    } catch (e) {
      // A missing package (usually the kit itself, imported as "doc-kit/targets") is not a syntax error.
      const key = e.code === "ERR_MODULE_NOT_FOUND" ? "capture.planModule" : "capture.planImport";
      throw new KitError(EXIT.USAGE, key, { file: `${display}/${f}`, error: String(e.message).split("\n")[0] }, { cause: e });
    }
    if (!Array.isArray(mod.CAPTURES)) throw new KitError(EXIT.USAGE, "capture.planNoExport", { file: `${display}/${f}` });
    let isLegacy = false;
    mod.CAPTURES.forEach((raw, i) => {
      const { value, legacy: l } = normalizeEntry(raw);
      isLegacy ||= l;
      const errors = validateEntry(value);
      for (const e of errors) details.push({ ...e, file: `${display}/${f}`, entry: entryLabel(value, i), path: e.path === "(root)" ? "" : e.path });
      if (errors.length) return;
      if (seen.has(value.id)) {
        duplicate ??= { id: value.id, first: seen.get(value.id), second: f };
        return;
      }
      seen.set(value.id, f);
      captures.push({ ...value, file: f });
    });
    if (isLegacy) legacy.push(f);
  }
  if (details.length) throw new KitError(EXIT.USAGE, "capture.planInvalid", { folder: display, n: details.length }, { details, prefix: display });
  if (duplicate) throw new KitError(EXIT.USAGE, "capture.duplicate", duplicate);
  return { captures, files, legacy };
}

/** Regular expression of a selection pattern: "*" = any characters, "?" = one character, anchored. */
export function patternRegex(pattern) {
  return new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
}

/** The captures whose id matches one of the patterns (all of them without a pattern), in plan order. */
export function selectCaptures(captures, patterns = []) {
  if (!patterns.length) return captures;
  const res = patterns.map(patternRegex);
  return captures.filter((c) => res.some((re) => re.test(c.id)));
}

/** Path of a route, without query string or hash. */
export const routePath = (route) => String(route).split(/[?#]/)[0] || "/";

/**
 * Compiles capture.forbidden (JavaScript regular expressions on the route path).
 * @throws {KitError} exit code 2 on an invalid expression
 */
export function forbiddenMatchers(patterns = []) {
  return patterns.map((p, i) => {
    try {
      return { pattern: p, re: new RegExp(p) };
    } catch (e) {
      throw new KitError(EXIT.USAGE, "config.invalid", { file: "doc.config.mjs", n: 1 }, { details: [{ path: `capture.forbidden[${i}]`, key: "regex", vars: { error: e.message } }], prefix: "doc.config.mjs" });
    }
  });
}

/**
 * Forms of a path a server may treat as the same route: as written, percent-decoded (%2F, %61…), with repeated
 * slashes collapsed and without a trailing slash. A forbidden pattern is tested on each (SECURITY.md).
 */
function pathForms(p) {
  let decoded = p;
  try {
    decoded = decodeURIComponent(p);
  } catch {
    // malformed escape: the path as written
  }
  const forms = new Set();
  for (const f of [p, decoded]) {
    const collapsed = f.replace(/\/{2,}/g, "/");
    for (const g of [f, collapsed, collapsed.length > 1 ? collapsed.replace(/\/$/, "") : collapsed]) forms.add(g);
  }
  return [...forms];
}

/** The forbidden pattern matched by a route (its path only, in any of its forms), or null. */
export function forbiddenMatch(route, matchers) {
  const forms = pathForms(routePath(route));
  return matchers.find((m) => forms.some((f) => m.re.test(f)))?.pattern ?? null;
}
