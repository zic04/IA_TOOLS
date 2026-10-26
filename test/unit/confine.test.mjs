// fileInside (engine/core/confine.mjs, SECURITY.md): the file a proof cites or a page depends on, judged where it
// really is. A missing path is judged by its nearest existing ancestor, found by bisection; these tests prove it gives
// the answers of the walk it replaced (every ancestor asked in turn, kept here as the reference) on random file systems
// under both systems' path rules — roots that resolve or not, device paths of Windows, drives and shares that are not
// there —, in O(log depth) calls; 32 broken links followed at most; the path joined as written, in one pass, is the one
// path.resolve gives (kept here as the reference) on random paths, and climbing out gets its answers; a path longer
// than MAX_PATH, resolved or as written, is missing without a call; a broken link whose target has a `..` after a name
// is outside; real links and junctions, and the folder given through one.
// The growth of its time is measured in confine-growth.test.mjs.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileInside } from "../../engine/core/confine.mjs";
import { tempDir } from "../tools/helpers.mjs";
import { caseSeed, hex, rng } from "../tools/fuzz/prng.mjs";

const RULES = { posix: path.posix, win32: path.win32 };
const MAX_PATH = 32767;
const ERRORS = Object.fromEntries(
  ["ENOENT", "ENOTDIR", "ELOOP", "EINVAL", "EISDIR"].map((code) => [code, Object.assign(new Error(code), { code })]),
);

/** Windows' device paths that name a drive or a share: `\\?\C:\x`, `\\.\C:\x`, `\\?\UNC\host\share\x`. */
const DEVICE = /^[\\/]{2}[?.][\\/](?:([a-z]:)|unc[\\/]([^\\/]+)[\\/]([^\\/]+))(?=[\\/]|$)/i;

/**
 * A file system resolved as a system resolves it, under the path rules P: folders, files and links (their target as
 * written), a path read one part at a time from its root, a link followed where it is met, a `..` going up from where
 * the path really is (POSIX's "physical" resolution), 40 links at most. `fold`: names compared regardless of case
 * (Windows', macOS'), the case on disk given back. `rootless`: a root does not resolve, asked as itself, while what is
 * below it does. Under Windows' rules, a device path is read as the drive or the share it names, its real path given
 * without its prefix, as realpathSync.native gives it (`\\?\C:\x` is `C:\x`), while its own root, or a folder above
 * it (`\\?\C:\`, `\\?\UNC\host`), does not resolve (EISDIR, ENOENT), as on Windows. Every path asked is logged in
 * `calls`, with what was asked.
 * @param {path.PlatformPath} P
 * @param {{ fold?: boolean, rootless?: boolean }} [options]
 */
function modelFs(P, { fold = false, rootless = false } = {}) {
  const windows = P.sep === "\\";
  const key = (name) => (fold ? name.toLowerCase() : name);
  const rootKey = (root) => (windows ? root.replaceAll("/", "\\").toLowerCase() : root);
  const parts = (text) => text.split(windows ? /[\\/]/ : "/").filter(Boolean);
  const folder = () => ({ kind: "dir", entries: new Map() });
  /** @type {Map<string, { name: string, node: any }>} */
  const roots = new Map();
  /** @type {Array<[string, string]>} */
  const calls = [];
  /** A device path as the path it names (`\\?\C:\x` → `C:\x`); its own root, or above it, is no path. */
  const device = (p) => {
    if (!windows || !/^[\\/]{2}[?.][\\/]/.test(p)) return p;
    const m = DEVICE.exec(p);
    if (!m) throw ERRORS.ENOENT; // `\\?\UNC\host`, `\\?\` alone: above a drive or a share
    const rest = parts(p.slice(m[0].length));
    if (!rest.length && m[1]) throw ERRORS.EISDIR; // `\\?\C:\` (Windows' realpath fails there; `\\?\UNC\h\s` does not)
    return (m[1] ? m[1] + "\\" : `\\\\${m[2]}\\${m[3]}\\`) + rest.join("\\");
  };
  const rootOf = (p) => {
    const found = roots.get(rootKey(P.parse(p).root));
    if (!found) throw ERRORS.ENOENT;
    return found;
  };
  /** Adds `node` at the absolute path `p`, the folders above it made when missing. */
  function add(p, node = folder()) {
    const root = P.parse(p).root;
    if (!roots.has(rootKey(root))) roots.set(rootKey(root), { name: root, node: folder() });
    let here = roots.get(rootKey(root)).node;
    const names = parts(p.slice(root.length));
    names.forEach((name, i) => {
      const last = i === names.length - 1;
      if (!here.entries.has(key(name))) here.entries.set(key(name), { name, node: last ? node : folder() });
      else if (last) here.entries.get(key(name)).node = node;
      here = here.entries.get(key(name)).node;
    });
    return p;
  }
  function walk(asked, followLast) {
    const p = device(asked);
    let { name: rootName, node } = rootOf(p);
    let stack = [node];
    let names = [];
    const todo = parts(p.slice(P.parse(p).root.length)).reverse(); // the parts still to read, the next one last
    let hops = 0;
    while (todo.length) {
      const name = todo.pop();
      const here = stack[stack.length - 1];
      if (name === ".") continue;
      if (here.kind !== "dir") throw ERRORS.ENOTDIR;
      if (name === "..") {
        if (names.length) {
          stack.pop();
          names.pop();
        }
        continue;
      }
      const entry = here.entries.get(key(name));
      if (!entry) throw ERRORS.ENOENT;
      if (entry.node.kind === "link" && (todo.length || followLast)) {
        if (++hops > 40) throw ERRORS.ELOOP;
        const target = P.isAbsolute(entry.node.target) ? device(entry.node.target) : entry.node.target;
        if (P.isAbsolute(target)) {
          ({ name: rootName, node } = rootOf(target));
          [stack, names] = [[node], []];
          todo.push(...parts(target.slice(P.parse(target).root.length)).reverse());
        } else todo.push(...parts(target).reverse());
        continue;
      }
      stack.push(entry.node);
      names.push(entry.name);
    }
    return { node: stack[stack.length - 1], real: rootName + names.join(P.sep) };
  }
  const asked = (what, p) => calls.push([what, p]);
  return {
    path: P,
    calls,
    add,
    file: (p) => add(p, { kind: "file" }),
    link: (p, target) => add(p, { kind: "link", target }),
    realpathSync: {
      native: (p) => {
        asked("realpath", p);
        if (rootless && P.parse(p).root === p) throw ERRORS.EISDIR;
        return walk(p, true).real;
      },
    },
    lstatSync: (p) => {
      asked("lstat", p);
      const { node } = walk(p, false);
      return { isSymbolicLink: () => node.kind === "link" };
    },
    readlinkSync: (p) => {
      asked("readlink", p);
      const { node } = walk(p, false);
      if (node.kind !== "link") throw ERRORS.EINVAL;
      return node.target;
    },
    statSync: (p) => {
      asked("stat", p);
      const { node } = walk(p, true);
      return { isFile: () => node.kind === "file" };
    },
  };
}

