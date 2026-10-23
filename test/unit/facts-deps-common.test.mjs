// What every dependency reader shares: the workspace members read beside a lock file (deps/workspaces.mjs and its
// bounds, SECURITY.md "Network and dependencies"), the manifests read beside a lock (links, 4 MB), one package
// however its name is written (engine/core/packages.mjs), the chains of the transitive ones (deps/graph.mjs), and a
// name that looks like a secret, never kept.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { membersOf } from "../../engine/facts/deps/workspaces.mjs";
import { readBeside } from "../../engine/facts/deps/read.mjs";
import { viaChains, withVia } from "../../engine/facts/deps/graph.mjs";
import { packageKey, oncePerPackage } from "../../engine/core/packages.mjs";
import { collectDependencies } from "../../engine/facts/dependencies.mjs";
import { SKIP_DIRS } from "../../engine/facts/common.mjs";
import { yarnBlock, yarnLock, packageJson } from "../tools/locks.mjs";
import { app, deps } from "../tools/deps-apps.mjs";

/** A yarn.lock holding one registry block for each of `names`. */
const lockOf = (names) => yarnLock(...names.map((n) => yarnBlock(`${n}@^1`)));

/** A manifest declaring each of `names` (range "^1"). */
const declaring = (...names) => packageJson(Object.fromEntries(names.map((n) => [n, "^1"])));

/** The root package.json of an application whose workspaces are `patterns`. */
const rootOf = (patterns) => packageJson({}, {}, { workspaces: patterns });

/**
 * The names a lock's items mark direct (sorted), after checking the lock's items are exactly `all`: a name not direct
 * is an item that was read and found not declared, never an item that vanished.
 */
function directIn(lock, all) {
  assert.deepEqual(Object.keys(lock).sort(), [...all].sort(), "every package of the lock is an item");
  return Object.values(lock)
    .filter((i) => i.direct)
    .map((i) => i.name)
    .sort();
}

/** The direct names of the yarn.lock of an application made of `files`, its lock holding `all`. */
const directOf = (files, all, lockPath = "yarn.lock") => directIn(deps(files)[lockPath], all);

describe("a workspace pattern: the forms the kit follows", () => {
  const folders = [["apps"], ["apps", "web"], ["apps", "web-admin"], ["apps", "legacy"], ["packages", "a", "sub"]];
  const names = (patterns, list = folders) => membersOf(patterns, list).map((f) => f.join("/"));

  /** [label, patterns, members, why] */
  const ROWS = [
    ["a folder's name", ["apps/web"], ["apps/web"], "a plain segment is compared whole"],
    ["'*' is every folder of a level", ["apps/*"], ["apps/web", "apps/web-admin", "apps/legacy"], "npm's own form"],
    ["a prefix before '*'", ["apps/web-*"], ["apps/web-admin"], "one '*' inside a name: a prefix and a suffix"],
    ["a suffix after '*'", ["apps/*-admin"], ["apps/web-admin"], "one '*' inside a name: a prefix and a suffix"],
    ["a prefix and a suffix", ["apps/w*b"], ["apps/web"], "'web-admin' starts with w but does not end with b"],
    ["a name is not its prefix and suffix overlapping", ["apps/web*web"], [], "'web' is not 'web' twice"],
    ["'**' leads to any depth", ["**/sub"], ["packages/a/sub"], "'**' stands for any folders"],
    [
      "'**' alone at the end: zero folders too",
      ["apps/**"],
      ["apps", "apps/web", "apps/web-admin", "apps/legacy"],
      "'**' also matches no folder at all",
    ],
    ["./ and a trailing / are dropped", ["./apps/web/"], ["apps/web"], "npm writes both"],
    [
      "'!' leaves a folder out",
      ["apps/*", "!apps/legacy"],
      ["apps/web", "apps/web-admin"],
      "an exclusion takes the folder out of the others",
    ],
    [
      "'!' with a pattern of its own",
      ["apps/*", "!apps/*-admin"],
      ["apps/web", "apps/legacy"],
      "the exclusion is a pattern like any other",
    ],
    ["'!' alone keeps nothing", ["!apps/legacy"], [], "there is nothing to leave out of"],
    [
      "an entry that is no string is ignored",
      ["apps/*", "!apps/legacy", 42, null],
      ["apps/web", "apps/web-admin"],
      "a package.json is untrusted",
    ],
  ];
  for (const [label, patterns, members, why] of ROWS)
    test(label, () => assert.deepEqual(names(patterns), members, `${label}: ${why}`));

  test("a pattern written twice is one pattern", () =>
    assert.deepEqual(names(["apps/web", "apps/web", "apps/web"]), ["apps/web"]));
});

