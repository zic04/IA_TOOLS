// The licences of the dependencies (engine/facts/deps/licences.mjs, ARCHITECTURE.md §6.9): a licence is kept only as
// a licence's name, whatever untrusted source gave it — a lock file, an installed copy, a registry's answer —, never
// a licence's text, an object or anything a secret detector finds (AUDIT.md S8). Minimal pairs: each refused value
// beside the closest one that is kept.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { safeLicence, npmLicence, pythonLicence, composerLicence } from "../../engine/facts/deps/licences.mjs";
import { deps } from "../tools/deps-apps.mjs";
import { packageJson, npmEntry, packageLockV3 } from "../tools/locks.mjs";

/** A token-shaped text, split so that no secret is written in the repository. */
const TOKEN = "gh" + "p_16C7e42F292c6912E7710c838347Ae178B4a";

describe("safeLicence: a licence's name, or nothing", () => {
  for (const [label, value, expected] of [
    ["an SPDX identifier", "MIT", "MIT"],
    ["trimmed", "  Apache-2.0 \t", "Apache-2.0"],
    ["an SPDX expression", "(MIT OR GPL-3.0-or-later)", "(MIT OR GPL-3.0-or-later)"],
    ["an exception", "GPL-2.0-only WITH Classpath-exception-2.0", "GPL-2.0-only WITH Classpath-exception-2.0"],
    ["a name with spaces, its blanks one space", "BSD  3-Clause\tLicense", "BSD 3-Clause License"],
    ["npm's own words for a file", "SEE LICENSE IN LICENSE.md", "SEE LICENSE IN LICENSE.md"],
    ["npm's word for none given, kept (it says something)", "UNLICENSED", "UNLICENSED"],
    ["100 characters", "A".repeat(100), "A".repeat(100)],
  ])
    test(`kept: ${label}`, () => assert.equal(safeLicence(value), expected));

  for (const [label, value] of [
    ["101 characters", "A".repeat(101)],
    ["a licence's text: more than one line", "MIT\nPermission is hereby granted"],
    ["setuptools' UNKNOWN", "UNKNOWN"],
    ["empty", "   "],
    ["a character no licence name holds", "MIT <b>"],
    ["a quote", 'MIT"'],
    ["a punctuation first", "-MIT"],
    ["an address with a user", "https://user@example.org/licence"],
    ["a token-shaped text", TOKEN],
    ["an object", { type: "MIT" }],
    ["a number", 3],
    ["null", null],
  ])
    test(`refused: ${label}`, () => assert.equal(safeLicence(value), null));
});

describe("the forms of each source", () => {
  test("npm: `license` a string or `{ type }`; else the legacy `licenses`, one of them; `license` first", () => {
    assert.equal(npmLicence({ license: "ISC" }), "ISC");
    assert.equal(npmLicence({ license: { type: "MIT", url: "https://example.org" } }), "MIT");
    assert.equal(npmLicence({ licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] }), "MIT OR Apache-2.0");
    assert.equal(npmLicence({ licenses: ["MIT", "MIT"] }), "MIT", "the same licence once");
    assert.equal(npmLicence({ license: "ISC", licenses: [{ type: "MIT" }] }), "ISC");
    assert.equal(npmLicence({ license: { url: "https://example.org" } }), null, "an object without its type");
    assert.equal(npmLicence({ license: "UNKNOWN", licenses: [{ type: "MIT" }] }), null, "`license` said none");
    assert.equal(npmLicence({ licenses: Array.from({ length: 20 }, (_, i) => `L${i}`) }).split(" OR ").length, 8);
    for (const doc of [null, "MIT", [], {}]) assert.equal(npmLicence(doc), null, JSON.stringify(doc));
  });

  test("Python: the SPDX expression, else a short `License`, else the licence classifiers", () => {
    const classifiers = [
      "Programming Language :: Python :: 3",
      "License :: OSI Approved :: MIT License",
      "License :: OSI Approved",
    ];
    assert.equal(pythonLicence({ expression: "MIT", license: "BSD", classifiers }), "MIT");
    assert.equal(pythonLicence({ license: "BSD", classifiers }), "BSD");
    assert.equal(pythonLicence({ license: "UNKNOWN", classifiers }), "MIT License", "UNKNOWN says none");
    assert.equal(
      pythonLicence({ license: "Copyright (c) 2024\n\nPermission is hereby granted…", classifiers }),
      "MIT License",
      "a whole licence text is no name",
    );
    assert.equal(
      pythonLicence({
        classifiers: ["License :: OSI Approved :: MIT License", "License :: OSI Approved :: Apache Software License"],
      }),
      "MIT License OR Apache Software License",
    );
    assert.equal(pythonLicence({ classifiers: ["License :: OSI Approved"] }), null, "no licence of its own");
    assert.equal(pythonLicence({ classifiers: ["Topic :: License :: MIT"] }), null, "not a licence classifier");
    assert.equal(pythonLicence({}), null);
    assert.equal(pythonLicence(), null);
  });

  test("Composer: a string, or a list of them (one of them)", () => {
    assert.equal(composerLicence("MIT"), "MIT");
    assert.equal(composerLicence(["MIT", "Apache-2.0"]), "MIT OR Apache-2.0");
    assert.equal(composerLicence(["MIT", { x: 1 }, TOKEN]), "MIT", "only the names");
    assert.equal(composerLicence([]), null);
  });
});

describe("a lock file's licence, kept as a name (package-lock.json, composer.lock)", () => {
  /** The package-lock items of an application whose package `x` gives `info` beside its registry fields. */
  const lockItem = (info) =>
    deps({
      "package.json": packageJson({ x: "^1.0.0" }),
      "package-lock.json": packageLockV3({ x: "^1.0.0" }, { "node_modules/x": npmEntry("x", info) }),
    })["package-lock.json"].x;

  test('a name: kept, `licenseFrom: "lock"`', () => {
    const item = lockItem({ license: "MIT" });
    assert.equal(item.license, "MIT");
    assert.equal(item.licenseFrom, "lock");
  });

  for (const [label, license] of [
    ["an object: its type", { type: "Apache-2.0" }],
    ["the legacy list", undefined],
  ])
    test(`${label}: a name`, () => {
      const item = lockItem(license === undefined ? { licenses: [{ type: "Apache-2.0" }] } : { license });
      assert.equal(item.license, "Apache-2.0");
      assert.equal(item.licenseFrom, "lock");
    });

  for (const [label, license] of [
    ["a token-shaped text: never stored", TOKEN],
    ["a licence's text", "MIT\nPermission is hereby granted"],
    ["a number", 42],
  ])
    test(`${label}: no licence, no source of one`, () => {
      const item = lockItem({ license });
      assert.ok(!("license" in item) && !("licenseFrom" in item), JSON.stringify(item));
      assert.equal(item.version, "1.0.0", "the item itself is kept");
    });

  test("composer.lock: the same allowlist", () => {
    const items = deps({
      "composer.lock": JSON.stringify({
        packages: [
          { name: "acme/a", version: "1.0.0", license: ["MIT", TOKEN] },
          { name: "acme/b", version: "1.0.0", license: TOKEN },
        ],
      }),
    })["composer.lock"];
    assert.equal(items["acme/a"].license, "MIT");
    assert.ok(!("license" in items["acme/b"]) && !("licenseFrom" in items["acme/b"]));
  });
});
