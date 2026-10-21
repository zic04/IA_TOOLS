// Ruby manifests and lock files of the `dependencies` source (engine/facts/dependencies.mjs), ecosystem `rubygems`:
// Gemfile and Gemfile.lock, each read on its own. A Gemfile is Ruby: only its plain declarations are read (`gem`
// lines, `group`, `path`, `git`, `github` and `source` blocks), never evaluated.
import { readText, textLines, splitTopLevel, quoted, scanOutsideQuotes } from "./read.mjs";

/** The manifests are untrusted: these expressions are anchored and bounded, so linear (RULES.md S5). */
export const RUBY_PATTERNS = Object.freeze({
  /** A gem declaration, its name captured: `gem "rails"`, `gem 'rails'`, `gem("rails"`. */
  gemLine: /^gem[\s(]{1,20}["']([\w.-]{1,200})["']/,
  /** An option of a gem or a block, its key captured: `group: :test`, `:path => "x"`, `"git" => "x"`. */
  gemOption: /^:?["']?([a-z_]{1,40})["']?\s{0,20}(?::|=>)/,
  /** An exact requirement: `7.1.2`, `= 7.1.2`. */
  gemExact: /^(?:=\s{0,20})?(\d[\w.]{0,100})$/,
  /** Gemfile.lock: a gem of a `specs:` list (exactly four spaces), `name (version)`. */
  gemLockSpec: /^ {4}([\w.-]{1,200}) \(([^()\s]{1,200})\)$/,
  /** Gemfile.lock: an entry of DEPENDENCIES (two spaces), `name (~> 7.1)` or `name!`. */
  gemLockDependency: /^ {2}([\w.-]{1,200})/,
});

/** The keys that take a gem from a folder or a git repository. */
const LOCAL_KEYS = new Set(["path", "git", "github", "gitlab", "bitbucket"]);
/** The blocks that open with `do` and close with `end`, or open a statement closed by `end`. */
const STATEMENTS = ["if", "unless", "case", "begin", "while", "until"];

/** The sections of Gemfile.lock that list gems (`specs:`). */
const SPEC_SECTIONS = ["GEM", "PATH", "GIT"];

/** rubygems.org itself (any other `source` or `remote` is a private gem server). */
function isRubygemsOrg(url) {
  const lower = url.toLowerCase();
  const bare = lower.endsWith("/") ? lower.slice(0, -1) : lower;
  return bare === "https://rubygems.org" || bare === "http://rubygems.org";
}

/** A Ruby line without its `#` comment (a `#` inside a string is kept), trimmed. */
const code = (line) =>
  line
    .slice(
      0,
      scanOutsideQuotes(line, 0, (c) => c === "#"),
    )
    .trim();

/** The group names of `:development, :test`, `[:development, "test"]`. */
const groupNames = (text) =>
  splitTopLevel(text.startsWith("[") ? text.slice(1) : text)
    .map((p) => (p.startsWith(":") ? p.slice(1) : quoted(p)))
    .filter(Boolean);

/** Whether every group is a development or test one. */
const devOnly = (groups) => groups.every((g) => g === "development" || g === "test");

/**
 * What the blocks around a gem give it, of a fixed size whatever their depth — whether one of them names a group,
 * whether all their groups are development or test ones, whether one takes the gem from a folder, git or another
 * source — so that a file of blocks never closed is read in linear time.
 * @typedef {{ grouped: boolean, dev: boolean, local: boolean }} BlockState
 */
/** @type {BlockState} */
const TOP = Object.freeze({ grouped: false, dev: true, local: false });

/** The state inside a block opened by `line`, within `parent`. */
function blockOf(line, parent) {
  const end = Math.min(...[" ", "("].map((c) => line.indexOf(c)).filter((i) => i > 0), line.length);
  const word = line.slice(0, end);
  const args = line.slice(end, line.lastIndexOf(" do")).trim();
  const inner = args.startsWith("(") ? args.slice(1).trim() : args;
  const source = quoted(inner);
  const groups = word === "group" ? groupNames(inner) : [];
  return {
    grouped: parent.grouped || groups.length > 0,
    dev: parent.dev && devOnly(groups),
    local: parent.local || LOCAL_KEYS.has(word) || (word === "source" && source !== null && !isRubygemsOrg(source)),
  };
}

/** The requirements, groups and source of a gem line, from what follows its name. */
function gemArguments(rest) {
  const out = { requirements: [], groups: [], local: false };
  for (const piece of splitTopLevel(rest)) {
    // An option first: `"git" => "…"` is an option, not a requirement "git".
    const m = RUBY_PATTERNS.gemOption.exec(piece);
    const requirement = m ? null : quoted(piece);
    if (requirement !== null) {
      out.requirements.push(requirement);
      continue;
    }
    const value = m ? piece.slice(m[0].length).trim() : "";
    if (m && (m[1] === "group" || m[1] === "groups")) out.groups.push(...groupNames(value));
    else if (m && LOCAL_KEYS.has(m[1])) out.local = true;
    else if (m?.[1] === "source" && !isRubygemsOrg(quoted(value) ?? "")) out.local = true;
  }
  return out;
}

/**
 * One gem line as an item, in the blocks around it (their cumulative state).
 * @param {BlockState} around
 */
function gemItem(name, rest, around, manifest) {
  const args = gemArguments(rest);
  const exact = args.requirements.length === 1 ? RUBY_PATTERNS.gemExact.exec(args.requirements[0]) : null;
  const version = exact ? exact[1] : null;
  const spec = args.requirements.join(", ");
  const local = args.local || around.local;
  return {
    name,
    version,
    ...(spec && spec !== version ? { spec } : {}),
    ecosystem: "rubygems",
    direct: true,
    dev: (around.grouped || args.groups.length > 0) && around.dev && devOnly(args.groups),
    manifest,
    ...(local ? { local } : {}),
  };
}

/**
 * One Gemfile: its `gem` lines, direct; dev when every group of the gem (its `group` blocks, its `group:` /
 * `groups:` option) is development or test; local when it comes from a folder or git (`path:`, `git:`, `github:`,
 * a `path`/`git` block) or from a `source` other than rubygems.org. The requirement is kept in `spec`; `version`
 * only for an exact one.
 */
function fromGemfile(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable);
  if (text === null) return [];
  const out = [];
  /** @type {BlockState[]} */
  const blocks = [];
  const around = () => blocks.at(-1) ?? TOP;
  for (const raw of textLines(text)) {
    const line = code(raw);
    if (line === "end") blocks.pop();
    else if (line.endsWith(" do") || line.includes(" do |")) blocks.push(blockOf(line, around()));
    else if (STATEMENTS.some((s) => line === s || line.startsWith(s + " ") || line.startsWith(s + "(")))
      blocks.push(around());
    else {
      const m = RUBY_PATTERNS.gemLine.exec(line);
      if (m) out.push(gemItem(m[1], line.slice(m[0].length), around(), manifest));
    }
  }
  return out;
}

/**
 * One Gemfile.lock: the gems of its `specs:` lists (GEM: from its remote; PATH and GIT, or a GEM section whose
 * remote is not rubygems.org: local), with their exact version; `direct` from its own DEPENDENCIES section. It does
 * not record the groups (dev: false).
 */
function fromGemfileLock(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable);
  if (text === null) return [];
  const items = new Map();
  const direct = new Set();
  let section = "";
  let local = false;
  for (const line of textLines(text)) {
    if (line && line[0] !== " ") {
      section = line.trim();
      local = section === "PATH" || section === "GIT";
    } else if (section === "DEPENDENCIES") {
      const m = RUBY_PATTERNS.gemLockDependency.exec(line);
      if (m) direct.add(m[1]);
    } else if (!SPEC_SECTIONS.includes(section)) continue;
    else if (line.startsWith("  remote: ")) local = local || !isRubygemsOrg(line.slice(10).trim());
    else {
      const m = RUBY_PATTERNS.gemLockSpec.exec(line);
      if (m && !items.has(m[1])) items.set(m[1], { name: m[1], version: m[2], local });
    }
  }
  return [...items.values()].map((i) => ({
    name: i.name,
    version: i.version,
    ecosystem: "rubygems",
    direct: direct.has(i.name),
    dev: false,
    manifest,
    ...(i.local ? { local: true } : {}),
  }));
}

/** The reader of each Bundler manifest or lock file, by file name (lower case). */
export const RUBY_READERS = Object.freeze({
  gemfile: fromGemfile,
  "gemfile.lock": fromGemfileLock,
});
