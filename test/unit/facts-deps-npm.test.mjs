// The npm items of the dependencies source (engine/facts/deps/npm.mjs, deps/graph.mjs): what a package.json, a
// package-lock.json (v1, v2, v3), a pnpm-lock.yaml and a yarn.lock give — `direct`, `dev`, `via`, `version`, `spec`,
// `local` —, which lock entry gives a version, which specs name a place, and the odd shapes. What is sent to a
// registry for these items is tested in facts-network-*.test.mjs.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { expectSent, expectNothingSent, deps } from "../tools/deps-apps.mjs";
import { HOST, CH, tarball, packageJson, npmEntry, packageLockV3, v1Entry, packageLockV1 } from "../tools/locks.mjs";

/** The names of the items of one manifest (`{ name: item }`) whose `local` is true, sorted. */
const localNames = (items) =>
  Object.values(items)
    .filter((i) => i.local === true)
    .map((i) => i.name)
    .sort();

describe("a package.json: a version, a range, or a place", () => {
  test("a pinned version is a version; a range is kept as `spec`; a folder, a workspace, git is local", () => {
    const pkg = deps({
      "package.json": {
        dependencies: { a: "1.2.3", b: "^1.0.0", c: "file:../c", d: "workspace:*", e: "github:user/repo", g: "v2.0.0" },
        devDependencies: { f: "user/repo#main", h: "~3.1.0" },
      },
    })["package.json"];
    assert.deepEqual(pkg.a, {
      name: "a",
      version: "1.2.3",
      ecosystem: "npm",
      direct: true,
      dev: false,
      manifest: "package.json",
    });
    assert.equal(pkg.b.version, null, "a range is not an installed version");
    assert.equal(pkg.b.spec, "^1.0.0");
    assert.equal(pkg.g.version, "2.0.0");
    for (const name of ["c", "d", "e", "f"]) assert.equal(pkg[name].local, true, name);
    assert.equal(pkg.b.local, undefined);
    assert.equal(pkg.h.dev, true);
    assert.deepEqual(localNames(pkg), ["c", "d", "e", "f"], "exactly the places are local");
  });

  test("dependencies and optionalDependencies are not dev, devDependencies are", () => {
    const pkg = deps({
      "package.json": {
        dependencies: { a: "^1" },
        optionalDependencies: { fsevents: "^2" },
        devDependencies: { b: "^1" },
      },
    })["package.json"];
    assert.equal(pkg.fsevents.dev, false);
    assert.equal(pkg.fsevents.direct, true);
    assert.equal(pkg.a.dev, false);
    assert.equal(pkg.b.dev, true);
  });

  describe("a spec that names a place is local", () => {
    const PLACES = [
      ["a folder with ./", "./libs/a", "npm reads a path starting with ./ as a folder"],
      ["a folder two levels up", "../../libs/b", "a path starting with ../"],
      ["an absolute path", "/opt/c", "a path starting with /"],
      ["a home folder", "~/d", "npm expands ~ to the home folder"],
      ["a scp-like git address", "git@github.com:corp/e.git", "git over ssh, written without a scheme"],
      ["a gitlab: shorthand", "gitlab:corp/f", "npm's hosted git shorthand"],
      ["a bitbucket: shorthand", "bitbucket:corp/g", "npm's hosted git shorthand"],
      ["a Windows path", `C:${CH.BACKSLASH}libs${CH.BACKSLASH}h`, "a drive and backslashes: a folder on Windows"],
      ["'.'", ".", "the application's own folder"],
      ["'..'", "..", "the parent folder"],
      ["a drive-relative path 'c:lib'", "c:lib", "npm reads a drive letter and a colon as a Windows path"],
      ["a folder starting with a dot", ".hidden/lib", "a path with a slash is a folder"],
      ["a scoped name in the place of a range", "@corp/lib", "a spec holding a slash is a GitHub shorthand"],
      ["exec:", "exec:./tools/gen-ui.js", "any protocol but npm: and patch: is a place"],
      ["exec: without a path", "exec:gen-ui.js", "any protocol but npm: and patch: is a place"],
      ["ssh://", "ssh://git@git.corp.internal/corp/ui.git", "a git address"],
    ];
    for (const [label, spec, why] of PLACES)
      test(`${label} (${why})`, () => {
        const pkg = deps({ "package.json": packageJson({ lib: spec, react: "^18.0.0" }) })["package.json"];
        assert.equal(pkg.lib.local, true, label);
        assert.equal(pkg.react.local, undefined, "control: a range next to it is no place");
      });

    for (const archive of ["corp-1.0.0.tgz", "corp.tar.gz", "corp.tar", "CORP.TGZ"])
      test(`an archive named alone (${archive}) is a local file`, () => {
        const pkg = deps({ "package.json": packageJson({ a: archive, "tgz-utils": "^1.0.0" }) })["package.json"];
        assert.equal(pkg.a.local, true, archive);
        assert.equal(pkg["tgz-utils"].local, undefined, "a name holding 'tgz' is no archive");
      });
  });

  describe("a spec that names no place is not local", () => {
    const RANGES = ["^1.2.3", "~3.1.0", ">=1 <2", "1.x", "latest", "*", "1.2.3 - 2.0.0", "^1.0.0 || ^2.0.0"];
    const npmFiles = { "package.json": { dependencies: Object.fromEntries(RANGES.map((spec, i) => [`p${i}`, spec])) } };

    test("the usual npm ranges are no places", () => {
      const pkg = deps(npmFiles)["package.json"];
      assert.deepEqual(Object.keys(pkg).sort(), RANGES.map((_, i) => `p${i}`).sort());
      assert.deepEqual(localNames(pkg), []);
      for (const [i, spec] of RANGES.entries()) assert.equal(pkg[`p${i}`].local, undefined, spec);
    });

    test("the usual pip ranges are no places either, and all these names are sent once proven", async () => {
      const files = {
        ...npmFiles,
        "requirements.txt": "a~=2.0\nb==1.*\nc>=1,<2\nd[extra]==1.0 ; python_version >= '3.9'\ne\n",
      };
      const all = deps(files);
      assert.deepEqual(Object.keys(all["requirements.txt"]).sort(), ["a", "b", "c", "d", "e"]);
      assert.deepEqual(localNames(all["requirements.txt"]), []);
      await expectSent(files, [...RANGES.map((_, i) => `npm p${i}`), "pip a", "pip b", "pip c", "pip d", "pip e"], {
        proof: "all",
      });
    });

    test("an npm alias names no place: its item is not local (the second net keeps it back, not the facts)", () => {
      const pkg = deps({ "package.json": packageJson({ alias: "npm:react@18.3.1" }) })["package.json"];
      assert.equal(pkg.alias.local, undefined);
      assert.equal(pkg.alias.spec, "npm:react@18.3.1");
    });
  });

  test("an alias without a version, a patch: and berry's npm:^18 are no places; exec: and ssh:// are", () => {
    const pkg = deps({
      "package.json": {
        dependencies: {
          a: "npm:@corp/ui",
          b: "npm:corp-ui-impl",
          c: "exec:./tools/gen-ui.js",
          g: "exec:gen-ui.js",
          d: "ssh://git@git.corp.internal/corp/ui.git",
          e: "patch:react@npm%3A18.3.1#./patches/react.patch",
          f: "npm:^18.0.0",
          react: "^18.0.0",
        },
      },
    })["package.json"];
    for (const name of ["c", "d", "g"]) assert.equal(pkg[name].local, true, name);
    for (const name of ["b", "f", "react"]) assert.equal(pkg[name].local, undefined, name);
    assert.deepEqual(Object.keys(pkg).sort(), ["a", "b", "c", "d", "e", "f", "g", "react"]);
  });

  test("a spec holding a slash is a folder in the manifest that wrote it, a range elsewhere is not", () => {
    const all = deps({
      "package.json": { workspaces: ["web"], dependencies: { "corp-lib": "@corp/lib" } },
      "web/package.json": { dependencies: { "corp-lib": "^1.0.0", react: "^18" } },
    });
    assert.equal(all["package.json"]["corp-lib"].local, true);
    assert.equal(all["web/package.json"]["corp-lib"].local, undefined, "the member's own range is no place");
    assert.equal(all["web/package.json"].react.local, undefined);
  });

  test("a place is not sent, the range beside it is", async () => {
    await expectSent(
      { "package.json": packageJson({ a: ".", b: "..", c: "c:lib", d: ".hidden/lib", react: "^18.0.0" }) },
      ["npm react"],
      { proof: "all" },
    );
    await expectSent(
      {
        "package.json": packageJson({
          a: "corp-1.0.0.tgz",
          b: "corp.tar.gz",
          c: "corp.tar",
          d: "CORP.TGZ",
          "tgz-utils": "^1.0.0",
        }),
      },
      ["npm tgz-utils"],
      { proof: "all" },
    );
  });
});

