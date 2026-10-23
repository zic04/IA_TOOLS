// Python manifests and lock files of the `dependencies` source (engine/facts/dependencies.mjs): requirements*.txt,
// pyproject.toml (PEP 621 `[project]`, PEP 735 `[dependency-groups]`, Poetry), poetry.lock. uv.lock, Pipfile and
// Pipfile.lock: deps/python-locks.mjs.
import path from "node:path";
import {
  readText,
  readBeside,
  configLines,
  tomlEntries,
  tomlArray,
  tomlLeaves,
  tableDependencies,
  splitTopLevel,
  equalsAt,
  dottedParts,
} from "./read.mjs";
import { packageKey } from "../../core/packages.mjs";
import { tomlString } from "./toml-values.mjs";
import { withVia } from "./graph.mjs";

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
  /** PyPI itself. */
  publicIndex: /^https?:\/\/(?:pypi\.org|files\.pythonhosted\.org)(?:\/|$)/i,
  /** A file PyPI serves (the `sdist` and `wheels` of a uv.lock package from its registry). */
  pypiFile: /^https:\/\/files\.pythonhosted\.org\/packages\//i,
  /** A PEP 508 requirement: its name, its extras, the rest (the constraint, or "@ <reference>"). */
  requirement: /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[([^\]]*)\])?\s*([\s\S]*)/,
  /** The first comparison of a constraint, and an exact pin. */
  operator: /^(===|==|>=|<=|~=|!=|>|<)/,
  pinned: /(?:^|,)\s*==\s*([^,\s*=]+)\s*(?:,|$)/,
  /** An exact Poetry version ("1.2.3", no operator): Poetry reads it as "==1.2.3". */
  poetryExact: /^\d+(?:\.\d+)*(?:[a-z]+\d*)?$/i,
});

/** A Python package's name as PyPI compares them (PEP 503: case and runs of -_. ignored; engine/core/packages.mjs). */
export const pypiName = (name) => packageKey("pip", name);

/**
 * One PEP 508 requirement ("name[extra1,extra2]>=1.0,<2 ; marker", "name @ git+https://…"), as an item's fields:
 * `name`, `extras` (omitted when there is none), `operator` (the first comparison, or null), `version` (the exact
 * pin, `==` only, else null), `spec` (the constraint as written, or null), `local` (a direct reference: not from
 * PyPI). Null for a URL, a path or a local archive, which name no PyPI package (its file name must never be sent as
 * one).
 */
function pep508(text) {
  const line = String(text).split(";")[0].trim(); // env markers (; python_version>="3.8") dropped
  const p = PYTHON_PATTERNS;
  if (!line || p.urlLine.test(line) || p.pathLine.test(line) || p.archiveLine.test(line)) return null;
  const m = p.requirement.exec(line);
  if (!m) return null;
  const [, name, extrasRaw, specRaw] = m;
  const extras = (extrasRaw || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  // PEP 508's older form puts the constraint in parentheses: "django (>=4.2)".
  const written = specRaw.trim();
  const spec = written.startsWith("(") && written.endsWith(")") ? written.slice(1, -1).trim() : written;
  const pinned = p.pinned.exec(spec);
  return {
    name,
    ...(extras.length ? { extras } : {}),
    operator: p.operator.exec(spec)?.[1] ?? null,
    version: pinned ? pinned[1] : null,
    spec: spec || null,
    // PEP 508 direct reference ("name @ file:///…", "name @ git+https://…"): not from PyPI, never sent.
    ...(spec.startsWith("@") ? { local: true } : {}),
  };
}

/** One requirements*.txt (requirements.txt, requirements-dev.txt…): one PEP 508 requirement a line. */
function fromRequirements(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable);
  if (text === null) return [];
  const dev = /dev/i.test(manifest.split("/").pop());
  const out = [];
  for (const line of requirementLines(text)) {
    if (!line || line.startsWith("-")) continue;
    const req = pep508(line);
    if (req) out.push({ ...req, ecosystem: "pip", direct: true, dev, manifest });
  }
  return out;
}