describe("a workspace pattern: the forms the kit never follows", () => {
  const folders = [
    ["apps", "web"],
    ["apps", "legacy"],
  ];
  // Folders named like the patterns themselves too: a form the kit does not follow matches nothing, not even itself
  // read as a plain name.
  const literal = [...["*e*", "we?", "[w]eb", "{web,legacy}", "a*b*c"].map((n) => ["apps", n]), ["..", "apps", "web"]];
  const listed = [...folders, ...literal];
  const names = (patterns, list = listed) => membersOf(patterns, list).map((f) => f.join("/"));

  /** [pattern, why] */
  const ROWS = [
    ["apps/*e*", "several '*' in a segment"],
    ["apps/a*b*c", "several '*' in a segment"],
    ["apps/we?", "'?' is a glob form npm writes but the kit does not follow"],
    ["apps/[w]eb", "brackets"],
    ["apps/{web,legacy}", "braces"],
    ["../apps/web", "leaves the application's folder"],
    ["apps/../apps/web", "'..' anywhere leaves the folder"],
    ["/apps/web", "an absolute path"],
  ];
  for (const [pattern, why] of ROWS)
    test(pattern, () => {
      assert.deepEqual(names([pattern]), [], `${pattern}: ${why}`);
      // The pattern is ignored, not fatal: a followed one beside it still gives its members.
      assert.deepEqual(names([pattern, "apps/legacy"]), ["apps/legacy"], `${pattern}: the others are still read`);
    });

  test("a segment: 100 characters are followed, 101 are not", () => {
    const long = ["x".repeat(100)];
    assert.deepEqual(names(["x".repeat(100)], [long]), [long.join("/")], "100 characters: followed");
    assert.deepEqual(names(["x".repeat(101)], [["x".repeat(101)]]), [], "101: not");
    assert.deepEqual(names(["x".repeat(99) + "*"], [long]), [long.join("/")], "99 and a '*': 100, followed");
    assert.deepEqual(names(["x".repeat(100) + "*"], [["x".repeat(101)]]), [], "100 and a '*': 101, not");
  });
});

describe("a workspace pattern: the bounds", () => {
  const apps = [
    ["apps", "web"],
    ["apps", "legacy"],
  ];
  const names = (patterns, list = apps) => membersOf(patterns, list).map((f) => f.join("/"));
  const deep = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];

  test("8 segments are followed, 9 are not", () => {
    assert.deepEqual(names(["*/*/*/*/*/*/*/*"], [deep.slice(0, 8)]), [deep.slice(0, 8).join("/")], "8 segments");
    assert.deepEqual(names(["*/*/*/*/*/*/*/*/*"], [deep]), [], "9 segments: the pattern is not followed");
  });

  const fifty = Array.from({ length: 49 }, (_, i) => `none-${i}`);
  test("the 50th distinct pattern is read, the 51st is not (a pattern written twice counts once)", () => {
    assert.deepEqual(names([...fifty, ...fifty, "apps/web"]), ["apps/web"], "the 50th distinct pattern is read");
    assert.deepEqual(names([...fifty, "none-x", "apps/web"]), [], "the 51st is not");
  });

  test("an exclusion past the 50th distinct pattern is not read either", () => {
    assert.deepEqual(names([...fifty, "apps/*", "!apps/legacy"]), ["apps/web", "apps/legacy"]);
    assert.deepEqual(names([...fifty.slice(1), "apps/*", "!apps/legacy"]), ["apps/web"], "one pattern fewer: read");
  });

  test("200 members at most, the first ones", () => {
    const many = Array.from({ length: 300 }, (_, i) => ["p", String(i)]);
    assert.deepEqual(
      names(["p/*"], many),
      Array.from({ length: 200 }, (_, i) => `p/${i}`),
    );
  });
});