/** Whether a link's target, as written, has a `..` after a name: the rule, from its definition (not the engine's). */
function afterName(target, P) {
  const names = target.split(P.sep === "\\" ? /[\\/]/ : "/").filter((s) => s && s !== ".");
  const first = names.findIndex((s) => s !== "..");
  return first >= 0 && names.indexOf("..", first) > first;
}

/**
 * The walk fileInside used before the bisection (480437d), kept as the reference, under the path rules of `io.path`:
 * every ancestor of a missing path asked in turn, from the path itself up. One rule is new in both: a broken link
 * whose target has a `..` after a name is outside (written here from its definition, apart from the engine's).
 */
const reference = (() => {
  const realPathOf = (p, io) => {
    try {
      return io.realpathSync.native(io.path.resolve(p));
    } catch {
      return null;
    }
  };
  const within = (p, dir, sep) => p === dir || p.startsWith(dir.endsWith(sep) ? dir : dir + sep);
  const UNPLACED = Symbol("unplaced");
  function brokenLinkTarget(p, io) {
    try {
      if (!io.lstatSync(p).isSymbolicLink()) return null;
      const folder = realPathOf(io.path.dirname(p), io);
      if (!folder) return null;
      const target = io.readlinkSync(p);
      return afterName(target, io.path) ? UNPLACED : io.path.resolve(folder, target);
    } catch {
      return null;
    }
  }
  function missingOutside(abs, base, io, links = 32) {
    const P = io.path;
    for (let p = abs; ; p = P.dirname(p)) {
      const real = realPathOf(p, io);
      if (real) return !within(real, base, P.sep);
      const target = brokenLinkTarget(p, io);
      if (target === UNPLACED) return true;
      if (target) return links === 0 || missingOutside(P.join(target, P.relative(p, abs)), base, io, links - 1);
      if (P.dirname(p) === p) return true; // nothing there, not even the root
    }
  }
  return function fileInsideReference(dir, rel, io) {
    const P = io.path;
    const abs = P.resolve(P.join(dir, rel));
    if (!within(abs, P.resolve(dir), P.sep)) return "outside";
    const base = realPathOf(dir, io);
    if (!base) return null;
    const real = realPathOf(abs, io);
    if (!real) return missingOutside(abs, base, io) ? "outside" : null;
    if (!within(real, base, P.sep)) return "outside";
    try {
      return io.statSync(real).isFile() ? real : null;
    } catch {
      return null;
    }
  };
})();

/** Every path `paths` names and every folder above each, under the rules P (path.dirname up to the root). */
function withAncestors(paths, P) {
  const all = new Set();
  for (let p of paths)
    while (!all.has(p)) {
      all.add(p);
      p = P.dirname(p);
    }
  return all;
}

const NAMES = ["a", "b", "lib", "x.txt", "y.txt"];

/** A device path as the path of the drive or the share it names (`\\?\C:\x` → `C:\x`), any other path as it is. */
const named = (p) => {
  const m = DEVICE.exec(p);
  return m ? path.win32.resolve((m[1] ? m[1] + "\\" : `\\\\${m[2]}\\${m[3]}\\`) + p.slice(m[0].length)) : p;
};

/** A path of a drive or a share written as Windows' device path: `\\?\C:\x`, `\\.\C:\x`, `\\?\UNC\host\share\x`. */
const asDevice = (p, r) => {
  const prefix = r.pick(["\\\\?\\", "\\\\.\\", "//?/"]);
  return p.startsWith("\\\\") ? prefix + r.pick(["UNC", "unc"]) + p.slice(1) : prefix + p;
};

