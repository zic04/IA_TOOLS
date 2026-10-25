// --network and package-lock.json (engine/facts/deps/npm.mjs): a name is sent to npm's registry only when a lock
// proves the public registry served it, and the lock is read as npm reads it. The proof is the name's own tarball on a
// public npm registry, in every entry of the name, at locations npm resolves to distinct folders, in a lock npm
// reads. Words: see test/tools/deps-apps.mjs (proven, unproven, private, sent).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { collectDependencies } from "../../engine/facts/dependencies.mjs";
import {
  HOST,
  CH,
  tarball,
  registryUrl,
  packageJson,
  npmEntry,
  packageLockV3,
  v1Entry,
  packageLockV1,
} from "../tools/locks.mjs";
import { network, withApp, deps, expectSent, expectNothingSent, expectProofDropped } from "../tools/deps-apps.mjs";

const LOCK = "package-lock.json";
const RANGE = "^1.0.0";
const NAME = "corp-lib";
/** A package-lock entry npm writes for a package it did not download (a bundled one, a hand-written one). */
const NO_TARBALL = Object.freeze({ version: "1.0.0", integrity: "sha512-BBBB" });
const KEY = (name) => `node_modules/${name}`;

/**
 * An application whose package.json declares `declared` (default: the names of `top`) and whose package-lock.json, of
 * the given version (1, 2 or 3), holds `top` (`{ name: entry }`) at its top level and, in v2 and v3, `more` (extra
 * `{ location: entry }`).
 */
function lockApp(version, top, { more = {}, declared = Object.keys(top) } = {}) {
  const ranges = Object.fromEntries(declared.map((name) => [name, RANGE]));
  const lock =
    version === 1
      ? packageLockV1(top)
      : packageLockV3(
          ranges,
          { ...Object.fromEntries(Object.entries(top).map(([n, e]) => [KEY(n), e])), ...more },
          { version },
        );
  return { "package.json": packageJson(ranges), [LOCK]: lock };
}

const VERSIONS = [1, 2, 3];

describe("an npm lock proves a name by the name's own tarball on a public npm registry", () => {
  for (const version of VERSIONS)
    test(`package-lock v${version}: the tarball of npm's registry proves the name, sent once`, async () => {
      const result = await expectSent(lockApp(version, { react: npmEntry("react", { version: "18.3.1" }) }), [
        "npm react",
      ]);
      assert.deepEqual(result.urls, [registryUrl("npm", "react")]);
    });

  test("the tarball of the Yarn registry proves a name in a package-lock too (both are public npm registries)", async () => {
    await expectSent(lockApp(3, { react: npmEntry("react", { host: HOST.yarn }) }), ["npm react"]);
  });

  for (const version of VERSIONS) {
    const rows = [
      [
        "another registry's tarball: private",
        () => npmEntry(NAME, { host: HOST.corpNpm }),
        "private",
        "a company's registry",
      ],
      [
        "no tarball at all: unproven",
        () => NO_TARBALL,
        "unproven",
        "a hand-written or bundled entry: nothing says who served it",
      ],
    ];
    for (const [label, entry, reason, why] of rows)
      test(`package-lock v${version}: ${label}`, async () => {
        await expectProofDropped({
          base: lockApp(version, { [NAME]: npmEntry(NAME) }),
          changed: lockApp(version, { [NAME]: entry() }),
          name: `npm ${NAME}`,
          reason,
          label: why,
        });
      });
  }

  for (const version of [2, 3])
    test(`package-lock v${version}: a link to a folder (a workspace member) is private`, async () => {
      await expectProofDropped({
        base: lockApp(version, { [NAME]: npmEntry(NAME) }),
        changed: lockApp(version, { [NAME]: { resolved: "libs/corp-lib", link: true } }),
        name: `npm ${NAME}`,
        reason: "private",
        label: "link: true",
      });
    });

  test("a mixed lock sends only the name npm's registry served; each other name is kept back for its reason", async () => {
    const files = lockApp(3, {
      react: npmEntry("react", { version: "18.3.1" }),
      "corp-ui": npmEntry("corp-ui", { host: HOST.corpNpm }),
      handwritten: NO_TARBALL,
      "corp-x": { ...npmEntry("x"), name: "x" },
    });
    const result = await network(files);
    assert.deepEqual(result.sent, ["npm react"]);
    assert.deepEqual(result.kept, {
      "npm corp-ui": "private",
      "npm handwritten": "unproven",
      "npm corp-x": "private",
    });
    assert.deepEqual(result.unreadable, []);
  });

  test("a lock as npm 6 wrote it (scoped `from`, a git dependency, a `file:` link, each with nested ones) still proves", async () => {
    const lock = packageLockV1({
      "@babel/core": v1Entry("@babel/core", {
        version: "7.22.0",
        from: "@babel/core@^7.22.0",
        dependencies: { semver: v1Entry("semver", { version: "6.3.1" }) },
      }),
      g: {
        version: "github:user/g#0123456789abcdef0123456789abcdef01234567",
        from: "github:user/g#v1",
        dependencies: { ms: v1Entry("ms", { version: "2.1.3" }) },
      },
      shared: { version: "file:../shared", dependencies: { lodash: v1Entry("lodash", { version: "4.17.21" }) } },
      semver: v1Entry("semver", { version: "7.5.4" }),
    });
    const declared = ["@babel/core", "g", "shared", "lodash", "semver", "ms"];
    const result = await network({
      "package.json": packageJson(Object.fromEntries(declared.map((n) => [n, RANGE]))),
      [LOCK]: lock,
    });
    assert.deepEqual(result.sent, ["npm @babel/core", "npm lodash", "npm ms", "npm semver"]);
    assert.deepEqual(result.kept, { "npm g": "private", "npm shared": "private" });
    assert.deepEqual(result.unreadable, []);
  });
});

