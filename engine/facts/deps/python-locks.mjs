// uv and Pipenv files of the `dependencies` source (engine/facts/dependencies.mjs): uv.lock, Pipfile, Pipfile.lock.
// No regular expression of their own: the TOML is read by the single-pass helpers of deps/read.mjs, Pipfile.lock is
// JSON. A package not taken from PyPI (a folder, git, a URL, an index of its own) is `local`: its name is never sent
// (engine/facts/network.mjs).
import path from "node:path";
import { readText, readJson, readBeside, tomlEntries, tomlArray, tableDependencies } from "./read.mjs";
import { PYTHON_PATTERNS, pypiName } from "./python.mjs";
import { withVia } from "./graph.mjs";
import { tomlString, inlineFields } from "./toml-values.mjs";

/** Is an index's URL PyPI's own? */
const isPyPI = (url) => PYTHON_PATTERNS.publicIndex.test(String(url ?? ""));

/** The names of an array of `{ name = … }` tables (uv.lock), as PyPI compares them. */
const uvNames = (value) =>
  tomlArray(value)
    .map((el) => tomlString(inlineFields(el)?.get("name") ?? ""))
    .filter(Boolean)
    .map(pypiName);

/**
 * Whether the files of a uv.lock package (its `sdist`, its `wheels`) are elsewhere than PyPI's file host: uv
 * downloads the files its lock names. A value other than an inline table with a `url` there counts as elsewhere; a
 * key given twice in one is a doubt (inlineFields).
 */
const filesElsewhere = (key, value, report) =>
  (key === "wheels" && value[0] === "[" ? tomlArray(value) : [value]).some(
    (table) => !PYTHON_PATTERNS.pypiFile.test(tomlString(inlineFields(table, report)?.get("url") ?? "", report) ?? ""),
  );

/**
 * The `[[package]]` blocks of a uv.lock that name a package — name, version, source, whether its files are
 * elsewhere than PyPI's, and their own names — read by the decoded path of each value, as uv reads them (`[["package"]]`,
 * `[package . sdist]` or an escaped key are the same tables and keys), and whether the lock could be read as TOML to
 * its end (`doubt`; a source written twice in a block, a key given twice in its inline table, files or a source
 * written as uv never writes them — a table or an array of tables of their own, a dotted key — are one too).
 */
function uvBlocks(text) {
  const blocks = new Map();
  const report = {};
  for (const { block, value, path: keys } of tomlEntries(text, report)) {
    if (!block || keys[0] !== "package") continue;
    if (!blocks.has(block)) blocks.set(block, { deps: [], extras: [], dev: [] });
    const b = blocks.get(block);
    const field = keys[1];
    // uv writes a source, its files, as one value each (an inline table, an array of them): a table of their own, or
    // a dotted key, is a form it never writes.
    if (["source", "sdist", "wheels"].includes(field) && keys.length !== 2) report.doubt = true;
    else if (field === "sdist" || field === "wheels") {
      if (filesElsewhere(field, value, report)) b.elsewhere = true;
    } else if (field === "optional-dependencies" && keys.length === 3) b.extras.push(...uvNames(value));
    else if (field === "dev-dependencies" && keys.length === 3) b.dev.push(...uvNames(value));
    else if (keys.length !== 2) continue;
    else if (field === "name" || field === "version") {
      // A name or a version that is no one-line string (multi-line, followed by more): uv may read it otherwise.
      b[field] = tomlString(value, report);
      if (b[field] === null) report.doubt = true;
    } else if (field === "source") {
      if (b.source) report.doubt = true;
      b.source = inlineFields(value, report) ?? new Map();
    } else if (field === "dependencies") b.deps.push(...uvNames(value));
  }
  // A `[[package]]` with no name, which uv refuses: what follows it is its own, taken away from the block before it.
  const nameless = [...blocks.values()].some((b) => b.name === undefined);
  return { blocks: [...blocks.values()].filter((b) => b.name), doubt: report.doubt === true || nameless };
}

