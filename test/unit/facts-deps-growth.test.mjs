// test/tools/run-plan.mjs runs this file alone, after the others (it imports test/tools/growth.mjs: it measures time).
// The readers of the dependencies source (RULES.md S5) stay linear on the shapes that once made them quadratic: each
// input is built at a base size, then 4 and 16 times larger (assertLinear, test/tools/growth.mjs), no absolute time.
// A reader that gives up early would be "linear" by doing nothing, so every test also asserts what the reader found
// at the largest size it was measured on.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { membersOf } from "../../engine/facts/deps/workspaces.mjs";
import { collectDependencies, dependencyReader } from "../../engine/facts/dependencies.mjs";
import { privateRegistries } from "../../engine/facts/network.mjs";
import { linearAt, assertLinear } from "../tools/growth.mjs";
import { tempDir } from "../tools/helpers.mjs";
import { app } from "../tools/deps-apps.mjs";
import { HOST, tarball } from "../tools/locks.mjs";
import { manifestShapes, READER_NAMES } from "../tools/manifest-shapes.mjs";

const readAll = (dir) => ({ items: collectDependencies(dir), registries: privateRegistries(dir, { env: {} }) });

/** `files(n)` written as an application per size, read by `read` (the items by default), then removed. */
function linearApp(label, { size, files, read = (dir) => ({ items: collectDependencies(dir) }) }) {
  return linearAt(label, {
    size,
    make: (n) => app(files(n)),
    read,
    remove: (dir) => fs.rmSync(dir, { recursive: true, force: true }),
  });
}

const sorted = (list) => [...list].sort();
const names = (n) => Array.from({ length: n }, (_, i) => `p${i}`);
const itemNames = (items) => sorted(items.map((i) => i.name));

describe("the workspace patterns stay linear in the folders and the patterns (deps/workspaces.mjs)", () => {
  test("one long '*' pattern of 8 segments against many folders: every comparison is a prefix and a suffix", () => {
    const seg = `${"a".repeat(49)}*${"a".repeat(50)}`;
    const patterns = Array.from({ length: 50 }, (_, i) => `**/**/**/**/**/**/${seg}/${"b".repeat(i + 1)}`);
    const control = [`${"a".repeat(49)}X${"a".repeat(50)}`, "b"];
    const { found } = linearAt("workspace patterns against folders", {
      size: 125,
      make: (n) => [...Array.from({ length: n }, (_, i) => ["a".repeat(150) + i, "a".repeat(200), "c"]), control],
      read: (folders) => membersOf(patterns, folders),
    });
    assert.deepEqual(found, [control], "only the folder the pattern fits is a member: the others were compared");
  });

  test("a package.json naming the same pattern many times is read once: the bound of patterns costs nothing", () => {
    const lock = (list) =>
      list.map((n) => `${n}@^1:\n  version "1.0.0"\n  resolved "${HOST.yarn}/${n}/-/${n}-1.0.0.tgz"\n`).join("\n");
    const { found } = linearApp("workspace patterns written many times", {
      size: 250,
      files: (n) => ({
        "package.json": { workspaces: [...Array(n).fill("src/*"), "packages/*/sub", "apps/*", "!apps/legacy"] },
        "packages/a/sub/package.json": { dependencies: { deep: "^1" } },
        "packages/a/package.json": { dependencies: { shallow: "^1" } },
        "apps/web/package.json": { dependencies: { kept: "^1" } },
        "apps/legacy/package.json": { dependencies: { dropped: "^1" } },
        "yarn.lock": lock(["deep", "shallow", "kept", "dropped"]),
      }),
    });
    const direct = Object.fromEntries(
      found.items.filter((i) => i.manifest === "yarn.lock" && i.version).map((i) => [i.name, i.direct]),
    );
    assert.deepEqual(direct, { deep: true, shallow: false, kept: true, dropped: false });
  });
});

