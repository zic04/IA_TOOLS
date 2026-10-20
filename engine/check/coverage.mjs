// Coverage (ARCHITECTURE.md §5): every element inventoried by the coverage adapters (routes, registry entries,
// files…) must be cited in the documentation. The adapters only list the elements; the kit searches the
// normalised text of <content>/**/*.md|json (pages and table of contents, `routes` included) of the WRITTEN pages
// only: not the pages declared without their file, nor those that still hold template guidance, whose entries are
// reported as the plan (`plannedBy`). It makes the report and gives the exit code.
//   config.coverage: [{ adapter: "next-app-router", app: "../../app" }, { adapter: "local:adapters/x.mjs", … }]
// An adapter that cannot find what it inventories (the application is not next to the documentation) answers
// { available: false, reason }: its check is skipped, not failed.
import fs from "node:fs";
import path from "node:path";
import { loadAdapter } from "../capture/session.mjs";
import { countGuidance } from "../core/page-templates.mjs";
import { globRegex } from "../core/glob.mjs";
import { TOC_FILE, stripBom } from "../project/toc.mjs";

const SKIP = new Set(["node_modules", ".git"]);

/** Normalised text: non-breaking spaces and runs of white space → one space, lower case. */
export const normalize = (s) => String(s).replace(/[  ]/g, " ").replace(/\s+/g, " ").toLowerCase();

/**
 * Tools given to the adapters; every path is relative to the project root (the documentation folder).
 *   resolve(p) · exists(p) · read(p) · json(p) · walk(dir) → relative file paths (forward slashes) ·
 *   glob(pattern, base = ".") → files of `base` matching the pattern · i18nKey(object, "a.b.c") → value
 */
export function adapterTools(root) {
  const resolve = (p) => path.resolve(root, p);
  const walk = (dir) => {
    const base = resolve(dir);
    if (!fs.existsSync(base)) return [];
    const out = [];
    const visit = (d, rel) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (SKIP.has(e.name)) continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) visit(path.join(d, e.name), r);
        else if (e.isFile()) out.push(r);
      }
    };
    visit(base, "");
    return out.sort();
  };
  return {
    resolve,
    exists: (p) => fs.existsSync(resolve(p)),
    read: (p) => fs.readFileSync(resolve(p), "utf8"),
    json: (p) => JSON.parse(fs.readFileSync(resolve(p), "utf8")),
    walk,
    glob: (pattern, base = ".") => {
      const re = globRegex(pattern.replace(/^\.\//, ""));
      return walk(base).filter((f) => re.test(f));
    },
    i18nKey: (object, key) => {
      if (object && Object.prototype.hasOwnProperty.call(object, key)) return object[key];
      return String(key)
        .split(".")
        .reduce((o, k) => (o == null || typeof o !== "object" ? undefined : o[k]), object);
    },
  };
}

/**
 * The forms under which a route may be cited: as is, with :param, {param} or [param], and the static prefix
 * before its first parameter (as the original engine did: "/orders/[id]" is covered by "/orders/").
 */
export function routeMatches(route) {
  const source = /\[\[?\.{0,3}([^\]]+?)\]?\]|:([A-Za-z_][\w]*)\??|\{([^}]+)\}/;
  if (!source.test(route)) return [route];
  const params = new RegExp(source.source, "g");
  const forms = new Set([route]);
  const each = (f) => route.replace(params, (m, a, b, c) => f(a || b || c));
  forms.add(each((p) => `:${p}`));
  forms.add(each((p) => `{${p}}`));
  forms.add(each((p) => `[${p}]`));
  const prefix = route.split(source)[0];
  if (/[^/]/.test(prefix)) forms.add(prefix);
  return [...forms];
}

/**
 * The table of contents without the pages not written yet (`isUnwritten(file)`, file relative to the content):
 * neither their entry (id, title, `routes`) nor their id in the journeys and suggestions. `planned` receives the
 * normalised text of each entry set aside, by page id: what the plan promises, not yet what the pages say.
 */
function tocText(text, isUnwritten, planned) {
  let toc;
  try {
    toc = JSON.parse(stripBom(text));
  } catch {
    return text; // reported by the build
  }
  const ids = new Set();
  const unwrittenEntry = (p) => p && typeof p === "object" && isUnwritten(String(p.file || `${p.id}.md`));
  for (const s of Array.isArray(toc?.sections) ? toc.sections : [])
    for (const g of s?.groups || [])
      if (Array.isArray(g?.pages))
        g.pages = g.pages.filter((p) => {
          if (!unwrittenEntry(p)) return true;
          ids.add(p.id);
          planned.set(String(p.id), normalize(JSON.stringify(p)));
          return false;
        });
  const keep = (list) => (Array.isArray(list) ? list.filter((id) => !ids.has(id)) : list);
  for (const j of Array.isArray(toc?.journeys) ? toc.journeys : [])
    if (j && typeof j === "object" && "steps" in j) j.steps = keep(j.steps);
  if (toc && typeof toc === "object") toc.suggestions = keep(toc.suggestions);
  return JSON.stringify(toc);
}