/**
 * One random case: a file system under the rules `rules` (case folded or not, its roots resolving or not), with
 * folders, files, links that lead somewhere and links that lead nowhere — a drive or a share that is not there, a
 * device path under Windows' rules among them —, a sibling `APP` beside `app`; and the relative paths asked of it,
 * made of its names in either case, missing names, `.` and `..`, links, sometimes a long missing tail.
 * @param {number} seed
 * @param {"posix"|"win32"} rules
 */
function randomCase(seed, rules) {
  const r = rng(seed);
  const P = RULES[rules];
  const fold = r.chance(0.5);
  const rootless = r.chance(0.3);
  const io = modelFs(P, { fold, rootless });
  const roots = rules === "win32" ? ["C:\\", "\\\\host\\share\\"] : ["/"];
  const absent = rules === "win32" ? ["Z:\\", "\\\\gone\\share\\"] : [];
  for (const root of roots) io.add(root + "srv");
  const srv = r.pick(roots) + "srv";
  const app = io.add(P.join(srv, "app"));
  const folders = [app, io.add(P.join(srv, "out"))];
  if (!fold) folders.push(io.add(P.join(srv, "APP")));
  const nodes = [...folders];
  const links = [];
  const name = () => {
    const n = r.pick(NAMES);
    return r.chance(0.2) ? n.toUpperCase() : n;
  };
  const sep = () => (rules === "win32" && r.chance(0.5) ? "\\" : "/");
  const target = () => {
    const from = r.int(7);
    const written = (p) => (rules === "win32" && r.chance(0.5) ? asDevice(p, r) : p);
    if (from === 0) return written(r.pick(nodes) + (r.chance(0.5) ? P.sep + "missing.txt" : ""));
    if (from === 1)
      return "../".repeat(r.int(3)).replaceAll("/", sep()) + name() + (r.chance(0.3) ? sep() + name() : "");
    if (from === 2) return [name(), "..", name()].join(sep()); // a `..` after a name
    if (from === 3) return r.pick([".", "..", "./" + name()]);
    if (from === 4) return written(P.join(r.pick([...roots, ...absent]), "nowhere", "missing.txt"));
    if (from === 5 && links.length) return r.chance(0.5) ? r.pick(links) : P.basename(r.pick(links));
    return name() + (r.chance(0.5) ? sep() + "missing.txt" : "");
  };
  const used = new Set(nodes.map((p) => (fold ? p.toLowerCase() : p)));
  for (let i = 0, count = 4 + r.int(14); i < count; i++) {
    const p = P.join(r.pick(folders), name());
    if (used.has(fold ? p.toLowerCase() : p)) continue;
    used.add(fold ? p.toLowerCase() : p);
    const kind = r.int(10);
    if (kind < 4) {
      folders.push(io.add(p));
      nodes.push(p);
    } else if (kind < 6) nodes.push(io.file(p));
    else {
      links.push(io.link(p, target()));
      nodes.push(p);
    }
  }
  const linkNames = links.map((l) => P.relative(app, l)).filter((l) => !l.startsWith(".."));
  const part = () => {
    const k = r.int(10);
    if (k < 4) return name();
    if (k < 5) return "missing";
    if (k < 6) return r.pick(["..", "."]);
    if (k < 8 && linkNames.length) return r.pick(linkNames);
    return r.pick(NAMES);
  };
  const under = nodes.map((p) => P.relative(app, p)).filter((p) => p && !p.startsWith(".."));
  const rels = Array.from({ length: 3 }, () => {
    const list = Array.from({ length: r.int(4) }, part);
    // Often from what is there: a file, a folder or a link of the application, as written or in another case.
    if (under.length && r.chance(0.6)) {
      const there = r.pick(under).split(P.sep);
      list.unshift(...(r.chance(0.2) ? there.map((s) => s.toUpperCase()) : there));
    } else list.push(part());
    if (r.chance(0.15)) list.push(...Array.from({ length: 10 + r.int(40) }, (_, i) => `d${i}`));
    if (r.chance(0.1)) list.unshift("..", r.pick(["app", "APP", "out"]));
    return list.join(sep());
  });
  return { io, app, rels, fold, rootless };
}