/**
 * Python's white space, as pip's \s and str.strip read it: unlike JavaScript's, 0x1c–0x1f are blanks and U+FEFF is
 * not (a "#" after a U+FEFF starts no comment for pip).
 */
const PY_BLANKS = new Set([
  9, 10, 11, 12, 13, 0x1c, 0x1d, 0x1e, 0x1f, 32, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005,
  0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);
const isBlank = (c) => PY_BLANKS.has(c.charCodeAt(0));

/** A line without Python's blanks at its start (and at its end with `both`). */
function pyTrim(line, both = true) {
  let a = 0;
  let b = line.length;
  while (a < b && isBlank(line[a])) a++;
  while (both && b > a && isBlank(line[b - 1])) b--;
  return line.slice(a, b);
}

/** A requirements line without its comment: pip starts one at a "#" that opens the line or follows a blank. */
function withoutComment(line) {
  for (let i = 0; i < line.length; i++)
    if (line[i] === "#" && (i === 0 || isBlank(line[i - 1]))) return line.slice(0, i);
  return line;
}

/** Is a requirements line a comment line (pip: blanks, then "#")? Such a line never goes on with the next. */
const isCommentLine = (line) => pyTrim(line, false).startsWith("#");

/** A line without the backslashes at its ends (Python's str.strip("\\"), as pip's join_lines does). */
function stripBackslashes(line) {
  let a = 0;
  let b = line.length;
  while (a < b && line[a] === "\\") a++;
  while (b > a && line[b - 1] === "\\") b--;
  return line.slice(a, b);
}

/**
 * The logical lines of a requirements file, as pip's `preprocess` reads them: split at every line break pip knows
 * (configLines); a line that ends with a backslash goes on with the next one, its backslashes stripped and the parts
 * joined with nothing (pip-compile and `uv pip compile --generate-hashes` write `name==1.0 \` then `--hash=…`
 * lines) — but a comment line never goes on, and ends a joined line; then comments are dropped and blank lines left
 * out. Read by the dependencies (here) and by the private declarations (declarations.mjs: an option on any of them).
 * @param {string} text
 * @returns {string[]}
 */
export function logicalLines(text) {
  const out = [];
  let joined = null;
  for (const line of configLines(text)) {
    if (!line.endsWith("\\") || isCommentLine(line)) {
      out.push(joined === null ? line : joined + (isCommentLine(line) ? ` ${line}` : line));
      joined = null;
    } else joined = (joined ?? "") + stripBackslashes(line);
  }
  if (joined !== null) out.push(joined);
  return out.map((line) => pyTrim(withoutComment(line))).filter(Boolean);
}

/** The requirements of a requirements file, one a logical line, each cut before its own options (`--hash`…). */
const requirementLines = (text) =>
  logicalLines(text).map((line) => {
    const options = [line.indexOf(" --"), line.indexOf("\t--")].filter((i) => i >= 0);
    return options.length ? line.slice(0, Math.min(...options)).trim() : line;
  });

/** A Poetry constraint as an item's `version` (an exact one, else null) and `spec` (otherwise). */
const poetryVersion = (raw) => {
  const v = String(raw ?? "*").trim() || "*";
  return PYTHON_PATTERNS.poetryExact.test(v) ? { version: v } : { version: null, spec: v };
};

/**
 * How many parts of a value's path name one of Poetry's dependency tables — `tool.poetry.dependencies` (main),
 * `tool.poetry.dev-dependencies`, `tool.poetry.group.<name>.dependencies` (or its former `dev-dependencies`) — or 0.
 */
const poetryTableLength = (keys) => {
  if (keys[0] !== "tool" || keys[1] !== "poetry") return 0;
  if (keys[2] === "dependencies" || keys[2] === "dev-dependencies") return 3;
  return keys[2] === "group" && (keys[4] === "dependencies" || keys[4] === "dev-dependencies") ? 5 : 0;
};

/**
 * The fields of a Poetry dependency that still take it from the configured index (PyPI unless `source` names
 * another): any other field (`path`, `git`, `url`, `develop`, `branch`…) takes it from elsewhere. An allowlist, so
 * that a field the kit does not know never lets a name out.
 */
const POETRY_PUBLIC = new Set([
  "version",
  "python",
  "markers",
  "extras",
  "optional",
  "allow-prereleases",
  "allows-prereleases",
  "platform",
  "source",
]);

/**
 * What an array of a pyproject.toml holds, by its decoded path: PEP 508 requirements of a table of dependencies, dev
 * or not — PEP 621 `project.dependencies` and `project.optional-dependencies.<extra>` (no), PEP 735
 * `dependency-groups.<group>`, PDM's `tool.pdm.dev-dependencies.<group>`, Rye's and uv's `dev-dependencies` (yes) —,
 * or uv's `override-dependencies` and `constraint-dependencies` (`override`: no dependency, a place to judge); null for
 * any other.
 * @param {string[]} keys
 */
function requirementPath(keys) {
  const [a, b, c] = keys;
  const n = keys.length;
  if (a === "project" && b === "dependencies" && n === 2) return { dev: false };
  if (a === "project" && b === "optional-dependencies" && n === 3) return { dev: false };
  if (a === "dependency-groups" && n === 2) return { dev: true };
  if (a !== "tool") return null;
  if (b === "pdm" && c === "dev-dependencies" && n === 4) return { dev: true };
  if ((b === "rye" || b === "uv") && c === "dev-dependencies" && n === 3) return { dev: true };
  if (b === "uv" && (c === "override-dependencies" || c === "constraint-dependencies") && n === 3)
    return { dev: false, override: true };
  return null;
}

/**
 * Every requirement array of a pyproject.toml's TOML entries, with what it holds (requirementPath), read by the
 * decoded path of each value whatever the TOML form — a header (`[project]`, `["project"]`), a dotted or a quoted key
 * (`project.dependencies = […]`), an inline table (`optional-dependencies = { dev = […] }`), 8 deep at most.
 * `prefix`: a uv.toml is read as uv's own table (`tool.uv`).
 * @param {Array<{ path: string[], value: string }>} entries
 * @param {string[]} [prefix]
 * @returns {Array<{ kind: { dev: boolean, override?: boolean }, value: string }>}
 */
function requirementArrays(entries, prefix = []) {
  const out = [];
  const visit = (keys, value, depth) => {
    if (value[0] === "{" && depth < 8) {
      for (const piece of splitTopLevel(value.slice(1))) {
        const eq = equalsAt(piece);
        if (eq > 0) visit([...keys, ...dottedParts(piece.slice(0, eq))], piece.slice(eq + 1).trim(), depth + 1);
      }
      return;
    }
    const kind = requirementPath(keys);
    if (kind && value[0] === "[") out.push({ kind, value });
  };
  for (const entry of entries) visit([...prefix, ...entry.path], entry.value, 0);
  return out;
}

/**
 * Whether a requirement of these arrays is written as a string the kit does not read (a multi-line one): uv and pip
 * read it, the kit cannot tell its name nor its place — a doubt to the second net (declarations.mjs).
 * @param {Array<{ path: string[], value: string }>} entries
 * @param {string[]} [prefix]
 */
export function unreadRequirement(entries, prefix = []) {
  return requirementArrays(entries, prefix).some(({ value }) =>
    tomlArray(value).some((element) => (element[0] === '"' || element[0] === "'") && tomlString(element) === null),
  );
}

/**
 * The names a pyproject.toml's `tool.uv.sources` lists, as written, from the paths of its values (tomlLeaves),
 * whatever the TOML form — a key of the table (`name = { git = … }`), a dotted or a quoted key (`name.git = …`,
 * `"corp.lib" = …`), a table of its own (`[tool.uv.sources.name]`), an inline table under `[tool.uv]` (`sources =
 * { name = … }`): the fourth part of the path; and every `override-dependencies` or `constraint-dependencies` taken
 * from a URL or a folder (`name @ …`). A uv source is always somewhere else than PyPI's default index (git, a
 * folder, a URL, the workspace, an index of its own): such a package is local here, and network.mjs keeps the name
 * private in the whole application with the same reader.
 * @param {Array<{ path: string[], value: string }>} leaves
 * @returns {string[]}
 */
export function uvSourceNames(leaves) {
  const names = [];
  for (const { path: keys, value } of leaves) {
    if (keys[0] !== "tool" || keys[1] !== "uv") continue;
    if (keys.length > 3 && keys[2] === "sources") names.push(keys[3]);
    // uv's override and constraint dependencies: one taken from a URL or a folder (`name @ …`) is a place too.
    if (keys.length === 3 && (keys[2] === "override-dependencies" || keys[2] === "constraint-dependencies"))
      for (const element of tomlArray(value)) {
        // `name @ <url or path>` — an archive's URL too, which pep508 reads as no requirement at all.
        const text = tomlString(element) ?? "";
        const at = text.indexOf("@");
        const name = at > 0 ? text.slice(0, at).split("[")[0].trim() : "";
        if (name) names.push(name);
      }
  }
  return names;
}

/**
 * Poetry's dependencies (its main table and its groups: non-main is dev), read by path whatever the form
 * (tableDependencies): local when a field is not one of POETRY_PUBLIC, or `source` names an index other than PyPI.
 */
function poetryItems(entries, manifest) {
  const out = [];
  for (const { table, name, fields } of tableDependencies(entries, poetryTableLength)) {
    if (name.toLowerCase() === "python") continue;
    const sources = fields.get("source") ?? [];
    const local =
      [...fields.keys()].some((f) => !POETRY_PUBLIC.has(f)) || sources.some((s) => String(s).toLowerCase() !== "pypi");
    out.push({
      name,
      ...poetryVersion(fields.get("version")?.[0]),
      ecosystem: "pip",
      direct: true,
      dev: table !== "tool.poetry.dependencies",
      manifest,
      ...(local ? { local } : {}),
    });
  }
  return out;
}

/**
 * The dependencies a pyproject.toml declares, from its TOML entries: the PEP 508 requirements of the tables of
 * `requirementArrays`, by path (an `{ include-group = … }` names no package; one `[tool.uv.sources]` takes elsewhere is local),
 * and Poetry's `[tool.poetry.dependencies]` and its groups (non-main: dev).
 */
function pyprojectItems(entries, manifest) {
  const out = [];
  const uvLocal = new Set(uvSourceNames(tomlLeaves(entries)).map(pypiName));
  for (const { kind, value } of requirementArrays(entries)) {
    if (kind.override) continue;
    for (const element of tomlArray(value)) {
      const r = pep508(tomlString(element) ?? "");
      if (!r) continue;
      const local = r.local || uvLocal.has(pypiName(r.name));
      out.push({ ...r, ecosystem: "pip", direct: true, dev: kind.dev, manifest, ...(local ? { local } : {}) });
    }
  }
  return [...out, ...poetryItems(entries, manifest)];
}

/** One pyproject.toml. */
function fromPyproject(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable);
  return text === null ? [] : pyprojectItems(tomlEntries(text), manifest);
}

