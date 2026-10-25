// The kit's one reading of versions and ranges (engine/project/semver.mjs, RULES.md M6), against npm's: tables of
// [version, range, satisfies], [a, b, order] and [range, lowest version] taken from the semver package's documented
// examples (its README: "Ranges", "Prerelease Tags", "Advanced Range Syntax"; SemVer 2.0 §11) and its test
// fixtures (comparisons, equality, range-include, range-exclude, min-version), the expected values written here —
// the package is no dependency of the kit. Then what the kit adds (partial versions and texts that are none, in its
// order; npm's minVersion judged per alternative), the site's copy of the order (engine/site/lib/versions.js), and a
// pre-release of the kit.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { satisfies, isValidRange, compareVersions, minVersion } from "../../engine/project/semver.mjs";
import { prepareConfig } from "../../engine/project/load.mjs";
import { KIT_ROOT } from "../tools/helpers.mjs";

/** [version, range, satisfies] — npm's `semver.satisfies(version, range)`, default options. */
const SATISFIES = [
  // Comparators, a space between them an intersection, || a union (README "Ranges").
  ["1.2.7", ">=1.2.7", true],
  ["1.3.9", ">=1.2.7", true],
  ["1.2.6", ">=1.2.7", false],
  ["1.2.99", ">=1.2.7 <1.3.0", true],
  ["1.3.0", ">=1.2.7 <1.3.0", false],
  ["1.2.7", "1.2.7 || >=1.2.9 <2.0.0", true],
  ["1.4.6", "1.2.7 || >=1.2.9 <2.0.0", true],
  ["1.2.8", "1.2.7 || >=1.2.9 <2.0.0", false],
  ["2.0.0", "1.2.7 || >=1.2.9 <2.0.0", false],
  ["1.2.3", "=1.2.3", true],
  ["1.2.3", "v1.2.3", true],
  ["1.2.4", "1.2.3", false],
  // Pre-release tags (README "Prerelease Tags").
  ["1.2.3-alpha.7", ">1.2.3-alpha.3", true],
  ["3.4.5-alpha.9", ">1.2.3-alpha.3", false],
  ["3.4.5", ">1.2.3-alpha.3", true],
  // Hyphen ranges.
  ["2.3.4", "1.2.3 - 2.3.4", true],
  ["2.3.5", "1.2.3 - 2.3.4", false],
  ["1.2.0", "1.2 - 2.3.4", true],
  ["2.3.9", "1.2.3 - 2.3", true],
  ["2.4.0", "1.2.3 - 2.3", false],
  ["2.9.9", "1.2.3 - 2", true],
  ["3.0.0", "1.2.3 - 2", false],
  // X-ranges.
  ["0.0.0", "*", true],
  ["1.2.3", "", true],
  ["1.9.9", "1.x", true],
  ["2.0.0", "1.x", false],
  ["1.2.9", "1.2.x", true],
  ["1.3.0", "1.2.x", false],
  ["1.5.0", "1", true],
  ["1.2.0", "1.2", true],
  ["1.3.0", "1.2", false],
  // Tilde ranges.
  ["1.2.9", "~1.2.3", true],
  ["1.3.0", "~1.2.3", false],
  ["1.2.0", "~1.2", true],
  ["1.9.0", "~1", true],
  ["0.2.9", "~0.2.3", true],
  ["0.3.0", "~0.2", false],
  ["0.9.9", "~0", true],
  ["1.2.3-beta.4", "~1.2.3-beta.2", true],
  ["1.2.4-beta.2", "~1.2.3-beta.2", false],
  ["1.2.3", "~>1.2", true],
  // Caret ranges.
  ["1.9.9", "^1.2.3", true],
  ["2.0.0", "^1.2.3", false],
  ["0.2.9", "^0.2.3", true],
  ["0.3.0", "^0.2.3", false],
  ["0.0.3", "^0.0.3", true],
  ["0.0.4", "^0.0.3", false],
  ["1.2.3-beta.4", "^1.2.3-beta.2", true],
  ["1.2.4-beta.2", "^1.2.3-beta.2", false],
  ["0.0.3-pr.2", "^0.0.3-beta", true],
  ["1.9.0", "^1.2.x", true],
  ["0.0.9", "^0.0.x", true],
  ["0.1.0", "^0.0", false],
  ["1.5.0", "^1.x", true],
  ["0.9.0", "^0.x", true],
  ["1.0.0", "^0.x", false],
  // A partial version after an operator, completed as npm does (VER-02: >1.2 is >=1.3.0).
  ["1.2.8", ">1.2", false],
  ["1.3.0", ">1.2", true],
  ["1.9.9", ">1", false],
  ["2.0.0", ">1", true],
  ["1.2.9", "<=1.2", true],
  ["1.3.0", "<=1.2", false],
  ["1.1.9", "<1.2", true],
  ["1.2.0", "<1.2", false],
  // A space after the operator (VER-02).
  ["1.2.3", ">= 1.2.3", true],
  ["1.0.0", ">=  1.0.0", true],
  ["1.9999.9999", "<=  2.0.0", true],
  ["1.0.2", "~ 1.0", true],
  ["1.2.3", "~> 1", true],
  ["1.2.3", "^ 1.2", true],
  // A pre-release satisfies a range only when the range names a pre-release of its major.minor.patch.
  ["1.2.3-beta", "^1.2.3", false],
  ["1.2.0-pre", "^1.2", false],
  ["1.3.0-beta", ">1.2", false],
  ["1.2.3-beta", "<=1.2.3", false],
  ["1.2.3-foo", "*", false],
  ["2.0.0-rc1", "^1.0.0", false],
  ["0.7.0-asdf", "=0.7.x", false],
  ["1.2.3-pre.2", "1.2.3-pre+asdf - 2.4.3-pre+asdf", true],
  ["1.2.0-pre", "^1.2.0-alpha", true],
  ["0.0.1-beta", "^0.0.1-alpha", true],
  ["1.0.0-rc.1", "^1.0.0-rc.0 || *", false],
  // Build metadata is ignored.
  ["1.2.3+build", "1.2.3", true],
  ["1.2.3", "^1.2.3+build", true],
  ["2.0.0", "^1.2.3+build", false],
  // A version must be one: three numbers, no leading zero.
  ["1.2", "1.x", false],
  ["01.2.3", "*", false],
  ["not-a-version", "*", false],
];