describe("the tarball must be the name's own", () => {
  const entryAt = (resolved) => ({ version: "1.0.0", resolved });
  const OTHER = [
    ["another case of the name", "https://registry.npmjs.org/Corp-X/-/Corp-X-1.0.0.tgz", "npm compares names exactly"],
    [
      "a '..' that leads to another package",
      "https://registry.npmjs.org/corp-x/-/../../lodash/-/lodash-4.17.21.tgz",
      "the path would resolve to lodash's tarball",
    ],
    [
      "a '%2e%2e' that leads to another package",
      "https://registry.npmjs.org/corp-x/-/%2e%2e/lodash-4.17.21.tgz",
      "the same, percent-encoded",
    ],
    [
      "another file name under the name's folder",
      "https://registry.npmjs.org/corp-x/-/lodash-4.17.21.tgz",
      "the base of the file name is the package's",
    ],
  ];
  for (const [label, resolved, why] of OTHER)
    test(`${label}: no proof`, async () => {
      await expectProofDropped({
        base: lockApp(3, { "corp-x": entryAt(tarball("corp-x")) }),
        changed: lockApp(3, { "corp-x": entryAt(resolved) }),
        name: "npm corp-x",
        label: why,
      });
    });

  const SCOPED = [
    ["its '/' written as is", tarball("@scope/ui")],
    ["its '/' written %2f", "https://registry.npmjs.org/@scope%2fui/-/ui-1.0.0.tgz"],
    ["its '/' written %2F", "https://registry.npmjs.org/@scope%2Fui/-/ui-1.0.0.tgz"],
  ];
  for (const [label, resolved] of SCOPED)
    test(`a scoped package's own tarball proves it, ${label}`, async () => {
      const lock = packageLockV3({}, { [KEY("@scope/ui")]: entryAt(resolved) });
      lock.packages[""] = { optionalDependencies: { "@scope/ui": RANGE } };
      const result = await expectSent({ [LOCK]: lock }, ["npm @scope/ui"]);
      assert.deepEqual(result.urls, ["https://registry.npmjs.org/%40scope%2Fui/latest"], label);
    });

  test("a scoped package's tarball under another scope proves nothing", async () => {
    await expectProofDropped({
      base: lockApp(3, { "@scope/ui": entryAt(tarball("@scope/ui")) }),
      changed: lockApp(3, { "@scope/ui": entryAt(tarball("@other/ui")) }),
      name: "npm @scope/ui",
      label: "@other/ui's tarball",
    });
  });

  test("package.json's optionalDependencies are direct dependencies, not dev ones", () => {
    const read = deps({ "package.json": packageJson({}, {}, { optionalDependencies: { fsevents: "^2" } }) });
    assert.equal(read["package.json"].fsevents.direct, true);
    assert.equal(read["package.json"].fsevents.dev, false);
  });

  test("the proof is the exact name: a lock proving corp-utils proves nothing of Corp-Utils", async () => {
    const files = {
      [LOCK]: packageLockV3({ "corp-utils": RANGE }, { [KEY("corp-utils")]: npmEntry("corp-utils") }),
      "web/package.json": packageJson({ "Corp-Utils": RANGE }),
    };
    const result = await network(files);
    assert.deepEqual(result.sent, ["npm corp-utils"]);
    assert.equal(result.kept["npm Corp-Utils"], "unproven");
    assert.deepEqual(result.unreadable, []);
    assert.deepEqual(result.urls, [registryUrl("npm", "corp-utils")]);
  });

  describe("an alias resolved to another package's tarball", () => {
    const ALIAS = "npm:lodash@4.17.21";

    test("package-lock v1: the alias is local in the facts, so its name is private in every manifest", async () => {
      const lock = packageLockV1({ "corp-x": { version: ALIAS, resolved: tarball("lodash") } });
      const item = deps({ [LOCK]: lock })[LOCK]["corp-x"];
      assert.equal(item.local, true, "local in the facts, not only unsent");
      assert.equal(item.public, undefined);
    });

    test("package-lock v1: an alias declared in a package.json is never sent", async () => {
      const result = await expectNothingSent(
        {
          "package.json": packageJson({}, {}, { optionalDependencies: { "corp-x": "npm:lodash@^4" } }),
          [LOCK]: packageLockV1({ "corp-x": { version: ALIAS, resolved: tarball("lodash") } }),
        },
        { "npm corp-x": "private" },
      );
      const lockItem = result.items.find((i) => i.manifest === LOCK && i.name === "corp-x");
      assert.equal(lockItem?.local, true, "the lock's own item is local, not only the package.json's");
    });

    test("package-lock v1: the alias drops the proof the name's own tarball would give", async () => {
      await expectProofDropped({
        base: lockApp(1, { "corp-x": v1Entry("corp-x") }),
        changed: lockApp(1, { "corp-x": { version: ALIAS, resolved: tarball("lodash") } }),
        name: "npm corp-x",
        reason: "private",
      });
    });

    test("package-lock v3: an entry resolved under another name, with no `name` field, is unproven", async () => {
      await expectProofDropped({
        base: lockApp(3, { "corp-x": npmEntry("corp-x") }),
        changed: lockApp(3, { "corp-x": { version: "1.0.0", resolved: tarball("lodash") } }),
        name: "npm corp-x",
        reason: "unproven",
      });
    });
  });
});