describe("fileInside: the bisection gives the answers of the walk it replaced", () => {
  const RUN = 0x0c0f1a7e;
  const TREES = 800;
  for (const rules of ["posix", "win32"])
    test(`on ${TREES} random file systems under ${rules} rules (${TREES * 3} paths), never asking elsewhere`, (t) => {
      const seen = { outside: 0, missing: 0, file: 0, linkFollowed: 0, unplaced: 0, deep: 0, folded: 0, rootless: 0 };
      if (rules === "win32") seen.device = 0;
      for (let i = 0; i < TREES; i++) {
        const seed = caseSeed(RUN, i);
        const { io, app, rels, fold, rootless } = randomCase(seed, rules);
        for (const rel of rels) {
          io.calls.length = 0;
          const expected = reference(app, rel, io);
          const before = io.calls.splice(0);
          const got = fileInside(app, rel, io);
          const asked = io.calls.splice(0);
          const where = `seed ${hex(seed)}, ${rules}${fold ? " folded" : ""}${rootless ? " rootless" : ""}, ${JSON.stringify(rel)}`;
          assert.equal(got, expected, where);
          // Never a path the walk did not have on its way: each one asked is the walk's, or a folder above one — a
          // device path the walk asked counting as the path it names, as fileInside asks it (`\\?\C:\x`, `C:\x`).
          const known = withAncestors(
            before.flatMap(([, p]) => [p, named(p)]),
            io.path,
          );
          for (const [what, p] of asked) assert.ok(known.has(p), `${where}: ${what} ${p}`);
          seen[expected === "outside" ? "outside" : expected === null ? "missing" : "file"]++;
          const read = before.filter(([what]) => what === "readlink").map(([, p]) => p);
          if (read.length) seen.linkFollowed++;
          if (read.some((p) => afterName(io.readlinkSync(p), io.path))) seen.unplaced++;
          if (rules === "win32" && read.some((p) => DEVICE.test(io.readlinkSync(p)))) seen.device++;
          if (rel.split(/[\\/]/).length > 10) seen.deep++;
          if (fold) seen.folded++;
          if (rootless && read.length) seen.rootless++;
        }
      }
      // The cases are worth their number: every kind of answer, links read, deep paths and both kinds of names.
      t.diagnostic(JSON.stringify(seen));
      for (const [kind, count] of Object.entries(seen)) assert.ok(count > 40, `${kind}: ${count}`);
    });

  test("a deep missing path costs O(log depth) real paths asked, one for a file missing in a folder that exists", () => {
    for (const P of Object.values(RULES)) {
      const io = modelFs(P);
      const app = io.add(P.join(P.sep === "\\" ? "C:\\" : "/", "srv", "app"));
      io.add(P.join(app, "lib", "sub", "deeper"));
      const realpaths = (rel) => {
        io.calls.length = 0;
        assert.equal(fileInside(app, rel, io), null, rel.slice(0, 40));
        return io.calls.filter(([what]) => what === "realpath").length;
      };
      // The folder read, the path itself, its folder — the deep end asked first: as many as the walk asked.
      assert.equal(realpaths("lib/missing.txt"), 3);
      assert.equal(realpaths("lib/sub/deeper/missing.txt"), 3);
      for (const depth of [1, 10, 100, 1000, 4000]) {
        const count = realpaths("lib/" + "d/".repeat(depth) + "z.txt");
        assert.ok(count <= 2 * Math.ceil(Math.log2(depth + 3)) + 3, `${depth} parts: ${count} real paths asked`);
      }
      // The folder read is known to resolve: nothing above it is asked, as the walk stopped there (where a root may
      // not resolve, `\\?\C:` on Windows, whatever lies below it).
      for (let depth = 0; depth < 40; depth++) {
        realpaths("gone/" + "d/".repeat(depth) + "x.txt");
        assert.deepEqual(
          io.calls.filter(([, p]) => p.length < app.length),
          [],
          `gone/ and ${depth} parts`,
        );
      }
    }
  });

  test("the folder read is a root (a drive, a share, /): its own ancestor, the walk stops there", () => {
    for (const [P, root] of [
      [path.posix, "/"],
      [path.win32, "C:\\"],
      [path.win32, "\\\\host\\share\\"],
    ]) {
      const io = modelFs(P);
      io.add(P.join(root, "lib"));
      const file = io.file(P.join(root, "lib", "a.txt"));
      io.link(P.join(root, "gone"), P.join(root, "nowhere", "missing.txt"));
      for (const [rel, expected] of [
        ["lib/a.txt", file],
        ["missing.txt", null],
        ["lib/missing/deeper.txt", null],
        ["gone/x.txt", null],
      ])
        assert.equal(fileInside(root, rel, io), expected, `${root} ${rel}`);
    }
  });

  /** `l/d0/…/x.txt`, `depth` folders between the link and the file. */
  const under = (link, depth) => `${link}/${Array.from({ length: depth }, (_, i) => `d${i}/`).join("")}x.txt`;

  test("32 broken links followed at most: a chain of 32 is judged where it ends; one more, or a loop, is outside", () => {
    for (const P of Object.values(RULES)) {
      const io = modelFs(P);
      const app = io.add(P.join(P.sep === "\\" ? "C:\\" : "/", "srv", "app"));
      io.add(P.join(app, "lib"));
      const chain = (name, count) => {
        for (let i = 0; i < count; i++)
          io.link(P.join(app, `${name}${i}`), i < count - 1 ? `${name}${i + 1}` : "lib/gone");
        return `${name}0`;
      };
      assert.equal(fileInside(app, under(chain("a", 32), 2), io), null, "32 links, then a folder inside");
      assert.equal(fileInside(app, under(chain("b", 33), 2), io), "outside", "33 links");
      io.link(P.join(app, "c0"), "c1");
      io.link(P.join(app, "c1"), "c0");
      assert.equal(fileInside(app, under("c0", 2), io), "outside", "a loop");
      for (const rel of [under("a0", 2), under("b0", 2), under("c0", 2)])
        assert.equal(fileInside(app, rel, io), reference(app, rel, io), `the walk: ${rel}`);
    }
  });

  test("a root that does not resolve while what is below it does: never taken for nothing there, at any depth", () => {
    // Windows' realpath fails on `\\?\C:\` and resolves `\\?\C:\Users`: a folder resolves only if its parent does, but
    // for a root. A broken link leads under such a root here; the bisection must give the walk's answer at every depth.
    for (const [P, root] of [
      [path.posix, "/"],
      [path.win32, "C:\\"],
      [path.win32, "\\\\host\\share\\"],
    ]) {
      const io = modelFs(P, { rootless: true });
      const app = io.add(P.join(root, "srv", "app"));
      io.add(P.join(root, "srv", "out"));
      io.link(P.join(app, "l"), P.join(app, "gone")); // a broken link that stays inside
      io.link(P.join(app, "o"), P.join(root, "srv", "out", "gone")); // one that leads out
      for (let depth = 0; depth <= 12; depth++)
        for (const [link, expected] of [
          ["l", null],
          ["o", "outside"],
        ]) {
          const rel = under(link, depth);
          assert.equal(reference(app, rel, io), expected, `the walk: ${root} ${rel}`);
          assert.equal(fileInside(app, rel, io), expected, `${root} ${rel}`);
        }
    }
  });

  test("a broken link written as a device path (\\\\?\\C:\\…, \\\\?\\UNC\\host\\share\\…): judged where it leads", () => {
    // Windows reads `\\?\C:\srv\app\gone` as `C:\srv\app\gone`, but its realpath fails on `\\?\C:\` and on
    // `\\?\UNC\host`, above a folder that resolves (`\\?\UNC\host\share` does): a link's target is judged as the path
    // it names, the same answer at every depth.
    const P = path.win32;
    for (const root of ["C:\\", "\\\\host\\share\\"]) {
      const io = modelFs(P);
      const app = io.add(P.join(root, "srv", "app"));
      io.add(P.join(root, "srv", "out"));
      const forms = root.startsWith("\\\\")
        ? (p) => ["\\\\?\\UNC" + p.slice(1), "\\\\.\\unc" + p.slice(1), "//?/UNC/" + p.slice(2).replaceAll("\\", "/")]
        : (p) => ["\\\\?\\" + p, "\\\\.\\" + p, "//?/" + p.replaceAll("\\", "/")];
      const links = [];
      forms(P.join(app, "gone")).forEach((target, i) => links.push([io.link(P.join(app, `l${i}`), target), null]));
      forms(P.join(root, "srv", "out", "gone")).forEach((target, i) =>
        links.push([io.link(P.join(app, `o${i}`), target), "outside"]),
      );
      for (let depth = 0; depth <= 12; depth++)
        for (const [link, expected] of links) {
          const rel = under(P.basename(link), depth);
          assert.equal(reference(app, rel, io), expected, `the walk: ${root} ${rel}`);
          assert.equal(fileInside(app, rel, io), expected, `${root} ${rel}`);
        }
    }
    // The prefix of a share without its server or its share names none that resolves: outside, never read as a folder
    // of the link's own drive (`\\srv` is `C:\srv` to path.win32, the application here).
    const io = modelFs(P);
    const app = io.add("C:\\srv");
    for (const target of ["\\\\?\\UNC\\srv", "\\\\?\\UNC\\srv\\", "\\\\?\\UNC\\", "\\\\?\\UNC\\\\srv\\app"]) {
      io.link(P.join(app, "u"), target);
      for (const rel of [under("u", 0), under("u", 3)]) {
        assert.equal(reference(app, rel, io), "outside", `the walk: ${target}, ${rel}`);
        assert.equal(fileInside(app, rel, io), "outside", `${target}, ${rel}`);
      }
    }
    // Under POSIX' rules the same text is a path like any other, under `/?`: outside, never a name of the link's folder.
    const posix = modelFs(path.posix);
    posix.add("/srv/app");
    posix.link("/srv/app/u", "//?/UNC/srv/app/gone");
    for (const rel of [under("u", 0), under("u", 3)]) {
      assert.equal(reference("/srv/app", rel, posix), "outside", `the walk: posix, ${rel}`);
      assert.equal(fileInside("/srv/app", rel, posix), "outside", `posix, ${rel}`);
    }
  });

  test("nothing there, not even the root (a drive or a share that is not there): outside; there, the same answer", () => {
    // The one answer the walk gives when no ancestor resolves. The same link once its drive or its share is there,
    // then its file too: outside still — whether a file outside exists is never told.
    const P = path.win32;
    for (const [target, root] of [
      ["Z:\\srv\\x.txt", "Z:\\"],
      ["\\\\gone\\share\\srv\\x.txt", "\\\\gone\\share\\"],
    ]) {
      const io = modelFs(P);
      const app = io.add("C:\\srv\\app");
      io.link(P.join(app, "l"), target);
      for (const state of ["absent", "there", "its file there"]) {
        if (state === "there") io.add(root + "srv");
        if (state === "its file there") io.file(target);
        for (const rel of ["l", under("l", 0), under("l", 5)]) {
          assert.equal(reference(app, rel, io), "outside", `the walk: ${target} ${state}, ${rel}`);
          assert.equal(fileInside(app, rel, io), "outside", `${target} ${state}, ${rel}`);
        }
      }
    }
    // Under POSIX' rules, a root that does not resolve: the same.
    const io = modelFs(path.posix, { rootless: true });
    const app = io.add("/srv/app");
    io.link("/srv/app/l", "/nowhere/x.txt");
    for (const rel of ["l", under("l", 0), under("l", 5)]) assert.equal(fileInside(app, rel, io), "outside", rel);
    io.add("/nowhere");
    for (const rel of ["l", under("l", 0), under("l", 5)]) assert.equal(fileInside(app, rel, io), "outside", rel);
  });
});

