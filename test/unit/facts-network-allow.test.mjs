// `facts --network` sends only what the configuration lists (`facts.network.allow`, ARCHITECTURE.md §3 and §6.9,
// SECURITY.md, Network): "npm:<name>" compared exactly, "pip:<name>" as PEP 503 normalises it, no wildcard; with no
// list, nothing is sent. The lock files' proof and the second net stay behind the list: a listed name they keep back is
// never sent. Each scenario is a minimal pair — the same application, one thing changed (the list, a declaration, the
// lock) — with a spy `fetch` that records every request (no request leaves the machine). Then the candidates the user
// reviews (networkCandidates, `--json`), what the command prints, and the validation of the list (en and fr).
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  checkExistence,
  createRegistryClient,
  networkCandidates,
  privateRegistries,
} from "../../engine/facts/network.mjs";
import { emptyRegistries } from "../../engine/facts/declarations.mjs";
import { collectQuality } from "../../engine/facts/quality.mjs";
import { renderHealth } from "../../engine/build/developer.mjs";
import { packageId } from "../../engine/core/packages.mjs";
import { readAllowEntry } from "../../engine/project/network-allow.mjs";
import { prepareConfig } from "../../engine/project/load.mjs";
import { createI18n } from "../../engine/i18n.mjs";
import { runCli } from "../../cli/doc-kit.mjs";
import { tempDir } from "../tools/helpers.mjs";
import { app, network, withApp } from "../tools/deps-apps.mjs";
import {
  npmEntry,
  packageJson,
  packageLockV3,
  pyproject,
  registryUrl,
  uvLock,
  uvPackage,
  HOST,
} from "../tools/locks.mjs";

/** An npm application whose package-lock.json proves every name of `deps` (`{ name: range }`), then `extra` files. */
const npmApp = (deps, extra = {}) => ({
  "package.json": packageJson(deps),
  "package-lock.json": packageLockV3(
    deps,
    Object.fromEntries(Object.keys(deps).map((name) => [`node_modules/${name}`, npmEntry(name)])),
  ),
  ...extra,
});

/** A Python application whose uv.lock proves every name of `names` (PyPI's registry, its files on PyPI's host). */
const uvApp = (names, extra = {}) => ({
  "pyproject.toml": pyproject(names),
  "uv.lock": uvLock(...names.map((name) => uvPackage(name))),
  ...extra,
});

/** Both: react and lodash proven by their package-lock.json, fastapi by its uv.lock. */
const BOTH = { ...npmApp({ react: "^18.0.0", lodash: "^4.17.21" }), ...uvApp(["fastapi"]) };

describe("nothing is sent unless the configuration lists it", () => {
  const ROWS = [
    // [label, files, allow, sent, kept back as unlisted]
    ["nothing listed: no proven name is asked for", BOTH, [], [], ["npm react", "npm lodash", "pip fastapi"]],
    ["one listed: that one alone", BOTH, ["npm:react"], ["npm react"], ["npm lodash", "pip fastapi"]],
    [
      "every one listed: every one",
      BOTH,
      ["npm:react", "npm:lodash", "pip:fastapi"],
      ["npm lodash", "npm react", "pip fastapi"],
      [],
    ],
    ["a name the application does not use lists nothing it uses", BOTH, ["npm:left-pad"], [], ["npm react"]],
    ["npm compares a listed name exactly: React is another package", BOTH, ["npm:React"], [], ["npm react"]],
    ["the ecosystem is part of the name: pip:react lists no npm package", BOTH, ["pip:react"], [], ["npm react"]],
    ["a pip name listed as PEP 503 reads it: My_Lib is my-lib", uvApp(["my-lib"]), ["pip:My_Lib"], ["pip my-lib"], []],
    ["a pip name listed with dots and capitals", uvApp(["my-lib"]), ["pip:MY.LIB"], ["pip my-lib"], []],
    ["another pip name lists nothing", uvApp(["my-lib"]), ["pip:my-libs"], [], ["pip my-lib"]],
    ["a wildcard lists nothing", BOTH, ["npm:*", "pip:*"], [], ["npm react", "pip fastapi"]],
    ["an entry with no ecosystem lists nothing", BOTH, ["react", ":react"], [], ["npm react"]],
  ];
  for (const [label, files, allow, sent, unlisted] of ROWS)
    test(label, async () => {
      const result = await network(files, { allow });
      assert.deepEqual(result.sent, sent, `${label}: sent`);
      assert.deepEqual(result.unreadable, []);
      for (const key of unlisted) assert.equal(result.kept[key], "unlisted", `${label}: ${key}`);
      for (const key of sent) assert.equal(result.kept[key], undefined, `${label}: ${key} is not kept back`);
    });

  test("an unlisted item carries `unlisted: true` and null answers, as every other item kept back", async () => {
    const { out, urls } = await network(npmApp({ react: "^18.0.0" }), { allow: [] });
    assert.deepEqual(urls, []);
    const direct = out.filter((i) => i.direct);
    assert.equal(direct.length, 2, "the package.json's item and the lock's");
    for (const i of direct) {
      assert.equal(i.unlisted, true, i.manifest);
      assert.deepEqual([i.exists, i.latest, i.majorsBehind], [null, null, null], i.manifest);
      assert.equal(i.private, undefined, `${i.manifest}: not private`);
      assert.equal(i.unproven, undefined, `${i.manifest}: not unproven`);
    }
  });
});