describe("every entry of a name must prove it", () => {
  // npm reads a lock's keys in any order: two nested copies of corp-lib, one its own tarball, one written without
  // `resolved` (no bundled copy) — whichever comes first, the name is not proven.
  const twoCopies = (version, first) => {
    const own = version === 1 ? v1Entry(NAME) : npmEntry(NAME);
    const copies = first === "both" ? [own, own] : first === "own" ? [own, NO_TARBALL] : [NO_TARBALL, own];
    if (version === 1)
      return lockApp(1, {
        a: v1Entry("a", { dependencies: { [NAME]: copies[0] } }),
        b: v1Entry("b", { dependencies: { [NAME]: copies[1] } }),
      });
    return lockApp(
      version,
      { a: npmEntry("a"), b: npmEntry("b") },
      { more: { [`${KEY("a")}/${KEY(NAME)}`]: copies[0], [`${KEY("b")}/${KEY(NAME)}`]: copies[1] } },
    );
  };
  /** The two copies, corp-lib declared too: a direct name, judged by the gateway. */
  const declaringName = (version, first) => {
    const files = twoCopies(version, first);
    files["package.json"] = packageJson({ a: RANGE, b: RANGE, [NAME]: RANGE });
    if (version !== 1) files[LOCK].packages[""].dependencies[NAME] = RANGE;
    return files;
  };
  for (const version of VERSIONS)
    for (const first of ["own", "without resolved"])
      test(`package-lock v${version}: a copy without resolved disproves the name, read ${first === "own" ? "after" : "before"} its own tarball`, async () => {
        const result = await expectSent(declaringName(version, first), ["npm a", "npm b"]);
        assert.equal(result.kept[`npm ${NAME}`], "unproven");
      });

  for (const version of VERSIONS)
    test(`package-lock v${version}: the same two copies, both their own tarball: the name is proven (the pair's control)`, async () => {
      await expectSent(declaringName(version, "both"), ["npm a", "npm b", `npm ${NAME}`]);
    });

  const NESTED = [
    [
      "another registry's tarball nested elsewhere: the name is private everywhere",
      () => npmEntry(NAME, { version: "2.0.0", host: HOST.corpNpm }),
      "private",
      VERSIONS,
    ],
    [
      "another package's tarball nested elsewhere: the proof is dropped",
      () => ({ version: "2.0.0", resolved: tarball("lodash") }),
      "unproven",
      VERSIONS,
    ],
    [
      "an alias nested elsewhere: the name is private everywhere",
      () => ({ version: "npm:lodash@4.17.21", resolved: tarball("lodash") }),
      "private",
      [1],
    ],
  ];
  /** `corp-lib` at the top level and `app`, which holds `nested` as its own copy of corp-lib. */
  const withNested = (version, nested) =>
    version === 1
      ? lockApp(1, { [NAME]: v1Entry(NAME), "web-ui": v1Entry("web-ui", { dependencies: { [NAME]: nested } }) })
      : lockApp(
          version,
          { [NAME]: npmEntry(NAME), "web-ui": npmEntry("web-ui") },
          { more: { [`${KEY("web-ui")}/${KEY(NAME)}`]: nested } },
        );
  const OWN_COPY = { version: "2.0.0", resolved: tarball(NAME, { version: "2.0.0" }) };

  for (const [label, nested, reason, versions] of NESTED)
    for (const version of versions)
      test(`package-lock v${version}: ${label}`, async () => {
        const { after } = await expectProofDropped({
          base: withNested(version, OWN_COPY),
          changed: withNested(version, nested()),
          name: `npm ${NAME}`,
          reason,
        });
        assert.deepEqual(after.sent, ["npm web-ui"], "the other package of the lock is still proven");
      });

  for (const version of VERSIONS)
    test(`package-lock v${version}: a nested copy with no tarball (a bundled one) leaves the proof`, async () => {
      const bundled = { version: "2.0.0", inBundle: true };
      const result = await expectSent(withNested(version, bundled), ["npm web-ui", `npm ${NAME}`]);
      assert.deepEqual(result.kept, {});
    });
});

