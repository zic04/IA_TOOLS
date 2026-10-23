// The network gateway (engine/facts/network.mjs, ARCHITECTURE.md §6.9, AUDIT.md S13): the decision that keeps a name
// back (isPrivatePackage: "private" or "unproven"), the client that refuses whatever its caller did, one request a
// package, the answers of `exists` and `latest`, the URL of each registry, and the timeout. A fake `fetch` records every
// request; the clock is never read (the timeout is played with node:test's mock timers).
import { test, describe, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  checkExistence,
  createRegistryClient,
  isPrivatePackage,
  privateRegistries,
} from "../../engine/facts/network.mjs";
import { emptyRegistries } from "../../engine/facts/declarations.mjs";
import { collectDependencies } from "../../engine/facts/dependencies.mjs";
import { collectQuality } from "../../engine/facts/quality.mjs";
import { packageId } from "../../engine/core/packages.mjs";
import { CH, npmEntry, packageJson, packageLockV3, registryUrl, yarnBlock, yarnLock } from "../tools/locks.mjs";
import { expectProofDropped, network, withApp } from "../tools/deps-apps.mjs";

const OK = { ok: true, status: 200 };

/** The registries the second net reads: nothing declared, and `items` proven by a lock (unless `proven` says), then `over`. */
const registriesFor = (items, over = {}) => ({ ...emptyRegistries(), proven: new Set(items.map(packageId)), ...over });

/** A fake `fetch` answering `answer(url)` (OK by default) and recording every URL it is asked. */
function spyFetch(answer = () => OK) {
  const urls = [];
  return { urls, fetch: async (url) => (urls.push(url), answer(url)) };
}

/** Why the gateway keeps `item` back ("private", "unproven") or null when it asks for it; isPrivatePackage agrees. */
async function verdict(item, registries) {
  const { urls, fetch } = spyFetch();
  const [out] = await checkExistence([{ ...item, direct: true }], fetch, { registries });
  const reason = out.private ? "private" : out.unproven ? "unproven" : null;
  assert.equal(isPrivatePackage(item, registries), reason !== null, "isPrivatePackage agrees with checkExistence");
  assert.equal(urls.length, reason === null ? 1 : 0, `requests: ${urls}`);
  assert.equal(out.exists, reason === null ? true : null);
  return reason;
}

