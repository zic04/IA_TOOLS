// What `--network` keeps of a registry's answer (engine/facts/network.mjs `describe`, ARCHITECTURE.md §6.9): one GET
// a package on its latest version's document, then on each direct item sent `exists`, `latest`, `majorsBehind`
// (engine/core/versions.mjs) and, for an item no offline source gave a licence, the registry's (`licenseFrom:
// "registry"`). The answer is untrusted: a version is kept only as a release reads, a licence only as a licence's name.
// A spy `fetch` answers (no request leaves the machine); the clock is never read (mock timers). Which names are sent at
// all: facts-network-gateway.test.mjs and the proof and second-net files, whose scenarios run unchanged.
import { test, describe, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { checkExistence, createRegistryClient } from "../../engine/facts/network.mjs";
import { emptyRegistries } from "../../engine/facts/declarations.mjs";
import { packageId } from "../../engine/core/packages.mjs";
import {
  npmEntry,
  packageJson,
  packageLockV3,
  poetryLock,
  poetryPackage,
  poetryProject,
  registryUrl,
} from "../tools/locks.mjs";
import { network } from "../tools/deps-apps.mjs";

/** The registries the second net reads: nothing declared, every item given proven by a lock. */
const registriesFor = (items) => ({ ...emptyRegistries(), proven: new Set(items.map(packageId)) });

/** A registry's 200 answer: its JSON document `doc` (npm's version document, PyPI's project JSON). */
const ok = (doc) => ({ ok: true, status: 200, json: async () => doc });

/** An npm and a PyPI document giving `version` and `license` as each registry writes them. */
const npmDoc = (version, license) => ({ name: "x", version, ...(license === undefined ? {} : { license }) });
const pipDoc = (version, license) => ({
  info: { version, ...(license === undefined ? {} : { license_expression: license }) },
});

/** What `describe` gives for one item and one answer, and the URLs it requested. */
async function describeWith(item, answer) {
  const urls = [];
  const fetch = async (url) => (urls.push(url), answer(url));
  const out = await createRegistryClient({ fetch, registries: registriesFor([item]) }).describe(item);
  return { out, urls };
}

/** One direct item through checkExistence, the registry answering `answer`: the item as it is kept. */
async function keptWith(item, answer) {
  const direct = { direct: true, ...item };
  const [out] = await checkExistence([direct], async () => answer(), { registries: registriesFor([direct]) });
  return out;
}

const NPM = { name: "next", ecosystem: "npm", version: "14.2.3" };
const PIP = { name: "flask", ecosystem: "pip", version: "2.3.3" };

describe("describe: one request on the latest version's document, its version and its licence", () => {
  const ROWS = [
    // [label, item, document, expected latest, expected licence]
    ["npm: version and license", NPM, npmDoc("15.1.0", "MIT"), "15.1.0", "MIT"],
    ["npm: a licence as older packages write it, { type }", NPM, npmDoc("15.1.0", { type: "ISC" }), "15.1.0", "ISC"],
    [
      "npm: the legacy licenses list, one of them",
      NPM,
      { version: "1.0.0", licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] },
      "1.0.0",
      "MIT OR Apache-2.0",
    ],
    ["npm: a prerelease and a build", NPM, npmDoc("2.0.0-rc.1+b5"), "2.0.0-rc.1+b5", null],
    ["pip: info.version and its SPDX expression", PIP, pipDoc("3.1.0", "BSD-3-Clause"), "3.1.0", "BSD-3-Clause"],
    [
      "pip: the expression before the License field and the classifiers",
      PIP,
      {
        info: {
          version: "3.1.0",
          license_expression: "MIT",
          license: "BSD",
          classifiers: ["License :: OSI Approved :: Apache Software License"],
        },
      },
      "3.1.0",
      "MIT",
    ],
    [
      "pip: the classifiers when nothing else names the licence",
      PIP,
      { info: { version: "3.1.0", license: "", classifiers: ["License :: OSI Approved :: MIT License"] } },
      "3.1.0",
      "MIT License",
    ],
    ["pip: a PEP 440 version with an epoch and a post release", PIP, pipDoc("1!2.0.post1"), "1!2.0.post1", null],
    ["pip: a release candidate", PIP, pipDoc("2.0.0rc1"), "2.0.0rc1", null],
  ];
  for (const [label, item, doc, latest, license] of ROWS)
    test(label, async () => {
      const { out, urls } = await describeWith(item, () => ok(doc));
      assert.deepEqual(out, { exists: true, latest, license });
      assert.deepEqual(urls, [registryUrl(item.ecosystem, item.name)], "one request, the latest version's document");
    });

  test("the clients of one run share its answers: one request a package, the guard still judging every call", async () => {
    const urls = [];
    const fetch = async (url) => (urls.push(url), ok(npmDoc("15.1.0", "MIT")));
    const answers = new Map();
    const registries = registriesFor([NPM]);
    const [a, b] = [1, 2].map(() => createRegistryClient({ fetch, registries, answers }));
    const both = await Promise.all([a.describe(NPM), b.describe(NPM), a.describe({ ...NPM, version: "15.0.0" })]);
    for (const out of both) assert.deepEqual(out, { exists: true, latest: "15.1.0", license: "MIT" });
    assert.deepEqual(urls, [registryUrl("npm", "next")], "one request, concurrent calls and other items included");
    // The answer is there, the package now declared private: still refused, never answered.
    const declared = createRegistryClient({ fetch, registries: { ...registries, npmAll: true }, answers });
    await assert.rejects(declared.describe(NPM), /private package reached the network gateway/);
    // A client of its own asks again.
    await createRegistryClient({ fetch, registries }).describe(NPM);
    assert.equal(urls.length, 2);
  });

  test("a version of 64 characters is kept (the longest), one of 65 is not", async () => {
    const longest = `1.${"0".repeat(62)}`;
    assert.equal(longest.length, 64);
    assert.equal((await describeWith(NPM, () => ok(npmDoc(longest)))).out.latest, longest);
    assert.equal((await describeWith(NPM, () => ok(npmDoc(`${longest}0`)))).out.latest, null);
  });
});