describe("fileInside: climbing out as written, in one pass, is what path.resolve answers", () => {
  /**
   * The check it replaced, kept as the reference: the path joined and resolved by path.resolve (quadratic on `a/`×n
   * then `b/../`×n, confine-growth.test.mjs), then compared with the folder resolved.
   */
  const insideAsWritten = (dir, rel, P) => {
    const top = P.resolve(dir);
    const abs = P.resolve(P.join(dir, rel));
    return abs === top || abs.startsWith(top.endsWith(P.sep) ? top : top + P.sep);
  };
  /** The folder read in the forms it is given: with or without a last separator, a root, a share, `\\?\`, relative. */
  const DIRS = {
    posix: ["/srv/app", "/srv/app/", "/", "/srv", "//srv//app", "/srv/./app", "/srv/x/../app", "srv/app", ".", "a\\b"],
    win32: [
      "C:\\srv\\app",
      "C:/srv/app/",
      "c:\\srv\\app",
      "C:\\",
      "C:\\srv",
      "\\\\host\\share",
      "\\\\host\\share\\srv\\app",
      "//host/share/srv",
      "\\\\?\\C:\\srv\\app",
      "\\\\.\\C:\\srv",
      "\\\\?\\UNC\\host\\share\\app",
      "\\\\?\\C:",
      "srv\\app",
      ".",
    ],
  };
  /** What starts a path elsewhere when it stands alone: a root, a share, a drive, a device. */
  const STARTS = ["/", "//", "\\", "\\\\", "\\\\?\\", "\\\\.\\", "C:", "C:\\", "c:/", "\\\\host\\share\\"];
  /**
   * A random `rel`: often `..` up to past the root, then the folder's own names to come back by (one sometimes
   * changed: its case, a letter more); then names, those names again, `..`, `.`, empty parts, drives, either
   * separator (a name's character under POSIX' rules); sometimes a start of its own or separators at its end.
   */
  const randomRel = (r, top) => {
    const own = top.split(/[\\/]/).filter(Boolean);
    const tokens = ["a", "b", "..", "..", "..", ".", "", "C:", "D:", "...", "?", ...own, ...own];
    const parts = [];
    if (r.chance(0.5)) {
      const up = 1 + r.int(own.length + 2);
      parts.push(...Array.from({ length: up }, () => ".."));
      if (r.chance(0.7))
        parts.push(...own.slice(-up).map((n) => (r.chance(0.15) ? r.pick([n.toUpperCase(), n + "x", "a"]) : n)));
    }
    parts.push(...Array.from({ length: r.int(8) }, () => r.pick(tokens)));
    let rel = parts.map((part, i) => (i ? (r.chance(0.3) ? "\\" : "/") : "") + part).join("");
    if (r.chance(0.25)) rel = r.pick(STARTS) + rel;
    if (r.chance(0.25)) rel += r.pick(["/", "\\", "//"]);
    return rel;
  };
  /**
   * A file system where every path is there as written, its calls counted: climbing out is answered before any. Its
   * path rules are P's, each path resolved alone kept in `resolved`, as fileInside gives it (realPathOf).
   */
  const mirror = (P) => {
    const io = {
      path: {
        ...P,
        resolve: (/** @type {string[]} */ ...parts) => {
          if (parts.length === 1) io.resolved.push(parts[0]);
          return P.resolve(...parts);
        },
      },
      /** @type {string[]} */
      resolved: [],
      calls: 0,
      realpathSync: { native: (p) => (io.calls++, p) },
      statSync: () => (io.calls++, { isFile: () => true }),
      lstatSync: () => (io.calls++, { isSymbolicLink: () => false }),
      readlinkSync: () => {
        io.calls++;
        throw ERRORS.EINVAL;
      },
    };
    return io;
  };
  const RUN = 0x0c11b0a7;
  const CASES = 6000;
  for (const [rules, dirs] of Object.entries(DIRS))
    test(`under ${rules} rules: ${CASES} random paths, outside without a call exactly where path.resolve says so, and the path joined is path.resolve's`, (t) => {
      const P = RULES[rules];
      const seen = { outside: 0, inside: 0, cameBack: 0, atRoot: 0, started: 0 };
      for (let i = 0; i < CASES; i++) {
        const seed = caseSeed(RUN, i);
        const r = rng(seed);
        const dir = r.pick(dirs);
        const rel = randomRel(r, P.resolve(dir));
        const inside = insideAsWritten(dir, rel, P);
        const io = mirror(P);
        const got = fileInside(dir, rel, io);
        const where = `seed ${hex(seed)}, ${rules}, ${JSON.stringify(dir)}, ${JSON.stringify(rel)}`;
        assert.equal(io.calls === 0 ? got : "asked", inside ? "asked" : "outside", where);
        // Inside, the path asked last is the one path.resolve joins, character for character, as fileInside built it.
        if (inside) assert.equal(io.resolved.at(-1), P.resolve(P.join(dir, rel)), where);
        // What the cases hold: each `..` part, the path before it out of the folder, or at its root already.
        seen[inside ? "inside" : "outside"]++;
        const sep = rules === "win32" ? /[\\/]/g : /\//g;
        let out = false;
        for (let start = 0, m; (m = sep.exec(rel + "/")) !== null; start = m.index + 1) {
          if (rel.slice(start, m.index) !== "..") continue;
          const before = P.resolve(P.join(dir, rel.slice(0, start)));
          if (before === P.resolve(before, "..")) seen.atRoot++;
          if (!insideAsWritten(dir, rel.slice(0, m.index), P)) out = true;
        }
        if (out && inside) seen.cameBack++;
        if (STARTS.some((s) => rel.startsWith(s))) seen.started++;
      }
      // Every kind of answer, paths that leave the folder and come back by its names, `..` at the root, starts.
      t.diagnostic(JSON.stringify(seen));
      for (const [kind, count] of Object.entries(seen)) assert.ok(count > 100, `${kind}: ${count}`);
    });

  test("the minimal pairs: out and back by the folder's own names, the case included, and `..` at the root", () => {
    for (const [P, app] of [
      [path.posix, "/srv/app"],
      [path.win32, "C:\\srv\\app"],
      [path.win32, "\\\\?\\C:\\srv\\app"],
    ]) {
      const outside = (rel) => {
        const io = mirror(P);
        return fileInside(app, rel, io) === "outside" && io.calls === 0;
      };
      assert.equal(outside("../app/lib/a.txt"), false, `${app}: back by its name`);
      assert.equal(outside("../APP/lib/a.txt"), true, `${app}: another name, case included`);
      assert.equal(outside("../ap/../app/x"), false, `${app}: a detour, then back`);
      assert.equal(outside("x/../../app"), false, `${app}: the folder itself`);
      assert.equal(outside("x/../../appx"), true, `${app}: a sibling`);
      const up = "../".repeat(P.resolve(app).split(/[\\/]/).filter(Boolean).length + 3);
      const back = P.resolve(app).slice(P.resolve(app, P.sep).length).split(P.sep).join("/");
      assert.equal(outside(up + back + "/x"), false, `${app}: \`..\` past the root is nothing`);
      assert.equal(outside(up + "x/" + back), true, `${app}: past the root, elsewhere`);
    }
  });
});