describe("the decision: a name is sent only when a lock proves it and nothing declares it private", () => {
  const npm = (name, extra = {}) => ({ name, ecosystem: "npm", version: null, ...extra });
  const pip = (name, extra = {}) => ({ name, ecosystem: "pip", version: null, ...extra });
  const ITEM_ROWS = [
    // [label, item, registries over (proven: false = no lock proves it), expected, why]
    ["a registry range of an npm package is sent", npm("x", { spec: "^1.0.0" }), {}, null, "the positive control"],
    [
      "a package no lock proves is kept back as unproven",
      npm("next"),
      { proven: false },
      "unproven",
      "a manifest proves nothing",
    ],
    [
      "a place beats a missing proof: private, not unproven",
      npm("x", { spec: "file:../lib" }),
      { proven: false },
      "private",
      "the stronger reason is given",
    ],
    ["npm file: spec", npm("x", { spec: "file:../lib" }), {}, "private", "a folder"],
    // A name the public registry cannot hold: whatever a lock says, it is a forged proof (npm: URL-safe, no "." or
    // "_" first, 214 characters at most; pip: PEP 508). The usual names are the controls.
    ["an npm name with a letter outside ASCII", npm(`caf${String.fromCharCode(0xe9)}`), {}, "private", "not URL-safe"],
    ["an npm name starting with an underscore", npm("_corp"), {}, "private", "npm refuses it"],
    ["an npm name starting with a dot", npm(".corp"), {}, "private", "npm refuses it"],
    ["an npm name of 215 characters", npm("a".repeat(215)), {}, "private", "past npm's longest"],
    ["an npm name of 214 characters", npm("a".repeat(214)), {}, null, "npm's longest: the control"],
    ["an npm name in capitals, as old packages are", npm("JSONStream"), {}, null, "npm's registry holds it"],
    ["a scoped npm name", npm("@corp/ui.kit_x"), {}, null, "a scope, dots and underscores inside"],
    ["a scope starting with an underscore", npm("@_corp/ui"), {}, "private", "npm refuses it"],
    ["a pip name ending with a dash", pip("corp-"), {}, "private", "PEP 508 refuses it"],
    ["a pip name starting with an underscore", pip("_corp"), {}, "private", "PEP 508 refuses it"],
    ["a pip name with a letter outside ASCII", pip(`caf${String.fromCharCode(0xe9)}`), {}, "private", "PEP 508"],
    ["a pip name with dots and underscores inside", pip("corp.lib_x-y"), {}, null, "PEP 508 allows them"],
    ["npm workspace: spec", npm("x", { spec: "workspace:*" }), {}, "private", "an own package"],
    ["npm link: spec", npm("x", { spec: "link:../x" }), {}, "private", "a folder"],
    ["npm github: spec", npm("x", { spec: "github:user/repo" }), {}, "private", "a git repository"],
    [
      "npm spec with a space after a slash",
      npm("x", { spec: "corp/ui#v1 extra" }),
      {},
      "private",
      "npm reads a slash as GitHub or a folder",
    ],
    ["npm version that is a folder", npm("tooling", { version: "file:../tooling" }), {}, "private", "a local version"],
    [
      "npm version that is a GitHub repository",
      npm("fork", { version: "github:acme/fork" }),
      {},
      "private",
      "a git repository",
    ],
    [
      "npm local item (its reader said so)",
      npm("x", { version: "1.0.0", local: true }),
      {},
      "private",
      "a lock took it from a place",
    ],
    ["pip spec that is a folder", pip("x", { spec: "../corp-lib" }), {}, "private", "a path"],
    [
      "pip version that is an scp-like git address",
      pip("x", { version: "git@git.corp.internal:corp/lib.git" }),
      {},
      "private",
      "a git repository",
    ],
    [
      "pip spec that is a Windows path",
      pip("x", { spec: `C:${CH.BACKSLASH}libs${CH.BACKSLASH}corp` }),
      {},
      "private",
      "a drive",
    ],
    [
      "pip spec that is a PEP 508 direct reference",
      pip("x", { spec: "@ https://corp.internal/x.zip" }),
      {},
      "private",
      "a URL, not a release",
    ],
    [
      "pip spec starting with git+",
      pip("x", { spec: "git+https://corp.internal/x.git" }),
      {},
      "private",
      "a git repository",
    ],
    ...[">=1.0, <2.0", "^1.2 || ^2", "~=2.0", "==1.0.*", "1!2.0", "*"].map((spec) => [
      `pip range ${spec} is sent`,
      pip("x", { spec }),
      {},
      null,
      "every character of a release range",
    ]),
    [
      "an npm scope with its own registry",
      npm("@corp/ui", { version: "2.1.0" }),
      { npmScopes: new Set(["@corp"]) },
      "private",
      "declared in an .npmrc",
    ],
    [
      "a scope compared in any case",
      npm("@Corp/ui", { version: "2.1.0" }),
      { npmScopes: new Set(["@corp"]) },
      "private",
      "fail closed",
    ],
    [
      "another scope is not private",
      npm("@types/node", { version: "22.0.0" }),
      { npmScopes: new Set(["@corp"]) },
      null,
      "the positive control",
    ],
    [
      "a registry replacing npm's: every npm package",
      npm("next", { version: "15.0.0" }),
      { npmAll: true },
      "private",
      "the default registry is not public",
    ],
    ["a registry replacing npm's spares pip", pip("flask", { version: "3.0.0" }), { npmAll: true }, null, "npm alone"],
    [
      "a private index: every pip package",
      pip("flask", { version: "3.0.0" }),
      { pipAll: true },
      "private",
      "pip cannot tell where a name comes from",
    ],
    ["a private index spares npm", npm("next", { version: "15.0.0" }), { pipAll: true }, null, "pip alone"],
    [
      "an own name of the application",
      npm("acme-utils", { version: "1.0.0" }),
      { names: new Set(["acme-utils"]) },
      "private",
      "its packages",
    ],
    [
      "an own name, in another case",
      npm("Acme-Utils", { version: "1.0.0" }),
      { names: new Set(["acme-utils"]) },
      "private",
      "fail closed",
    ],
    [
      "an own pip name, however it is spelled (PEP 503)",
      pip("Corp_Lib", { version: "1.0.0" }),
      { names: new Set(["corp-lib"]) },
      "private",
      "one package",
    ],
    ["an ecosystem the kit does not know", { name: "golang.org/x/net", ecosystem: "go" }, {}, "private", "never sent"],
  ];
  for (const [label, item, { proven = true, ...over }, expected, why] of ITEM_ROWS)
    test(`${label} (${why})`, async () => {
      assert.equal(await verdict(item, registriesFor(proven ? [item] : [], over)), expected, label);
    });

  test("the proof is the package's own identity: npm names as written, pip names as PEP 503 compares them", async () => {
    const lock = [npm("JSONStream", { version: "1.3.5" }), pip("My_Lib", { version: "1.0.0" })];
    const registries = registriesFor(lock);
    assert.equal(await verdict(npm("JSONStream", { version: "1.3.5" }), registries), null, "the proven name");
    assert.equal(await verdict(npm("jsonstream", { version: "1.3.5" }), registries), "unproven", "another npm package");
    assert.equal(await verdict(pip("my.lib", { version: "1.0.0" }), registries), null, "the same pip package");
  });

  test("a declaration keeps back what a lock proved (a scope, a pip index, places), the other proven names are still sent", async () => {
    const files = {
      ".npmrc": "@acme:registry=https://npm.acme.internal/\n",
      "requirements.txt": "--extra-index-url https://pypi.acme.internal/simple\nacme-billing==1.0\n",
    };
    const items = [
      { name: "next", version: "15.0.0", ecosystem: "npm", direct: true },
      { name: "@acme/ui", version: "2.1.0", ecosystem: "npm", direct: true },
      { name: "@types/node", version: "22.0.0", ecosystem: "npm", direct: true },
      { name: "shared", version: "workspace:*", ecosystem: "npm", direct: true },
      { name: "tooling", version: "file:../tooling", ecosystem: "npm", direct: true },
      { name: "fork", version: "github:acme/fork", ecosystem: "npm", direct: true },
      { name: "acme-billing", version: "1.0", ecosystem: "pip", direct: true },
    ].map((i) => ({ ...i, public: true }));
    await withApp(files, async (dir) => {
      const registries = privateRegistries(dir, { items });
      assert.deepEqual([...registries.npmScopes], ["@acme"]);
      assert.equal(registries.pipAll, true);
      const { urls, fetch } = spyFetch();
      const out = await checkExistence(items, fetch, { registries });
      assert.deepEqual(urls.sort(), [registryUrl("npm", "@types/node"), registryUrl("npm", "next")]);
      for (const name of ["@acme/ui", "shared", "tooling", "fork", "acme-billing"]) {
        const item = out.find((i) => i.name === name);
        assert.equal(item.private, true, name);
        assert.equal(item.exists, null, name);
      }
      for (const name of ["next", "@types/node"]) assert.equal(out.find((i) => i.name === name).exists, true, name);
    });
  });

  for (const [label, registry, privateOnes] of [
    ["a registry replacing npm's default makes every npm package private", "https://npm.acme.internal/", true],
    ["npm's own registry written in full is no declaration", "https://registry.npmjs.org/", false],
  ])
    test(label, async () => {
      const items = [{ name: "next", version: "15.0.0", ecosystem: "npm", direct: true, public: true }];
      await withApp({ ".npmrc": `registry=${registry}\n` }, async (dir) => {
        const registries = privateRegistries(dir, { items });
        assert.equal(registries.npmAll, privateOnes);
        const { urls, fetch } = spyFetch();
        const [out] = await checkExistence(items, fetch, { registries });
        assert.deepEqual(urls, privateOnes ? [] : [registryUrl("npm", "next")]);
        assert.equal(out.private === true, privateOnes);
      });
    });

  describe("a manifest alone proves nothing", () => {
    const MANIFESTS = {
      "package.json": packageJson({ react: "^18.0.0" }),
      "requirements.txt": "flask==3.0.0\n",
      "pyproject.toml": '[project]\nname = "app"\ndependencies = ["fastapi>=0.110"]\n',
      Pipfile: '[packages]\nrequests = "*"\n',
    };

    test("never sent, `unproven: true`, `exists: null`, not private", async () => {
      const { sent, kept, out, unreadable } = await network(MANIFESTS);
      assert.deepEqual(sent, []);
      assert.deepEqual(unreadable, []);
      assert.deepEqual(kept, {
        "npm react": "unproven",
        "pip flask": "unproven",
        "pip fastapi": "unproven",
        "pip requests": "unproven",
      });
      const direct = out.filter((i) => i.direct);
      assert.deepEqual(direct.map((i) => i.name).sort(), ["fastapi", "flask", "react", "requests"]);
      for (const i of direct) {
        assert.equal(i.unproven, true, i.name);
        assert.equal(i.exists, null, i.name);
        assert.equal(i.private, undefined, `${i.name}: not private, only unproven`);
      }
    });

    test("the same manifest beside a lock that proves it is sent", () =>
      expectProofDropped({
        base: {
          "package.json": packageJson({ react: "^18.0.0" }),
          "package-lock.json": packageLockV3({ react: "^18.0.0" }, { "node_modules/react": npmEntry("react") }),
        },
        changed: { "package.json": packageJson({ react: "^18.0.0" }) },
        name: "npm react",
        reason: "unproven",
      }));
  });
});