describe("a listed name is still judged by the proof and the second net", () => {
  const CORP_NPMRC = "@corp:registry=https://npm.corp.internal/\n";
  const ROWS = [
    // [label, base (proves the name), changed (one rule), name sent by the base, entry listed, options of `changed`]
    [
      "an npm scope with its own registry",
      npmApp({ "@corp/ui": "^1.0.0" }),
      npmApp({ "@corp/ui": "^1.0.0" }, { ".npmrc": CORP_NPMRC }),
      "npm @corp/ui",
    ],
    [
      "a registry that replaces npm's",
      npmApp({ "corp-lib": "^1.0.0" }),
      npmApp({ "corp-lib": "^1.0.0" }, { ".npmrc": "registry=https://npm.corp.internal/\n" }),
      "npm corp-lib",
    ],
    [
      "one of the application's own packages",
      npmApp({ "corp-lib": "^1.0.0" }),
      npmApp({ "corp-lib": "^1.0.0" }, { "packages/corp-lib/package.json": { name: "corp-lib", version: "1.0.0" } }),
      "npm corp-lib",
    ],
    [
      "a folder another manifest takes it from",
      npmApp({ "corp-lib": "^1.0.0" }),
      npmApp({ "corp-lib": "^1.0.0" }, { "tools/package.json": packageJson({ "corp-lib": "file:../libs/corp-lib" }) }),
      "npm corp-lib",
    ],
    [
      "a scope declared in the person's own ~/.npmrc",
      npmApp({ "@corp/ui": "^1.0.0" }),
      npmApp({ "@corp/ui": "^1.0.0" }),
      "npm @corp/ui",
      { home: { ".npmrc": CORP_NPMRC } },
    ],
    [
      "a private package index (pip.conf)",
      uvApp(["corp-lib"]),
      uvApp(["corp-lib"], { "pip.conf": `[global]\nextra-index-url = ${HOST.corpPypi}\n` }),
      "pip corp-lib",
    ],
    [
      "a [tool.uv.sources] entry",
      uvApp(["corp-lib"]),
      {
        ...uvApp(["corp-lib"]),
        "pyproject.toml": pyproject(
          ["corp-lib"],
          `[tool.uv.sources]\ncorp-lib = { git = "${HOST.corpGit}/corp-lib" }\n`,
        ),
      },
      "pip corp-lib",
    ],
    [
      "a private index in the person's variables",
      uvApp(["corp-lib"]),
      uvApp(["corp-lib"]),
      "pip corp-lib",
      { env: { PIP_INDEX_URL: HOST.corpPypi } },
    ],
    [
      "a lock that took it from another registry",
      npmApp({ "corp-lib": "^1.0.0" }),
      {
        "package.json": packageJson({ "corp-lib": "^1.0.0" }),
        "package-lock.json": packageLockV3(
          { "corp-lib": "^1.0.0" },
          { "node_modules/corp-lib": npmEntry("corp-lib", { host: HOST.corpNpm }) },
        ),
      },
      "npm corp-lib",
    ],
  ];
  for (const [label, base, changed, name, options = {}] of ROWS)
    test(`listed, then ${label}: never sent, private`, async () => {
      const allow = [name.replace(" ", ":")];
      const before = await network(base, { allow });
      assert.deepEqual(before.sent, [name], `${label}: the base sends the listed name`);
      const after = await network(changed, { allow, ...options });
      assert.deepEqual(after.sent, [], `${label}: nothing sent`);
      assert.equal(after.kept[name], "private", `${label}: kept back as private, listed or not`);
    });

  const UNPROVEN = [
    // [label, base (proves the name), changed (no proof), name]
    [
      "a package.json alone",
      npmApp({ react: "^18.0.0" }),
      { "package.json": packageJson({ react: "^18.0.0" }) },
      "npm react",
    ],
    ["a pyproject.toml alone", uvApp(["flask"]), { "pyproject.toml": pyproject(["flask"]) }, "pip flask"],
  ];
  for (const [label, base, changed, name] of UNPROVEN)
    test(`listed, but ${label}: never sent, unproven`, async () => {
      const allow = [name.replace(" ", ":")];
      assert.deepEqual((await network(base, { allow })).sent, [name], `${label}: the base sends it`);
      const after = await network(changed, { allow });
      assert.deepEqual(after.sent, [], `${label}: nothing sent`);
      assert.equal(after.kept[name], "unproven", label);
    });
});

