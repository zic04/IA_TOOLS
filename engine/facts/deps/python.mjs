// Python manifests and lock files of the `dependencies` source (engine/facts/dependencies.mjs): requirements*.txt,
// pyproject.toml (Poetry), poetry.lock.
import { readText } from "./read.mjs";

/**
 * What tells a Python package that is not from PyPI (`local: true`, never sent by network.mjs), or a requirements
 * line that names no package. The manifests are untrusted: these expressions are linear (RULES.md S5,
 * test/tools/redos-worker.mjs).
 */
export const PYTHON_PATTERNS = Object.freeze({
  /** A requirements line that is a URL or a path: it names no PyPI package. */
  urlLine: /^(?:git\+|https?:|file:|\.{0,2}[\\/])/i,
  /** A requirements line holding a path before any "@" (a direct reference keeps its name: "name @ file:///x"). */
  pathLine: /^[^@]*[\\/]/,
  /** A requirements line that is a local archive (pip installs the file; its name would be read as a package). */
  archiveLine: /\.(?:whl|zip|tgz|tar(?:\.(?:gz|bz2|xz))?)$/i,
  /** poetry.lock `[package.source]`: its `type` (legacy: an index; directory, file, git, url: not an index) and `url`. */
  poetrySource: /^(type|url)\s*=\s*"([^"]*)"/,
  /** PyPI itself. */
  publicIndex: /^https?:\/\/(?:pypi\.org|files\.pythonhosted\.org)(?:\/|$)/i,
  /** A Poetry inline table taking the package from a folder, git or a URL. */
  inlineLocal: /\b(?:path|git|url)\s*=/,
  inlineSource: /\bsource\s*=\s*"([^"]*)"/,
  inlineVersion: /\bversion\s*=\s*"([^"]*)"/,
});

/**
 * One requirements*.txt (requirements.txt, requirements-dev.txt…): "name[extra1,extra2]==version" (and the other
 * PEP 508 operators, possibly several comma-separated constraints, e.g. ">=2.0,<3.0"). `name` and `extras` are
 * read apart from the version specifier (`uvicorn[standard]` is the package `uvicorn`, extra `standard`, never
 * folded into the version); `operator` is the first comparison found; `version` is the exact pinned version
 * (`==` only) or `null` for a range or an unpinned entry; `spec` keeps the constraint as written, or `null` when
 * there is none.
 */
function fromRequirements(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable);
  if (text === null) return [];
  const dev = /dev/i.test(manifest.split("/").pop());
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").split(";")[0].trim(); // env markers (; python_version>="3.8") dropped
    if (!line || line.startsWith("-")) continue;
    // A URL, a path or a local archive: pip installs it as it is, it names no PyPI package (and its file name must
    // never be sent as one).
    const pattern = PYTHON_PATTERNS;
    if (pattern.urlLine.test(line) || pattern.pathLine.test(line) || pattern.archiveLine.test(line)) continue;
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[([^\]]*)\])?\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, name, extrasRaw, specRaw] = m;
    const extras = extrasRaw
      ? extrasRaw
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean)
      : [];
    const spec = specRaw.trim();
    const opMatch = /^(==|>=|<=|~=|!=|>|<)/.exec(spec);
    const operator = opMatch ? opMatch[1] : null;
    const pinned = /==\s*([^,\s]+)/.exec(spec);
    // PEP 508 direct reference ("name @ file:///…", "name @ git+https://…"): not from PyPI, never sent.
    const local = spec.startsWith("@");
    out.push({
      name,
      ...(extras.length ? { extras } : {}),
      operator,
      version: pinned ? pinned[1] : null,
      spec: spec || null,
      ecosystem: "pip",
      direct: true,
      dev,
      manifest,
      ...(local ? { local } : {}),
    });
  }
  return out;
}

/** One pyproject.toml: [tool.poetry.dependencies] and [tool.poetry.group.<name>.dependencies] (non-main groups are dev). */
function fromPyproject(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable);
  if (text === null) return [];
  const out = [];
  let section = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const h = /^\[([^\]]+)\]/.exec(line);
    if (h) {
      section = h[1];
      continue;
    }
    if (section !== "tool.poetry.dependencies" && !/^tool\.poetry\.group\.[\w-]+\.dependencies$/.test(section || ""))
      continue;
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*=\s*"?([^"#,{]*)/.exec(line);
    if (!m || m[1].toLowerCase() === "python") continue;
    // An inline table: { path = … }, { git = … }, { url = … } or { source = "<private index>" } is not from PyPI.
    // A list of constraints ([ { … }, { … } ]) is read the same way; one that goes on past this line cannot be read
    // here, so it counts as local (on a doubt, the name is never sent).
    const table = line.slice(line.indexOf("=") + 1).trim();
    const inline = table.startsWith("{") || table.startsWith("[");
    const unclosed = table.startsWith("[") && !table.includes("]");
    const source = inline ? PYTHON_PATTERNS.inlineSource.exec(table)?.[1] : null;
    const local =
      inline && (unclosed || PYTHON_PATTERNS.inlineLocal.test(table) || (!!source && source.toLowerCase() !== "pypi"));
    const version = inline ? PYTHON_PATTERNS.inlineVersion.exec(table)?.[1] : m[2];
    out.push({
      name: m[1],
      version: (version || "*").trim() || "*",
      ecosystem: "pip",
      direct: true,
      dev: section !== "tool.poetry.dependencies",
      manifest,
      ...(local ? { local } : {}),
    });
  }
  return out;
}

/** One poetry.lock: `[[package]]` blocks, `name`, `version` and `groups`; no self-contained direct/transitive signal. */
function fromPoetryLock(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable);
  if (text === null) return [];
  const out = [];
  /** @type {{ name?: string, version?: string, dev?: boolean, local?: boolean }|null} */
  let current = null;
  const flush = () => {
    if (current?.name)
      out.push({
        name: current.name,
        version: current.version,
        ecosystem: "pip",
        direct: false,
        dev: !!current.dev,
        manifest,
        ...(current.local ? { local: true } : {}),
      });
  };
  let inSource = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "[[package]]") {
      flush();
      current = {};
      inSource = false;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("[")) {
      inSource = line === "[package.source]";
      continue;
    }
    if (inSource) {
      // [package.source]: a folder, a file, git, a URL or an index other than PyPI — its name is never sent.
      const s = PYTHON_PATTERNS.poetrySource.exec(line);
      if (s?.[1] === "type" && s[2] !== "legacy") current.local = true;
      if (s?.[1] === "url" && !PYTHON_PATTERNS.publicIndex.test(s[2])) current.local = true;
      continue;
    }
    const m = /^(name|version)\s*=\s*"([^"]+)"/.exec(line);
    if (m) current[m[1]] = m[2];
    const g = /^groups\s*=\s*\[([^\]]*)\]/.exec(line);
    if (g) current.dev = !/(^|["'\s,])main(["'\s,]|$)/.test(g[1]);
  }
  flush();
  return out;
}

/** The reader of a Python manifest or lock file, by file name (lower case), or null. */
export const pythonReader = (name) =>
  name === "poetry.lock"
    ? fromPoetryLock
    : name === "pyproject.toml"
      ? fromPyproject
      : /^requirements[^/]*\.txt$/i.test(name)
        ? fromRequirements
        : null;