/**
 * What the pyproject.toml beside a lock file declares, by PyPI name: the direct dependencies (and the dev only
 * ones) of a lock that has no root entry of its own (poetry.lock).
 */
function declaredPyproject(abs) {
  // None beside it (or not an ordinary file): no direct dependency known.
  const text = readBeside(path.join(path.dirname(abs), "pyproject.toml"));
  const items = text === null ? [] : pyprojectItems(tomlEntries(text), "");
  const prod = new Set(items.filter((i) => !i.dev).map((i) => pypiName(i.name)));
  const dev = new Set(items.filter((i) => i.dev && !prod.has(pypiName(i.name))).map((i) => pypiName(i.name)));
  return { direct: new Set([...prod, ...dev]), dev };
}

/**
 * The source of a poetry.lock block, from one of its entries: each field by its decoded path, whatever the TOML form
 * ([package.source], an inline table, a dotted key), its value as Poetry reads it. A field given twice, or the source
 * written both as an inline table and as a table of its own (TOML refuses both, so does Poetry), is a doubt.
 */
function poetrySource(b, entry, report) {
  for (const leaf of tomlLeaves([entry], report)) {
    if (leaf.path[0] !== "package" || leaf.path[1] !== "source") continue;
    (b.sourceForms ??= new Set()).add(entry.path.length === 2 ? "inline" : "table");
    if (b.sourceForms.size > 1) report.doubt = true;
    const field = leaf.path[2] ?? "";
    if (b.source?.has(field)) report.doubt = true;
    (b.source ??= new Map()).set(field, tomlString(leaf.value, report) ?? leaf.value);
  }
}