describe("a lock of many duplicates stays linear: a name from another place makes every entry of it local", () => {
  const ROWS = [
    [
      "package-lock.json",
      (n) => {
        const packages = { "": { dependencies: {} } };
        for (const p of names(n)) {
          packages[""].dependencies[p] = "^1";
          packages[`node_modules/${p}`] = { version: "1.0.0", resolved: tarball(p) };
          packages[`node_modules/q/node_modules/${p}`] = {
            version: "2.0.0",
            resolved: tarball(p, { host: HOST.corpNpm }),
          };
        }
        return JSON.stringify({ lockfileVersion: 3, packages });
      },
      "the same name at two locations, the second from another registry",
      // Larger: at 16 times 400 a lookup by a scan of every item (markLocal) still hides in the linear part.
      1000,
    ],
    [
      "yarn.lock",
      (n) =>
        names(n)
          .map((p) => `${p}@^1:\n  version "1.0.0"\n  resolved "${tarball(p)}"\n\n${p}@file:../p:\n  version "2.0.0"\n`)
          .join("\n"),
      "the same name as a registry block and as a folder block",
    ],
    [
      "uv.lock",
      (n) =>
        names(n)
          .map(
            (p) =>
              `[[package]]\nname = "${p}"\nversion = "1.0.0"\nsource = { registry = "https://pypi.org/simple" }\n\n` +
              `[[package]]\nname = "${p}"\nversion = "2.0.0"\nsource = { registry = "https://pypi.corp.internal/simple" }\n`,
          )
          .join("\n"),
      "the same name from PyPI and from a private index",
    ],
    [
      "poetry.lock",
      (n) =>
        names(n)
          .map(
            (p) =>
              `[[package]]\nname = "${p}"\nversion = "1.0.0"\n\n` +
              `[[package]]\nname = "${p}"\nversion = "2.0.0"\n\n[package.source]\ntype = "legacy"\nurl = "https://pypi.corp.internal/simple"\n`,
          )
          .join("\n"),
      "the same name with and without a private source",
    ],
  ];
  for (const [file, shape, why, size = 400] of ROWS) {
    test(`${file}: ${why}`, () => {
      const { n, found } = linearApp(file, { size, files: (count) => ({ [file]: shape(count) }) });
      assert.deepEqual(itemNames(found.items), sorted(names(n)), `${file}: every name read once`);
      assert.deepEqual(
        found.items.filter((i) => i.public || i.local !== true).map((i) => i.name),
        [],
        `${file}: every name local, a duplicate came from elsewhere`,
      );
    });
  }
});

describe("a field written many times stays linear: Poetry's dotted keys and its list of constraints", () => {
  const ROWS = [
    ["dotted keys", (n) => `[tool.poetry.dependencies]\n${'x.version = "1"\n'.repeat(n)}y = "2"\n`, 2500],
    [
      "a list of constraints",
      (n) => `[tool.poetry.dependencies]\nx = [${'{ version = "1" }, '.repeat(n)}]\ny = "2"\n`,
      625,
    ],
  ];
  for (const [form, shape, size] of ROWS) {
    test(form, () => {
      const { found } = linearApp(form, { size, files: (n) => ({ "pyproject.toml": shape(n) }) });
      assert.deepEqual(
        found.items.map((i) => [i.name, i.version]),
        [
          ["x", "1"],
          ["y", "2"],
        ],
        "the written field's version read, and the dependency after it",
      );
    });
  }
});