describe("fileInside: a path longer than MAX_PATH is missing, without the file system", () => {
  /** A relative path that makes the path under `app` exactly `length` characters long. */
  const relOfLength = (P, app, length) => {
    const room = length - app.length - 1;
    const pairs = Math.floor((room - 5) / 2);
    return "lib" + P.sep + ("d" + P.sep).repeat(pairs) + "z".repeat(room - 4 - 2 * pairs);
  };
  for (const [rules, P] of Object.entries(RULES))
    test(`under ${rules} rules: asked at MAX_PATH, not one more, resolved or as written; climbing out stays outside`, () => {
      const io = modelFs(P);
      const app = io.add(P.join(rules === "win32" ? "C:\\" : "/", "srv", "app"));
      io.add(P.join(app, "lib"));
      const file = io.file(P.join(app, "lib", "a.txt"));
      const answer = (rel) => {
        io.calls.length = 0;
        return { got: fileInside(app, rel, io), calls: io.calls.length };
      };
      const atCap = relOfLength(P, app, MAX_PATH);
      assert.equal(P.join(app, atCap).length, MAX_PATH);
      const at = answer(atCap);
      assert.equal(at.got, null, "missing inside");
      assert.ok(at.calls > 0, "asked of the file system");
      assert.deepEqual(answer(relOfLength(P, app, MAX_PATH + 1)), { got: null, calls: 0 }, "one more: never asked");
      // Climbing out as written is checked first: such a path is outside, whatever its length; one that comes back
      // by the folder's name is not, and past the cap it is missing.
      const out = ".." + P.sep + "x" + P.sep + relOfLength(P, app, MAX_PATH + 100);
      assert.ok(P.resolve(app, out).length > MAX_PATH);
      assert.deepEqual(answer(out), { got: "outside", calls: 0 });
      const back = ".." + P.sep + "app" + P.sep + relOfLength(P, app, MAX_PATH + 100);
      assert.deepEqual(answer(back), { got: null, calls: 0 });
      // The cap is on `rel` as written too, before path.resolve (quadratic on some shapes) reads it: `./` repeated
      // up to it still names lib/a.txt; one character more, and it is missing without a call.
      const padded = "./".repeat(16379) + "lib/a.txt";
      assert.equal(padded.length, MAX_PATH);
      assert.equal(answer(padded).got, file);
      const over = "./".repeat(16379) + "lib//a.txt";
      assert.equal(over.length, MAX_PATH + 1);
      assert.deepEqual(answer(over), { got: null, calls: 0 });
    });
});