describe("the client refuses whatever its caller did", () => {
  const next = { name: "next", ecosystem: "npm", version: "15.0.0" };
  const REFUSED = [
    // [label, item, registries over, why]
    [
      "a private scope",
      { name: "@corp/ui", ecosystem: "npm" },
      { npmScopes: new Set(["@corp"]) },
      "declared in an .npmrc",
    ],
    ["a folder", { name: "tooling", version: "file:../tooling", ecosystem: "npm" }, {}, "a place, not a release"],
    ["a registry replacing npm's", next, { npmAll: true }, "every npm package is private"],
    [
      "a pip package behind a private index",
      { name: "flask", ecosystem: "pip" },
      { pipAll: true },
      "every pip package is private",
    ],
    [
      "an own name",
      { name: "acme-utils", ecosystem: "npm" },
      { names: new Set(["acme-utils"]) },
      "the application's package",
    ],
    ["an ecosystem the kit does not know", { name: "golang.org/x/net", ecosystem: "go" }, {}, "never sent"],
    ["a name no lock proves", next, { proven: new Set() }, "unproven"],
  ];
  for (const [label, item, over, why] of REFUSED)
    test(`${label}: exists and latest throw, nothing is sent (${why})`, async () => {
      const { urls, fetch } = spyFetch(() => ({ ...OK, json: async () => ({ version: "2.0.0" }) }));
      const client = createRegistryClient({ fetch, registries: registriesFor([item], over) });
      await assert.rejects(client.exists(item), /private package reached the network gateway/);
      await assert.rejects(client.latest(item), /private package reached the network gateway/);
      assert.deepEqual(urls, []);
    });

  test("a name the lock proves and nothing declares is asked for (the positive control of the refusals)", async () => {
    const { urls, fetch } = spyFetch(() => ({ ...OK, json: async () => ({ version: "2.0.0" }) }));
    const client = createRegistryClient({
      fetch,
      registries: registriesFor([next], { npmScopes: new Set(["@corp"]) }),
    });
    assert.equal(await client.exists(next), true);
    assert.equal(await client.latest(next), "2.0.0");
    assert.deepEqual(urls, [registryUrl("npm", "next"), `${registryUrl("npm", "next")}/latest`]);
  });
});