describe("a location is read as npm resolves it: two spellings of one folder prove nothing", () => {
  const CORP = npmEntry(NAME, { host: HOST.corpNpm });
  const E_ACUTE = String.fromCharCode(0xe9);
  const E_COMBINING = String.fromCharCode(0x65, 0x301);
  const KELVIN = String.fromCharCode(0x212a);
  const CORPORATE = "corporate-lib";

  // [label, lock version, the proven name, the twin (a location in v2/v3, a dependency name in v1), its entry, reason, why]
  const TWINS = [
    [
      "a trailing slash",
      3,
      NAME,
      "node_modules/corp-lib/",
      CORP,
      "unproven",
      "npm drops the empty folder: the same folder",
    ],
    ["an empty folder", 3, NAME, "node_modules//corp-lib", CORP, "unproven", "the same"],
    ["a '.' folder", 3, NAME, "node_modules/./corp-lib", CORP, "unproven", "the same"],
    ["a '..' that cancels a folder", 3, NAME, "node_modules/x/../corp-lib", CORP, "unproven", "the same"],
    [
      "a '..' after the name",
      3,
      NAME,
      "node_modules/corp-lib/node_modules/..",
      CORP,
      "unproven",
      "it resolves to corp-lib's folder",
    ],
    [
      "a backslash",
      3,
      NAME,
      `node_modules${CH.BACKSLASH}corp-lib`,
      CORP,
      "unproven",
      "Windows reads it as a separator",
    ],
    [
      "another case",
      3,
      NAME,
      "node_modules/Corp-Lib",
      NO_TARBALL,
      "unproven",
      "a case-insensitive filesystem has one folder",
    ],
    [
      "another case, each its own public tarball (JSONStream and jsonstream)",
      3,
      NAME,
      "node_modules/Corp-Lib",
      npmEntry("Corp-Lib"),
      "unproven",
      "one folder on Windows and macOS: which package it holds is not told",
    ],
    ["a trailing dot", 3, NAME, "node_modules/corp-lib.", NO_TARBALL, "unproven", "Windows drops trailing dots"],
    ["a trailing space", 3, NAME, "node_modules/corp-lib ", NO_TARBALL, "unproven", "Windows drops trailing spaces"],
    [
      "a UNC path",
      3,
      NAME,
      "//server/share/node_modules/corp-lib",
      NO_TARBALL,
      "unproven",
      "an absolute location: not told",
    ],
    [
      "a composed and a decomposed é",
      3,
      `caf${E_ACUTE}`,
      `node_modules/caf${E_COMBINING}`,
      NO_TARBALL,
      "unproven",
      "macOS reads both as one folder",
    ],
    ["the Kelvin sign for K", 3, "kit", `node_modules/${KELVIN}it`, NO_TARBALL, "unproven", "NFKC folds it to k"],
    [
      "a Windows 8.3 short name",
      3,
      CORPORATE,
      "node_modules/CORPOR~1",
      NO_TARBALL,
      "unproven",
      "the same folder as the long name",
    ],
    ["a trailing dot (v1)", 1, NAME, "corp-lib.", NO_TARBALL, "unproven", "Windows drops trailing dots"],
    ["a trailing space (v1)", 1, NAME, "corp-lib ", NO_TARBALL, "unproven", "Windows drops trailing spaces"],
    [
      "a Windows 8.3 short name (v1)",
      1,
      CORPORATE,
      "CORPOR~1",
      NO_TARBALL,
      "unproven",
      "the same folder as the long name",
    ],
  ];
  const lockWith = (version, name, twin, entry) => {
    const files = lockApp(version, { [name]: npmEntry(name) });
    if (!twin) return files;
    if (version === 1) files[LOCK].dependencies[twin] = entry;
    else files[LOCK].packages[twin] = entry;
    return files;
  };
  /** Whether the lock's own item of `name` is proven (a name no registry can hold is never sent, but still proven). */
  const provenIn = (files, name) => deps(files)[LOCK][name]?.public === true;
  for (const [label, version, name, twin, entry, reason, why] of TWINS)
    test(`${label}: no proof`, async () => {
      // `café` is never sent at all (no registry holds such a name): the pair is judged on the proof itself.
      if (!/^[\x20-\x7e]*$/.test(name)) {
        assert.equal(provenIn(lockWith(version, name, null), name), true, `${label}: the base proves ${name}`);
        assert.equal(provenIn(lockWith(version, name, twin, entry), name), false, `${label}: ${why}`);
        return;
      }
      await expectProofDropped({
        base: lockWith(version, name, null),
        changed: lockWith(version, name, twin, entry),
        name: `npm ${name}`,
        reason,
        label: `${label}: ${why}`,
      });
    });

  // Locations that depend on where the application is: written from its folder, checked on the facts (`public`).
  const FOLDER_KEYS = [
    ["a '..' that comes back into the lock's folder", (d) => `../${d.base}/${KEY(NAME)}`],
    ["the same, in capitals", (d) => `../${d.base.toUpperCase()}/${KEY(NAME)}`],
    ["a longer way back", (d) => `../../${d.parent}/${d.base}/${KEY(NAME)}`],
    [
      "a climb past the filesystem's root",
      (d) => `${"../".repeat(d.segments.length + 2)}${d.segments.join("/")}/${KEY(NAME)}`,
    ],
    ["the folder's absolute path", (d) => `${d.abs}/${KEY(NAME)}`],
    ["a drive-relative location", () => "C:node_modules/corp-lib"],
  ];
  const BESIDE = "../shared/node_modules/corp-lib";
  const proofOfKey = (dir, key) => {
    const lock = packageLockV3({ [NAME]: RANGE }, { [KEY(NAME)]: npmEntry(NAME), [key]: npmEntry(NAME) });
    fs.writeFileSync(path.join(dir, LOCK), JSON.stringify(lock));
    const unreadable = [];
    const items = collectDependencies(dir, unreadable);
    assert.deepEqual(unreadable, []);
    const item = items.find((i) => i.name === NAME);
    assert.ok(item, "the lock's own item is read");
    return item.public === true;
  };
  for (const [label, keyOf] of FOLDER_KEYS)
    test(`${label}: no proof, where a sibling folder keeps it`, async () => {
      await withApp({ "package.json": packageJson({ [NAME]: RANGE }) }, (dir) => {
        const here = path.resolve(dir);
        const folder = {
          base: path.basename(dir),
          parent: path.basename(path.dirname(dir)),
          abs: here.split(path.sep).join("/"),
          segments: here.slice(path.parse(here).root.length).split(path.sep),
        };
        assert.equal(proofOfKey(dir, BESIDE), true, "base: a folder beside the lock's keeps the proof");
        assert.equal(proofOfKey(dir, keyOf(folder)), false, label);
      });
    });

  test("a `file:` link outside the lock's folder (../shared, as npm writes it) keeps the public entries proven", async () => {
    const files = {
      "package.json": packageJson({ shared: "file:../shared", "left-pad": RANGE }),
      [LOCK]: packageLockV3(
        { shared: "file:../shared", "left-pad": RANGE },
        {
          "../shared": { version: "1.0.0" },
          [KEY("shared")]: { resolved: "../shared", link: true },
          [KEY("left-pad")]: npmEntry("left-pad"),
        },
      ),
    };
    const sent = await expectSent(files, ["npm left-pad"]);
    assert.equal(sent.kept["npm shared"], "private");
  });

  test("a dependency of a sibling folder (../shared/node_modules/left-pad) leaves the lock's own entries proven", async () => {
    const files = lockApp(
      3,
      { [NAME]: npmEntry(NAME) },
      { more: { "../shared/node_modules/left-pad": npmEntry("left-pad") } },
    );
    await expectSent(files, [`npm ${NAME}`]);
  });
});