describe("the workspace folders listed beside a lock", () => {
  // Every folder is a possible member; the lock holds the dependency each declares, so that "direct" says "read".

  describe("a folder the facts never walk is no member", () => {
    // Written out, then the constant's own: a folder that left SKIP_DIRS would still fail its row.
    const FOLDERS = [
      "vendor",
      "target",
      ".cache",
      "node_modules",
      "build",
      ...SKIP_DIRS.filter((f) => !f.startsWith(".")),
    ];
    for (const folder of [...new Set(FOLDERS)]) {
      test(`${folder}/`, () => {
        const files = (dir) => ({
          "package.json": rootOf(["*", "**/x"]),
          "web/package.json": declaring("kept"),
          [`${dir}/package.json`]: declaring("top"),
          [`${dir}/x/package.json`]: declaring("nested"),
          "yarn.lock": lockOf(["kept", "top", "nested"]),
        });
        const all = ["kept", "nested", "top"];
        assert.deepEqual(directOf(files("ok"), all), all, "the same layout in a folder named ok: all read");
        assert.deepEqual(directOf(files(folder), all), ["kept"], `${folder}/: neither it nor its subfolders`);
      });
    }

    test("a pattern naming it: build/* with a member in build/", () => {
      const files = {
        "package.json": rootOf(["build/*", "packages/*"]),
        "build/tool/package.json": declaring("dropped"),
        "packages/web/package.json": declaring("kept"),
        "yarn.lock": lockOf(["dropped", "kept"]),
      };
      assert.deepEqual(directOf(files, ["dropped", "kept"]), ["kept"]);
    });
  });

  test("a pattern that leaves the lock's folder is never followed; the members inside it are read", () => {
    const files = {
      "app/package.json": rootOf(["packages/*", "../outside/*"]),
      "app/packages/api/package.json": declaring("fastify"),
      "outside/x/package.json": declaring("leak"),
      "app/yarn.lock": lockOf(["fastify", "leak"]),
    };
    assert.deepEqual(directOf(files, ["fastify", "leak"], "app/yarn.lock"), ["fastify"]);
  });

  test("a pattern repeated 4,000 times still leaves room for the others; 'packages/*/sub' is that depth only", () => {
    const files = {
      "package.json": rootOf([...Array(4000).fill("src/*"), "packages/*/sub", "apps/*", "!apps/legacy"]),
      "packages/a/sub/package.json": declaring("deep"),
      "packages/a/package.json": declaring("shallow"),
      "apps/web/package.json": declaring("kept"),
      "apps/legacy/package.json": declaring("dropped"),
      "yarn.lock": lockOf(["deep", "shallow", "kept", "dropped"]),
    };
    assert.deepEqual(directOf(files, ["deep", "shallow", "kept", "dropped"]), ["deep", "kept"]);
  });

  describe("three folders deep (SECURITY.md)", () => {
    const members = {
      "w1/package.json": declaring("level1"),
      "w1/x/package.json": declaring("level2"),
      "w1/x/y/package.json": declaring("level3"),
      "w1/x/y/z/package.json": declaring("level4"),
    };
    const all = ["level1", "level2", "level3", "level4"];
    for (const [label, patterns] of [
      ["'**' reaches the third level, not the fourth", ["**"]],
      ["a pattern naming the third level and the fourth", ["w1/x/y", "w1/x/y/z"]],
    ])
      test(label, () => {
        const files = { "package.json": rootOf(patterns), ...members, "yarn.lock": lockOf(all) };
        const expected = patterns.includes("**") ? ["level1", "level2", "level3"] : ["level3"];
        assert.deepEqual(directOf(files, all), expected, "the member at the 4th level is not read");
      });
  });

  describe("2,000 folders (SECURITY.md)", () => {
    // The folders are listed in name order (the platform's directory listing is sorted), the member last.
    const fillers = (count) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`f${i}/.keep`, ""]));
    const layout = (count) => ({
      "package.json": rootOf(["zzz"]),
      ...fillers(count),
      "zzz/package.json": declaring("late"),
      "yarn.lock": lockOf(["late"]),
    });

    test("the 2,000th folder listed is looked at", () =>
      assert.deepEqual(directOf(layout(1999), ["late"]), ["late"], "1,999 folders and the member: 2,000"));

    test("a member listed after 2,000 folders is not read", () =>
      assert.deepEqual(directOf(layout(2000), ["late"]), [], "2,000 folders and the member: 2,001"));
  });

  describe("a link is never followed", () => {
    const lock = lockOf(["leak", "leak2"]);
    const layout = {
      "x/package.json": declaring("leak"),
      "svc/package.json": declaring("leak2"),
    };

    test("neither a workspace pattern's base nor a member that is a link", () => {
      const outside = app(layout);
      const dir = app({ "package.json": rootOf(["packages/*", "svc"]), "yarn.lock": lock });
      try {
        fs.symlinkSync(outside, path.join(dir, "packages"), "junction");
        fs.symlinkSync(path.join(outside, "svc"), path.join(dir, "svc"), "junction");
        const items = collectDependencies(dir).filter((i) => i.manifest === "yarn.lock");
        assert.deepEqual(
          directIn(Object.fromEntries(items.map((i) => [i.name, i])), ["leak", "leak2"]),
          [],
          "a pattern's base that is a link, and a member that is a link: neither is read",
        );
      } finally {
        // A junction is unlinked, never removed recursively (that would empty the folder it points to).
        for (const link of ["packages", "svc"])
          try {
            fs.unlinkSync(path.join(dir, link));
          } catch {
            // not created
          }
        fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });

    test("the same layout in real folders is read", () => {
      const files = {
        "package.json": rootOf(["packages/*", "svc"]),
        "packages/x/package.json": declaring("leak"),
        "svc/package.json": declaring("leak2"),
        "yarn.lock": lock,
      };
      assert.deepEqual(directOf(files, ["leak", "leak2"]), ["leak", "leak2"]);
    });
  });
});