describe("one request a package", () => {
  const answerOf = (url) => ({
    ok: true,
    status: 200,
    json: async () => ({ version: "19.0.0", info: { version: "1.2.0" } }),
    url,
  });

  test("checkExistence: a package named by a manifest and by its lock is asked for once, both items get the answer", async () => {
    const { sent, out, urls, unreadable } = await network({
      ".npmrc": "@corp:registry=https://npm.corp.internal/\n",
      "package.json": packageJson({ "@corp/ui": "^1", react: "^18" }),
      "package-lock.json": packageLockV3(
        { "@corp/ui": "^1", react: "^18" },
        {
          "node_modules/@corp/ui": npmEntry("@corp/ui"),
          "node_modules/react": npmEntry("react", { version: "18.3.1" }),
        },
      ),
    });
    assert.deepEqual(unreadable, []);
    assert.deepEqual(urls, [registryUrl("npm", "react")], "one request for react, both its items");
    assert.deepEqual(sent, ["npm react"]);
    const react = out.filter((i) => i.name === "react");
    assert.deepEqual(react.map((i) => i.manifest).sort(), ["package-lock.json", "package.json"]);
    for (const i of react) assert.equal(i.exists, true, `${i.manifest}: proven by its lock`);
    const corp = out.filter((i) => i.name === "@corp/ui" && i.direct);
    assert.ok(corp.length >= 1, "the private package's own items exist");
    for (const i of corp)
      assert.equal(i.private, true, `${i.manifest}: a proven package declared private stays private`);
  });

  test("checkExistence: a PyPI package is one however each manifest writes its name (case, '-', '_')", async () => {
    const files = {
      "pyproject.toml": '[project]\nname = "app"\ndependencies = ["FastAPI>=0.110", "my_lib==1.0"]\n',
      "requirements.txt": "fastapi==0.110.0\nmy-lib==1.0\n",
    };
    await withApp(files, async (dir) => {
      // Every item as a lock would prove it: what is left to tell them apart is their identity.
      const items = collectDependencies(dir).map((i) => ({ ...i, public: true }));
      assert.deepEqual(items.map((i) => i.name).sort(), ["FastAPI", "fastapi", "my-lib", "my_lib"]);
      const { urls, fetch } = spyFetch();
      const out = await checkExistence(items, fetch, { registries: privateRegistries(dir, { items }) });
      assert.equal(urls.length, 2, urls.join(", "));
      assert.equal(urls.filter((u) => /fastapi/i.test(u)).length, 1, urls.join(", "));
      assert.equal(urls.filter((u) => /my[-_.]lib/i.test(u)).length, 1, urls.join(", "));
      for (const i of out) assert.equal(i.exists, true, `${i.manifest} ${i.name}: the answer is shared`);
    });
  });

  test("collectQuality: FastAPI and fastapi are one request, and the lock's exact version names the major", async () => {
    await withApp({}, async (dir) => {
      const { urls, fetch } = spyFetch(answerOf);
      const dependencies = [
        { name: "FastAPI", version: "0.110.0", ecosystem: "pip", direct: true, manifest: "poetry.lock", public: true },
        { name: "fastapi", version: null, spec: ">=0.110", ecosystem: "pip", direct: true, manifest: "pyproject.toml" },
      ];
      const { summary } = await collectQuality(dir, {
        fetch,
        dependencies,
        registries: privateRegistries(dir, { items: dependencies }),
      });
      assert.deepEqual(urls, [registryUrl("pip", "FastAPI")]);
      assert.equal(summary.outdated, 1, "0.110.0 → 1.2.0: one major behind, though the range says nothing of it");
    });
  });

  test("collectQuality without declarations given: the proof is read from the dependencies themselves", async () => {
    await withApp({}, async (dir) => {
      const { urls, fetch } = spyFetch(answerOf);
      const dependencies = [
        {
          name: "react",
          version: "17.0.2",
          ecosystem: "npm",
          direct: true,
          manifest: "package-lock.json",
          public: true,
        },
        { name: "left-pad", version: "1.0.0", ecosystem: "npm", direct: true, manifest: "package.json" },
      ];
      const { summary } = await collectQuality(dir, { fetch, dependencies });
      assert.deepEqual(urls, [`${registryUrl("npm", "react")}/latest`], "the unproven one is never asked");
      assert.equal(summary.outdated, 1);
    });
  });

  describe("two npm names that differ only in case are two packages (JSONStream, jsonstream)", () => {
    const answer = (url) => (url.endsWith("/JSONStream") ? OK : { ok: false, status: 404 });
    const deps = { JSONStream: "^1.3.5", jsonstream: "^0.0.1" };
    const LOCKS = [
      [
        // One lock cannot hold both at its top level (a case-insensitive filesystem reads them as one folder), so each
        // package-lock.json belongs to its own folder.
        "two package-lock.json",
        {
          "a/package.json": packageJson({ JSONStream: "^1.3.5" }),
          "a/package-lock.json": packageLockV3(
            { JSONStream: "^1.3.5" },
            { "node_modules/JSONStream": npmEntry("JSONStream", { version: "1.3.5" }) },
          ),
          "b/package.json": packageJson({ jsonstream: "^0.0.1" }),
          "b/package-lock.json": packageLockV3(
            { jsonstream: "^0.0.1" },
            { "node_modules/jsonstream": npmEntry("jsonstream", { version: "0.0.1" }) },
          ),
        },
      ],
      [
        // The same for a yarn.lock: one holding both proves neither (facts-network-proof-yarn.test.mjs, twins).
        "two yarn.lock",
        {
          "a/package.json": packageJson({ JSONStream: deps.JSONStream }),
          "a/yarn.lock": yarnLock(yarnBlock("JSONStream@^1.3.5", { version: "1.3.5" })),
          "b/package.json": packageJson({ jsonstream: deps.jsonstream }),
          "b/yarn.lock": yarnLock(yarnBlock("jsonstream@^0.0.1", { version: "0.0.1" })),
        },
      ],
    ];
    for (const [lockName, files] of LOCKS)
      test(`${lockName}: two requests, each name its own answer`, () =>
        withApp(files, async (dir) => {
          const items = collectDependencies(dir);
          const { urls, fetch } = spyFetch(answer);
          const out = await checkExistence(items, fetch, { registries: privateRegistries(dir, { items }) });
          assert.deepEqual(urls.sort(), [registryUrl("npm", "JSONStream"), registryUrl("npm", "jsonstream")].sort());
          const direct = (name) => out.filter((i) => i.direct && i.name === name);
          assert.ok(direct("JSONStream").length >= 1 && direct("jsonstream").length >= 1, "both names are items");
          for (const i of direct("JSONStream")) assert.equal(i.exists, true, `JSONStream in ${i.manifest}`);
          for (const i of direct("jsonstream")) assert.equal(i.exists, false, `jsonstream in ${i.manifest}`);
        }));

    test("collectQuality: two requests for the latest version, each name its own", async () => {
      await withApp({}, async (dir) => {
        const { urls, fetch } = spyFetch((url) => ({
          ok: true,
          status: 200,
          json: async () => ({ version: url.includes("/JSONStream/") ? "3.0.0" : "1.0.0" }),
        }));
        const dependencies = [
          {
            name: "JSONStream",
            version: "1.3.5",
            ecosystem: "npm",
            direct: true,
            manifest: "package-lock.json",
            public: true,
          },
          {
            name: "jsonstream",
            version: "1.0.0",
            ecosystem: "npm",
            direct: true,
            manifest: "package-lock.json",
            public: true,
          },
        ];
        const { summary } = await collectQuality(dir, { fetch, dependencies });
        assert.deepEqual(urls.sort(), [
          `${registryUrl("npm", "JSONStream")}/latest`,
          `${registryUrl("npm", "jsonstream")}/latest`,
        ]);
        assert.equal(summary.outdated, 1, "JSONStream 1 → 3 is behind, jsonstream 1 → 1 is not");
      });
    });
  });
});

