// fileInside (engine/core/confine.mjs) stays linear on what a crafted path names (RULES.md S5): the path comes from a
// page's text and the facts. A missing one is judged by its nearest existing ancestor, found by bisection — asking
// every ancestor in turn, each call given the whole path, cost depth times length (seconds for 16,000 missing parts).
// Each shape is built at a base size, then 4 and 16 times larger (linearAt, test/tools/growth.mjs), no absolute time;
// 16 times stays under the length cap (MAX_PATH, 32,767 characters), past which a path is missing without a call —
// but the shape path.resolve is quadratic on (`a/` then `b/../`), past it at every size: what is measured there is the
// check of climbing out as written, which comes before the cap. A long name then `b/../` (quadratic in path.resolve
// too) stays under it: what is measured there is the path joined in one pass, never by path.resolve.
// The paths the tools of the adapters, sync and context are given in the application (linkFree, entryInto): a deep
// one is judged in a few calls, never one for each folder, each given the whole path (depth times length), and a file
// the tools' own walk listed is not judged again — a walk of a deep folder then the read of each of its files asked
// every folder above it again for each file (5 s for `check coverage` on a chain 400 deep, 32 s at 800).
// The file system is a fake (no link privilege needed, no disk). test/tools/run-plan.mjs runs this file alone, after
// the others. The functional tests of the confinement (the answers, the count of calls) stay in confine.test.mjs and
// adapters.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { entryInto, fileInside, linkFree } from "../../engine/core/confine.mjs";
import { adapterTools } from "../../engine/check/coverage.mjs";
import { linearAt } from "../tools/growth.mjs";

const srv = path.resolve("/srv");
const app = path.join(srv, "app");
const at = (...parts) => path.join(app, ...parts);

/**
 * A file system with the folders `real` (own real path), the links `links` (target as written), nothing else. Its
 * errors are made once: a stack captured for each call would weigh more than the walk measured.
 */
function fakeIo(real, links = {}) {
  const missing = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  const notLink = Object.assign(new Error("EINVAL"), { code: "EINVAL" });
  return {
    realpathSync: {
      native: (p) => {
        if (Object.hasOwn(real, p)) return real[p];
        throw missing;
      },
    },
    statSync: (p) => ({ isFile: () => p.endsWith(".txt") }),
    lstatSync: (p) => {
      if (!Object.hasOwn(real, p) && !Object.hasOwn(links, p)) throw missing;
      return { isSymbolicLink: () => Object.hasOwn(links, p) };
    },
    readlinkSync: (p) => {
      if (Object.hasOwn(links, p)) return links[p];
      throw notLink;
    },
  };
}
// Every folder above the application resolves, the root too, as on a real system: a missing path found through a
// link is judged from wherever its target lies, the root included.
const root = path.parse(srv).root;
const base = { [root]: root, [srv]: srv, [app]: app, [at("lib")]: at("lib") };

// A path of n missing components, `width` characters each with its slash: the walk climbed n ancestors, each one asked
// of the file system with the whole path. The longer the parts, the more the time that grows outweighs the rest.
const deepRel = (n, width = 3) =>
  Array.from({ length: n }, (_, i) => `d${i % 10}`.padEnd(width - 1, "0")).join("/") + "/z.txt";

test("fileInside: a path of many missing components, under the application and under a link out", () => {
  const inside = linearAt("missing components inside", {
    size: 500,
    make: (n) => ({ io: fakeIo(base), rel: "lib/" + deepRel(n) }),
    read: ({ io, rel }) => fileInside(app, rel, io),
  });
  assert.equal(inside.at16, null, "missing, inside");
  const out = path.join(srv, "x");
  const outside = linearAt("missing components under a link out", {
    size: 500,
    make: (n) => ({
      io: fakeIo({ ...base, [out]: out, [at("out")]: out }, { [at("out")]: out }),
      rel: "out/" + deepRel(n),
    }),
    read: ({ io, rel }) => fileInside(app, rel, io),
  });
  assert.equal(outside.at16, "outside");
});

test("fileInside: many missing files in a row, as markPages passes them", () => {
  const { at16 } = linearAt("many missing files", {
    size: 500,
    make: (n) => ({ io: fakeIo(base), rels: Array.from({ length: n }, (_, i) => `lib/sub${i % 7}/missing-${i}.txt`) }),
    read: ({ io, rels }) => rels.map((rel) => fileInside(app, rel, io)),
  });
  assert.equal(at16.length, 8000);
  assert.ok(at16.every((r) => r === null));
});