describe("a yarn.lock of long headers stays linear: its tarball is read once, a list of children is walked once", () => {
  const manifest = { dependencies: { root: "1", a: "1" } };
  const lockItems = (found) => found.items.filter((i) => i.manifest === "yarn.lock");

  test("a long header and tarball: one header naming a package n times, its `resolved` 5n characters long", () => {
    const { found } = linearApp("yarn.lock a long header", {
      size: 500,
      files: (n) => ({
        "package.json": manifest,
        "yarn.lock": `${Array(n).fill("a@1").join(", ")}:\n  version "1.0.0"\n  resolved "${tarball("a", { host: HOST.yarn })}#${"f".repeat(5 * n)}"\n`,
      }),
    });
    assert.deepEqual(
      lockItems(found).map((i) => [i.name, i.version, i.public]),
      [["a", "1.0.0", true]],
      "the tarball is the name's own: proven",
    );
  });

  test("a header sharing its children: n names in one header, one list of n children", () => {
    const { n, found } = linearApp("yarn.lock a shared list of children", {
      size: 500,
      files: (count) => {
        const as = Array.from({ length: count }, (_, i) => `a${i}`);
        return {
          "package.json": manifest,
          "yarn.lock":
            `root@1:\n  version "1.0.0"\n  resolved "${tarball("root", { host: HOST.yarn })}"\n  dependencies:\n${as.map((a) => `    ${a} "1"`).join("\n")}\n\n` +
            `${as.map((a) => `${a}@1`).join(", ")}:\n  version "1.0.0"\n  resolved "${tarball("a0", { host: HOST.yarn })}"\n  dependencies:\n${as.map((_, i) => `    c${i} "1"`).join("\n")}\n`,
        };
      },
    });
    const read = Object.fromEntries(lockItems(found).map((i) => [i.name, i.public === true]));
    assert.equal(Object.keys(read).length, n + 1, "root and every name of the header");
    assert.equal(read.root, true);
    assert.equal(read.a0, true, "the one name the tarball is its own");
    assert.equal(read.a1, false, "a name the tarball is not its own proves nothing");
  });
});

describe("a long TOML table name stays linear over many keys", () => {
  const long = "x".repeat(17000);
  const keys = (n) => Array.from({ length: n }, (_, i) => `k${i} = "1"`).join("\n");

  test("pyproject.toml: a 17,000-character table next to Poetry's dependencies is a doubt about every pip package", () => {
    const { found } = linearApp("pyproject.toml a long table name", {
      size: 250,
      files: (n) => ({
        "pyproject.toml": `[tool.poetry.dependencies]\nfastapi = "^0.110"\n\n[tool.${long}]\n${keys(n)}\n\n[tool.poetry.group.dev.dependencies]\npytest = "^8"\n`,
      }),
      read: readAll,
    });
    assert.deepEqual(itemNames(found.items), ["fastapi", "pytest"], "the dependency after the long table is read");
    assert.equal(found.registries.pipAll, true, "the doubt");
  });

  test("poetry.lock: the same table in a lock leaves its package read and declares nothing", () => {
    const { found } = linearApp("poetry.lock a long table name", {
      size: 250,
      files: (n) => ({
        "poetry.lock": `[[package]]\nname = "fastapi"\nversion = "0.110.0"\n\n[package.${long}]\n${keys(n)}\n\n[[package]]\nname = "flask"\nversion = "3.0.0"\n`,
      }),
      read: readAll,
    });
    assert.deepEqual(
      found.items.map((i) => [i.name, i.version]),
      [
        ["fastapi", "0.110.0"],
        ["flask", "3.0.0"],
      ],
      "the package after the long table is read too",
    );
    assert.equal(found.registries.pipAll, false, "a lock declares no private index");
  });
});

describe("a TOML name over 1,000 characters stays linear through both readers: what it holds is left out", () => {
  const long = "g".repeat(17000);
  /** A dependency after the long name: the reader goes on past it. */
  const AFTER = '\n[tool.poetry.dependencies]\nflask = "^3"\n';
  const keys = (n) => Array.from({ length: n }, (_, i) => `k${i} = "1"`).join("\n");
  const ROWS = [
    [
      "a Poetry group",
      (n) => `[tool.poetry]\nname = "app"\n\n[tool.poetry.group.${long}.dependencies]\n${keys(n)}\n`,
      "a group name that long is never followed",
    ],
    [
      "a uv source",
      (n) => `[project]\nname = "app"\n\n[tool.uv.sources.${long}]\n${keys(n)}\n`,
      "a source name that long is never followed",
    ],
    [
      "an inline key",
      (n) =>
        `[tool.uv]\nsources = { "${long}" = { ${Array.from({ length: n }, (_, i) => `k${i} = 1`).join(", ")} } }\n`,
      "an inline key that long is never followed",
    ],
  ];
  for (const [form, shape, why] of ROWS) {
    test(`${form}: ${why}`, () => {
      const { found } = linearApp(form, {
        size: 250,
        files: (n) => ({ "pyproject.toml": `${shape(n)}${AFTER}` }),
        read: readAll,
      });
      assert.deepEqual(
        itemNames(found.items),
        ["flask"],
        "what the long name holds is left out, the entry after it is read",
      );
      assert.equal(found.registries.pipAll, true, "the file is a doubt: every pip package private");
    });
  }
});