/**
 * The written documentation (content/**\/*.md|json), normalised, and what the plan promises beyond it. A page is
 * WRITTEN when its file exists and holds no template guidance (`<!-- guidance:` / `<!-- consigne :`): only written
 * pages cover an element (ARCHITECTURE.md §5). A page declared without its file, or that still holds guidance,
 * covers nothing: neither its text nor its entry in the table of contents (id, title, `routes`), so that neither
 * the plan alone nor the examples of a skeleton cover a route.
 * @returns {{ text: string, planned: Map<string, string> }}  planned: page id → normalised text of the entry of
 *   each page declared but not written yet
 */
function documentationTexts(root, content) {
  const tools = adapterTools(root);
  const files = tools.walk(content).filter((f) => /\.(md|json)$/i.test(f));
  const texts = new Map(files.map((f) => [f, tools.read(path.join(content, f))]));
  const drafts = new Set(files.filter((f) => /\.md$/i.test(f) && countGuidance(texts.get(f)) > 0));
  const isUnwritten = (f) => drafts.has(f) || !texts.has(f);
  const planned = new Map();
  const text = normalize(
    files
      .filter((f) => !drafts.has(f))
      .map((f) => (f === TOC_FILE ? tocText(texts.get(f), isUnwritten, planned) : texts.get(f)))
      .join("\n"),
  );
  return { text, planned };
}

/** A letter or a digit, of any script: what continues an id (punctuation — “ ” … ’ — does not). One character. */
const ID_CHAR = /^[\p{L}\p{N}]$/u;
const isIdChar = (ch) => ch !== undefined && ID_CHAR.test(ch);

/** Whether `needle` appears in `text` whole: no letter or digit right before or after it (F-01 is not in F-010). */
function containsWhole(text, needle) {
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + 1))
    if (!isIdChar(text[i - 1]) && !isIdChar(text[i + needle.length])) return true;
  return false;
}

/** Does an item appear in the documentation text? An item marked `whole` (an id: F-01) only as a whole. */
export const isCovered = (item, text) =>
  (item.match || []).some(
    (m) =>
      m !== undefined &&
      m !== null &&
      String(m).trim() !== "" &&
      (item.whole ? containsWhole(text, normalize(m)) : text.includes(normalize(m))),
  );

/** Applies an `exclude` option (regular expressions, or exact ids) to a list of items. */
export function excludeItems(items, exclude = []) {
  const res = exclude.map((x) => {
    try {
      return new RegExp(x);
    } catch {
      return { test: (id) => id === x };
    }
  });
  return items.filter((i) => !res.some((re) => re.test(i.id)));
}

/**
 * Runs the coverage adapters of the configuration. An element is covered when a WRITTEN page cites it (see
 * documentationTexts); an element that only the entry of a page not written yet cites is `plannedBy` that page:
 * `planned` counts the elements covered once every declared page is written.
 * @param {{ root: string, config: object }} p
 * @returns {Promise<{ adapters: Array<{ adapter: string, available: boolean, reason?: string, vars?: object,
 *   families: Array<{ name: string, total: number, covered: number, items: Array<{ id, label?, match, covered, plannedBy? }> }> }>,
 *   total: number, covered: number, missing: number, planned: number }>}
 */
export async function runCoverage({ root, config }) {
  const { text, planned } = documentationTexts(root, config.paths.content);
  const tools = adapterTools(root);
  const adapters = [];
  for (const [i, spec] of config.coverage.entries()) {
    const { name, adapter, options } = await loadAdapter("coverage", spec, root, `coverage[${i}]`);
    let r;
    try {
      r = await adapter.inventory({ root, options, tools });
    } catch (e) {
      r = { available: false, reason: "error", vars: { error: String(e.message).split("\n")[0] } };
    }
    if (!r || r.available === false) {
      adapters.push({
        adapter: name,
        available: false,
        reason: r?.reason || "unknown",
        vars: r?.vars || {},
        families: [],
      });
      continue;
    }
    const families = (r.families || []).map((f) => {
      const items = (f.items || []).map((it) => ({
        id: String(it.id),
        ...(it.label !== undefined ? { label: it.label } : {}),
        match: it.match || [String(it.id)],
        ...(it.whole ? { whole: true } : {}),
        covered: false,
      }));
      for (const it of items) {
        it.covered = isCovered(it, text);
        if (!it.covered)
          for (const [page, entry] of planned)
            if (isCovered(it, entry)) {
              it.plannedBy = page;
              break;
            }
      }
      return { name: f.name, total: items.length, covered: items.filter((x) => x.covered).length, items };
    });
    adapters.push({ adapter: name, available: true, families });
  }
  const all = adapters.flatMap((a) => a.families);
  const total = all.reduce((n, f) => n + f.total, 0);
  const covered = all.reduce((n, f) => n + f.covered, 0);
  const plannedOnly = all.reduce((n, f) => n + f.items.filter((x) => x.plannedBy).length, 0);
  return { adapters, total, covered, missing: total - covered, planned: covered + plannedOnly };
}