describe("fileInside: a broken link whose target has a `..` after a name is outside, present or missing", () => {
  // POSIX resolves `j/../x` from wherever `j` leads: through `j`, a link to a folder outside, the file is outside.
  // Read as text, the `..` takes `j` back and the path stays in the application: a missing file there would be judged
  // inside while a present one is outside, telling whether a file of the operator exists.
  const P = path.posix;
  const setup = () => {
    const io = modelFs(P);
    const app = io.add("/srv/app");
    io.add("/srv/app/lib");
    io.add("/home/op/.ssh");
    io.link("/srv/app/j", "/home/op/.ssh"); // a link to a folder outside
    io.link("/srv/app/l", "j/../.aws/credentials"); // through j, then up: /home/op/.aws/credentials
    io.link("/srv/app/k", "/srv/app/j/../.aws/credentials"); // the same, absolute
    io.link("/srv/app/c0", "c1"); // a chain: its second link holds the `..`
    io.link("/srv/app/c1", "j/../.aws/credentials");
    io.add("/srv/app/sub");
    io.link("/srv/app/sub/up", "../lib/a.txt"); // a leading `..`: from the link's real folder, as before
    return { io, app };
  };
  for (const state of ["present", "missing"])
    test(`the outside file ${state}: the same answer`, () => {
      const { io, app } = setup();
      if (state === "present") io.file("/home/op/.aws/credentials");
      for (const rel of ["l", "k", "c0", "l/x"]) assert.equal(fileInside(app, rel, io), "outside", rel);
      // The minimal pair: a leading `..` that stays inside resolves from the link's folder, present or missing.
      assert.equal(fileInside(app, "sub/up", io), null, "missing inside");
      io.file("/srv/app/lib/a.txt");
      assert.equal(fileInside(app, "sub/up", io), "/srv/app/lib/a.txt");
    });
});