/**
 * One uv.lock: `[[package]]` blocks — `name`, `version`, `source` (`{ registry = … }`, `{ git = … }`,
 * `{ editable = "." }`…) and their own `dependencies = [{ name = … }]`. The packages of the project itself (an
 * `editable` or `virtual` source: the root and its workspace members) give the direct dependencies (their
 * dependencies and optional dependencies) and the dev only ones (their `[package.dev-dependencies]`). The root
 * (`"."`) is no dependency; a member (another folder) is one, `local`: its name is never sent.
 */
function fromUvLock(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable, "strict");
  if (text === null) return [];
  const { blocks: all, doubt } = uvBlocks(text);
  const isProject = (b) => b.source?.has("editable") || b.source?.has("virtual");
  const isRoot = (b) => isProject(b) && tomlString(b.source.get("editable") ?? b.source.get("virtual") ?? "") === ".";
  const prod = new Set();
  const devNames = new Set();
  for (const b of all.filter(isProject)) {
    for (const n of [...b.deps, ...b.extras]) prod.add(n);
    for (const n of b.dev) devNames.add(n);
  }
  for (const n of prod) devNames.delete(n);
  const direct = new Set([...prod, ...devNames]);
  /** @type {Array<{ name: string, version: string|null, ecosystem: string, direct: boolean, dev: boolean, manifest: string, local?: boolean, public?: boolean }>} */
  const out = [];
  const graph = new Map();
  const byKey = new Map();
  for (const b of all.filter((x) => !isRoot(x))) {
    const key = pypiName(b.name);
    const registry = b.source?.get("registry");
    // Public only from PyPI's registry, its files on PyPI's file host: any other source (a folder, git, a URL, another
    // index), none, or a file elsewhere is local.
    const local = registry === undefined || !isPyPI(tomlString(registry)) || !!b.elsewhere;
    if (graph.has(key)) {
      // The same name again (uv's forked resolutions): taken from elsewhere there, it is local everywhere.
      const first = byKey.get(key);
      if (local && first) ((first.local = true), delete first.public);
      continue;
    }
    graph.set(key, b.deps);
    // PyPI's registry, written in the lock: the proof the public index served it.
    const item = {
      name: b.name,
      version: b.version ?? null,
      ecosystem: "pip",
      direct: direct.has(key),
      dev: devNames.has(key),
      manifest,
      ...(local ? { local: true } : doubt ? {} : { public: true }),
    };
    out.push(item);
    byKey.set(key, item);
  }
  return withVia(out, direct, graph, pypiName);
}

/** The `[[source]]` indexes of a Pipfile's TOML entries, by name: their URL. */
function pipfileSources(entries) {
  const byBlock = new Map();
  for (const { section, block, key, value } of entries)
    if (section === "source" && (key === "name" || key === "url"))
      byBlock.set(block, { ...byBlock.get(block), [key]: tomlString(value) });
  return new Map([...byBlock.values()].filter((s) => s.name).map((s) => [s.name, s.url]));
}

/** A Pipfile or Pipfile.lock version ("==1.2.3", "*", ">=1") as an item's `version` (exact) and `spec`. */
const pipenvVersion = (raw) => {
  const v = String(raw ?? "*").trim() || "*";
  return v.startsWith("==") && !v.slice(2).includes("*") && !v.includes(",")
    ? { version: v.slice(2).trim() }
    : { version: null, spec: v };
};

/**
 * The fields of a Pipfile package that still take it from an index: its version, its markers and extras, the PEP 508
 * markers Pipenv accepts as fields, `index`. An allowlist: any other field (`path`, `git`, `file`, `editable`, `ref`…)
 * takes it from elsewhere, and a field the kit does not know never lets a name out.
 */
const PIPENV_PUBLIC = new Set([
  "version",
  "markers",
  "extras",
  "index",
  "os_name",
  "sys_platform",
  "platform_machine",
  "platform_python_implementation",
  "platform_release",
  "platform_system",
  "platform_version",
  "python_version",
  "python_full_version",
  "implementation_name",
  "implementation_version",
]);