describe("every caller is held by the gate: the gateway itself, and quality", () => {
  const REACT = { name: "react", ecosystem: "npm", version: "17.0.2", direct: true, manifest: "package-lock.json" };
  const proven = (over = {}) => ({ ...emptyRegistries(), proven: new Set([packageId(REACT)]), ...over });
  const spy = () => {
    const urls = [];
    const fetch = async (url) => (urls.push(url), { ok: true, status: 200, json: async () => ({ version: "19.0.0" }) });
    return { urls, fetch };
  };

  test("the client refuses an unlisted package, and refuses it before the run's answers: one already there is never given", async () => {
    const { urls, fetch } = spy();
    const answer = { exists: true, latest: "19.0.0", license: null };
    const answers = new Map([[packageId(REACT), Promise.resolve(answer)]]);
    const unlisted = createRegistryClient({ fetch, registries: proven(), answers });
    await assert.rejects(unlisted.describe(REACT), /reached the network gateway/);
    assert.deepEqual(urls, [], "nothing sent");
    // The control: listed, the run's answer is given, and nothing more is asked.
    const listed = createRegistryClient({
      fetch,
      registries: proven({ allowed: new Set([packageId(REACT)]) }),
      answers,
    });
    assert.deepEqual(await listed.describe(REACT), answer);
    assert.deepEqual(urls, []);
  });

  test("checkExistence: nothing listed, nothing asked; listed, asked once", async () => {
    for (const [allowed, expected] of [
      [new Set(), []],
      [new Set([packageId(REACT)]), [registryUrl("npm", "react")]],
    ]) {
      const { urls, fetch } = spy();
      const [out] = await checkExistence([{ ...REACT, public: true }], fetch, { registries: proven({ allowed }) });
      assert.deepEqual(urls, expected);
      assert.equal(out.unlisted, expected.length ? undefined : true);
    }
  });

  const QUALITY = [
    // [label, allow, version in use, outdated (null: no package could be asked, unknown), requests]
    ["nothing listed: unknown, not none", [], "17.0.2", null, []],
    ["react listed, two majors behind", ["npm:react"], "17.0.2", 1, [registryUrl("npm", "react")]],
    ["react listed, up to date", ["npm:react"], "19.0.0", 0, [registryUrl("npm", "react")]],
    ["React listed (another npm package)", ["npm:React"], "17.0.2", null, []],
  ];
  for (const [label, allow, version, outdated, requests] of QUALITY)
    test(`quality's outdated count obeys the list: ${label}`, () =>
      withApp({}, async (dir) => {
        const dependencies = [{ ...REACT, version, public: true }];
        // The run's registries (the command's), then quality's own fallback when none is given.
        for (const registries of [privateRegistries(dir, { items: dependencies, allow }), undefined]) {
          const { urls, fetch } = spy();
          const { summary } = await collectQuality(dir, { fetch, dependencies, registries, allow });
          assert.equal(summary.outdated, outdated, `${label}: react ${version} → 19`);
          assert.deepEqual(urls, requests, label);
        }
      }));

  test("the health view says unknown, not 0, when the list kept every package back", () => {
    const t = (key) => key;
    const esc = (s) => String(s);
    const row = (html, key) =>
      new RegExp(`<span>${key.replace(/\./g, "\\.")}</span><strong>([^<]*)</strong>`).exec(html)?.[1];
    const unlisted = { ...REACT, unlisted: true, exists: null, latest: null, majorsBehind: null };
    const kept = renderHealth(
      { dependencies: { items: [unlisted] }, quality: { summary: { outdated: null } } },
      { t, esc },
    );
    assert.equal(row(kept, "render.health.unknownPackages"), "—");
    assert.equal(row(kept, "render.health.outdated"), "—");
    // The control: a package its registry answered for is counted, 0 included.
    const asked = { ...REACT, exists: true, latest: "17.0.2", majorsBehind: 0 };
    const html = renderHealth({ dependencies: { items: [asked] }, quality: { summary: { outdated: 0 } } }, { t, esc });
    assert.equal(row(html, "render.health.unknownPackages"), "0");
    assert.equal(row(html, "render.health.outdated"), "0");
  });
});

