// yarn.lock (classic v1 and berry) of the `dependencies` source (engine/facts/dependencies.mjs): read as Yarn 1
// writes and reads it — its blocks, their headers and fields in Yarn's own forms —, a name proven only when every
// block naming it proves it (engine/facts/network.mjs sends no other). Its expressions are npm.mjs's NPM_PATTERNS.
import { readText } from "./read.mjs";
import { withVia } from "./graph.mjs";
import { NPM_PATTERNS, tarballPath, namesTarball, npmAlias, declaredBeside, devOnly, folderKey } from "./npm.mjs";
import { LOCAL_SPEC } from "../network.mjs";

/** A yarn specifier ("@scope/name@range", "name@npm:range", "name@file:./x"): its package name and its range. */
function yarnSpecifier(spec) {
  const s = spec.trim().replace(/^"|"$/g, "");
  const i = s.startsWith("@") ? s.indexOf("@", 1) : s.indexOf("@");
  return i > 0 ? { name: s.slice(0, i), range: s.slice(i + 1) } : null;
}

/** The names a yarn.lock block depends on: the lines of its `dependencies:` and `optionalDependencies:` sections. */
function yarnChildren(lines) {
  const children = [];
  let inDeps = false;
  for (const l of lines.slice(1)) {
    if (NPM_PATTERNS.yarnField.test(l)) inDeps = NPM_PATTERNS.yarnDependencies.test(l);
    else if (inDeps) {
      const d = NPM_PATTERNS.yarnDependency.exec(l);
      if (d) children.push(d[1]);
    }
  }
  return children;
}

/**
 * Whether Yarn 1's tokenizer reads a yarn.lock line as the kit does: every string closed on it (an even number of
 * `"`: one left open is read on past the line, and the lock refused), and no backslash (Yarn 1 writes none; its
 * tokenizer and JSON, which then reads the string, take an escape each their own way). One pass: linear.
 * @param {string} line
 */
function quotesClosed(line) {
  let quotes = 0;
  for (const c of line) {
    if (c === "\\") return false;
    if (c === '"') quotes++;
  }
  return quotes % 2 === 0;
}

/**
 * The blocks of a yarn.lock — each a line with no indentation and the indented lines below it — and whether the lock as
 * a whole is written as Yarn 1 writes one (`plain`): its lines ending with `\n` or `\r\n`, its comments and blank
 * lines between blocks only (never followed by an indented line), no berry `__metadata`, no git conflict marker. Any
 * other form (a lone `\r`, a blank or comment line inside a block…) may be read by Yarn otherwise than by the kit,
 * which then reads no proof in the lock; its lines are still split at a lone `\r` too, for what makes a package local.
 * @param {string} text
 */
function yarnBlocks(text) {
  /** @type {string[][]} */
  const blocks = [];
  let plain =
    !NPM_PATTERNS.yarnLoneCr.test(text) && !["<<<<<<<", "=======", ">>>>>>>"].some((marker) => text.includes(marker));
  let gap = false; // the line before was blank or a comment
  let berry = false;
  for (const l of text.split(NPM_PATTERNS.yarnLineBreak)) {
    // A string Yarn's tokenizer reads on to the next line (a quote left open): Yarn refuses the whole lock.
    if (!quotesClosed(l)) plain = false;
    const trimmed = l.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      gap = true;
      continue;
    }
    if (/^\s/.test(l)) {
      if (gap || !blocks.length) plain = false;
      // Berry's `resolution` field, which Yarn 1 never writes: a berry lock, its metadata cut off or not.
      if (NPM_PATTERNS.yarnResolution.test(l)) berry = true;
      blocks.at(-1)?.push(l);
    } else {
      // Berry's metadata (`__metadata:`, quoted or not): a berry lock, which proves nothing.
      if (l.startsWith("__metadata") || l.startsWith('"__metadata')) berry = true;
      blocks.push([l]);
    }
    gap = false;
  }
  return { blocks, plain: plain && !berry, berry };
}

/**
 * Whether a yarn.lock block is written as Yarn 1 writes it, so that Yarn reads it as the kit does: its header the
 * specifiers Yarn writes (yarnHeader), each field at two spaces one of its own in its own form (yarnPlainField), the
 * lines at four spaces under a section of dependencies only, `version` and `resolved` once. Any other form — a
 * quoted or escaped key, `resolved` twice (Yarn keeps the last), a tab, a comment after a value, berry's fields —
 * proves nothing.
 * @param {string[]} lines
 */
function yarnPlain(lines) {
  if (!NPM_PATTERNS.yarnHeader.test(lines[0])) return false;
  let inDeps = false;
  let resolved = 0;
  let version = 0;
  for (const l of lines.slice(1)) {
    if (NPM_PATTERNS.yarnField.test(l)) {
      if (!NPM_PATTERNS.yarnPlainField.test(l)) return false;
      inDeps = NPM_PATTERNS.yarnDependencies.test(l);
      if (l.startsWith("  resolved")) resolved++;
      if (l.startsWith("  version")) version++;
    } else if (!inDeps || !NPM_PATTERNS.yarnDeeper.test(l)) return false;
  }
  return resolved === 1 && version === 1;
}

