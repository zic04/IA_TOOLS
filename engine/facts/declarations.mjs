// The private declarations of an application and of the person running the kit (ARCHITECTURE.md §6.9): where a
// registry or a package index other than the public ones is declared, so that network.mjs never sends a private
// package's name (AUDIT.md S13). Read: in the application, every folder down to each manifest (.npmrc, .yarnrc,
// .yarnrc.yml, bunfig.toml, pyproject.toml, Pipfile, uv.toml, pip.conf / pip.ini, requirements files and the files they
// include); the person's own configuration (every home given, APPDATA, XDG_CONFIG_HOME, NPM_CONFIG_USERCONFIG,
// PIP_CONFIG_FILE, UV_CONFIG_FILE, Poetry's config.toml); and the npm, yarn, bun, pip, uv and Poetry variables. Each
// reader fails closed: what it does not follow is a declaration (on a doubt, no name is sent).
// Every TOML file is read with the kit's one TOML reader (deps/read.mjs), each value by its full dotted path: the
// form a table is written in changes nothing. A declared item gets `private: true` and `exists: null`. This is the
// second net: a name is only ever sent when a lock file proves its public registry served it (network.mjs).
import fs from "node:fs";
import path from "node:path";
import { tomlEntries, tomlLeaves, tomlArray, readBeside, decodeText, configLines } from "./deps/read.mjs";
import { logicalLines, pypiName, unreadRequirement, uvSourceNames } from "./deps/python.mjs";
import { tomlString } from "./deps/toml-values.mjs";