// Real links and junctions. A file link (a relative one above all) needs a privilege on Windows (developer mode): the
// ubuntu and macos jobs of the CI run them for real; without the privilege the test says so (t.diagnostic) and the
// model of the file system above checks the same answers — never a silent skip.
describe("fileInside on real links", () => {
  /** Removes a link or a junction on its own: removing the folder must never walk into what it points to. */
  const unlink = (p) => {
    try {
      fs.unlinkSync(p);
    } catch {
      if (fs.existsSync(p)) fs.rmdirSync(p);
    }
  };
  const folderLink = process.platform === "win32" ? "junction" : "dir";

  test("each form of a broken link: relative, with a `..`, to another broken link, to a missing name outside", (t) => {
    const dir = tempDir("doc-kit-confine-links-");
    const app = path.join(dir, "app");
    const made = [];
    try {
      fs.mkdirSync(path.join(app, "lib"), { recursive: true });
      fs.mkdirSync(path.join(app, "sub"));
      fs.mkdirSync(path.join(dir, "outside"));
      fs.writeFileSync(path.join(app, "lib", "a.ts"), "export const a = 1;\n");
      const link = (name, target, type = "file") => {
        fs.symlinkSync(target, path.join(app, name), type);
        made.push(path.join(app, name));
      };
      link("j", path.join(dir, "outside"), folderLink);
      try {
        link("in", "missing.ts"); // relative, inside
      } catch (e) {
        t.diagnostic(`no file link on this system (${e.code}): the model of the file system checks these answers`);
        return;
      }
      link("out", "../outside/missing.ts"); // relative, out
      link("climb", "j/../x.ts"); // a `..` after a name: from j's target on POSIX, outside
      link("to-in", "in"); // to another broken link, inside
      link("to-out", "out"); // to another broken link, out
      link("nope", "../outside/nope/missing.ts"); // to a missing name in outside/
      link(path.join("sub", "up"), "../lib/a.ts"); // a leading `..`: from the link's folder
      link(path.join("sub", "up-missing"), "../lib/missing.ts");
      const real = fs.realpathSync.native(path.join(app, "lib", "a.ts"));
      for (const state of ["missing", "present"]) {
        if (state === "present") fs.writeFileSync(path.join(dir, "x.ts"), "outside\n");
        const at = `the file beside the application ${state}`;
        assert.equal(fileInside(app, "in"), null, `a broken link inside, ${at}`);
        assert.equal(fileInside(app, "out"), "outside", `a broken link out, ${at}`);
        assert.equal(fileInside(app, "climb"), "outside", `j/../x.ts, ${at}`);
        assert.equal(fileInside(app, "to-in"), null, `to a broken link inside, ${at}`);
        assert.equal(fileInside(app, "to-out"), "outside", `to a broken link out, ${at}`);
        assert.equal(fileInside(app, "nope"), "outside", `to a missing name in outside/, ${at}`);
        assert.equal(fileInside(app, "sub/up"), real, `../lib/a.ts from sub, ${at}`);
        assert.equal(fileInside(app, "sub/up-missing"), null, `../lib/missing.ts from sub, ${at}`);
      }
    } finally {
      for (const p of made.reverse()) unlink(p);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the folder given through a link to it, or as \\\\?\\ on Windows: the same answers", () => {
    const dir = tempDir("doc-kit-confine-alias-");
    const app = path.join(dir, "app");
    const alias = path.join(dir, "alias");
    const j = path.join(app, "j");
    try {
      fs.mkdirSync(path.join(app, "lib"), { recursive: true });
      fs.mkdirSync(path.join(dir, "outside"));
      fs.writeFileSync(path.join(app, "lib", "a.ts"), "export const a = 1;\n");
      fs.symlinkSync(path.join(dir, "outside"), j, folderLink);
      fs.symlinkSync(app, alias, folderLink);
      const real = fs.realpathSync.native(path.join(app, "lib", "a.ts"));
      const forms = [app, alias];
      if (process.platform === "win32") forms.push(`\\\\?\\${app}`, `\\\\?\\${alias}`);
      for (const folder of forms) {
        assert.equal(fileInside(folder, "lib/a.ts"), real, folder);
        assert.equal(fileInside(folder, "lib/missing.ts"), null, folder);
        assert.equal(fileInside(folder, "j/missing.ts"), "outside", folder);
        assert.equal(fileInside(folder, "j/deeper/missing.ts"), "outside", folder);
        assert.equal(fileInside(folder, "../outside/missing.ts"), "outside", folder);
      }
    } finally {
      unlink(j);
      unlink(alias);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