test("fileInside: a path that goes down then back up as written, a/ n times then b/../ n times", () => {
  // path.resolve is quadratic on it (each `..` cuts the path built so far, copied whole): 0.7 s for 448,000
  // characters. Climbing out is judged in one pass, then a `rel` past MAX_PATH is missing before path.resolve reads
  // it: past the cap at every size here (35,000 characters at the base), what is measured is that pass alone.
  const shape = (n) => "a/".repeat(n) + "b/../".repeat(n) + "z.txt";
  const inside = linearAt("down then up, inside", {
    size: 5000,
    make: (n) => ({ io: fakeIo(base), rel: shape(n) }),
    read: ({ io, rel }) => fileInside(app, rel, io),
  });
  assert.equal(inside.at16, null, "missing: past the cap");
  // Out of the application first: outside, whatever its length.
  const outside = linearAt("down then up, out first", {
    size: 5000,
    make: (n) => ({ io: fakeIo(base), rel: "../x/" + shape(n) }),
    read: ({ io, rel }) => fileInside(app, rel, io),
  });
  assert.equal(outside.at16, "outside");
});

test("fileInside: a long name, then b/../ many times, under the length cap", () => {
  // path.resolve is quadratic on it too (each `..` copies the long name again: 30 to 70 ms at 16 times on a laptop),
  // and it stays under MAX_PATH at 16 times (32,006 characters): the path is joined in the pass that judges climbing
  // out, never by path.resolve.
  const shape = (n) => "x".repeat(n) + "/" + "b/../".repeat(n / 5) + "z.txt";
  const { at16 } = linearAt("a long name, then down and up", {
    size: 1000,
    make: (n) => ({ io: fakeIo(base), rel: shape(n) }),
    read: ({ io, rel }) => fileInside(app, rel, io),
  });
  assert.equal(at16, null, "missing, inside");
  assert.ok(path.join(app, shape(16000)).length <= 32767, "under the cap at 16 times");
});

test("fileInside: a chain of broken links (the longest followed), with a missing tail of many components", () => {
  // 32 links, each to the next, the last to a folder inside: every link is walked again with the whole tail (parts of
  // 9 characters: 14,400 at 16 times, under the cap).
  const chain = (n) => {
    const links = {};
    for (let i = 0; i < 32; i++) links[at(`l${i}`)] = i === 31 ? at("lib") : at(`l${i + 1}`);
    return { io: fakeIo(base, links), rel: "l0/" + deepRel(n, 9) };
  };
  const { at16 } = linearAt("a chain of broken links and a deep tail", {
    size: 100,
    make: chain,
    read: ({ io, rel }) => fileInside(app, rel, io),
  });
  assert.equal(at16, null);
});

// ─── The paths in the application: linkFree, entryInto, the tools of the adapters ──────────────────────────────────
const PX = path.posix;
const SRV = "/srv";
const APP = "/srv/app";
const OUT = "/srv/out";
const ALIAS = "/srv/alias";

/**
 * A file system under POSIX' rules of one chain of folders as deep as asked, each path read in one pass over its text
 * (never a string for each folder), as a system is given the whole path at each call: what grows is the reader.
 * `/srv/app` and `/srv/out` each hold `depth` folders named `d`, one in the other, the deepest holding `files` files
 * (f0.txt…), which `/srv/out` holds at its top too; `/srv/alias` is a link to `/srv/app`. `linkAt`: the folder at
 * that depth of the application's chain is a junction to `/srv/out`. `fold`: a name read in any case, the case on
 * disk given back. Its errors are made once.
 * @param {number} depth
 * @param {{ files?: number, linkAt?: number, fold?: boolean }} [o]
 */