/** The application's files are untrusted: these expressions are linear (RULES.md S5, test/tools/redos-worker.mjs). */
export const DECLARATION_PATTERNS = Object.freeze({
  // npmRegistryServer's whole line: one word, quoted alike or not, then nothing but a comment.
  yarnServer: /^npmRegistryServer:[ \t]*(["']?)([^"'\s#]+)\1[ \t]*(?:#.*)?$/,
  yamlKey: /^([ \t]*)["']?@?([\w.-]+)["']?:[ \t]*$/,
  envScope: /^npm_config_(@[\w.-]+):registry$/i,
  publicNpm: /^https?:\/\/registry\.(?:npmjs\.(?:org|com)|yarnpkg\.com)\/?$/i,
  publicPip: /^https?:\/\/(?:pypi\.org|files\.pythonhosted\.org)(?:\/|$)/i,
  yarnScopesBlock: /^npmScopes:[ \t]*$/,
  yarnScopesMention: /\bnpmScopes\b/,
  bunScopesMention: /\binstall\.scopes\b/,
});

/** A file's text (UTF-8 without its byte order mark, or UTF-16), or "" when it is missing or not an ordinary file. */
export const readIf = (file) => {
  try {
    return fs.existsSync(file) && fs.statSync(file).isFile() ? decodeText(fs.readFileSync(file)) : "";
  } catch {
    return "";
  }
};
const isPublicNpm = (url) => DECLARATION_PATTERNS.publicNpm.test(String(url));
const isPublicPip = (url) => DECLARATION_PATTERNS.publicPip.test(String(url));
/** What is declared private, before any declaration is read. */
export const emptyRegistries = () => ({
  npmScopes: new Set(),
  npmAll: false,
  pipAll: false,
  names: new Set(),
  proven: new Set(),
});

/**
 * A key or a value of an .npmrc as npm's ini reader (5) reads it: '…' without its quotes then as JSON if it is some, "…" as JSON (`"regis\u0074ry"` is
 * registry), else up to a ";" or a "#" that no backslash escapes, trimmed.
 * @param {string} s
 */
function iniText(s) {
  const v = s.trim();
  if (v.length > 1 && (v[0] === '"' || v[0] === "'") && v.at(-1) === v[0]) {
    // ini 5 drops the single quotes, then reads what is left as JSON too ('"regis\u0074ry"' is registry).
    const inner = v[0] === "'" ? v.slice(1, -1) : v;
    try {
      return String(JSON.parse(inner));
    } catch {
      return inner;
    }
  }
  let out = "";
  for (let i = 0; i < v.length; i++) {
    if (v[i] === "\\" && i + 1 < v.length && "\\;#".includes(v[i + 1])) out += v[++i];
    else if (v[i] === ";" || v[i] === "#") break;
    else out += v[i];
  }
  return out.trim();
}

/** A word of a .yarnrc (Yarn 1's lockfile syntax): "…" decoded as JSON, else as written. */
function yarnText(s) {
  if (s[0] !== '"') return s;
  try {
    return String(JSON.parse(s));
  } catch {
    return s;
  }
}

/** The first word of a .yarnrc line, a "…" one read to its closing quote: its text and where it ends. */
function yarnWord(line, from) {
  let i = from;
  while (i < line.length && (line[i] === " " || line[i] === "\t")) i++;
  const start = i;
  if (line[i] === '"') {
    for (i++; i < line.length && line[i] !== '"'; i++) if (line[i] === "\\") i++;
    i++;
  } else while (i < line.length && line[i] !== " " && line[i] !== "\t" && line[i] !== "#") i++;
  return { word: yarnText(line.slice(start, Math.min(i, line.length))), end: i };
}

/**
 * One setting of an .npmrc or a .yarnrc, added to `out`: `registry` other than npm's own makes every npm package
 * private, `@scope:registry` adds the scope, and any other key holding "registry" (a form not followed:
 * `replace-registry-host`, `--registry`…), a key that loads another file (`userconfig`, `globalconfig`: any key holding
 * "config"), and a key npm would expand (`${…}`) make every npm package private too: on a doubt, no name is sent. A key
 * that starts with "//" only holds a host's credentials (`//npm.corp/:_authToken`): it names no registry to use.
 */
function readRcSetting(key, value, out) {
  const k = key.toLowerCase();
  if (k.startsWith("//")) return;
  if (k.includes("config") || k.includes("$")) {
    out.npmAll = true;
    return;
  }
  if (!k.includes("registry")) return;
  if (k === "registry") {
    if (value && !isPublicNpm(value)) out.npmAll = true;
  } else if (k.startsWith("@") && k.endsWith(":registry") && k.length > "@:registry".length)
    out.npmScopes.add(k.slice(0, -":registry".length));
  else out.npmAll = true;
}

/**
 * One .npmrc, read as npm's ini reader does: the key up to the first "=", key and value decoded (iniText), `;` and `#`
 * comments, sections.
 */
function readNpmrc(text, out) {
  for (const raw of configLines(text)) {
    const line = raw.trim();
    if (!line || line[0] === ";" || line[0] === "#" || line[0] === "[") continue;
    const eq = line.indexOf("=");
    readRcSetting(iniText(eq < 0 ? line : line.slice(0, eq)), eq < 0 ? "" : iniText(line.slice(eq + 1)), out);
  }
}

/** One .yarnrc of Yarn 1: `key value` a line, each word quoted ("…", JSON) or not, a "#" outside them a comment. */
function readYarnrc(text, out) {
  for (const raw of configLines(text)) {
    const line = raw.trim();
    if (!line || line[0] === "#") continue;
    const key = yarnWord(line, 0);
    readRcSetting(key.word, yarnWord(line, key.end).word, out);
  }
}

/**
 * One .yarnrc.yml of Yarn 2+, failing closed: a top-level line that names `npmRegistryServer` or `npmScopes` must be
 * `npmRegistryServer: <a public registry>` or a bare `npmScopes:`; in that block each key at the scopes' indentation
 * must be a bare `name:` (its settings below it). Any other form — quoted, a blank before the ":", the value on the
 * next line, flow style, a comment after a key, an indented root, a registry named inside another key, a key with an
 * escape — makes every npm package private: on a doubt, no name is sent.
 */
function readYarnrcYml(text, out) {
  let inScopes = false;
  let indent = null;
  let found = 0;
  for (const line of configLines(text)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const at = line.length - line.trimStart().length;
    const colon = trimmed.indexOf(":");
    // A key written with an escape ("npmRegistry\x53erver") is never read: a doubt.
    if (colon >= 0 && trimmed.slice(0, colon).includes("\\")) {
      out.npmAll = true;
      continue;
    }
    const names = ["npmregistry", "npmscopes"].some((n) => trimmed.toLowerCase().includes(n));
    if (at === 0) {
      inScopes = DECLARATION_PATTERNS.yarnScopesBlock.test(line);
      indent = null;
      if (inScopes || !names) continue;
      const server = DECLARATION_PATTERNS.yarnServer.exec(line)?.[2];
      if (server === undefined || !isPublicNpm(server)) out.npmAll = true;
      continue;
    }
    if (!inScopes) {
      // An indented root, or a registry named inside another key: a form the kit does not follow.
      if (names) out.npmAll = true;
      continue;
    }
    indent ??= at;
    if (at > indent) continue; // a scope's own settings
    const key = at === indent ? DECLARATION_PATTERNS.yamlKey.exec(line) : null;
    if (key) (out.npmScopes.add("@" + key[2].toLowerCase()), found++);
    else out.npmAll = true;
  }
  if (!found && DECLARATION_PATTERNS.yarnScopesMention.test(text)) out.npmAll = true;
}

/**
 * A TOML value as text: a one-line string as the tools read it (its escapes decoded, tomlString), a bare value as
 * written; null for a quoted value the kit does not read (a multi-line string, one followed by more) — a doubt to
 * its caller, never an empty name or URL.
 */
export const tomlText = (value) => tomlString(value) ?? (value[0] === '"' || value[0] === "'" ? null : value);

/** Does a value's path start with `prefix`? */
export const under = (keys, prefix) => prefix.every((part, i) => keys[i] === part);

/**
 * Every value of a TOML file (bunfig.toml, pyproject.toml, Pipfile, uv.toml, Poetry's config.toml) with its full
 * dotted path, read by the kit's one TOML reader (deps/read.mjs): a table written as a header, as a dotted or a quoted
 * key, as an inline table or an array of them gives the same path; a comment after a header changes nothing.
 * `doubt`: the text is not TOML as the kit reads it (deps/read.mjs tomlEntries): its declarations cannot be told.
 */
export const tomlValues = (text) => {
  const report = {};
  const leaves = tomlLeaves(tomlEntries(text, report), report);
  return Object.assign(leaves, { doubt: report.doubt === true });
};

/**
 * One bunfig.toml: `install.registry` (a URL, or a table and its `url`) and every scope `install.scopes` names,
 * whatever its form, added to `out`. A `install.scopes` value that is no table, or a file that mentions
 * `install.scopes` and names no scope this reader follows, makes every npm package private: on a doubt, no name is
 * sent.
 */
function readBunfig(text, out) {
  let found = 0;
  const values = tomlValues(text);
  if (values.doubt) out.npmAll = true;
  for (const { path: keys, value } of values) {
    if (under(keys, ["install", "registry"]) && (keys.length === 2 || keys[2] === "url")) {
      const url = tomlText(value);
      if (url === null || (url && !isPublicNpm(url))) out.npmAll = true;
    }
    if (!under(keys, ["install", "scopes"])) continue;
    if (keys.length > 2) (out.npmScopes.add("@" + keys[2].replace(/^@/, "").toLowerCase()), found++);
    else out.npmAll = true;
  }
  if (!found && DECLARATION_PATTERNS.bunScopesMention.test(text)) out.npmAll = true;
}

/** Where Poetry, PDM, Rye and a Pipfile declare their package indexes (each with a `url`). */
const PIP_SOURCES = [["tool", "poetry", "source"], ["tool", "pdm", "source"], ["tool", "rye", "sources"], ["source"]];
/** uv's own keys that name where packages come from, in its table or below it (`[tool.uv.pip]`, uv.toml `[pip]`). */
const UV_INDEX_KEYS = ["index-url", "extra-index-url", "find-links"];
/** Poetry's table of the plugins a project requires, and its PyPI mirror plugin (POETRY_PYPI_MIRROR_URL). */
const POETRY_PLUGINS = ["tool", "poetry", "requires-plugins"];
const POETRY_MIRROR = "poetry-plugin-pypi-mirror";

/**
 * One pyproject.toml, Pipfile or uv.toml: a package index other than PyPI (Poetry's `tool.poetry.source`, PDM's
 * `tool.pdm.source`, Rye's `tool.rye.sources`, a Pipfile's `source`, each with its `url`; any uv index —
 * `tool.uv.index`, uv.toml's `index`; uv's `index-url`, `extra-index-url`, `find-links` other than PyPI), or Poetry's
 * PyPI mirror plugin required by the project (`tool.poetry.requires-plugins`: the mirror it reads is written in no
 * poetry.lock), whatever the TOML form it is written in, makes every pip package private.
 */
export function readPythonIndexes(text, out, { uvToml = false } = {}) {
  const uv = uvToml ? [] : ["tool", "uv"];
  const values = tomlValues(text);
  // A doubt, or a requirement written as a string the kit does not read (uv.toml's read as uv's own table).
  if (values.doubt || (text && unreadRequirement(tomlEntries(text), uvToml ? ["tool", "uv"] : []))) out.pipAll = true;
  for (const { path: keys, value } of values) {
    if (under(keys, [...uv, "index"])) out.pipAll = true;
    else if (!uvToml && under(keys, POETRY_PLUGINS) && pypiName(keys[POETRY_PLUGINS.length] ?? "") === POETRY_MIRROR)
      out.pipAll = true;
    // uv.toml's override or constraint dependencies from a URL or a folder: the name is not known to be public.
    else if (uvToml && uvSourceNames([{ path: ["tool", "uv", ...keys], value }]).length) out.pipAll = true;
    else if (keys.length > uv.length && under(keys, uv) && UV_INDEX_KEYS.includes(keys[keys.length - 1])) {
      // A string or a list: a URL other than PyPI, or a folder (find-links), may hold any package.
      const urls = value[0] === "[" ? tomlArray(value).map(tomlText) : [tomlText(value)];
      if (urls.some((url) => !isPublicPip(url))) out.pipAll = true;
    } else if (PIP_SOURCES.some((s) => under(keys, s)) && keys.at(-1) === "url" && !isPublicPip(tomlText(value)))
      out.pipAll = true;
  }
}

/** The private declarations of one folder of the application, added to `out`. */
export function readFolder(dir, out, root) {
  readNpmrc(readIf(path.join(dir, ".npmrc")), out);
  readYarnrc(readIf(path.join(dir, ".yarnrc")), out);
  readYarnrcYml(readIf(path.join(dir, ".yarnrc.yml")), out);
  readBunfig(readIf(path.join(dir, "bunfig.toml")), out);
  readPythonIndexes(readIf(path.join(dir, "pyproject.toml")), out);
  readPythonIndexes(readIf(path.join(dir, "Pipfile")), out);
  readPythonIndexes(readIf(path.join(dir, "uv.toml")), out, { uvToml: true });
  readPoetryConfig(readIf(path.join(dir, "poetry.toml")), out);
  if (["pip.conf", "pip.ini"].some((f) => fs.existsSync(path.join(dir, f)))) out.pipAll = true;
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const f of names)
    if (/^requirements.*\.(?:txt|in)$/i.test(f) && requirementsIndex(readIf(path.join(dir, f)), dir, root, new Set()))
      out.pipAll = true;
}

/** The most files a requirements file's includes are followed through. */
const MAX_INCLUDES = 16;

/**
 * The options of a requirements file that never say where packages come from, by their exact name: any other option
 * — `--index-url`, `--extra-index-url`, `--find-links`, `--no-index`, `-i`, `-f`, and every abbreviation pip accepts
 * (`--index`, `--find`…) — is taken as an index.
 */
const PIP_SAFE_OPTIONS = new Set([
  "-e",
  "--editable",
  "--pre",
  "--prefer-binary",
  "--require-hashes",
  "--only-binary",
  "--no-binary",
  "--use-feature",
  "--trusted-host",
  "--hash",
  "--config-settings",
  "--global-option",
]);

/** One option word of a requirements line ("-r", "-ihttps://…", "--constraint=c.txt"): its name and attached value. */
function pipOption(word) {
  if (!word.startsWith("--")) return { name: word.slice(0, 2), value: word.slice(2) };
  const eq = word.indexOf("=");
  return eq < 0 ? { name: word, value: "" } : { name: word.slice(0, eq), value: word.slice(eq + 1) };
}

/** Does an option include another file: -r, -c, or "--requirement" / "--constraint" written whole or abbreviated? */
const includes = (name) =>
  name === "-r" ||
  name === "-c" ||
  (name.length >= 10 && "--requirement".startsWith(name)) ||
  (name.length >= 6 && "--constraint".startsWith(name));

/**
 * Does a requirements text, or a file it includes (`-r`, `-c`, followed from its folder), declare an index or a
 * folder of packages? Every option word of every logical line (logicalLines: continued lines joined, as pip does) is
 * judged — any off PIP_SAFE_OPTIONS counts. An include the kit cannot read — outside the application, a link, missing,
 * past 16 files — counts as one too: on a doubt, no name is sent.
 */
export function requirementsIndex(text, dir, root, seen) {
  for (const line of logicalLines(text)) {
    // pip expands ${VAR} first, and reads a line's options with shlex: a variable, a quote or an escape there may
    // name an index the kit cannot read — a doubt.
    if (line.includes("${")) return true;
    // pip's options start at the first word (split at " ") that starts with "-".
    const split = line.split(" ");
    const at = split.findIndex((w) => w.startsWith("-"));
    const options = at < 0 ? "" : split.slice(at).join(" ");
    if (['"', "'", "\\"].some((c) => options.includes(c))) return true;
    const words = line.replaceAll("\t", " ").split(" ").filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      if (!words[i].startsWith("-")) continue;
      const { name, value } = pipOption(words[i]);
      if (!includes(name)) {
        if (!PIP_SAFE_OPTIONS.has(name)) return true;
        continue;
      }
      const target = value || words[++i] || "";
      const file = path.resolve(dir, target);
      if (seen.has(file)) continue;
      seen.add(file);
      const included = target && seen.size <= MAX_INCLUDES ? readBeside(file, { within: root }) : null;
      if (included === null || requirementsIndex(included, path.dirname(file), root, seen)) return true;
    }
  }
  return false;
}

/**
 * One pip.conf / pip.ini of the person: a key as pip reads it — any case, "_" for "-", ":" or "=" — that names an
 * index or a place of packages (any key holding "index" or "find": index-url, extra_index_url, Find-Links, no-index…)
 * makes every pip package private.
 */
function readPipConf(text, out) {
  for (const raw of configLines(text)) {
    const line = raw.trim();
    if (!line || "#;[".includes(line[0])) continue;
    const ends = [line.indexOf("="), line.indexOf(":")].filter((i) => i > 0);
    if (!ends.length) continue;
    const key = line
      .slice(0, Math.min(...ends))
      .trim()
      .toLowerCase();
    if (key.includes("index") || key.includes("find")) out.pipAll = true;
  }
}

/**
 * The person's own configuration files that can declare private registries (never the application's): those of
 * every home given (HOME and USERPROFILE can differ on Windows), of APPDATA and XDG_CONFIG_HOME, and the files named
 * by NPM_CONFIG_USERCONFIG and PIP_CONFIG_FILE.
 */
function userConfigFiles(env) {
  const get = (name) => Object.entries(env).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] || null;
  const files = [];
  for (const home of new Set([env.HOME, env.USERPROFILE].filter(Boolean))) {
    files.push({ kind: "npmrc", file: path.join(home, ".npmrc") });
    files.push({ kind: "yarnrc", file: path.join(home, ".yarnrc") });
    files.push({ kind: "yarnrcYml", file: path.join(home, ".yarnrc.yml") });
    files.push({ kind: "bunfig", file: path.join(home, ".bunfig.toml") });
    for (const f of [
      ".config/pip/pip.conf",
      ".pip/pip.conf",
      "pip/pip.ini",
      "Library/Application Support/pip/pip.conf",
    ])
      files.push({ kind: "pip", file: path.join(home, f) });
    files.push({ kind: "uv", file: path.join(home, ".config", "uv", "uv.toml") });
  }
  if (env.APPDATA) {
    files.push({ kind: "pip", file: path.join(env.APPDATA, "pip", "pip.ini") });
    files.push({ kind: "uv", file: path.join(env.APPDATA, "uv", "uv.toml") });
  }
  if (env.XDG_CONFIG_HOME) {
    files.push({ kind: "bunfig", file: path.join(env.XDG_CONFIG_HOME, ".bunfig.toml") });
    files.push({ kind: "pip", file: path.join(env.XDG_CONFIG_HOME, "pip", "pip.conf") });
    files.push({ kind: "uv", file: path.join(env.XDG_CONFIG_HOME, "uv", "uv.toml") });
  }
  const npmUser = get("NPM_CONFIG_USERCONFIG");
  if (npmUser) files.push({ kind: "npmrc", file: npmUser });
  const pipFile = get("PIP_CONFIG_FILE");
  if (pipFile) files.push({ kind: "pip", file: pipFile });
  const uvFile = get("UV_CONFIG_FILE");
  if (uvFile) files.push({ kind: "uv", file: uvFile });
  // Poetry's own configuration (`poetry config repositories.<name> <url>`).
  const poetryDirs = [get("POETRY_CONFIG_DIR"), env.APPDATA && path.join(env.APPDATA, "pypoetry")];
  if (env.XDG_CONFIG_HOME) poetryDirs.push(path.join(env.XDG_CONFIG_HOME, "pypoetry"));
  for (const home of new Set([env.HOME, env.USERPROFILE].filter(Boolean)))
    poetryDirs.push(
      path.join(home, ".config", "pypoetry"),
      path.join(home, "Library", "Application Support", "pypoetry"),
    );
  for (const dir of poetryDirs.filter(Boolean)) files.push({ kind: "poetry", file: path.join(dir, "config.toml") });
  return files;
}