describe("the candidates: what listing would send, for the user to review", () => {
  const MIXED = {
    ...npmApp(
      { react: "^18.0.0", JSONStream: "^1.3.5", "@corp/ui": "^1.0.0" },
      { ".npmrc": "@corp:registry=https://npm.corp.internal/\n" },
    ),
    "web/package.json": packageJson({ "left-pad": "^1.3.0" }), // a manifest alone: unproven
    ...uvApp(["My_Lib"]),
    "api/requirements.txt": "unproven-lib==1.0\n",
  };

  test("only proven names that nothing declares private, in the list's syntax; never a private or unproven name", async () => {
    const { candidates, kept } = await network(MIXED, { allow: [] });
    assert.deepEqual(candidates, ["npm:JSONStream", "npm:react", "pip:my-lib"]);
    assert.equal(kept["npm @corp/ui"], "private");
    assert.equal(kept["npm left-pad"], "unproven");
    assert.equal(kept["pip unproven-lib"], "unproven");
    for (const c of candidates) assert.ok(!/corp|left-pad|unproven/.test(c), c);
  });

  test("listing the candidates sends exactly them, and leaves none", async () => {
    const { candidates } = await network(MIXED, { allow: [] });
    const listed = await network(MIXED, { allow: candidates });
    assert.deepEqual(listed.sent, ["npm JSONStream", "npm react", "pip My_Lib"]);
    assert.deepEqual(listed.candidates, []);
  });

  test("a name already listed is no candidate; the others still are", async () => {
    const { candidates } = await network(MIXED, { allow: ["npm:react"] });
    assert.deepEqual(candidates, ["npm:JSONStream", "pip:my-lib"]);
  });

  test("a transitive package is never a candidate (it is never sent)", async () => {
    const files = npmApp({ react: "^18.0.0" });
    files["package-lock.json"].packages["node_modules/scheduler"] = npmEntry("scheduler");
    const { candidates, items } = await network(files, { allow: [] });
    assert.ok(
      items.some((i) => i.name === "scheduler" && !i.direct),
      "the transitive item is read",
    );
    assert.deepEqual(candidates, ["npm:react"]);
  });

  test("a package one of whose items is kept back for another reason is no candidate", () => {
    const x = { name: "x", ecosystem: "npm", version: "1.0.0", direct: true, public: true };
    const registries = { ...emptyRegistries(), proven: new Set([packageId(x)]) };
    assert.deepEqual(networkCandidates([x], registries), ["npm:x"], "the control: one item, unlisted");
    const place = { name: "x", ecosystem: "npm", spec: "file:../x", direct: false };
    assert.deepEqual(networkCandidates([x, place], registries), [], "another item names a place");
  });
});