/** [a, b, order] — npm's `semver.compare(a, b)`: SemVer 2.0 §11. */
const ORDER = [
  // SemVer 2.0 §11's own examples, in a row.
  ["1.0.0-alpha", "1.0.0-alpha.1", -1],
  ["1.0.0-alpha.1", "1.0.0-alpha.beta", -1],
  ["1.0.0-alpha.beta", "1.0.0-beta", -1],
  ["1.0.0-beta", "1.0.0-beta.2", -1],
  ["1.0.0-beta.2", "1.0.0-beta.11", -1],
  ["1.0.0-beta.11", "1.0.0-rc.1", -1],
  ["1.0.0-rc.1", "1.0.0", -1],
  ["1.0.0", "2.0.0", -1],
  ["2.0.0", "2.1.0", -1],
  ["2.1.0", "2.1.1", -1],
  // npm's comparison fixtures (the first is the greater).
  ["0.0.0", "0.0.0-foo", 1],
  ["0.0.1", "0.0.0", 1],
  ["1.0.0", "0.9.9", 1],
  ["0.10.0", "0.9.0", 1],
  ["0.99.0", "0.10.0", 1],
  ["2.0.0", "1.2.3", 1],
  ["v0.0.0", "0.0.0-foo", 1],
  ["1.2.3", "1.2.3-asdf", 1],
  ["1.2.3", "1.2.3-4", 1],
  ["1.2.3", "1.2.3-4-foo", 1],
  ["1.2.3-5-foo", "1.2.3-5", 1],
  ["1.2.3-5", "1.2.3-4", 1],
  ["1.2.3-5-foo", "1.2.3-5-Foo", 1],
  ["3.0.0", "2.7.2+asdf", 1],
  ["1.2.3-a.10", "1.2.3-a.5", 1],
  ["1.2.3-a.b", "1.2.3-a.5", 1],
  ["1.2.3-a.b", "1.2.3-a", 1],
  ["1.2.3-a.b.c.10.d.5", "1.2.3-a.b.c.5.d.100", 1],
  ["1.2.3-r2", "1.2.3-r100", 1],
  ["1.2.3-r100", "1.2.3-R2", 1],
  // A pre-release comes after the versions below its release (VER-03).
  ["1.2.3-rc.1", "1.2.2", 1],
  // npm's equality fixtures: a leading v, build metadata.
  ["1.2.3", "v1.2.3", 0],
  ["1.2.3-beta+build", "1.2.3-beta+otherbuild", 0],
  ["1.2.3+build", "1.2.3+otherbuild", 0],
];