describe("a manifest read beside a lock file", () => {
  const lock = lockOf(["left-pad"]);
  const MB4 = 4 * 1024 * 1024;
  const padded = (size) => {
    const json = JSON.stringify({ dependencies: { "left-pad": "^1" } });
    return json + " ".repeat(size - json.length);
  };

  test("4 MB are read, 4 MB and a byte are not", () => {
    assert.deepEqual(directOf({ "package.json": padded(MB4), "yarn.lock": lock }, ["left-pad"]), ["left-pad"]);
    assert.deepEqual(directOf({ "package.json": padded(MB4 + 1), "yarn.lock": lock }, ["left-pad"]), []);
  });

  describe("readBeside", () => {
    const dirs = [];
    const files = (list) => {
      const dir = app(list);
      dirs.push(dir);
      return dir;
    };
    const linked = [];
    test("an ordinary file inside the folder is read", () => {
      const dir = files({ "package.json": "{}", "svc/package.json": "{}" });
      assert.equal(readBeside(path.join(dir, "package.json")), "{}");
      assert.equal(readBeside(path.join(dir, "svc", "package.json"), { within: dir }), "{}");
    });

    test("a file outside the folder, a folder, and a missing file are not", () => {
      const dir = files({ "package.json": "{}" });
      const outside = files({ "x/package.json": "{}" });
      assert.equal(readBeside(path.join(outside, "x", "package.json"), { within: dir }), null, "outside the folder");
      assert.equal(readBeside(dir), null, "a folder");
      assert.equal(readBeside(path.join(dir, "nothing.json")), null, "a missing file");
    });

    test("a link, and a file reached through a link, are not", () => {
      const outside = files({ "svc/package.json": "{}" });
      const dir = files({ "package.json": "{}" });
      fs.symlinkSync(path.join(outside, "svc"), path.join(dir, "svc"), "junction");
      linked.push(path.join(dir, "svc"));
      assert.equal(readBeside(path.join(dir, "svc", "package.json"), { within: dir }), null, "through a link");
      assert.equal(readBeside(path.join(dir, "svc")), null, "a link is no ordinary file");
    });

    after(() => {
      // A junction is unlinked, never removed recursively (that would empty the folder it points to).
      for (const link of linked) fs.unlinkSync(link);
      for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
    });
  });
});