function chainIo(depth, { files = 0, linkAt = 0, fold = false } = {}) {
  const missing = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  const key = (name) => (fold ? name.toLowerCase() : name);
  const fileNames = new Set(Array.from({ length: files }, (_, i) => `f${i}.txt`));
  const real = (base, names, from) => [base, ...names.slice(from).map(key)].join("/");
  const under = (p, t) => key(p.slice(0, t.length)) === t && (p.length === t.length || p[t.length] === "/");
  /** Where `p` leads: its kind, its real path, and for a folder its chain and its depth; null: nothing there. */
  function locate(p, follow) {
    if (key(p) === "/" || key(p) === SRV) return { kind: "dir", real: key(p) };
    const top = [APP, OUT, ALIAS].find((t) => under(p, t));
    if (!top) return null;
    if (top === ALIAS && p.length === top.length && !follow) return { kind: "link" };
    let base = top === OUT ? OUT : APP;
    const names = p.length > top.length ? p.slice(top.length + 1).split("/") : [];
    let level = 0;
    let from = 0;
    for (let i = 0; i < names.length; i++) {
      const last = i === names.length - 1;
      if (level < depth && key(names[i]) === "d") {
        level++;
        if (base === APP && level === linkAt) {
          if (last && !follow) return { kind: "link" };
          [base, level, from] = [OUT, 0, i + 1];
        }
      } else if (last && fileNames.has(key(names[i])) && (level === depth || (base === OUT && level === 0)))
        return { kind: "file", real: real(base, names, from) };
      else return null;
    }
    return { kind: "dir", real: real(base, names, from), base, level };
  }
  const entry = (name, kind) => ({
    name,
    isDirectory: () => kind === "dir",
    isFile: () => kind === "file",
    isSymbolicLink: () => kind === "link",
  });
  return {
    path: PX,
    realpathSync: {
      native: (p) => {
        const found = locate(p, true);
        if (!found) throw missing;
        return found.real;
      },
    },
    lstatSync: (p) => {
      const found = locate(p, false);
      if (!found) throw missing;
      return entry("", found.kind);
    },
    existsSync: (p) => !!locate(p, true),
    readFileSync: (p) => {
      if (locate(p, true)?.kind !== "file") throw missing;
      return "x";
    },
    readdirSync: (p) => {
      const found = locate(p, true);
      if (found?.kind !== "dir") throw missing;
      const out = [];
      if (found.level !== undefined && found.level < depth)
        out.push(entry("d", found.base === APP && found.level + 1 === linkAt ? "link" : "dir"));
      if (found.level === depth || (found.base === OUT && found.level === 0))
        for (const name of fileNames) out.push(entry(name, "file"));
      return out;
    },
  };
}
const folders = (n) => Array(n).fill("d");

test("linkFree: a deep path is judged in a few calls — plain folders, a junction at its end, written in another case", () => {
  const plain = linearAt("linkFree, a chain of folders", {
    size: 500,
    make: (n) => ({ io: chainIo(n, { files: 1 }), names: [...folders(n), "f0.txt"] }),
    read: ({ io, names }) => [linkFree(APP, names, { io }), linkFree(APP, names.slice(0, -1), { folder: true, io })],
  });
  assert.deepEqual(plain.at16, [true, true]);
  const junction = linearAt("linkFree, a junction at the end of the chain", {
    size: 500,
    make: (n) => ({ io: chainIo(n, { files: 1, linkAt: n }), names: [...folders(n), "f0.txt"] }),
    read: ({ io, names }) => linkFree(APP, names, { io }),
  });
  assert.equal(junction.at16, false, "through the junction");
  const other = linearAt("linkFree, the chain written in another case at its top", {
    size: 500,
    make: (n) => ({ io: chainIo(n, { files: 1, fold: true }), names: ["D", ...folders(n - 1), "F0.TXT"] }),
    read: ({ io, names }) => linkFree(APP, names, { io }),
  });
  assert.equal(other.at16, true, "a name in another case is no link");
});

test("entryInto: a deep path in the application, written through an alias, outside, missing outside", () => {
  const inside = linearAt("entryInto, a deep path in the application", {
    size: 500,
    make: (n) => ({ io: chainIo(n, { files: 1 }), rel: [...folders(n), "f0.txt"] }),
    read: ({ io, rel }) => [
      entryInto(APP, PX.join(APP, ...rel), io)?.names.length,
      entryInto(ALIAS, PX.join(APP, ...rel), io)?.top,
      entryInto(APP, PX.join(ALIAS, ...rel), io)?.top,
    ],
  });
  assert.deepEqual(inside.at16, [8001, APP, ALIAS]);
  const outside = linearAt("entryInto, a deep path outside", {
    size: 500,
    make: (n) => ({ io: chainIo(n, { files: 1 }), abs: PX.join(OUT, ...folders(n), "f0.txt") }),
    read: ({ io, abs }) => entryInto(APP, abs, io),
  });
  assert.equal(outside.at16, null);
  const gone = linearAt("entryInto, a deep missing path outside", {
    size: 500,
    make: (n) => ({ io: chainIo(1), abs: PX.join(OUT, "missing", ...folders(n)) }),
    read: ({ io, abs }) => entryInto(APP, abs, io),
  });
  assert.equal(gone.at16, null);
});

test("the tools of the application: a deep folder walked, then each of its files read, as a coverage adapter does", () => {
  const { at16 } = linearAt("tools: a deep folder walked, then each file read", {
    size: 200,
    make: (n) => ({ io: chainIo(n, { files: 16 }), dir: "../app/" + folders(n).join("/") }),
    read: ({ io, dir }) => {
      const tools = adapterTools("/srv/docs", { appDir: APP, io });
      return tools.exists(dir)
        ? tools
            .walk(dir)
            .map((f) => tools.read(`${dir}/${f}`))
            .join("")
        : null;
    },
  });
  assert.equal(at16, "x".repeat(16));
});