/**
 * One block of a yarn.lock read: its version (none, or a berry workspace entry: `itemless`, its names judged all the
 * same), the names it depends on, and for each name of its header whether the block takes it from elsewhere (`own`)
 * or proves it.
 * @param {string[]} lines
 * @param {{ lockPlain: boolean, berry: boolean }} lock
 */
function yarnBlock(lines, { lockPlain, berry }) {
  const specifiers = lines[0].replace(/:$/, "").split(",").map(yarnSpecifier).filter(Boolean);
  const versionLine = lines.find((l) => /^\s+version:?\s/.test(l));
  const version = versionLine
    ?.replace(/^\s+version:?\s+/, "")
    .replace(/^"|"$/g, "")
    .trim();
  // Taken from a private registry, git, a file or a URL (v1 `resolved`, berry `resolution` other than npm/patch,
  // or a specifier whose range is a folder, git or a URL — a v1 `file:` block has no `resolved`): its name is
  // never sent (network.mjs).
  const resolved = lines.map((l) => NPM_PATTERNS.yarnResolved.exec(l)?.[1]).filter(Boolean);
  const resolution = lines.map((l) => NPM_PATTERNS.yarnResolution.exec(l)?.[1]).filter(Boolean);
  const local =
    resolved.some((r) => !NPM_PATTERNS.publicTarball.test(r)) ||
    resolution.some((r) => !NPM_PATTERNS.yarnRegistryProtocol.test(r.slice(1))) ||
    specifiers.some((sp) => LOCAL_SPEC.test(sp.range));
  // Yarn 1 writes the tarball it took (`resolved`): read once for the block, the proof of each name it names.
  const tarball = lockPlain && yarnPlain(lines) ? tarballPath(resolved[0]) : null;
  return {
    version,
    itemless: !versionLine || lines[0].includes("@workspace:"),
    children: yarnChildren(lines),
    names: specifiers.map(({ name, range }) => {
      // An alias is another package under this name: local — in Yarn 1's lock every `npm:` range
      // (`corp-x@npm:lodash@^4`, `corp-ui@npm:xcorp-ui`: the latest of another package), in berry's, where `npm:` is
      // the protocol of every registry package, one naming another package (`npm:lodash@^4`). Berry's `resolution`
      // names no registry: no proof.
      const own = local || (berry ? npmAlias(range) : range.startsWith("npm:"));
      return { name, own, proven: !own && tarball !== null && namesTarball(name, tarball) };
    }),
  };
}

/**
 * One yarn.lock (classic v1 or berry). It has no root entry: the direct dependencies (and the dev only ones) are
 * those the package.json beside it declares, with its workspace members'; each block's own `dependencies:` give
 * the chains (`via`). Every block is judged before any is left out: a name is local when one block takes it from
 * elsewhere, proven only when every block naming it proves it (one without `version`, or naming a workspace,
 * included) and the lock as a whole is written as Yarn 1 writes one.
 */
function fromYarnLock(abs, manifest, unreadable) {
  const text = readText(abs, manifest, unreadable, true);
  if (text === null) return [];
  const declared = declaredBeside(abs);
  const { blocks, plain: lockPlain, berry } = yarnBlocks(text);
  const out = [];
  const graph = new Map();
  /** @type {Map<string, { item: any, local: boolean, proven: boolean }>} each name: its item, and what its blocks say */
  const names = new Map();
  for (const lines of blocks) {
    const block = yarnBlock(lines, { lockPlain, berry });
    for (const { name, own, proven } of block.names) {
      let state = names.get(name);
      if (!state) names.set(name, (state = { item: null, local: false, proven: true }));
      state.local ||= own;
      state.proven &&= proven;
      if (state.item || block.itemless) continue;
      graph.set(name, block.children);
      state.item = {
        name,
        version: block.version,
        ecosystem: "npm",
        direct: declared.direct.has(name),
        dev: devOnly(declared, name),
        manifest,
      };
      out.push(state.item);
    }
  }
  // Two names a filesystem that folds case, Unicode forms and trailing dots and spaces (Windows, macOS) installs into
  // one folder (`corp-lib` and `corp-lib.`): which package that folder holds is not told — neither is proven.
  const folders = new Map();
  for (const name of names.keys()) folders.set(folderKey(name), (folders.get(folderKey(name)) ?? 0) + 1);
  for (const [name, { item, local, proven }] of names) {
    if (!item) continue;
    if (local) item.local = true;
    else if (proven && folders.get(folderKey(name)) === 1) item.public = true;
  }
  return withVia(out, declared.direct, graph);
}

/** The reader of yarn.lock, by file name (lower case). */
export const YARN_READERS = Object.freeze({ "yarn.lock": fromYarnLock });