describe("a hostile answer stores nothing (the registry's answer is untrusted)", () => {
  // Split so that no secret detector of the repository finds them in this file.
  const TOKEN = "gh" + "p_" + "a1B2c3D4".repeat(5);
  const JWT = `1.${"ey"}J${"abcdefgh1"}.${"ey"}J${"abcdefgh2"}.abcdefgh3`;
  const CLOUD_KEY = `1.0.0-${"s"}k-${"a1b2c3d4".repeat(3)}`;
  const LICENCE_TEXT =
    "MIT License\n\nCopyright (c) 2024 Someone\n\nPermission is hereby granted, free of charge, to any person";
  const VERSIONS = [
    // [label, version]
    ["an address", "https://evil.example/1.0.0"],
    ["a scheme and a host", "1.0.0://evil.example"],
    ["a blank inside", "1.0.0 beta"],
    ["a line break after it", "1.0.0\n"],
    ["500 characters", `1.${"0".repeat(498)}`],
    ["markup", "1.0.0<script>"],
    ["a quote", '1.0.0"'],
    ["a letter first", "v1.2.3"],
    ["a word, no digit", "canary"],
    ["a JSON web token's shape", JWT],
    ["a cloud key's shape", CLOUD_KEY],
    ["a number, not a string", 2],
    ["an object", { major: 2 }],
  ];
  for (const [label, version] of VERSIONS)
    for (const [ecosystem, item, doc] of [
      ["npm", NPM, npmDoc(version, "MIT")],
      ["pip", PIP, pipDoc(version, "MIT")],
    ])
      test(`${ecosystem}: a latest version that is ${label} is no version`, async () => {
        const { out } = await describeWith(item, () => ok(doc));
        assert.deepEqual(out, { exists: true, latest: null, license: "MIT" }, "the rest of the answer is still read");
        const kept = await keptWith(item, () => ok(doc));
        assert.equal(kept.latest, null);
        assert.equal(kept.majorsBehind, null);
        if (typeof version === "string")
          assert.ok(!JSON.stringify(kept).includes(JSON.stringify(version).slice(1, -1)), "stored nowhere in the item");
      });

  const LICENCES = [
    // [label, npm's license, PyPI's info fields]
    ["a token", TOKEN, { license_expression: TOKEN }],
    ["a licence's whole text", LICENCE_TEXT, { license: LICENCE_TEXT }],
    ["a line of 150 characters", `MIT ${"x".repeat(146)}`, { license_expression: `MIT ${"x".repeat(146)}` }],
    ["an object with no type", { name: "MIT" }, { license_expression: { name: "MIT" } }],
    ["a list of objects", [{ type: "MIT" }], { license_expression: ["MIT"] }],
    ["a classifier that names no licence", null, { classifiers: ["License :: OSI Approved"] }],
  ];
  for (const [label, npmLicense, pipInfo] of LICENCES)
    for (const [ecosystem, item, doc] of [
      ["npm", NPM, npmDoc("15.1.0", npmLicense)],
      ["pip", PIP, { info: { version: "3.1.0", ...pipInfo } }],
    ])
      test(`${ecosystem}: a licence that is ${label} is no licence`, async () => {
        const { out } = await describeWith(item, () => ok(doc));
        assert.equal(out.license, null);
        assert.ok(out.latest, "the version is still read");
        const kept = await keptWith(item, () => ok(doc));
        assert.ok(!("license" in kept) && !("licenseFrom" in kept), JSON.stringify(kept));
        assert.ok(!JSON.stringify(kept).includes(TOKEN) && !JSON.stringify(kept).includes("Permission"));
      });
});