describe("the answers of exists and latest", () => {
  const registries = (items) => registriesFor(items);

  test("exists: true, false (404), null (no usable answer) — direct dependencies only", async () => {
    const items = [
      { name: "next", ecosystem: "npm", direct: true },
      { name: "left-pad-pro", ecosystem: "npm", direct: true },
      { name: "acme-internal", ecosystem: "npm", direct: true },
      { name: "scheduler", ecosystem: "npm", direct: false },
    ];
    const { urls, fetch } = spyFetch((url) => {
      if (url.includes("left-pad-pro")) return { ok: false, status: 404 };
      if (url.includes("acme-internal")) throw new Error("network down");
      return OK;
    });
    const out = await checkExistence(items, fetch, { registries: registries(items) });
    assert.deepEqual(
      out.map((i) => [i.name, i.exists]),
      [
        ["next", true],
        ["left-pad-pro", false],
        ["acme-internal", null],
        ["scheduler", undefined],
      ],
    );
    assert.ok(!("exists" in out[3]), "never checked for a transitive package");
    assert.deepEqual(urls.sort(), ["next", "left-pad-pro", "acme-internal"].map((n) => registryUrl("npm", n)).sort());
  });

  const EXISTS_ROWS = [
    ["a 200 answer", () => OK, true],
    ["a 404 answer", () => ({ ok: false, status: 404 }), false],
    ["a 500 answer", () => ({ ok: false, status: 500 }), null],
    ["a 403 answer", () => ({ ok: false, status: 403 }), null],
    [
      "a fetch that throws",
      () => {
        throw new Error("network down");
      },
      null,
    ],
  ];
  for (const [label, answer, expected] of EXISTS_ROWS)
    test(`exists, ${label}: ${expected}`, async () => {
      const item = { name: "next", ecosystem: "npm", version: "15.0.0" };
      const client = createRegistryClient({ fetch: spyFetch(answer).fetch, registries: registriesFor([item]) });
      assert.equal(await client.exists(item), expected);
    });

  const LATEST_ROWS = [
    [
      "npm: the version of the answer",
      { name: "next", ecosystem: "npm" },
      { ok: true, status: 200, json: async () => ({ version: "15.1.0" }) },
      "15.1.0",
    ],
    [
      "pip: info.version of the answer",
      { name: "flask", ecosystem: "pip" },
      { ok: true, status: 200, json: async () => ({ info: { version: "3.1.0" } }) },
      "3.1.0",
    ],
    [
      "a 404",
      { name: "next", ecosystem: "npm" },
      { ok: false, status: 404, json: async () => ({ version: "9.9.9" }) },
      null,
    ],
    [
      "an answer without a version",
      { name: "next", ecosystem: "npm" },
      { ok: true, status: 200, json: async () => ({}) },
      null,
    ],
    [
      "a pip answer without info",
      { name: "flask", ecosystem: "pip" },
      { ok: true, status: 200, json: async () => ({}) },
      null,
    ],
    [
      "a body that is not JSON",
      { name: "next", ecosystem: "npm" },
      {
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("x");
        },
      },
      null,
    ],
  ];
  for (const [label, item, response, expected] of LATEST_ROWS)
    test(`latest, ${label}: ${expected}`, async () => {
      const client = createRegistryClient({ fetch: spyFetch(() => response).fetch, registries: registriesFor([item]) });
      assert.equal(await client.latest(item), expected);
    });

  test("a package kept back is annotated and its `exists` is null; the others keep their answer", async () => {
    const items = [
      { name: "@corp/ui", ecosystem: "npm", direct: true },
      { name: "react", ecosystem: "npm", direct: true },
      { name: "left-pad", ecosystem: "npm", direct: true },
    ];
    const { fetch } = spyFetch();
    const out = await checkExistence(items, fetch, {
      registries: registriesFor(items.slice(0, 2), { npmScopes: new Set(["@corp"]) }),
    });
    assert.deepEqual(
      out.map((i) => [i.name, i.private, i.unproven, i.exists]),
      [
        ["@corp/ui", true, undefined, null],
        ["react", undefined, undefined, true],
        ["left-pad", undefined, true, null],
      ],
    );
  });
});

