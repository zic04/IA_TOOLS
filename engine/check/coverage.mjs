// Coverage (ARCHITECTURE.md §5): every element inventoried by the coverage adapters (routes, registry entries,
// files…) must be cited in the documentation. The adapters only list the elements; the kit searches the
// normalised text of <content>/**/*.md|json (pages and table of contents, `routes` included), makes the report
// and gives the exit code.
//   config.coverage: [{ adapter: "next-app-router", app: "../../app" }, { adapter: "local:adapters/x.mjs", … }]
// An adapter that cannot find what it inventories (the application is not next to the documentation) answers
// { available: false, reason }: its check is skipped, not failed.
import fs from "node:fs";
import path from "node:path";
import { loadAdapter } from "../capture/session.mjs";

const SKIP = new Set(["node_modules", ".git"]);

/** Normalised text: non-breaking spaces and runs of white space → one space, lower case. */
export const normalize = (s) =>
  String(s)
    .replace(/[  ]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

/** Regular expression of a glob: ** (any folders), * (any characters but /), ?, {a,b}. */
export function globRegex(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") {
        i++;
        re += "(?:.*/)?";
      } else re += ".*";
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end < 0) re += "\\{";
      else {
        re += "(?:" + glob.slice(i + 1, end).split(",").map((s) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&")).join("|") + ")";
        i = end;
      }
    } else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp("^" + re + "$");
}

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

/** All the text of the documentation (content/**\/*.md|json), normalised. */
export function documentationText(root, content) {
  const tools = adapterTools(root);
  return normalize(
    tools
      .walk(content)
      .filter((f) => /\.(md|json)$/i.test(f))
      .map((f) => tools.read(path.join(content, f)))
      .join("\n")
  );
}

/** Does an item appear in the documentation text? */
export const isCovered = (item, text) => (item.match || []).some((m) => m !== undefined && m !== null && String(m).trim() !== "" && text.includes(normalize(m)));

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
 * Runs the coverage adapters of the configuration.
 * @param {{ root: string, config: object, withText?: boolean }} p
 * @returns {Promise<{ adapters: Array<{ adapter: string, available: boolean, reason?: string, vars?: object,
 *   families: Array<{ name: string, total: number, covered: number, items: Array<{ id, label?, match, covered }> }> }>,
 *   total: number, covered: number, missing: number }>}
 */
export async function runCoverage({ root, config }) {
  const text = documentationText(root, config.paths.content);
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
      adapters.push({ adapter: name, available: false, reason: r?.reason || "unknown", vars: r?.vars || {}, families: [] });
      continue;
    }
    const families = (r.families || []).map((f) => {
      const items = (f.items || []).map((it) => ({ id: String(it.id), ...(it.label !== undefined ? { label: it.label } : {}), match: it.match || [String(it.id)], covered: false }));
      for (const it of items) it.covered = isCovered(it, text);
      return { name: f.name, total: items.length, covered: items.filter((x) => x.covered).length, items };
    });
    adapters.push({ adapter: name, available: true, families });
  }
  const all = adapters.flatMap((a) => a.families);
  const total = all.reduce((n, f) => n + f.total, 0);
  const covered = all.reduce((n, f) => n + f.covered, 0);
  return { adapters, total, covered, missing: total - covered };
}
