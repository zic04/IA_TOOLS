// Local import resolver (ARCHITECTURE.md §6.10, §2.2): a lightweight, regex-based closure of the local imports of
// a set of files, bounded in depth and in size. No AST, no package resolution (a specifier that is not relative
// and matches no `paths` alias is a package: ignored). Never reads outside app.dir.
import fs from "node:fs";
import path from "node:path";
import { relPath } from "../facts/common.mjs";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".venv", "venv"]);
const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const CODE_EXTS = ["ts", "tsx", "js", "jsx", "mjs", "cjs"];
const IGNORED_EXTS = /\.(css|scss|sass|less|svg|png|jpe?g|gif|webp|ico|woff2?|json|md)$/i;

const JS_IMPORT_RES = [
  /\b(?:import|export)\s[^'"`;]*?\sfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/** Raw import/require specifiers of a JS/TS source (regex on the text, not an AST). */
export function jsSpecifiers(text) {
  const out = [];
  for (const re of JS_IMPORT_RES) for (const m of text.matchAll(re)) out.push(m[1]);
  return out;
}

/** `from .x import y` / `import a.b` specifiers of a Python source: { module, level } (level: number of leading dots). */
export function pySpecifiers(text) {
  const out = [];
  for (const m of text.matchAll(/^\s*from\s+(\.*)([\w.]*)\s+import\b/gm))
    out.push({ module: m[2], level: m[1].length });
  for (const m of text.matchAll(/^\s*import\s+([\w.]+)/gm)) out.push({ module: m[1], level: 0 });
  return out;
}

/** Text without JSON comments (// and /\* *\/, respecting string literals) and trailing commas: tolerant jsonc. */
function stripJsonc(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      i--;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
      continue;
    }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

/**
 * The nearest tsconfig.json/jsconfig.json of a file, from its folder up to (and including) app.dir. `extends` is
 * never followed. `baseUrl` is returned already resolved relative to app.dir (not to the tsconfig's own folder).
 * @returns {{ baseUrl: string, paths: Record<string,string[]> } | null}
 */
export function loadTsconfig(appDir, fileAppRel) {
  let dir = path.posix.dirname(fileAppRel.split(path.sep).join("/"));
  for (;;) {
    for (const name of ["tsconfig.json", "jsconfig.json"]) {
      const rel = dir === "." ? name : `${dir}/${name}`;
      const abs = path.join(appDir, rel);
      if (fs.existsSync(abs)) {
        try {
          const json = JSON.parse(stripJsonc(fs.readFileSync(abs, "utf8")));
          const co = json.compilerOptions || {};
          if (co.paths) return { baseUrl: path.posix.join(dir, co.baseUrl || "."), paths: co.paths };
        } catch {
          // an invalid tsconfig is not this resolver's job
        }
      }
    }
    if (dir === ".") return null;
    dir = path.posix.dirname(dir);
  }
}

/** Is `rel` (posix, relative to appDir) inside app.dir once resolved? */
function withinApp(appDir, rel) {
  const abs = path.resolve(appDir, rel);
  const base = path.resolve(appDir);
  return abs === base || abs.startsWith(base + path.sep);
}

/** Candidate files for a specifier resolved to `base` (no known extension yet), in resolution order (§2.2). */
function codeCandidates(base) {
  const out = [];
  if (CODE_FILE.test(base)) out.push(base);
  for (const ext of CODE_EXTS) out.push(`${base}.${ext}`);
  for (const ext of CODE_EXTS) out.push(`${base}/index.${ext}`);
  if (base.endsWith(".js")) out.push(base.slice(0, -3) + ".ts", base.slice(0, -3) + ".tsx");
  return out;
}

/** The first candidate that exists within app.dir, as a path relative to it (forward slashes), or null. */
function firstExisting(appDir, candidates) {
  for (const c of candidates) {
    if (!withinApp(appDir, c)) continue;
    const abs = path.resolve(appDir, c);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return relPath(appDir, abs);
  }
  return null;
}

/** Resolves one JS/TS specifier to a file relative to app.dir, or null (a package, or not found). */
export function resolveJs(spec, fromFile, appDir, tsconfig) {
  if (IGNORED_EXTS.test(spec)) return null;
  if (spec.startsWith("./") || spec.startsWith("../")) {
    const base = path.posix.join(path.posix.dirname(fromFile.split(path.sep).join("/")), spec);
    return firstExisting(appDir, codeCandidates(base));
  }
  if (tsconfig)
    for (const [key, values] of Object.entries(tsconfig.paths)) {
      const re = new RegExp(`^${key.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace("*", "(.*)")}$`);
      const m = re.exec(spec);
      if (!m) continue;
      for (const value of values) {
        const resolved = value.includes("*") ? value.replace("*", m[1] ?? "") : value;
        const found = firstExisting(appDir, codeCandidates(path.posix.join(tsconfig.baseUrl, resolved)));
        if (found) return found;
      }
    }
  return null; // a bare package specifier
}

/** Resolves one Python `{ module, level }` specifier to a file relative to app.dir, or null. */
export function resolvePy({ module, level }, fromFile, appDir) {
  const posixFrom = fromFile.split(path.sep).join("/");
  const modPath = module ? module.split(".").join("/") : "";
  const candidates = [];
  if (level > 0) {
    const dirParts = path.posix.dirname(posixFrom) === "." ? [] : path.posix.dirname(posixFrom).split("/");
    const up = level - 1;
    if (up > dirParts.length) return null; // would climb above app.dir
    const base = dirParts.slice(0, dirParts.length - up).join("/") || ".";
    if (!modPath) candidates.push(`${base}/__init__.py`);
    else {
      const full = base === "." ? modPath : `${base}/${modPath}`;
      candidates.push(`${full}.py`, `${full}/__init__.py`);
    }
  } else {
    if (!modPath) return null;
    candidates.push(`${modPath}.py`, `${modPath}/__init__.py`);
    const dir = path.posix.dirname(posixFrom);
    if (dir !== ".") candidates.push(`${dir}/${modPath}.py`, `${dir}/${modPath}/__init__.py`);
  }
  for (const c of candidates) {
    if (!withinApp(appDir, c)) continue;
    const abs = path.resolve(appDir, c);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return relPath(appDir, abs);
  }
  return null;
}

/** Is any segment of `rel` one of the folders never traversed? */
const inSkippedDir = (rel) => rel.split("/").some((s) => SKIP_DIRS.has(s));

/**
 * The transitive closure of the local imports of `files` (BFS), bounded in depth and in size. The starting
 * files are included at depth 0; a file reached at `maxDepth` is included but its own imports are not resolved.
 * @param {{ appDir: string, files: string[], maxDepth?: number, maxFiles?: number }} p   files: appRel
 * @returns {{ files: Set<string>, truncated: boolean }}
 */
export function resolveImports({ appDir, files, maxDepth = 3, maxFiles = 200 }) {
  const visited = new Set(files);
  const queue = files.map((file) => ({ file, depth: 0 }));
  let truncated = false;
  const tsconfigCache = new Map();
  while (queue.length) {
    const { file, depth } = queue.shift();
    if (depth >= maxDepth) continue;
    const abs = path.join(appDir, file);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    let text;
    try {
      text = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const next = [];
    if (CODE_FILE.test(file)) {
      if (!tsconfigCache.has(file)) tsconfigCache.set(file, loadTsconfig(appDir, file));
      const tsconfig = tsconfigCache.get(file);
      for (const spec of jsSpecifiers(text)) {
        const r = resolveJs(spec, file, appDir, tsconfig);
        if (r) next.push(r);
      }
    } else if (file.endsWith(".py")) {
      for (const spec of pySpecifiers(text)) {
        const r = resolvePy(spec, file, appDir);
        if (r) next.push(r);
      }
    }
    for (const n of next) {
      if (inSkippedDir(n) || visited.has(n)) continue;
      if (visited.size >= maxFiles) {
        truncated = true;
        continue;
      }
      visited.add(n);
      queue.push({ file: n, depth: depth + 1 });
    }
  }
  return { files: visited, truncated };
}