describe("the URL of each registry", () => {
  const ROWS = [
    ["npm", "next", "https://registry.npmjs.org/next", "https://registry.npmjs.org/next/latest"],
    [
      "npm",
      "@types/node",
      "https://registry.npmjs.org/%40types%2Fnode",
      "https://registry.npmjs.org/%40types%2Fnode/latest",
    ],
    ["pip", "fastapi", "https://pypi.org/pypi/fastapi/json", "https://pypi.org/pypi/fastapi/json"],
    ["pip", "my_lib", "https://pypi.org/pypi/my_lib/json", "https://pypi.org/pypi/my_lib/json"],
  ];
  for (const [ecosystem, name, exists, latest] of ROWS)
    test(`${ecosystem} ${name}: ${exists}`, async () => {
      const item = { name, ecosystem, version: "1.0.0" };
      const { urls, fetch } = spyFetch(() => ({ ...OK, json: async () => ({ version: "1", info: { version: "1" } }) }));
      const client = createRegistryClient({ fetch, registries: registriesFor([item]) });
      await client.exists(item);
      await client.latest(item);
      assert.deepEqual(urls, [exists, latest]);
      assert.equal(exists.split("/latest")[0], registryUrl(ecosystem, name), "the shared tool builds the same URL");
    });

  test("a request carries only the name: one argument, a signal, no version and no header", async () => {
    const calls = [];
    const fetch = async (...args) => (calls.push(args), OK);
    const item = { name: "next", ecosystem: "npm", version: "15.0.0", spec: "^15" };
    await createRegistryClient({ fetch, registries: registriesFor([item]) }).exists(item);
    assert.equal(calls.length, 1);
    assert.deepEqual(Object.keys(calls[0][1]), ["signal"]);
    assert.ok(!calls[0][0].includes("15"), calls[0][0]);
    assert.ok(calls[0][1].signal instanceof AbortSignal);
  });
});