/**
 * The `[[package]]` blocks of a poetry.lock — `name`, `version`, `groups`, their own `[package.dependencies]`, their
 * source — every value read by its decoded path, whatever the TOML form (a header spelled `[["package"]]` or
 * `[package . source]`, an inline table, a dotted or an escaped key) — and whether the
 * lock could be read as TOML to its end, with no array of tables but `[[package]]` (`doubt`). A source other than
 * PyPI's own index (a folder, a file, git, a URL, another index, or one not read whole) makes its block local.
 * @param {string} text
 */
function poetryBlocks(text) {
  const blocks = new Map();
  const report = {};
  for (const entry of tomlEntries(text, report)) {
    // Read by the decoded path of each value, as Poetry reads it: `[["package"]]`, `[package . dependencies]` or an
    // escaped key are the same tables and keys.
    const { block, value, path: keys } = entry;
    if (!block || keys[0] !== "package") continue;
    if (!blocks.has(block)) blocks.set(block, { deps: [] });
    const b = blocks.get(block);
    const field = keys[1];
    if (keys.length === 2 && (field === "name" || field === "version")) {
      // A name or a version that is no one-line string (multi-line, followed by more): Poetry may read it otherwise.
      b[field] = tomlString(value, report);
      if (b[field] === null) report.doubt = true;
    } else if (keys.length === 2 && field === "groups") b.dev = !tomlArray(value).some((g) => tomlString(g) === "main");
    else if (field === "dependencies" && keys.length > 2) b.deps.push(pypiName(keys[2]));
    else if (field === "source") poetrySource(b, entry, report);
  }
  const pypi = (source) =>
    source.get("type") === "legacy" && PYTHON_PATTERNS.publicIndex.test(String(source.get("url") ?? ""));
  for (const b of blocks.values()) b.local = b.source !== undefined && !pypi(b.source);
  // Poetry writes no array of tables but `[[package]]`: after any other (`[[package.files]]`, `[[x.y]]`), a
  // `[package.source]` belongs to a block the kit cannot tell — the lock proves nothing.
  const otherArrays = [...(report.arrays ?? [])].some((name) => name !== "package");
  // A `[[package]]` with no name, which Poetry cannot read: the tables after it (a `[package.source]`) are its own,
  // taken away from the block before it — the lock proves nothing.
  const nameless = [...blocks.values()].some((b) => b.name === undefined);
  return { blocks, doubt: report.doubt === true || otherArrays || nameless };
}