describe("a package-lock.json: direct, dev and via", () => {
  const CHAIN = {
    "node_modules/express": npmEntry("express", { version: "4.19.2", dependencies: { "body-parser": "1" } }),
    "node_modules/body-parser": npmEntry("body-parser", { version: "1.20.2", dependencies: { "raw-body": "2" } }),
    "node_modules/raw-body": npmEntry("raw-body", { version: "2.5.2" }),
  };

  test("v3: the workspace members' dependencies are direct too; each transitive one has its chain", () => {
    const lock = deps({
      "package-lock.json": {
        lockfileVersion: 3,
        packages: {
          "": { name: "root", workspaces: ["packages/*"], dependencies: { express: "^4" } },
          "packages/web": { name: "web", dependencies: { axios: "^1" }, devDependencies: { vitest: "^1" } },
          "node_modules/web": { resolved: "packages/web", link: true },
          "node_modules/express": { version: "4.19.2", dependencies: { "body-parser": "1" } },
          "node_modules/body-parser": { version: "1.20.2", dependencies: { "raw-body": "2" } },
          "node_modules/raw-body": { version: "2.5.2" },
          "node_modules/axios": { version: "1.7.2", dependencies: { "follow-redirects": "^1" } },
          "node_modules/follow-redirects": { version: "1.15.6" },
          "node_modules/vitest": { version: "1.6.0", dev: true },
        },
      },
    })["package-lock.json"];
    assert.equal(lock.axios.direct, true, "a dependency of a workspace member");
    assert.equal(lock.vitest.direct, true);
    assert.equal(lock.vitest.dev, true);
    assert.deepEqual(lock["follow-redirects"].via, ["axios"]);
    assert.deepEqual(lock["raw-body"].via, ["express", "body-parser"], "the whole chain from the direct one");
    assert.equal(lock.express.via, undefined, "a direct one has none");
    assert.deepEqual(Object.keys(lock).sort(), [
      "axios",
      "body-parser",
      "express",
      "follow-redirects",
      "raw-body",
      "vitest",
      "web",
    ]);
    assert.deepEqual(
      Object.values(lock)
        .filter((i) => i.direct)
        .map((i) => i.name)
        .sort(),
      ["axios", "express", "vitest"],
      "exactly the declared ones are direct",
    );
  });

  for (const version of [2, 3])
    test(`v${version}: the root's dependencies are direct, the others transitive with their chain`, () => {
      const lock = deps({ "package-lock.json": packageLockV3({ express: "^4" }, CHAIN, { version }) })[
        "package-lock.json"
      ];
      assert.equal(lock.express.direct, true);
      assert.equal(lock["body-parser"].direct, false);
      assert.deepEqual(lock["body-parser"].via, ["express"]);
      assert.deepEqual(lock["raw-body"].via, ["express", "body-parser"]);
    });

  describe("the dependencies of a `file:` link target (ARCHITECTURE.md §6.9)", () => {
    for (const target of ["libs/x", "../shared"])
      for (const version of [2, 3])
        test(`v${version}: those of ${target} are direct, a dev one is dev, a package nothing declares is not`, () => {
          const lock = deps({
            "package-lock.json": packageLockV3(
              {},
              {
                "node_modules/x": { resolved: target, link: true },
                [target]: { name: "x", version: "1.0.0", dependencies: { a: "^1" }, devDependencies: { b: "^1" } },
                "node_modules/a": npmEntry("a"),
                "node_modules/b": npmEntry("b", { dev: true }),
                "node_modules/z": npmEntry("z"),
              },
              { version },
            ),
          })["package-lock.json"];
          assert.equal(lock.a.direct, true, `a dependency of ${target}`);
          assert.equal(lock.a.dev, false, "a");
          assert.equal(lock.b.direct, true, `a devDependency of ${target}`);
          assert.equal(lock.b.dev, true, "b");
          assert.equal(lock.z.direct, false, "control: declared by nobody");
        });

    test("v1: a link's own dependencies are not direct (the lock has no entry for the target)", () => {
      const lock = deps({
        "package.json": packageJson({ x: "file:libs/x" }),
        "libs/x/package.json": packageJson({ a: "^1" }),
        "package-lock.json": packageLockV1({
          x: { version: "file:libs/x", requires: { a: "^1" } },
          a: v1Entry("a"),
        }),
      })["package-lock.json"];
      assert.equal(lock.x.direct, true, "the link itself is declared by the package.json beside the lock");
      assert.equal(lock.x.local, true);
      assert.equal(lock.a.direct, false, "libs/x is no workspace: its package.json is not read");
      assert.deepEqual(lock.a.via, ["x"]);
    });
  });

  describe("a v1 lock and a yarn.lock take `direct` from the package.json beside them", () => {
    test("v1: direct and dev from the manifest, their chains from `requires`", () => {
      const v1 = deps({
        "package.json": { dependencies: { express: "^4" }, devDependencies: { jest: "^29" } },
        "package-lock.json": {
          lockfileVersion: 1,
          dependencies: {
            express: { version: "4.19.2", requires: { "body-parser": "1" } },
            "body-parser": { version: "1.20.2" },
            jest: { version: "29.7.0", dev: true },
          },
        },
      })["package-lock.json"];
      assert.equal(v1.express.direct, true);
      assert.equal(v1["body-parser"].direct, false);
      assert.deepEqual(v1["body-parser"].via, ["express"]);
      assert.equal(v1.jest.dev, true);
      assert.equal(v1.jest.direct, true);
    });

    test("yarn.lock: direct from the manifest, their chains from the block's dependencies", () => {
      const yarn = deps({
        "package.json": { dependencies: { "@scope/ui": "^1" } },
        "yarn.lock": [
          '"@scope/ui@^1":\n  version "1.0.0"\n  resolved "https://registry.yarnpkg.com/@scope/ui/-/ui-1.0.0.tgz"\n  dependencies:\n    "@scope/core" "^2"\n    left-pad "1"\n',
          '"@scope/core@^2":\n  version "2.0.0"\n  resolved "https://registry.yarnpkg.com/@scope/core/-/core-2.0.0.tgz"\n',
          'left-pad@1:\n  version "1.3.0"\n  resolved "https://registry.yarnpkg.com/left-pad/-/left-pad-1.3.0.tgz"\n',
        ].join("\n"),
      })["yarn.lock"];
      assert.equal(yarn["@scope/ui"].direct, true);
      assert.deepEqual(yarn["@scope/core"].via, ["@scope/ui"]);
      assert.deepEqual(yarn["left-pad"].via, ["@scope/ui"]);
      assert.equal(yarn["@scope/core"].direct, false);
      assert.equal(yarn["left-pad"].direct, false);
    });
  });
});