describe("a v1 link to the lock's own folder brings its dependencies onto the root's: no proof", () => {
  // The nested copy is corp-lib's own public tarball, as npm writes it: only its place differs.
  const nestedCorp = { [NAME]: v1Entry(NAME) };
  /** The root's corp-lib, and x: `fields` (where x says it is a link) with `nested` as its dependencies. */
  const withLink = (fields, nested = nestedCorp) =>
    packageLockV1({ [NAME]: v1Entry(NAME), x: { ...fields, dependencies: nested } });
  const ELSEWHERE = { version: "file:libs/x" };

  // [label, the link's fields (a function of the application's folder when they name it), nested dependencies, why]
  const LINKS = [
    ["file:.", { version: "file:." }, undefined, "the lock's own folder"],
    ["a bare '.'", { version: "." }, undefined, "npm reads a path starting with '.' as a folder"],
    ["'./'", { version: "./" }, undefined, "the same"],
    ["FILE:. in capitals", { version: "FILE:." }, undefined, "the scheme in any case"],
    [
      "the folder by its present name",
      (d) => ({ version: `file:../${d.base}` }),
      undefined,
      "back into the folder it is in",
    ],
    ["the folder by its present name, no scheme", (d) => ({ version: `../${d.base}` }), undefined, "the same"],
    [
      "the folder by its present name, in another case",
      (d) => ({ version: `file:../${d.base.toUpperCase()}` }),
      undefined,
      "one folder where the lock is installed on Windows or macOS",
    ],
    [
      "file:. with another case of the nested name",
      { version: "file:." },
      { "Corp-Lib": v1Entry("Corp-Lib") },
      "a case-insensitive filesystem has one folder",
    ],
    ["`from` alone", { from: "file:." }, undefined, "npm reads `from` when the version is not a folder"],
    ["`resolved` alone", { version: "1.0.0", resolved: "file:." }, undefined, "npm reads `resolved` too"],
    [
      "two folders named, one the lock's own",
      { version: "file:libs/x", resolved: "file:." },
      undefined,
      "which one npm takes cannot be told",
    ],
    ["a slash that comes back", { version: "a/b/../.." }, undefined, "any spec holding a slash may be a folder"],
    ["a backslash that comes back", { version: `a${CH.BACKSLASH}..` }, undefined, "Windows reads it as a separator"],
    [
      "a file URL",
      (d) => ({ version: `file:///${d.abs.replace(/^\//, "")}` }),
      undefined,
      "an absolute path to the folder",
    ],
    ["a file: path with one slash", (d) => ({ version: `file:/${d.abs.replace(/^\//, "")}` }), undefined, "the same"],
    [
      "`resolved` with a slash that comes back",
      { version: "1.0.0", resolved: "a/b/../.." },
      undefined,
      "any field may name a folder",
    ],
    ["`from` with a slash that comes back", { from: "a/b/../.." }, undefined, "the same"],
    ["a colon past a name, not a URL", { version: "./x:y/.." }, undefined, "npm reads it as a folder"],
    ["a digit before the colon", { version: "1a:b/.." }, undefined, "not a URL scheme"],
    ["a digit after a letter before the colon", { version: "a1:b/.." }, undefined, "not a URL scheme"],
    ["a colon in a deeper path", { version: "x/y:z/../.." }, undefined, "a folder"],
    ["a scope-like name with a colon", { version: "@x:y/.." }, undefined, "not a scoped registry spec"],
    [
      "a colon after the folder's own name",
      (d) => ({ version: `../${d.base}/x:y/..` }),
      undefined,
      "a folder, back into itself",
    ],
    ["a home folder", { version: "~/app" }, undefined, "where it is depends on the machine that installs"],
    ["file: and a home folder", { version: "file:~/app" }, undefined, "the same"],
    ["`from` with a home folder", { from: "~/app" }, undefined, "the same"],
    [
      "an absolute path",
      (d) => ({ version: `file:${d.abs.startsWith("/") ? "" : "/"}${d.abs}` }),
      undefined,
      "an absolute path cannot be placed",
    ],
    ["a drive in `resolved`", { version: "1.0.0", resolved: "C:/app" }, undefined, "a drive cannot be placed"],
  ];

  /** Reads `lock` in `dir`: the facts of corp-lib (read, proven or not) and the files left unreadable. */
  const proofOf = (dir, lock) => {
    fs.writeFileSync(path.join(dir, LOCK), JSON.stringify(lock));
    const unreadable = [];
    const items = collectDependencies(dir, unreadable);
    assert.deepEqual(unreadable, []);
    const item = items.find((i) => i.name === NAME);
    assert.ok(item, "corp-lib is read");
    return item.public === true;
  };
  const inFolder = (fn) => withApp({ "package.json": packageJson({ [NAME]: RANGE }) }, fn);

  for (const [label, link, nested, why] of LINKS)
    test(`${label}: no proof`, async () => {
      await inFolder((dir) => {
        const folder = { base: path.basename(dir), abs: path.resolve(dir).split(path.sep).join("/") };
        const fields = typeof link === "function" ? link(folder) : link;
        assert.equal(proofOf(dir, withLink(ELSEWHERE, nested)), true, "base: a link elsewhere keeps the proof");
        assert.equal(proofOf(dir, withLink(fields, nested)), false, why);
      });
    });

  test("the order of the fields npm reads is not mimicked: the folder is counted at each place named", async () => {
    await inFolder((dir) => {
      const order = (z) =>
        packageLockV1({
          x: { version: "file:../elsewhere", resolved: tarball("x"), dependencies: { [NAME]: v1Entry(NAME) } },
          z: { version: z, dependencies: nestedCorp },
        });
      assert.equal(proofOf(dir, order("file:./elsewhere")), true, "base: z links to a folder of its own");
      assert.equal(
        proofOf(dir, order("file:./node_modules/x")),
        false,
        "z links to the folder x's dependencies are in",
      );
      const x = collectDependencies(dir).find((i) => i.manifest === LOCK && i.name === "x");
      assert.ok(x, "x is read");
      assert.notEqual(x.public, true, "x is a link: its public tarball in resolved proves nothing");
    });
  });

  test("a registry dependency below a v1 link, inside the link's folder, is read and proven; the link is not", () => {
    const lock = packageLockV1({
      x: {
        version: "file:libs/x",
        dependencies: { lodash: v1Entry("lodash", { version: "4.17.21" }) },
      },
    });
    const read = deps({ "package.json": packageJson({ x: RANGE, lodash: RANGE }), [LOCK]: lock })[LOCK];
    assert.equal(read.lodash?.public, true, "lodash, below the link, has its own public tarball");
    assert.notEqual(read.x?.public, true, "the link itself proves nothing");
  });

  test("a chain of links deeper than the 64 places the kit follows proves nothing", async () => {
    const chainOf = (links) => {
      let chain = v1Entry("leaf");
      for (let i = 0; i < links; i++) chain = { version: `file:./d${i}`, dependencies: { [`l${i}`]: chain } };
      return packageLockV1({ [NAME]: v1Entry(NAME), top: chain });
    };
    await inFolder((dir) => {
      assert.equal(proofOf(dir, chainOf(3)), true, "base: a short chain of links");
      assert.equal(proofOf(dir, chainOf(70)), false, "70 links");
    });
  });

  test("a registry entry whose `from` holds a scope's slash still proves (npm 6 wrote `from` so)", async () => {
    const lock = packageLockV1({
      "@types/node": v1Entry("@types/node", {
        version: "20.1.0",
        from: "@types/node@^20.0.0",
        dependencies: { "undici-types": v1Entry("undici-types", { version: "5.26.5" }) },
      }),
    });
    const files = { "package.json": packageJson({ "@types/node": RANGE, "undici-types": RANGE }), [LOCK]: lock };
    await expectSent(files, ["npm @types/node", "npm undici-types"]);
  });

  test("an archive (file:x.tgz) is no link: its dependencies stay below it, nothing is reached twice", async () => {
    const archive = (version) => ({
      version,
      dependencies: { lodash: v1Entry("lodash", { version: "4.17.21" }) },
    });
    const lockWith = (x) => ({
      "package.json": packageJson({ a: RANGE, b: RANGE, lodash: RANGE }),
      [LOCK]: packageLockV1({
        a: v1Entry("a", { dependencies: { x: archive(x) } }),
        b: v1Entry("b", { dependencies: { x: archive(x) } }),
      }),
    });
    await expectProofDropped({
      base: lockWith("file:vendor/x-1.0.0.tgz"),
      changed: lockWith("file:vendor/x"),
      name: "npm lodash",
      label: "the same two copies of x as one folder: the folder is reached twice",
    });
    const result = await expectSent(lockWith("file:vendor/x-1.0.0.tgz"), ["npm a", "npm b", "npm lodash"]);
    assert.deepEqual(result.kept, {});
  });

  const ODD = [
    ["a trailing slash", "corp-lib/"],
    ["a './' prefix", "./corp-lib"],
    ["a '..' that cancels a folder", "x/../corp-lib"],
    ["only '..'", ".."],
    ["a backslash", `corp-lib${CH.BACKSLASH}x`],
    // A scope's shape, but its name empty or '.': `node_modules/@corp/` or `node_modules/@corp/.`, a folder of its own.
    ["a scope with an empty name", "@corp/"],
    ["a scope whose name is '.'", "@corp/."],
  ];
  for (const [label, odd] of ODD)
    test(`a dependency named as a path (${label}): no proof`, async () => {
      const lockWith = (nestedName) => ({
        "package.json": packageJson({ [NAME]: RANGE }),
        [LOCK]: packageLockV1({
          [NAME]: v1Entry(NAME),
          x: v1Entry("x", { dependencies: { [nestedName]: v1Entry(NAME, { host: HOST.corpNpm }) } }),
        }),
      });
      await expectProofDropped({
        base: lockWith("other-lib"),
        changed: lockWith(odd),
        name: `npm ${NAME}`,
        label: "npm 7+ reads a dependency's name as a location of its own",
      });
    });

  test("a name of two parts that is no scope (corp/lib) is no npm name, even with a tarball that looks its own", async () => {
    const lockOf = (name) => ({
      "package.json": packageJson({ [name]: RANGE }),
      [LOCK]: packageLockV1({ [name]: v1Entry(name) }),
    });
    await expectSent(lockOf("@corp/lib"), ["npm @corp/lib"]);
    const result = await network(lockOf("corp/lib"));
    assert.deepEqual(result.sent, []);
    assert.ok(
      result.items.some((i) => i.manifest === LOCK && i.name === "corp/lib"),
      "the lock's own item is read",
    );
    assert.ok(
      result.items.filter((i) => i.manifest === LOCK).every((i) => i.public !== true),
      "none proven",
    );
    assert.deepEqual(result.unreadable, []);
  });
});