/**
 * One poetry.lock (poetryBlocks): its packages, and their chains (`via`). The direct dependencies are those the
 * pyproject.toml beside it declares.
 */
function fromPoetryLock(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable, "strict");
  if (text === null) return [];
  const declared = declaredPyproject(abs);
  const { blocks, doubt } = poetryBlocks(text);
  const out = [];
  const byKey = new Map();
  const graph = new Map();
  for (const b of blocks.values()) {
    if (!b.name) continue;
    const key = pypiName(b.name);
    if (graph.has(key)) {
      // The same name again (another version, for other markers): taken from elsewhere there, local everywhere.
      const first = byKey.get(key);
      if (b.local && first) ((first.local = true), delete first.public);
      continue;
    }
    graph.set(key, b.deps);
    const item = {
      name: b.name,
      version: b.version ?? null,
      ecosystem: "pip",
      direct: declared.direct.has(key),
      dev: !!b.dev || declared.dev.has(key),
      manifest,
      // Poetry writes a [package.source] for any package taken elsewhere than PyPI: none (or PyPI's) is the proof —
      // unless the lock cannot be read as TOML to its end.
      ...(b.local ? { local: true } : doubt ? {} : { public: true }),
    };
    out.push(item);
    byKey.set(key, item);
  }
  return withVia(out, declared.direct, graph, pypiName);
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