describe("the fields of each direct item sent", () => {
  test("npm: a package.json and its lock, one request; exists, latest and majorsBehind on both; the transitive item unchanged", async () => {
    const { urls, items, out, unreadable } = await network(
      {
        ".npmrc": "@corp:registry=https://npm.corp.internal/\n",
        "package.json": packageJson({ react: "^17.0.0", "@corp/ui": "^1.0.0" }),
        "package-lock.json": packageLockV3(
          { react: "^17.0.0", "@corp/ui": "^1.0.0" },
          {
            "node_modules/react": npmEntry("react", {
              version: "17.0.2",
              license: "MIT",
              dependencies: { "loose-envify": "^1.1.0" },
            }),
            "node_modules/loose-envify": npmEntry("loose-envify", { version: "1.4.0" }),
            "node_modules/@corp/ui": npmEntry("@corp/ui", { host: "https://npm.corp.internal" }),
          },
        ),
      },
      { answer: (url) => (url === registryUrl("npm", "react") ? ok(npmDoc("19.1.0", "Apache-2.0")) : null) },
    );
    assert.deepEqual(unreadable, []);
    assert.deepEqual(urls, [registryUrl("npm", "react")], "the latest version's document, once for both items");
    const react = Object.fromEntries(out.filter((i) => i.name === "react").map((i) => [i.manifest, i]));
    for (const i of Object.values(react)) {
      assert.equal(i.exists, true, i.manifest);
      assert.equal(i.latest, "19.1.0", i.manifest);
      assert.equal(i.majorsBehind, 2, `${i.manifest}: 17 → 19`);
    }
    // The licence the lock gives is the installed version's: kept with its own source. The package has one, so the
    // registry's (the latest version's, Apache-2.0) is written on none of its items, the package.json's included.
    assert.equal(react["package-lock.json"].license, "MIT");
    assert.equal(react["package-lock.json"].licenseFrom, "lock");
    assert.ok(!("license" in react["package.json"]) && !("licenseFrom" in react["package.json"]));
    // A private package is never sent: its fields say nothing.
    const corp = out.filter((i) => i.name === "@corp/ui" && i.direct);
    assert.ok(corp.length >= 1);
    for (const i of corp)
      assert.deepEqual(
        [i.private, i.exists, i.latest, i.majorsBehind, i.licenseFrom],
        [true, null, null, null, undefined],
      );
    // A transitive item is the item read, untouched.
    const k = items.findIndex((i) => i.name === "loose-envify");
    assert.ok(k >= 0 && !items[k].direct);
    assert.equal(out[k], items[k], "the same object, never described");
  });

  test("pip: a pyproject.toml and its poetry.lock, one request; the range ^2.0 and the version 2.3.3 both one major behind", async () => {
    const { urls, out, unreadable } = await network(
      {
        "pyproject.toml": poetryProject({ flask: "^2.0" }),
        "poetry.lock": poetryLock(poetryPackage("flask", { version: "2.3.3" })),
      },
      { answer: () => ok(pipDoc("3.1.0", "BSD-3-Clause")) },
    );
    assert.deepEqual(unreadable, []);
    assert.deepEqual(urls, [registryUrl("pip", "flask")]);
    const flask = out.filter((i) => i.name === "flask" && i.direct);
    assert.deepEqual(flask.map((i) => i.manifest).sort(), ["poetry.lock", "pyproject.toml"]);
    for (const i of flask)
      assert.deepEqual(
        [i.exists, i.latest, i.majorsBehind, i.license, i.licenseFrom],
        [true, "3.1.0", 1, "BSD-3-Clause", "registry"],
        i.manifest,
      );
  });

  test("an unproven item is never sent: exists, latest and majorsBehind null, no licence from the registry", async () => {
    const { urls, out } = await network(
      { "package.json": packageJson({ react: "^17.0.0" }) },
      {
        answer: () => ok(npmDoc("19.1.0", "MIT")),
      },
    );
    assert.deepEqual(urls, []);
    const [react] = out.filter((i) => i.name === "react");
    assert.deepEqual(
      [react.unproven, react.exists, react.latest, react.majorsBehind, "licenseFrom" in react],
      [true, null, null, null, false],
    );
  });

  test("the registry's licence only for a package no offline source gave one, on any of its items", async () => {
    const items = [
      // a: its lock's licence; its manifest item has none of its own, the package has one.
      { name: "a", ecosystem: "npm", version: "1.0.0", direct: true, license: "Apache-2.0", licenseFrom: "lock" },
      { name: "a", ecosystem: "npm", version: null, spec: "^1.0.0", direct: true, manifest: "package.json" },
      // b: no licence anywhere, but on a transitive copy of it: the package has one too.
      { name: "b", ecosystem: "npm", version: "1.0.0", direct: true },
      { name: "b", ecosystem: "npm", version: "1.0.0", direct: false, license: "ISC", licenseFrom: "lock" },
      // c: none: the registry's.
      { name: "c", ecosystem: "npm", version: "1.0.0", direct: true },
    ];
    const out = await checkExistence(items, async () => ok(npmDoc("1.2.0", "MIT")), {
      registries: registriesFor(items),
    });
    assert.deepEqual(
      out.map((i) => [i.name, i.license, i.licenseFrom]),
      [
        ["a", "Apache-2.0", "lock"],
        ["a", undefined, undefined],
        ["b", undefined, undefined],
        ["b", "ISC", "lock"],
        ["c", "MIT", "registry"],
      ],
    );
  });

  test("a registry that gives no licence adds none", async () => {
    const kept = await keptWith(NPM, () => ok(npmDoc("15.1.0")));
    assert.ok(!("license" in kept) && !("licenseFrom" in kept), JSON.stringify(kept));
  });
});