describe("a pnpm-lock.yaml: every importer's dependencies are direct", () => {
  test("a devDependency of one importer, a dependency of another, is not dev", () => {
    const pnpm = deps({
      "pnpm-lock.yaml": [
        "lockfileVersion: '9.0'",
        "importers:",
        "  .:",
        "    devDependencies:",
        "      typescript:",
        "        specifier: ^5",
        "        version: 5.4.5",
        "  packages/api:",
        "    dependencies:",
        "      fastify:",
        "        specifier: ^4",
        "        version: 4.28.0",
        "      typescript:",
        "        specifier: ^5",
        "        version: 5.4.5",
        "packages:",
        "  fastify@4.28.0:",
        "    resolution: {integrity: sha512-x}",
        "  typescript@5.4.5:",
        "    resolution: {integrity: sha512-y}",
        "",
      ].join("\n"),
    })["pnpm-lock.yaml"];
    assert.equal(pnpm.fastify.direct, true, "a member's dependency");
    assert.equal(pnpm.fastify.dev, false);
    assert.equal(pnpm.typescript.direct, true);
    assert.equal(pnpm.typescript.dev, false, "a dependency of packages/api");
    assert.deepEqual(Object.keys(pnpm).sort(), ["fastify", "typescript"]);
  });
});

describe("a yarn.lock: a block taken from a folder is local", () => {
  const FILES = {
    "package.json": { workspaces: ["build/*", "packages/*"] },
    "build/tool/package.json": { dependencies: { "corp-file-lib": "file:../lib" } },
    "packages/web/package.json": { dependencies: { "left-pad": "^1" } },
    "yarn.lock":
      '"corp-file-lib@file:../lib":\n  version "1.0.0"\n\nleft-pad@^1:\n  version "1.3.0"\n  resolved "https://registry.yarnpkg.com/left-pad/-/left-pad-1.3.0.tgz"\n',
  };

  test("a v1 `file:` block with no resolved line is local; a member in build/ is not read", () => {
    const lock = deps(FILES)["yarn.lock"];
    assert.equal(lock["corp-file-lib"].local, true);
    assert.equal(lock["corp-file-lib"].direct, false, "build/ is no workspace folder the kit reads");
    assert.equal(lock["left-pad"].direct, true);
    assert.equal(lock["left-pad"].local, undefined, "control: the block resolved on the registry is no place");
  });

  test("only the registry block is sent", async () => {
    await expectSent(FILES, ["npm left-pad"], { proof: "all" });
  });
});