describe("the timeout covers the whole answer (played with mock timers, the clock is never read)", () => {
  afterEach(() => mock.timers.reset());

  /** A fetch whose answer settles only when the request is aborted; `state.aborted` says whether it was. */
  function hanging({ body = false } = {}) {
    const state = { calls: 0, aborted: false };
    const onAbort = (signal, reject) =>
      signal.addEventListener("abort", () => ((state.aborted = true), reject(new Error("aborted"))));
    state.fetch = (url, { signal }) => {
      state.calls++;
      if (!body) return new Promise((resolve, reject) => onAbort(signal, reject));
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => new Promise((resolve, reject) => onAbort(signal, reject)),
      });
    };
    return state;
  }
  const item = { name: "next", ecosystem: "npm", version: "15.0.0" };
  const make = (fetch, timeoutMs) => createRegistryClient({ fetch, registries: registriesFor([item]), timeoutMs });

  for (const [label, body, call] of [
    ["exists, a registry that never answers", false, (c) => c.exists(item)],
    ["latest, a registry that never answers", false, (c) => c.latest(item)],
    ["latest, a registry that trickles its body", true, (c) => c.latest(item)],
  ])
    test(`${label}: aborted at the timeout, the answer is null`, { timeout: 10_000 }, async () => {
      mock.timers.enable({ apis: ["setTimeout"] });
      const state = hanging({ body });
      const pending = call(make(state.fetch, 10_000));
      assert.equal(state.calls, 1);
      mock.timers.tick(9_999);
      await Promise.resolve();
      assert.equal(state.aborted, false, "not aborted one millisecond early");
      mock.timers.tick(1);
      assert.equal(await pending, null);
      assert.equal(state.aborted, true, "aborted at the timeout");
    });

  test("the default timeout is 5 seconds", { timeout: 10_000 }, async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const state = hanging();
    const pending = createRegistryClient({ fetch: state.fetch, registries: registriesFor([item]) }).exists(item);
    mock.timers.tick(4_999);
    assert.equal(state.aborted, false);
    mock.timers.tick(1);
    assert.equal(await pending, null);
    assert.equal(state.aborted, true);
  });

  test(
    "checkExistence passes its timeout to the client: a hanging registry gives `exists: null`",
    { timeout: 10_000 },
    async () => {
      mock.timers.enable({ apis: ["setTimeout"] });
      const state = hanging();
      const pending = checkExistence([{ ...item, direct: true }], state.fetch, {
        timeoutMs: 10_000,
        registries: registriesFor([item]),
      });
      assert.equal(state.calls, 1);
      mock.timers.tick(10_000);
      const [out] = await pending;
      assert.equal(out.exists, null);
      assert.equal(state.aborted, true);
    },
  );

  test("an answer in time is not aborted afterwards (the timer is cleared)", { timeout: 10_000 }, async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    let signal;
    const fetch = async (url, options) => ((signal = options.signal), OK);
    assert.equal(await make(fetch, 10_000).exists(item), true);
    mock.timers.tick(10_000);
    assert.equal(signal.aborted, false);
  });
});