/**
 * Poetry's configuration (the user's `config.toml`, a project's `poetry.toml`): a repository other than PyPI, or the
 * PyPI mirror plugin's table (`plugins.pypi_mirror`: the mirror it reads is written in no poetry.lock) — every pip
 * package may come from it.
 */
function readPoetryConfig(text, out) {
  const values = tomlValues(text);
  if (values.doubt) out.pipAll = true;
  for (const { path: keys, value } of values)
    if (keys[0] === "repositories" && keys.at(-1) === "url" && !isPublicPip(tomlText(value))) out.pipAll = true;
    else if (keys[0] === "plugins" && keys[1] === "pypi_mirror") out.pipAll = true;
}

export const READ_USER_FILE = {
  npmrc: readNpmrc,
  yarnrc: readYarnrc,
  yarnrcYml: readYarnrcYml,
  bunfig: readBunfig,
  pip: readPipConf,
  uv: (text, out) => readPythonIndexes(text, out, { uvToml: true }),
  poetry: readPoetryConfig,
};

/** The environment variables of npm, yarn, bun, pip and uv that name a registry or an index, added to `out`. */
function readEnv(env, out) {
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    const scope = DECLARATION_PATTERNS.envScope.exec(key);
    if (scope) out.npmScopes.add(scope[1].toLowerCase());
    else if (/^(?:npm_config_registry|YARN_NPM_REGISTRY_SERVER|YARN_REGISTRY|BUN_CONFIG_REGISTRY)$/i.test(key)) {
      if (!isPublicNpm(value)) out.npmAll = true;
    } else if (
      /^(?:PIP_(?:EXTRA_)?INDEX_URL|UV_(?:EXTRA_)?INDEX_URL|UV_DEFAULT_INDEX|UV_INDEX|(?:PIP|UV)_FIND_LINKS|PIPENV_PYPI_MIRROR|POETRY_PYPI_MIRROR_URL)$/i.test(
        key,
      )
    ) {
      // A list separated by spaces: each URL counts (a folder of find-links is no PyPI URL).
      if (value.split(/\s+/).some((url) => url && !isPublicPip(url))) out.pipAll = true;
    } else if (/^POETRY_REPOSITORIES_\w+_URL$/i.test(key) && !isPublicPip(value)) out.pipAll = true;
  }
}

/** The person's own declarations (their configuration files, their variables), added to `out`. */
export function readUserDeclarations(env, out) {
  for (const { kind, file } of userConfigFiles(env)) READ_USER_FILE[kind](readIf(file), out);
  readEnv(env, out);
}