/** [a, b, order] the kit adds to npm's: a partial version read with zeros, a text that is none after the versions. */
const KIT_ORDER = [
  ["1.0", "1.0.0", 0],
  ["1.10", "1.9.2", 1],
  ["2", "1.99.99", 1],
  ["v1.2", "1.2.1", -1],
  ["1.2.3", "R1", -1],
  ["R2", "R10", -1],
  ["2024-10-01", "2024-09-30", 1],
  ["1.x", "9.0.0", 1],
];

/** [range, lowest version] — npm's `semver.minVersion(range)` (its fixtures), then the kit's own rows. */
const MIN = [
  ["*", "0.0.0"],
  ["* || >=2", "0.0.0"],
  [">2 || *", "0.0.0"],
  ["1.0.0", "1.0.0"],
  ["1.0", "1.0.0"],
  ["1.0.x", "1.0.0"],
  ["1.x.x", "1.0.0"],
  ["=1.0.0", "1.0.0"],
  ["~1.1.1", "1.1.1"],
  ["~1.1.1-beta", "1.1.1-beta"],
  ["^1.1.1 || >=2", "1.1.1"],
  ["^2.16.2 ^2.16", "2.16.2"],
  ["1.1 - 1.8.0", "1.1.0"],
  ["<2", "0.0.0"],
  ["<0.0.0-beta", "0.0.0-0"],
  ["<0.0.1-beta", "0.0.0"],
  [">4 || <2", "0.0.0"],
  [">0.0.0-alpha <0.0.0-beta", "0.0.0-alpha.0"],
  [">=2.2.2 <2 || >=1.1.1 <2", "1.1.1"],
  [">1.0.0", "1.0.1"],
  [">1.0.0-0", "1.0.0-0.0"],
  [">2 || >1.0.0-beta", "1.0.0-beta.0"],
  [">4 <3", null],
  // The kit's (VER-01): the lowest version of every alternative, not the first one written.
  ["^0.4.0 || ^0.3.0", "0.3.0"],
  ["<1.0.0", "0.0.0"],
  // npm tests only the lowest of the alternatives' lower bounds (3.0.0 here) and gives none.
  [">2 <1 || ^5", "5.0.0"],
  ["abc", null],
];

/** [range, readable] — what npm's `semver.validRange` refuses, the kit refuses too. */
const VALID = [
  [">= 1.2.3", true],
  ["1.2.3 - 2.3.4", true],
  ["", true],
  ["||", true],
  ["^1.2.3+build", true],
  ["abc", false],
  ["01.2.3", false],
  ["1.2.3-", false],
  ["1.2.3-rc.01", false],
  ["> = 1.2.3", false],
  [">=1.2.3 - 2", false],
  ["1.2.3 - 2.3.4 - 3", false],
  // Stricter than npm, which reads these as ~1.2 and 1.x: refused, never misread.
  ["~=1.2", false],
  ["vv1", false],
];