/** A Pipfile.lock entry's fields: a Pipfile's, and the `hashes` Pipenv writes in every one. */
const PIPENV_LOCK_PUBLIC = new Set([...PIPENV_PUBLIC, "hashes"]);

/**
 * Is a Pipenv package taken elsewhere than PyPI: a field off the allowlist, or an index not declared as PyPI's? A
 * Pipfile's fields hold every value a field was given (tableDependencies), a Pipfile.lock's their JSON value.
 */
const pipenvLocal = (fields, sources, allowed = PIPENV_PUBLIC) => {
  if ([...fields.keys()].some((f) => !allowed.has(f))) return true;
  const indexes = [fields.get("index") ?? []].flat();
  return indexes.some((index) => !(sources.has(index) && isPyPI(sources.get(index))));
};

/** How many parts of a value's path name a Pipfile's table of packages (`packages`, `dev-packages`), or 0. */
const pipfileTableLength = (keys) => (keys[0] === "packages" || keys[0] === "dev-packages" ? 1 : 0);

/** The packages a Pipfile's TOML entries declare: `[packages]` (dev: false) and `[dev-packages]` (dev: true). */
function pipfileItems(entries, manifest) {
  const sources = pipfileSources(entries);
  return tableDependencies(entries, pipfileTableLength).map(({ table, name, fields }) => ({
    name,
    ...pipenvVersion(fields.get("version")?.[0]),
    ecosystem: "pip",
    direct: true,
    dev: table === "dev-packages",
    manifest,
    ...(pipenvLocal(fields, sources) ? { local: true } : {}),
  }));
}

/** One Pipfile. */
function fromPipfile(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable);
  return text === null ? [] : pipfileItems(tomlEntries(text), manifest);
}

/**
 * One Pipfile.lock (JSON): its `default` and `develop` packages, a package in both counted once (not dev); the
 * direct ones are those the Pipfile beside it declares.
 */
function fromPipfileLock(abs, manifest, unreadable) {
  const lock = readJson(abs, manifest, unreadable);
  if (lock === null || typeof lock !== "object") return [];
  // No Pipfile beside it (or not an ordinary file): no direct dependency known.
  const beside = readBeside(path.join(path.dirname(abs), "Pipfile"));
  const declared = beside === null ? [] : pipfileItems(tomlEntries(beside), "");
  const direct = new Set(declared.map((i) => pypiName(i.name)));
  const sources = new Map(
    (Array.isArray(lock._meta?.sources) ? lock._meta.sources : []).map((s) => [String(s?.name), s?.url]),
  );
  const out = [];
  const seen = new Set();
  for (const group of ["default", "develop"]) {
    const dev = group === "develop";
    for (const [name, info] of Object.entries(lock[group] && typeof lock[group] === "object" ? lock[group] : {})) {
      if (seen.has(pypiName(name))) continue;
      seen.add(pypiName(name));
      const fields = new Map(Object.entries(info && typeof info === "object" ? info : {}));
      out.push({
        name,
        ...pipenvVersion(fields.get("version")),
        ecosystem: "pip",
        direct: direct.has(pypiName(name)),
        dev,
        manifest,
        // No proof (network.mjs): Pipenv's mirror (PIPENV_PYPI_MIRROR) is not written in the lock, which still names
        // PyPI for a package a company mirror served — that mirror may host private packages too.
        ...(pipenvLocal(fields, sources, PIPENV_LOCK_PUBLIC) ? { local: true } : {}),
      });
    }
  }
  return out;
}

/** The reader of each uv and Pipenv file, by file name (lower case). */
export const PYTHON_LOCK_READERS = Object.freeze({
  "uv.lock": fromUvLock,
  pipfile: fromPipfile,
  "pipfile.lock": fromPipfileLock,
});