describe("package-lock v1 stays linear in its depth: a deep chain is read level by level", () => {
  const level = {
    chain: (i) => `{"p${i}":{"version":"1.0.0","resolved":"${tarball(`p${i}`)}","dependencies":`,
    links: (i) => `{"p${i}":{"version":"file:./d${i}","dependencies":`,
  };
  const lockOf = (form, n) =>
    `{"lockfileVersion":1,"dependencies":${Array.from({ length: n }, (_, i) => level[form](i)).join("")}{}${"}}".repeat(n)}}`;

  test("a chain of registry packages, 10,000 levels deep at the largest size", () => {
    const { n, found } = linearApp("package-lock v1 chain", {
      size: 625,
      files: (count) => ({ "package-lock.json": lockOf("chain", count) }),
    });
    // 16 times 625 at least (a fast machine measures longer chains): never less than the 10,000 levels promised.
    assert.ok(n >= 10000, `measured up to ${n} levels`);
    assert.deepEqual(itemNames(found.items), sorted(names(n)), "every level read");
    assert.deepEqual(
      found.items.filter((i) => i.public !== true),
      [],
      "every level proven",
    );
  });

  test("a chain of links to folders: every level local", () => {
    const { n, found } = linearApp("package-lock v1 links", {
      size: 625,
      files: (count) => ({ "package-lock.json": lockOf("links", count) }),
    });
    assert.deepEqual(itemNames(found.items), sorted(names(n)));
    assert.deepEqual(
      found.items.filter((i) => i.local !== true || i.public).map((i) => i.name),
      [],
      "every level a folder, none sent",
    );
  });
});

describe("the readers of the manifests stay linear on what a crafted file holds (dependencies.mjs)", () => {
  // facts-deps-ecosystems.test.mjs › "every reader of the dependencies source reads the crafted shapes without
  // throwing": the same shapes (test/tools/manifest-shapes.mjs) at the base size there; here 4 and 16 times larger.
  test("every reader of a manifest stays linear on characters built to make it backtrack", () => {
    const SIZE = 12_500;
    const names = READER_NAMES;
    const shapesAt = manifestShapes;
    // The shapes of the three first sizes are kept (every reader reads each of them); longer ones are built when needed.
    const memo = new Map();
    const shapesOf = (n) => {
      if (n > 16 * SIZE) return shapesAt(n);
      if (!memo.has(n)) memo.set(n, shapesAt(n));
      return memo.get(n);
    };
    const dir = tempDir("doc-kit-deps-growth-");
    try {
      for (const [i, sample] of shapesOf(SIZE).entries())
        for (const name of names)
          assertLinear(`${name} on ${JSON.stringify(sample.slice(0, 30))}…`, {
            size: SIZE,
            build: (n) => {
              const file = path.join(dir, `manifest-${n}`);
              fs.writeFileSync(file, shapesOf(n)[i]);
              return file;
            },
            run: (file) => assert.doesNotThrow(() => dependencyReader(name)(file, name, [])),
          });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // stacks-hardening.test.mjs › "a Gemfile of blocks never closed is read in linear time" (512,000 characters, was
  // under 1,000 ms each)
  test("a Gemfile of blocks never closed: each gem in them is read once", () => {
    for (const unit of ['group :test do\n  gem "a"\n', 'if x\ngem "a"\n']) {
      const { at16 } = linearApp(`Gemfile of ${JSON.stringify(unit)}`, {
        size: 32_000,
        files: (n) => ({ Gemfile: unit.repeat(Math.ceil(n / unit.length)) }),
      });
      assert.equal(at16.items[0].dev, unit.startsWith("group"), "the gems of the block are dev ones, or not");
    }
  });
});