describe("the command: what it prints, and the candidates of --json", () => {
  const dirs = [];
  after(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  /** A documentation project reading an application made of `files`, listing `allow` (no `facts` key when absent). */
  function project(files, allow) {
    const appDir = app(files);
    const dir = tempDir("doc-kit-allow-");
    dirs.push(appDir, dir);
    const facts = allow ? `, facts: { network: { allow: ${JSON.stringify(allow)} } }` : "";
    fs.writeFileSync(
      path.join(dir, "doc.config.mjs"),
      `export default { product: { name: "Acme Orders" }, app: { dir: ${JSON.stringify(appDir)} }${facts} };\n`,
    );
    fs.mkdirSync(path.join(dir, "content"));
    fs.writeFileSync(path.join(dir, "content", "toc.json"), JSON.stringify({ title: "Acme Orders", sections: [] }));
    return dir;
  }

  /** `doc-kit facts --network` on `dir` (dependencies and quality), with a spy registry; its output and requests. */
  async function facts(dir, more = []) {
    let out = "";
    let err = "";
    const urls = [];
    const args = ["facts", "--project", dir, "--source", "dependencies", "--source", "quality", "--network", ...more];
    const code = await runCli(args, {
      stdout: { write: (s) => (out += s) },
      stderr: { write: (s) => (err += s) },
      env: {},
      commit: () => null,
      exec: () => null,
      fetch: async (url) => (urls.push(url), { ok: true, status: 200, json: async () => ({ version: "19.0.0" }) }),
    });
    return { code, out, err, urls };
  }

  const APP = {
    ...npmApp(
      { react: "^17.0.0", next: "^15.0.0", "@corp/design": "^2.0.0" },
      { ".npmrc": "@corp:registry=https://npm.corp.internal/\n" },
    ),
    "web/package.json": packageJson({ "left-pad": "^1.3.0" }),
  };

  test("nothing listed: nothing sent, the count of the candidates and how to list them (en, fr)", async () => {
    const dir = project(APP);
    const en = await facts(dir);
    assert.equal(en.code, 0, en.err);
    assert.deepEqual(en.urls, []);
    assert.match(en.out, /--network: 2 direct packages not sent: facts\.network\.allow does not list them/);
    assert.match(en.out, /network\.candidates/);
    assert.match(en.out, /facts: \{ network: \{ allow: \["npm:next"\] \} \}/);
    assert.ok(!/corp|left-pad/.test(en.out), "no private or unproven name is printed");
    const fr = await facts(dir, ["--lang", "fr"]);
    assert.match(fr.out, /--network : 2 paquets directs non envoyés : facts\.network\.allow ne les liste pas/);
    assert.match(fr.out, /relisez les candidats/);
    const quality = JSON.parse(fs.readFileSync(path.join(dir, "facts", "quality.json"), "utf8"));
    assert.equal(quality.summary.outdated, null, "nothing asked: unknown, not none");
  });

  test("--json carries the candidates in the list's syntax, never a private or unproven name", async () => {
    const r = await facts(project(APP), ["--json"]);
    assert.equal(r.code, 0, r.err);
    const parsed = JSON.parse(r.out);
    assert.deepEqual(parsed.network, { candidates: ["npm:next", "npm:react"] });
    const deps = parsed.sources.dependencies.items.filter((i) => i.direct);
    assert.ok(deps.find((i) => i.name === "react").unlisted);
    assert.ok(deps.find((i) => i.name === "@corp/design").private);
    assert.ok(deps.find((i) => i.name === "left-pad").unproven);
  });

  test("one listed: that one asked once for both sources, the other counted", async () => {
    const dir = project(APP, ["npm:react", "npm:@corp/design"]);
    const r = await facts(dir);
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(r.urls, [registryUrl("npm", "react")], "react alone, once; @corp/design listed but private");
    assert.match(r.out, /--network: 1 direct package not sent: facts\.network\.allow does not list it/);
    const quality = JSON.parse(fs.readFileSync(path.join(dir, "facts", "quality.json"), "utf8"));
    assert.equal(quality.summary.outdated, 1, "react 17 → 19; next never asked");
  });

  test("every candidate listed: no line about the list", async () => {
    const r = await facts(project(APP, ["npm:react", "npm:next"]));
    assert.deepEqual(r.urls.sort(), [registryUrl("npm", "next"), registryUrl("npm", "react")]);
    assert.ok(!/facts\.network\.allow/.test(r.out), r.out);
  });

  test("nothing listed and no candidate: says that no package name was sent", async () => {
    const r = await facts(project({ "package.json": packageJson({ react: "^18.0.0" }) }));
    assert.deepEqual(r.urls, []);
    assert.match(r.out, /--network: no package name was sent: facts\.network\.allow lists no package/);
    const fr = await facts(project({ "package.json": packageJson({ react: "^18.0.0" }) }), ["--lang", "fr"]);
    assert.match(
      fr.out,
      /--network : aucun nom de paquet n'a été envoyé : facts\.network\.allow ne liste aucun paquet/,
    );
  });

  test("an invalid entry stops the command before any request, with its message in English and French", async () => {
    const dir = project(APP, ["react", "npm:", "npm:@corp/*"]);
    const en = await facts(dir);
    assert.equal(en.code, 2);
    assert.deepEqual(en.urls, []);
    assert.match(en.err, /facts\.network\.allow\[0\]: “react”: an entry starts with its ecosystem \(npm, pip\)/);
    assert.match(en.err, /write "npm:<name>" or "pip:<name>"/);
    assert.match(en.err, /facts\.network\.allow\[1\]: “npm:”: no package name, or a name holding a blank/);
    assert.match(en.err, /facts\.network\.allow\[2\]: “npm:@corp\/\*”: a wildcard lists no package/);
    const fr = await facts(dir, ["--lang", "fr"]);
    assert.equal(fr.code, 2);
    assert.match(fr.err, /facts\.network\.allow\[0\]: « react » : une entrée commence par son écosystème \(npm, pip\)/);
    assert.match(fr.err, /« npm: » : aucun nom de paquet, ou un nom qui contient un blanc/);
    assert.match(fr.err, /« npm:@corp\/\* » : un joker ne liste aucun paquet/);
  });
});

describe("the list in the configuration (facts.network.allow)", () => {
  const ENTRIES = [
    // [entry, read]
    ["npm:react", { ecosystem: "npm", name: "react" }],
    ["npm:@types/node", { ecosystem: "npm", name: "@types/node" }],
    ["npm:JSONStream", { ecosystem: "npm", name: "JSONStream" }],
    ["pip:My_Lib", { ecosystem: "pip", name: "My_Lib" }],
    ["react", { error: "ecosystem" }],
    ["NPM:react", { error: "ecosystem" }],
    ["go:golang.org/x/net", { error: "ecosystem" }],
    [":react", { error: "ecosystem" }],
    ["npm:", { error: "name" }],
    ["pip: flask", { error: "name" }],
    ["npm:re act", { error: "name" }],
    ["npm:*", { error: "wildcard" }],
    ["npm:@corp/*", { error: "wildcard" }],
    ["pip:corp-*", { error: "wildcard" }],
    [42, { error: "ecosystem" }],
  ];
  for (const [entry, read] of ENTRIES)
    test(`readAllowEntry(${JSON.stringify(entry)})`, () => assert.deepEqual(readAllowEntry(entry), read));

  const err = (facts) => {
    try {
      prepareConfig({ product: { name: "X" }, facts }, { env: {} });
      return null;
    } catch (e) {
      return e;
    }
  };

  test("defaults: an empty list, nothing sent", () => {
    assert.deepEqual(prepareConfig({ product: { name: "X" } }, { env: {} }).facts, { network: { allow: [] } });
    assert.deepEqual(
      prepareConfig(
        { product: { name: "X" }, facts: { network: { allow: ["npm:react", "pip:fastapi"] } } },
        { env: {} },
      ).facts.network.allow,
      ["npm:react", "pip:fastapi"],
    );
  });

  const INVALID = [
    // [label, facts, path, key]
    [
      "an unknown ecosystem",
      { network: { allow: ["npm:react", "go:x"] } },
      "facts.network.allow[1]",
      "networkAllowEcosystem",
    ],
    ["no ecosystem", { network: { allow: ["react"] } }, "facts.network.allow[0]", "networkAllowEcosystem"],
    ["an empty name", { network: { allow: ["pip:"] } }, "facts.network.allow[0]", "networkAllowName"],
    ["a wildcard", { network: { allow: ["npm:@corp/*"] } }, "facts.network.allow[0]", "networkAllowWildcard"],
    ["a list that is no array", { network: { allow: "npm:react" } }, "facts.network.allow", "type"],
    ["an entry that is no string", { network: { allow: [42] } }, "facts.network.allow[0]", "type"],
    ["an unknown key", { network: { alow: [] } }, "facts.network.alow", "unknownClose"],
  ];
  for (const [label, facts, where, key] of INVALID)
    test(`${label}: a configuration error (exit code 2), ${key} at ${where}`, () => {
      const e = err(facts);
      assert.ok(e, label);
      assert.equal(e.code, 2);
      assert.equal(e.key, "config.invalid");
      assert.ok(
        e.details.some((d) => d.path === where && d.key === key),
        JSON.stringify(e.details),
      );
    });

  test("each message exists in English and French, with its help", () => {
    const vars = { got: "x", known: "npm, pip", command: "doc-kit" };
    for (const language of ["en", "fr"]) {
      const i18n = createI18n({ language });
      for (const key of ["networkAllowEcosystem", "networkAllowName", "networkAllowWildcard"]) {
        assert.ok(i18n.has(`cli.validate.${key}`), `${language}: ${key}`);
        assert.ok(i18n.has(`cli.validate.${key}.help`), `${language}: ${key}.help`);
        assert.match(i18n.t(`cli.validate.${key}`, vars), /x/, `${language}: ${key} names the entry`);
      }
    }
  });
});