describe("a package-lock v1 taken from a private registry is local", () => {
  test("the item is local and nothing is sent for it", async () => {
    const files = {
      "package.json": packageJson({ "corp-reg-lib": "^1" }),
      "package-lock.json": packageLockV1({ "corp-reg-lib": v1Entry("corp-reg-lib", { host: HOST.corpNpm }) }),
    };
    assert.equal(deps(files)["package-lock.json"]["corp-reg-lib"].local, true);
    await expectNothingSent(files, {}, { proof: "all" });
  });
});

describe("which lock entry gives the version", () => {
  const own = (name, version = "1.0.0") => tarball(name, { version });

  test("v3: the top-level entry is the package's own; a nested copy npm sorts before it is only a later word", () => {
    const lock = {
      lockfileVersion: 3,
      packages: {
        "": { dependencies: { bundler: "^1.0.0", "is-number": "^6.0.0" } },
        "node_modules/bundler": { version: "1.0.0", resolved: own("bundler"), bundleDependencies: ["is-number"] },
        "node_modules/bundler/node_modules/is-number": { version: "7.0.0", inBundle: true },
        "node_modules/is-number": { version: "6.0.0", resolved: own("is-number", "6.0.0") },
      },
    };
    const item = deps({ "package-lock.json": lock })["package-lock.json"]["is-number"];
    assert.equal(item.public, true);
    assert.equal(item.version, "6.0.0");
  });

  const V3 = {
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { "is-odd": "^2.0.0" } },
      "../shared/node_modules/is-odd": { version: "3.0.1", resolved: own("is-odd", "3.0.1") },
      "node_modules/is-odd": { version: "2.0.0", resolved: own("is-odd", "2.0.0") },
    },
  };
  const V1 = {
    lockfileVersion: 1,
    dependencies: {
      a: {
        version: "1.0.0",
        resolved: own("a"),
        dependencies: { "is-odd": { version: "3.0.1", resolved: own("is-odd", "3.0.1") } },
      },
      "is-odd": { version: "2.0.0", resolved: own("is-odd", "2.0.0") },
    },
  };
  for (const [label, lock] of [
    ["v3: before a copy outside the root", V3],
    ["v1: before a copy nested in another package", V1],
  ])
    test(`the root's own top-level entry gives the version, ${label}`, () => {
      assert.equal(deps({ "package-lock.json": lock })["package-lock.json"]["is-odd"].version, "2.0.0", label);
    });

  test("v1, read level by level: the shallower nested copy gives the version, whichever parent comes first", () => {
    // b at the second level under x, at the third under a (through c): a deeper copy is never the package's own.
    const entry = (name, dependencies) => ({ version: "1.0.0", resolved: own(name), dependencies });
    const lock = (order) =>
      packageLockV1(
        Object.fromEntries(
          order.map((parent) =>
            parent === "x"
              ? ["x", entry("x", { b: { version: "2.0.0", resolved: own("b", "2.0.0") } })]
              : ["a", entry("a", { c: entry("c", { b: { version: "3.0.0", resolved: own("b", "3.0.0") } }) })],
          ),
        ),
      );
    for (const order of [
      ["x", "a"],
      ["a", "x"],
    ])
      assert.equal(deps({ "package-lock.json": lock(order) })["package-lock.json"].b.version, "2.0.0", order.join());
  });
});
