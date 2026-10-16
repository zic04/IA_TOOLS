// Rust manifests and lock files of the `dependencies` source (engine/facts/dependencies.mjs), ecosystem `cargo`
// (crates.io names): Cargo.toml and Cargo.lock, each read on its own (a `{ workspace = true }` dependency takes its
// version from the workspace's Cargo.toml, another file: its version stays null). No TOML parser: a line at a time.
import { readText, textLines, keyValue, quoted, inlineTable, tomlHeader, unquote } from "./read.mjs";

/** The manifests are untrusted: these expressions are anchored and bounded, so linear (RULES.md S5). */
export const RUST_PATTERNS = Object.freeze({
  /** A crate name, as a key of a dependency table. */
  cargoName: /^[\w-]{1,200}$/,
  /** An exact requirement, `=1.2.3` (Cargo reads a bare "1.2.3" as "^1.2.3": a range). */
  cargoExact: /^=\s{0,20}(\d[\w.+-]{0,100})$/,
});

/** The sources of Cargo.lock that are crates.io itself (git, a path or another registry: local). */
const PUBLIC_SOURCES = new Set([
  "registry+https://github.com/rust-lang/crates.io-index",
  "sparse+https://index.crates.io/",
]);
/** The dependency tables of Cargo.toml, and whether they are development ones. */
const TABLES = /** @type {Array<[string, boolean]>} */ ([
  ["dependencies", false],
  ["dev-dependencies", true],
  ["build-dependencies", false],
]);
/** The fields of a dependency that take it from a folder, git or a registry other than crates.io. */
const LOCAL_FIELDS = new Set(["path", "git", "registry", "registry-index"]);

/** The header name without a `target.<cfg>.` prefix (`target.'cfg(unix)'.dependencies` → dependencies), or null. */
function withoutTarget(header) {
  if (!header.startsWith("target.")) return header.startsWith("workspace.") ? header.slice(10) : header;
  const rest = header.slice(7);
  // A quoted target ends at its quote followed by a dot (a basic string may hold escaped quotes: "cfg(a = \"b\")").
  const end = rest[0] === '"' || rest[0] === "'" ? rest.indexOf(rest[0] + ".", 1) + 1 : rest.indexOf(".");
  return end > 0 && rest[end] === "." ? rest.slice(end + 1) : null;
}

/**
 * What a table header of Cargo.toml opens: a table of dependencies (`crate: null`), the table of one dependency
 * (`[dependencies.serde]`), a `[patch.<registry>]` table, or nothing (null).
 * @returns {{ patch?: boolean, dev?: boolean, crate?: string|null }|null}
 */
function cargoSection(header) {
  if (header.startsWith("patch.")) return { patch: true };
  const rest = withoutTarget(header);
  for (const [table, dev] of TABLES) {
    if (rest === table) return { dev, crate: null };
    if (rest?.startsWith(table + ".")) return { dev, crate: unquote(rest.slice(table.length + 1).trim()) };
  }
  return null;
}

/** One field of a dependency (`version`, `path`, `git`, `workspace`, `package`…) applied to its entry. */
function apply(entry, field, raw) {
  if (field === "version") entry.spec = quoted(raw) ?? entry.spec;
  else if (field === "package") entry.name = quoted(raw) ?? entry.name;
  else if (LOCAL_FIELDS.has(field)) entry.local = true;
}

/** One `key = value` line of a dependency table: `serde = "1"`, `serde = { … }`, `serde.workspace = true`. */
function applyLine(entry, sub, value) {
  if (sub) return apply(entry, sub, value);
  if (quoted(value) !== null) return apply(entry, "version", value);
  for (const [field, raw] of inlineTable(value) || []) apply(entry, field, raw);
}

