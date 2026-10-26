// fileInside (engine/core/confine.mjs) stays linear on what a crafted path names (RULES.md S5): the path comes from a
// page's text and the facts. A missing one is judged by its nearest existing ancestor, found by bisection — asking
// every ancestor in turn, each call given the whole path, cost depth times length (seconds for 16,000 missing parts).
// Each shape is built at a base size, then 4 and 16 times larger (linearAt, test/tools/growth.mjs), no absolute time;
// 16 times stays under the length cap (MAX_PATH, 32,767 characters), past which a path is missing without a call —
// but the shape path.resolve is quadratic on (`a/` then `b/../`), past it at every size: what is measured there is the
// check of climbing out as written, which comes before the cap. A long name then `b/../` (quadratic in path.resolve
// too) stays under it: what is measured there is the path joined in one pass, never by path.resolve.
// The file system is a fake (no link privilege needed, no disk). test/tools/run-plan.mjs runs this file alone, after
// the others. The functional tests of the confinement (the answers, the count of calls) stay in confine.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileInside } from "../../engine/core/confine.mjs";
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