describe("an answer that tells nothing gives null fields", () => {
  const ROWS = [
    // [label, answer, exists]
    ["a 404", () => ({ ok: false, status: 404, json: async () => npmDoc("9.9.9", "MIT") }), false],
    ["a 500", () => ({ ok: false, status: 500, json: async () => npmDoc("9.9.9", "MIT") }), null],
    [
      "a fetch that throws",
      () => {
        throw new Error("network down");
      },
      null,
    ],
    [
      "a body that is not JSON",
      () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON");
        },
      }),
      true,
    ],
    ["a JSON that is no object", () => ok("1.0.0"), true],
    ["a JSON array", () => ok([npmDoc("9.9.9", "MIT")]), true],
  ];
  for (const [label, answer, exists] of ROWS)
    test(`${label}: exists ${exists}, latest and majorsBehind null, no licence`, async () => {
      const kept = await keptWith(NPM, answer);
      assert.deepEqual([kept.exists, kept.latest, kept.majorsBehind], [exists, null, null]);
      assert.ok(!("license" in kept) && !("licenseFrom" in kept), JSON.stringify(kept));
    });

  test("a body over 8 MB, its size told, is never read: its stream cancelled, the package exists, its version unknown", async () => {
    let read = 0;
    let cancelled = 0;
    const big = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-length": String(8 * 1024 * 1024 + 1) }),
      body: { cancel: async () => void cancelled++ },
      json: async () => (read++, npmDoc("99.0.0", "MIT")),
    };
    assert.deepEqual((await describeWith(NPM, () => big)).out, { exists: true, latest: null, license: null });
    assert.equal(read, 0, "never read");
    assert.equal(cancelled, 1, "its stream cancelled");
    const fits = { ...big, headers: new Headers({ "content-length": String(8 * 1024 * 1024) }) };
    assert.deepEqual((await describeWith(NPM, () => fits)).out, { exists: true, latest: "99.0.0", license: "MIT" });
  });

  describe("the timeout (mock timers)", () => {
    afterEach(() => mock.timers.reset());
    const item = { ...NPM, direct: true };

    test("a body that never settles, whatever the signal: null at the timeout", { timeout: 10_000 }, async () => {
      mock.timers.enable({ apis: ["setTimeout"] });
      const fetch = async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) });
      const pending = checkExistence([item], fetch, { timeoutMs: 10_000, registries: registriesFor([item]) });
      await Promise.resolve();
      mock.timers.tick(10_000);
      const [out] = await pending;
      assert.deepEqual([out.exists, out.latest, out.majorsBehind], [null, null, null]);
    });

    test("a registry that never answers: exists, latest and majorsBehind null", { timeout: 10_000 }, async () => {
      mock.timers.enable({ apis: ["setTimeout"] });
      const fetch = (url, { signal }) =>
        new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
      const pending = checkExistence([item], fetch, { registries: registriesFor([item]) });
      mock.timers.tick(5_000);
      const [out] = await pending;
      assert.deepEqual([out.exists, out.latest, out.majorsBehind], [null, null, null]);
    });
  });
});