describe("one package, however its name is written (engine/core/packages.mjs)", () => {
  /** [ecosystem, name, key, why] */
  const KEYS = [
    ["pip", "My__Lib.x", "my-lib-x", "PEP 503: case aside, a run of '-', '_', '.' is one '-'"],
    ["pip", "my.lib", "my-lib", "'.' and '-' are one"],
    ["pip", "My-Lib", "my-lib", "case aside"],
    ["npm", "My_Lib", "My_Lib", "npm's registry tells names apart as written"],
    ["npm", "JSONStream", "JSONStream", "`JSONStream` is not `jsonstream`"],
  ];
  for (const [ecosystem, name, key, why] of KEYS)
    test(`${ecosystem} ${name} → ${key}`, () => assert.equal(packageKey(ecosystem, name), key, why));

  test("the first item with an exact version is kept, in the order of the first seen; two npm names in another case are two packages", () => {
    const kept = oncePerPackage([
      { name: "my_lib", version: null, spec: ">=1", ecosystem: "pip" },
      { name: "My-Lib", version: "1.2.0", ecosystem: "pip" },
      { name: "JSONStream", version: "1.3.5", ecosystem: "npm" },
      { name: "jsonstream", version: "0.0.1", ecosystem: "npm" },
      { name: "my-lib", version: "1.0.0", ecosystem: "npm" },
    ]);
    assert.deepEqual(
      kept.map((i) => `${i.ecosystem} ${i.name} ${i.version}`),
      ["pip My-Lib 1.2.0", "npm JSONStream 1.3.5", "npm jsonstream 0.0.1", "npm my-lib 1.0.0"],
    );
  });

  test("with no exact version anywhere, the first item is kept", () => {
    const kept = oncePerPackage([
      { name: "my_lib", version: null, spec: ">=1", ecosystem: "pip" },
      { name: "My-Lib", version: null, spec: "<3", ecosystem: "pip" },
    ]);
    assert.deepEqual(
      kept.map((i) => `${i.name} ${i.spec}`),
      ["my_lib >=1"],
    );
  });
});

describe("the chain of a transitive dependency (deps/graph.mjs)", () => {
  test("the shortest chain from a direct dependency; a cycle is visited once; a direct one has none", () => {
    const graph = new Map([
      ["a", ["b", "c"]],
      ["b", ["d"]],
      ["c", ["d", "a"]],
      ["d", ["b"]],
    ]);
    assert.deepEqual(
      [...viaChains(["a"], graph)],
      [
        ["b", ["a"]],
        ["c", ["a"]],
        ["d", ["a", "b"]],
      ],
    );
  });

  test("a chain of 12 names is kept, a deeper one is left out", () => {
    const long = new Map(Array.from({ length: 20 }, (_, i) => [`p${i}`, [`p${i + 1}`]]));
    const chains = viaChains(["p0"], long);
    assert.deepEqual(
      chains.get("p12"),
      Array.from({ length: 12 }, (_, i) => `p${i}`),
      "p12 comes in through 12 names",
    );
    assert.deepEqual(
      [...chains.keys()],
      Array.from({ length: 12 }, (_, i) => `p${i + 1}`),
      "p13 would need 13",
    );
  });

  test("a list of dependencies shared by several names is walked once, from the shallowest", () => {
    const shared = ["c"];
    const chains = viaChains(
      ["a", "b"],
      new Map([
        ["a", shared],
        ["b", shared],
      ]),
    );
    assert.deepEqual([...chains], [["c", ["a"]]]);
  });

  test("withVia gives a transitive item its chain and leaves a direct one as it is", () => {
    const graph = new Map([["a", ["b"]]]);
    const items = [
      { name: "a", direct: true },
      { name: "B", direct: false },
      { name: "z", direct: false },
    ];
    assert.deepEqual(
      withVia(items, ["a"], graph, (name) => name.toLowerCase()),
      [
        { name: "a", direct: true },
        { name: "B", direct: false, via: ["a"] },
        { name: "z", direct: false },
      ],
    );
  });
});

describe("a name shaped like a secret is never kept", () => {
  const token = "gh" + "p_" + "aB3dE5fG7hJ9".repeat(3);
  const files = (name, extra) => ({
    "package.json": { dependencies: { [name]: "^1" } },
    "yarn.lock": yarnLock(
      yarnBlock(`"${name}@^1"`, { name: "x", dependencies: { "left-pad": "1" } }),
      yarnBlock("left-pad@1"),
    ),
    "requirements.txt": `httpx[http2,${extra}]==0.27.0\n`,
  });

  test("a chain through it is left out whole, and such an extra is dropped; the same chain through an ordinary name is kept", () => {
    const ordinary = deps(files("corp-lib", "socks"));
    assert.deepEqual(ordinary["yarn.lock"]["left-pad"].via, ["corp-lib"], "the control keeps the chain");
    assert.deepEqual(ordinary["requirements.txt"].httpx.extras, ["http2", "socks"], "the control keeps the extras");

    const all = deps(files(token, token));
    assert.ok(!JSON.stringify(all).includes(token), "the name shaped like a secret appears nowhere");
    assert.deepEqual(Object.keys(all["yarn.lock"]), ["left-pad"], "its own item is dropped, the other is read");
    assert.equal(all["yarn.lock"]["left-pad"].via, undefined, "its chain is left out whole");
    assert.deepEqual(all["requirements.txt"].httpx.extras, ["http2"]);
  });
});