/**
 * One Cargo.toml: [dependencies], [dev-dependencies] (dev), [build-dependencies], [workspace.dependencies], their
 * `[target.<cfg>.…]` forms and their dotted tables (`[dependencies.serde]`), direct. A requirement is kept in
 * `spec` (`version` only for an exact `=1.2.3`); a dependency from a folder, git or another registry, or patched
 * to a folder or git by the same file's `[patch.…]`, is local.
 */
function fromCargoToml(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable);
  if (text === null) return [];
  const state = { entries: new Map(), patched: new Set(), section: null, header: "" };
  for (const raw of textLines(text)) cargoLine(state, raw.trim());
  return [...state.entries.values()].map((e) => {
    const exact = e.spec === null ? null : RUST_PATTERNS.cargoExact.exec(e.spec);
    const local = e.local || state.patched.has(e.name);
    return {
      name: e.name,
      version: exact ? exact[1] : null,
      ...(e.spec !== null ? { spec: e.spec } : {}),
      ecosystem: "cargo",
      direct: true,
      dev: e.dev,
      manifest,
      ...(local ? { local } : {}),
    };
  });
}

/** The entry of a crate in the current table of Cargo.toml, made on its first line. */
function entryOf(state, crate) {
  const key = `${state.header}\u0000${crate}`;
  if (!state.entries.has(key))
    state.entries.set(key, { name: crate, dev: state.section.dev, spec: null, local: false });
  return state.entries.get(key);
}

/** One line of Cargo.toml: a table header, or a `key = value` of the current table. */
function cargoLine(state, line) {
  const header = tomlHeader(line);
  if (header !== null) {
    state.header = header;
    state.section = cargoSection(header);
    const crate = state.section?.crate;
    if (crate && RUST_PATTERNS.cargoName.test(crate)) entryOf(state, crate);
  } else if (state.section && !line.startsWith("#")) {
    const kv = keyValue(line);
    if (kv) cargoField(state, kv);
  }
}

/** One `key = value` line of the current table of Cargo.toml. */
function cargoField(state, kv) {
  const { section } = state;
  if (section.crate) {
    const entry = state.entries.get(`${state.header}\u0000${section.crate}`);
    if (entry) apply(entry, kv.key, kv.value);
    return;
  }
  const dot = kv.key.indexOf(".");
  const crate = dot < 0 ? kv.key : kv.key.slice(0, dot);
  if (!RUST_PATTERNS.cargoName.test(crate)) return;
  const fields = section.patch ? inlineTable(kv.value) : null;
  if (fields?.has("path") || fields?.has("git")) state.patched.add(crate);
  else if (!section.patch) applyLine(entryOf(state, crate), dot < 0 ? null : kv.key.slice(dot + 1), kv.value);
}

/**
 * One Cargo.lock: its `[[package]]` blocks (name, version, source), every one `direct: false`, dev: false (the
 * lock file records neither). A package with no source is a member of the workspace, one from git or from another
 * registry is not from crates.io: local.
 */
function fromCargoLock(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable);
  if (text === null) return [];
  const out = [];
  /** @type {{ name?: string, version?: string, source?: string }|null} */
  let current = null;
  const flush = () => {
    if (!current?.name) return;
    const local = !current.source || !PUBLIC_SOURCES.has(current.source);
    out.push({
      name: current.name,
      version: current.version ?? null,
      ecosystem: "cargo",
      direct: false,
      dev: false,
      manifest,
      ...(local ? { local } : {}),
    });
  };
  for (const raw of textLines(text)) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      flush();
      current = line === "[[package]]" ? {} : null;
      continue;
    }
    const kv = current ? keyValue(line) : null;
    const value = kv ? quoted(kv.value) : null;
    if (value === null) continue;
    if (kv.key === "name") current.name = value;
    else if (kv.key === "version") current.version = value;
    else if (kv.key === "source") current.source = value;
  }
  flush();
  return out;
}

/** The reader of each Cargo manifest or lock file, by file name (lower case). */
export const RUST_READERS = Object.freeze({
  "cargo.toml": fromCargoToml,
  "cargo.lock": fromCargoLock,
});