describe("majorsBehind: the latest major minus the current one, never negative, null when unknown", () => {
  const ROWS = [
    // [label, item fields, latest, expected]
    ["an exact version", { version: "17.0.2" }, "19.1.0", 2],
    ["the exact version before the range beside it", { version: "18.3.1", spec: "^17.0.0" }, "19.1.0", 1],
    ["npm ^", { version: null, spec: "^17.0.0" }, "19.1.0", 2],
    ["npm ~", { version: null, spec: "~17.1" }, "19.1.0", 2],
    ["pip ==", { ecosystem: "pip", version: null, spec: "==2.0.*" }, "3.1.0", 1],
    ["pip ~=", { ecosystem: "pip", version: null, spec: "~=2.0" }, "3.1.0", 1],
    ["a range written after a blank", { version: null, spec: " ^17.0.0" }, "19.1.0", 2],
    ["a lower bound alone names no major", { version: null, spec: ">=1.2" }, "19.1.0", null],
    ["pip >= alone", { ecosystem: "pip", version: null, spec: ">=1.26" }, "2.2.0", null],
    ["any version", { version: null, spec: "*" }, "19.1.0", null],
    ["neither a version nor a range", { version: null }, "19.1.0", null],
    ["the same major", { version: "19.0.0" }, "19.1.0", 0],
    ["a latest older than the version in use", { version: "3.0.0" }, "2.5.0", 0],
    ["a version that is no number", { version: "next" }, "19.1.0", null],
    ["a latest that is no version", { version: "17.0.2" }, "canary", null],
    ["no latest (a 200 without a version)", { version: "17.0.2" }, undefined, null],
  ];
  for (const [label, fields, latest, expected] of ROWS)
    test(`${label}: ${expected}`, async () => {
      const item = { name: "x", ecosystem: "npm", ...fields };
      const doc = item.ecosystem === "pip" ? pipDoc(latest) : npmDoc(latest);
      const kept = await keptWith(item, () => ok(doc));
      assert.equal(kept.majorsBehind, expected);
      assert.equal(kept.latest, latest === "canary" ? null : (latest ?? null));
    });
});