describe("semver: the kit's ranges are npm's", () => {
  for (const [version, range, expected] of SATISFIES)
    test(`${version} ${expected ? "satisfies" : "does not satisfy"} "${range}"`, () =>
      assert.equal(satisfies(version, range), expected));

  test("the order of versions: SemVer 2.0 §11, both ways", () => {
    for (const [a, b, order] of [...ORDER, ...KIT_ORDER]) {
      assert.equal(compareVersions(a, b), order, `${a} against ${b}`);
      assert.equal(compareVersions(b, a), -order || 0, `${b} against ${a}`);
    }
    const sorted = ["1.0.0", "1.0.0-rc.1", "1.0.0-alpha", "0.9.0", "1.0.0-alpha.1", "1.0.0-beta.11", "1.0.0-beta.2"];
    assert.deepEqual(sorted.sort(compareVersions), [
      "0.9.0",
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
    ]);
  });

  test("the lowest version a range allows", () => {
    for (const [range, lowest] of MIN) assert.equal(minVersion(range), lowest, range);
  });

  test("a range that cannot be read", () => {
    for (const [range, readable] of VALID) assert.equal(isValidRange(range), readable, JSON.stringify(range));
  });
});

describe("semver: the site's copy of the order (engine/site/lib/versions.js)", () => {
  test("gives the order of engine/project/semver.mjs on every pair of the tables", () => {
    const context = { EXT: { hydrators: [], api: {} } };
    vm.runInNewContext(fs.readFileSync(path.join(KIT_ROOT, "engine", "site", "lib", "versions.js"), "utf8"), context);
    const texts = [...new Set([...ORDER, ...KIT_ORDER, ...SATISFIES].flatMap(([a, b]) => [a, b]))];
    texts.push("", "1.2.3-", "1.2.3-a..b", "1.2.3+", "01.2.3", "1.2.3-01", " 1.2.3 ", "x", "*");
    for (const a of texts)
      for (const b of texts)
        assert.equal(context.EXT.compareVersions(a, b), compareVersions(a, b), `${a} against ${b}`);
  });

  test("app.js sorts the screenshots' versions with it", () => {
    const app = fs.readFileSync(path.join(KIT_ROOT, "engine", "site", "app.js"), "utf8");
    assert.match(app, /const versionOrder = EXT\.compareVersions;/);
  });
});

describe("semver: a pre-release of the kit", () => {
  // Decided: npm's rule, no exception for the kit. A project's range accepts a pre-release only when it names one of
  // the same major.minor.patch; `doc-kit upgrade --apply` writes ^<the pre-release>, which its release accepts too.
  test("refused by a range written for releases, accepted by one that names it", () => {
    assert.equal(satisfies("0.5.0-rc.1", "^0.4.1"), false);
    assert.equal(satisfies("0.5.0-rc.1", "*"), false);
    assert.equal(satisfies("0.5.0-rc.1", "^0.5.0"), false, "a pre-release comes before its release");
    assert.equal(satisfies("0.5.0-rc.1", "^0.5.0-rc.1"), true);
    assert.equal(satisfies("0.5.0-rc.1", ">=0.5.0-0"), true);
    assert.equal(satisfies("0.5.0-rc.2", "^0.5.0-rc.1"), true, "the next pre-release");
    assert.equal(satisfies("0.5.0", "^0.5.0-rc.1"), true, "the release");
    assert.equal(satisfies("0.5.1-rc.1", "^0.5.0-rc.1"), false, "another version's pre-release");
  });

  test("the project's configuration: exit code 3, then accepted once its range names it", () => {
    const config = (kit) => prepareConfig({ product: { name: "X" }, kit }, { env: {}, version: "0.5.0-rc.1" });
    assert.throws(
      () => config("^0.4.1"),
      (e) => e.code === 3 && e.key === "config.kitIncompatible",
    );
    assert.equal(config("^0.5.0-rc.1").kit, "^0.5.0-rc.1");
  });
});