describe("a v1 lock is read level by level, however deep", () => {
  test("a lock nested 10,000 levels deep is read in full, every level proven", async () => {
    const n = 10000;
    const levels = Array.from(
      { length: n },
      (_, i) => `{"p${i}":{"version":"1.0.0","resolved":"${tarball(`p${i}`)}","dependencies":`,
    );
    const lock = `{"lockfileVersion":1,"dependencies":${levels.join("")}{}${"}}".repeat(n)}}`;
    const result = await network({ "package.json": packageJson({ p0: RANGE, [`p${n - 1}`]: RANGE }), [LOCK]: lock });
    assert.equal(result.items.filter((i) => i.manifest === LOCK).length, n);
    const lockItems = result.items.filter((i) => i.manifest === LOCK);
    assert.deepEqual([lockItems[0].name, lockItems[n - 1].name], ["p0", `p${n - 1}`]);
    assert.ok(lockItems.every((i) => i.public === true));
    assert.deepEqual(result.sent, ["npm p0", `npm p${n - 1}`]);
    assert.deepEqual(result.unreadable, []);
  });
});

describe("a lock npm refuses or cannot read proves nothing", () => {
  const UTF16_LE_BOM = Buffer.from([0xff, 0xfe]);
  const utf16 = (text) => Buffer.concat([UTF16_LE_BOM, Buffer.from(text, "utf16le")]);

  test("`packages` that is no object, which npm refuses, makes the lock unreadable", async () => {
    const v1 = { [NAME]: v1Entry(NAME) };
    const files = (packages) => ({
      "package.json": packageJson({ [NAME]: RANGE }),
      [LOCK]: { lockfileVersion: 1, packages, dependencies: v1 },
    });
    for (const packages of [true, 1, "x"]) {
      const { after } = await expectProofDropped({
        base: files(null),
        changed: files(packages),
        name: `npm ${NAME}`,
        label: `packages: ${JSON.stringify(packages)}`,
      });
      assert.deepEqual(after.unreadable, [{ file: LOCK, reason: "json" }], String(packages));
      assert.deepEqual(
        after.items.filter((i) => i.manifest === LOCK),
        [],
        String(packages),
      );
    }
  });

  for (const packages of [null, 0])
    test(`"packages": ${packages} is a v1 lock as npm reads it`, async () => {
      const files = {
        "package.json": packageJson({ [NAME]: RANGE }),
        [LOCK]: { lockfileVersion: 1, packages, dependencies: { [NAME]: v1Entry(NAME) } },
      };
      await expectSent(files, [`npm ${NAME}`]);
    });

  const NOT_OBJECTS = [
    ["v3: a null entry", () => lockApp(3, { corp: null }, { declared: ["corp"] })],
    ["v3: a string entry", () => lockApp(3, { corp: "1.0.0" }, { declared: ["corp"] })],
    [
      "v1: a null dependency",
      () => lockApp(1, { corp: null }, { declared: ["corp"] }),
      () => lockApp(1, { corp: v1Entry("corp") }),
    ],
  ];
  for (const [label, files, base = () => lockApp(3, { corp: npmEntry("corp") })] of NOT_OBJECTS)
    test(`an entry that is no object is left out, never a crash (${label})`, async () => {
      await expectProofDropped({
        base: base(),
        changed: files(),
        name: "npm corp",
        label,
      });
      assert.equal(deps(files())[LOCK]?.corp, undefined, "no item of the lock for it");
      await expectNothingSent(files(), { "npm corp": "unproven" });
    });

  test("a lock in UTF-16, which npm does not read, is unreadable and proves nothing", async () => {
    const lock = lockApp(3, { [NAME]: npmEntry(NAME) });
    const json = JSON.stringify(lock[LOCK]);
    await expectProofDropped({
      base: { ...lock, [LOCK]: json },
      changed: { ...lock, [LOCK]: utf16(json) },
      name: `npm ${NAME}`,
    });
    await expectNothingSent(
      { ...lock, [LOCK]: utf16(json) },
      { [`npm ${NAME}`]: "unproven" },
      {
        unreadable: [{ file: LOCK, reason: "read" }],
      },
    );
  });

  test("a lock that is not JSON is unreadable and proves nothing", async () => {
    const lock = lockApp(3, { [NAME]: npmEntry(NAME) });
    const json = JSON.stringify(lock[LOCK]);
    await expectNothingSent(
      { ...lock, [LOCK]: json.slice(0, -2) },
      { [`npm ${NAME}`]: "unproven" },
      {
        unreadable: [{ file: LOCK, reason: "json" }],
      },
    );
    await expectSent({ ...lock, [LOCK]: json }, [`npm ${NAME}`]);
  });
});
