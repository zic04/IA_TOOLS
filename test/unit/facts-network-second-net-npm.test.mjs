// `--network`, the second net for npm (engine/facts/network.mjs, engine/facts/declarations.mjs): behind the lock files'
// proof, a name is kept back when it names a place, an npm alias, one of the application's own packages, or when a
// private registry is declared where the kit reads — the application's .npmrc, .yarnrc, .yarnrc.yml and bunfig.toml,
// the person's own files and their npm, yarn and bun variables (SECURITY.md, "Network").
// Every test marks every item proven (`proof: "all"`): only the second net keeps a name back. Each private outcome has
// its positive control, the same application with the public value, which sends the name.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { privateRegistries } from "../../engine/facts/network.mjs";
import {
  HOST,
  CH,
  packageJson,
  npmEntry,
  packageLockV1,
  packageLockV3,
  tarball,
  v1Entry,
  yarnBlock,
  yarnLock,
} from "../tools/locks.mjs";
import { expectProofDropped, expectSent, network, registriesOf, withApp } from "../tools/deps-apps.mjs";

const PROVEN = { proof: "all" };
const CORP = `${HOST.corpNpm}/`;
const PUBLIC = `${HOST.npm}/`;
const BACKSLASH = CH.BACKSLASH;

// ─── The outcome of a declaration ───────────────────────────────────────────────────────────────────────────────

/** The scopes the tests declare, and the application that depends on one package of each, and on `react`. */
const SCOPES = ["@corp", "@team", "@other"];
const NAMES = ["npm react", ...SCOPES.map((s) => `npm ${s}/ui`)];
const APP = {
  "package.json": packageJson({ react: "^18.0.0", ...Object.fromEntries(SCOPES.map((s) => [`${s}/ui`, "^1.0.0"])) }),
};
/** What a declaration does: every npm package private (`all`), the packages of these scopes, or nothing. */
const ALL = { all: true, scopes: [] };
const NONE = { all: false, scopes: [] };
const scoped = (...scopes) => ({ all: false, scopes });
const allAnd = (...scopes) => ({ all: true, scopes });

/** `text` with the company's registry made npm's own: the same declaration with a public value. */
function pub(text) {
  const changed = text.replaceAll(HOST.corpNpm, HOST.npm);
  assert.notEqual(changed, text, "the control needs a registry to make public");
  return changed;
}

/**
 * Asserts what `--network` sends for APP and `files`, and why each other name stays back, then what the kit read:
 * `npmAll` and the scopes of `registriesOf`.
 */
async function expectOutcome(files, outcome, label, options = {}) {
  const all = { ...APP, ...files };
  const privateNames = outcome.all ? NAMES : NAMES.filter((n) => outcome.scopes.some((s) => n.startsWith(`npm ${s}/`)));
  const result = await network(all, { ...PROVEN, ...options });
  assert.deepEqual(result.sent, NAMES.filter((n) => !privateNames.includes(n)).sort(), `${label}: sent`);
  assert.deepEqual(result.kept, Object.fromEntries(privateNames.map((n) => [n, "private"])), `${label}: kept back`);
  assert.deepEqual(result.unreadable, [], `${label}: every file read`);
  const read = await registriesOf(all, { env: options.env, home: options.home });
  assert.equal(read.npmAll, outcome.all, `${label}: every npm package`);
  assert.deepEqual([...read.npmScopes].sort(), [...outcome.scopes].sort(), `${label}: scopes`);
}

/**
 * One test per row `[label, text, outcome, why, control]` of the application's `file`: the row's outcome, then its
 * control (the same file with another value: the opposite outcome).
 */
function declarationRows(file, rows) {
  for (const [label, text, outcome, why, control] of rows)
    test(label, async () => {
      await expectOutcome({ [file]: text }, outcome, `${label} (${why})`);
      if (control === undefined) return;
      const opposite = outcome.all || outcome.scopes.length ? NONE : ALL;
      await expectOutcome({ [file]: control }, opposite, `${label}: control`);
    });
}

/** A file in UTF-16 with its byte order mark, little or big endian (a Windows editor, PowerShell 5). */
const utf16 = (text, endian) =>
  endian === "le"
    ? Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")])
    : Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(text, "utf16le").swap16()]);

/** A package.json of `dependencies`, and the names `--network` sends for it. */
const manifest = (dependencies) => ({ "package.json": packageJson(dependencies) });

// ─── Places and aliases ─────────────────────────────────────────────────────────────────────────────────────────

describe("a range that names a place is never sent", () => {
  const PLACES = [
    ["an archive: x.tgz", "corp-1.0.0.tgz", "npm reads it as a file"],
    ["an archive: x.tar.gz", "corp.tar.gz", "npm reads it as a file"],
    ["an archive: x.tar", "corp.tar", "npm reads it as a file"],
    ["an archive in capitals", "CORP.TGZ", "npm reads LIB.TGZ as an archive too"],
    ["a dot", ".", "the application's own folder"],
    ["two dots", "..", "the folder above"],
    ["a drive", "c:lib", "a protocol or a drive: a place"],
    ["a hidden folder", ".hidden/lib", "starts with a dot"],
    ["a folder", "./libs/a", "relative"],
    ["a folder two levels up", "../../libs/b", "relative"],
    ["an absolute folder", "/opt/c", "absolute"],
    ["a home folder", "~/d", "the person's home"],
    ["a Windows folder", `C:${BACKSLASH}libs${BACKSLASH}h`, "a drive and backslashes"],
    ["a scp-like git address", "git@github.com:corp/e.git", "git over ssh"],
    ["a gitlab: shorthand", "gitlab:corp/f", "a git host"],
    ["a bitbucket: shorthand", "bitbucket:corp/g", "a git host"],
    ["a github: shorthand", "github:acme/fork", "a git host"],
    ["a scoped name as a spec", "@corp/lib", "a spec holding a slash is a folder to npm"],
    ["a slash and a space", "corp/ui#v1 extra", "a spec holding a slash"],
    ["file:", "file:../lib", "a folder"],
    ["file: of a sibling", "file:../tooling", "a folder"],
    ["workspace:", "workspace:*", "the application's own package"],
    ["link:", "link:../x", "a folder"],
    ["exec: of a script", "exec:./tools/gen-ui.js", "any protocol but npm: and patch:"],
    ["exec: of a file", "exec:gen-ui.js", "any protocol but npm: and patch:"],
    ["ssh://", "ssh://git@git.corp.internal/corp/ui.git", "a git repository"],
    ["patch:", "patch:react@npm%3A18.3.1#./patches/react.patch", "names a patch file of the project"],
  ];
  for (const [label, spec, why] of PLACES)
    test(label, async () => {
      const text = `${label} (${why})`;
      const { before, after } = await expectProofDropped({
        base: manifest({ lib: "^1.0.0", react: "^18.0.0" }),
        changed: manifest({ lib: spec, react: "^18.0.0" }),
        name: "npm lib",
        reason: "private",
        label: text,
        ...PROVEN,
      });
      assert.deepEqual(before.sent, ["npm lib", "npm react"], `${text}: control`);
      assert.deepEqual(after.sent, ["npm react"], text);
      assert.deepEqual(after.unreadable, [], `${text}: every file read`);
    });

  const PUBLIC_RANGES = [
    "^1.2.3",
    "~3.1.0",
    ">=1 <2",
    "1.x",
    "latest",
    "*",
    "1.2.3 - 2.0.0",
    "^1.0.0 || ^2.0.0",
    "1.2.3",
    "2.x.x",
  ];
  for (const spec of PUBLIC_RANGES)
    test(`a registry range is a release, sent: ${spec}`, async () => {
      const result = await expectSent(manifest({ lib: spec }), ["npm lib"], { ...PROVEN, label: spec });
      assert.equal(result.items.find((i) => i.name === "lib").local, undefined, `${spec} names no place`);
    });

  // A range holding a character no release has (`#`, `@`) is no `local` item, yet it names no release: its name is
  // private in every manifest — its lock's item, which the lock proves, too.
  for (const spec of ["1.0.0#x", "^1 || corp-lib@2"])
    test(`a range no release holds (${spec}) keeps its name back in its lock too`, async () => {
      const files = (range) => ({
        "package.json": packageJson({ "corp-lib": range }),
        "package-lock.json": packageLockV3({ "corp-lib": range }, { "node_modules/corp-lib": npmEntry("corp-lib") }),
      });
      await expectProofDropped({
        base: files("^1.0.0"),
        changed: files(spec),
        name: "npm corp-lib",
        reason: "private",
        label: spec,
      });
    });
});

describe("an npm alias is never sent", () => {
  const ALIASES = [
    ["a scoped alias with a version", "npm:@corp/ui@^1", "npm reads every npm: spec as an alias"],
    ["an alias of a public package", "npm:react@18.3.1", "an alias is never sent, whatever it points at"],
    ["a scoped alias without a version", "npm:@corp/ui", "no version: still an alias"],
    ["an alias of a plain name", "npm:corp-ui-impl", "holds a range's characters once npm: is read"],
    ["berry's explicit range", "npm:^18.0.0", "cannot be told from an alias"],
    ["a target starting with x", "npm:xcorp-ui", "a bare x is not a range here"],
    ["a target starting with a capital X", "npm:Xcorp", "in any case"],
    ["a target starting with a digit", "npm:3d-corp", "a digit is not a range"],
    ["a target that is a lone x", "npm:x", "an alias"],
    ["a target 1x", "npm:1x", "an alias"],
    ["a target x-x", "npm:x-x", "an alias"],
  ];
  for (const [label, spec, why] of ALIASES)
    test(label, async () => {
      const text = `${label} (${why})`;
      const { after } = await expectProofDropped({
        base: manifest({ lib: "^1.0.0", react: "^18.0.0" }),
        changed: manifest({ lib: spec, react: "^18.0.0" }),
        name: "npm lib",
        reason: "private",
        label: text,
        ...PROVEN,
      });
      assert.deepEqual(after.sent, ["npm react"], text);
    });

  test("an alias in yarn.lock is private, in the package.json and in its lock", async () => {
    const files = (alias, header) => ({
      ...manifest({ "corp-ui": alias, "react-18": alias === "^1" ? "^18.3.1" : "npm:react@18.3.1", react: "^18.0.0" }),
      "yarn.lock": yarnLock(yarnBlock(header, { name: "@corp/ui" })),
    });
    const { before, after } = await expectProofDropped({
      base: files("^1", '"corp-ui@^1"'),
      changed: files("npm:@corp/ui@^1", '"corp-ui@npm:@corp/ui@^1"'),
      name: "npm corp-ui",
      reason: "private",
      ...PROVEN,
    });
    assert.deepEqual(before.sent, ["npm corp-ui", "npm react", "npm react-18"], "control");
    assert.deepEqual(after.sent, ["npm react"]);
    assert.equal(after.kept["npm react-18"], "private", "an alias of a public package too");
    const lockItem = after.items.find((i) => i.manifest === "yarn.lock" && i.name === "corp-ui");
    assert.ok(lockItem, "the lock's own item exists");
    assert.equal(lockItem.local, true, "the lock's item is an alias, a place");
  });

  test("an alias whose target starts with x is private in its yarn.lock item too", async () => {
    const files = (alias, header) => ({
      ...manifest({ "corp-ui": alias, react: "^18.0.0" }),
      "yarn.lock": yarnLock(yarnBlock(header, { name: "xcorp-ui" })),
    });
    const { after } = await expectProofDropped({
      base: files("^1", '"corp-ui@^1"'),
      changed: files("npm:xcorp-ui", '"corp-ui@npm:xcorp-ui"'),
      name: "npm corp-ui",
      reason: "private",
      ...PROVEN,
    });
    assert.deepEqual(after.sent, ["npm react"]);
    const lockItem = after.items.find((i) => i.manifest === "yarn.lock" && i.name === "corp-ui");
    assert.ok(lockItem, "the lock's own item exists");
    assert.equal(lockItem.local, true, "the lock's item is an alias, a place");
    // The alias is only in the lock: the package.json's plain range does not hide it, the name stays back.
    const plain = await network(files("^1", '"corp-ui@npm:xcorp-ui"'), PROVEN);
    assert.equal(plain.kept["npm corp-ui"], "private", "a plain range in the package.json, an alias in the lock");
    assert.deepEqual(plain.sent, ["npm react"]);
  });

  test("a package-lock alias (corp-x for x) is private", async () => {
    const lock = (alias) =>
      packageLockV3(
        { "corp-x": alias ? "npm:x@^1.0.0" : "^1.0.0", react: "^18.2.0" },
        {
          "node_modules/corp-x": npmEntry("x", alias ? { name: "x" } : {}),
          "node_modules/react": npmEntry("react", { version: "18.2.0" }),
        },
      );
    const { before, after } = await expectProofDropped({
      base: { "package-lock.json": lock(false) },
      changed: { "package-lock.json": lock(true) },
      name: "npm corp-x",
      reason: "private",
      ...PROVEN,
    });
    assert.deepEqual(before.sent, ["npm corp-x", "npm react"], "control");
    assert.deepEqual(after.sent, ["npm react"]);
  });
});

describe("a package a lock took from elsewhere than a public registry is never sent", () => {
  const next = (version = "15.0.0") => ({ next: version });

  test("package-lock v3: a tarball of a private registry", async () => {
    const lock = (host) =>
      packageLockV3(
        { "corp-private": "^2.0.0", ...next() },
        {
          "node_modules/corp-private": npmEntry("corp-private", { version: "2.1.0", host }),
          "node_modules/next": npmEntry("next", { version: "15.0.0" }),
        },
      );
    const { before, after } = await expectProofDropped({
      base: { "package-lock.json": lock(HOST.npm) },
      changed: { "package-lock.json": lock(HOST.corpNpm) },
      name: "npm corp-private",
      reason: "private",
      ...PROVEN,
    });
    assert.deepEqual(before.sent, ["npm corp-private", "npm next"], "control");
    assert.deepEqual(after.sent, ["npm next"]);
    assert.deepEqual(after.unreadable, []);
  });

  test("package-lock v1: a tarball of a private registry", async () => {
    const lock = (host) => packageLockV1({ "corp-reg-lib": v1Entry("corp-reg-lib", { host }) });
    const files = (host) => ({ ...manifest({ "corp-reg-lib": "^1" }), "package-lock.json": lock(host) });
    const { before, after } = await expectProofDropped({
      base: files(HOST.npm),
      changed: files(HOST.corpNpm),
      name: "npm corp-reg-lib",
      reason: "private",
      ...PROVEN,
    });
    assert.deepEqual(before.sent, ["npm corp-reg-lib"], "control");
    assert.deepEqual(after.sent, []);
    assert.deepEqual(after.unreadable, []);
  });

  test("yarn.lock v1: a tarball of a private registry, a scoped name", async () => {
    const files = (resolved) => ({
      ...manifest({ "@corp/ui": "^1.0.0", ...next() }),
      "yarn.lock": yarnLock(
        yarnBlock('"@corp/ui@^1.0.0"', { name: "@corp/ui", resolved }),
        yarnBlock("next@15.0.0", { version: "15.0.0" }),
      ),
    });
    const own = `${tarball("@corp/ui", { host: HOST.yarn })}#abc`;
    const { before, after } = await expectProofDropped({
      base: files(own),
      changed: files(`${tarball("@corp/ui", { host: HOST.corpNpm })}#abc`),
      name: "npm @corp/ui",
      reason: "private",
      ...PROVEN,
    });
    assert.deepEqual(before.sent, ["npm @corp/ui", "npm next"], "control");
    assert.deepEqual(after.sent, ["npm next"]);
    assert.deepEqual(after.unreadable, []);
  });

  test("yarn berry: a resolution that is a URL of a private host", async () => {
    const berry = (resolution) =>
      [
        `"corp-x@npm:^2.0.0":\n  version: 2.0.0\n  resolution: "${resolution}"`,
        '"next@npm:15.0.0":\n  version: 15.0.0\n  resolution: "next@npm:15.0.0"',
      ].join("\n\n");
    const files = (resolution) => ({
      ...manifest({ "corp-x": "^2.0.0", ...next() }),
      "yarn.lock": berry(resolution),
    });
    const { before, after } = await expectProofDropped({
      base: files("corp-x@npm:2.0.0"),
      changed: files("corp-x@https://files.corp.internal/corp-x-2.0.0.tgz"),
      name: "npm corp-x",
      reason: "private",
      ...PROVEN,
    });
    assert.deepEqual(before.sent, ["npm corp-x", "npm next"], "control");
    assert.deepEqual(after.sent, ["npm next"]);
    const lock = after.items.filter((i) => i.manifest === "yarn.lock");
    assert.equal(lock.find((i) => i.name === "corp-x").local, true, "the lock's item is a place");
    assert.ok(!("local" in lock.find((i) => i.name === "next")), "npm: is the configured registry");
  });

  test("pnpm-lock.yaml: a tarball of a private host", async () => {
    const pnpm = (resolution) =>
      [
        "lockfileVersion: '9.0'",
        "packages:",
        "  corp-x@2.0.0:",
        `    resolution: ${resolution}`,
        "  next@15.0.0:",
        "    resolution: {integrity: sha512-abc}",
      ].join("\n");
    const files = (resolution) => ({
      ...manifest({ "corp-x": "^2.0.0", ...next() }),
      "pnpm-lock.yaml": pnpm(resolution),
    });
    const { before, after } = await expectProofDropped({
      base: files("{integrity: sha512-abc}"),
      changed: files("{tarball: https://files.corp.internal/corp-x-2.0.0.tgz}"),
      name: "npm corp-x",
      reason: "private",
      ...PROVEN,
    });
    assert.deepEqual(before.sent, ["npm corp-x", "npm next"], "control");
    assert.deepEqual(after.sent, ["npm next"]);
    const lock = after.items.filter((i) => i.manifest === "pnpm-lock.yaml");
    assert.equal(lock.find((i) => i.name === "corp-x").local, true, "the lock's item is a place");
    assert.ok(!("local" in lock.find((i) => i.name === "next")), "a tarball with an integrity only is the registry's");
  });
});

// ─── Own names ──────────────────────────────────────────────────────────────────────────────────────────────────

describe("an application's own package is never sent", () => {
  const workspace = (memberName, { bom = "" } = {}) => ({
    "package.json": `${bom}${JSON.stringify({ name: "app", workspaces: ["lib"], dependencies: { "corp-lib": "^1.0.0", react: "^18" } })}`,
    "lib/package.json": `${bom}${JSON.stringify({ name: memberName, version: "1.0.0" })}`,
  });

  // A merge left unresolved: the kit cannot tell the member's name, nor the places its ranges name, while the lock still
  // proves them — every npm package is private (as a pyproject.toml it cannot read makes every pip one).
  for (const [label, rel] of [
    ["a workspace member's package.json", "lib/package.json"],
    ["the root package.json", "package.json"],
  ])
    test(`${label} that is not valid JSON keeps every npm package back`, async () => {
      const lock = packageLockV3(
        { "corp-lib": "^1.0.0", react: "^18" },
        { "node_modules/corp-lib": npmEntry("corp-lib"), "node_modules/react": npmEntry("react") },
      );
      const files = { ...workspace("corp-lib"), "package-lock.json": lock };
      const broken = { ...files, [rel]: `<<<<<<< ours\n${files[rel]}\n=======\n>>>>>>> theirs\n` };
      const { before, after } = await expectProofDropped({
        base: files,
        changed: broken,
        name: "npm react",
        reason: "private",
      });
      assert.deepEqual(before.sent, ["npm react"], `${label}: the control sends react, the member's name stays back`);
      assert.deepEqual(after.sent, []);
      assert.equal((await registriesOf(broken)).npmAll, true, label);
    });

  test("a workspace member, named by its siblings with a plain range", async () => {
    const { before, after } = await expectProofDropped({
      base: workspace("other-lib"),
      changed: workspace("corp-lib"),
      name: "npm corp-lib",
      reason: "private",
      ...PROVEN,
    });
    assert.deepEqual(before.sent, ["npm corp-lib", "npm react"], "control");
    assert.deepEqual(after.sent, ["npm react"]);
  });

  test("a byte order mark before a package.json: its dependencies are read, its name is private", async () => {
    const { before, after } = await expectProofDropped({
      base: workspace("other-lib", { bom: CH.BOM }),
      changed: workspace("corp-lib", { bom: CH.BOM }),
      name: "npm corp-lib",
      reason: "private",
      ...PROVEN,
    });
    assert.deepEqual(before.sent, ["npm corp-lib", "npm react"], "control: the manifest is read");
    assert.deepEqual(after.sent, ["npm react"], "the workspace's own name is never sent");
    assert.ok(
      after.items.some((i) => i.name === "react"),
      "the manifest is read",
    );
  });

  test("a name is private in any case", async () => {
    const { after } = await expectProofDropped({
      base: workspace("other-lib"),
      changed: workspace("Corp-Lib"),
      name: "npm corp-lib",
      reason: "private",
      ...PROVEN,
    });
    assert.deepEqual(after.sent, ["npm react"]);
  });

  test("a package.json outside the workspaces, a link and a private tarball, whatever the lock proves", async () => {
    const files = ({ utilsName, tarballHost }) => ({
      "package.json": {
        name: "acme",
        workspaces: ["packages/*"],
        dependencies: { "@acme/billing-core": "*", "acme-utils": "^1.0.0", "corp-private": "^2.0.0", next: "15.0.0" },
      },
      "packages/billing-core/package.json": { name: "@acme/billing-core" },
      "package-lock.json": packageLockV3(
        { "@acme/billing-core": "*", "corp-private": "^2.0.0", next: "15.0.0" },
        {
          "node_modules/@acme/billing-core": { resolved: "packages/billing-core", link: true },
          "node_modules/corp-private": npmEntry("corp-private", { version: "2.1.0", host: tarballHost }),
          "node_modules/next": npmEntry("next", { version: "15.0.0" }),
        },
      ),
      "utils/package.json": { name: utilsName },
    });
    const base = files({ utilsName: "other-utils", tarballHost: HOST.npm });
    const changed = files({ utilsName: "acme-utils", tarballHost: HOST.corpNpm });
    const result = await network(changed, PROVEN);
    // next, named by the package.json and by its lock: one request, the answer shared by both items.
    assert.deepEqual(result.urls, [`${HOST.npm}/next`]);
    assert.ok(result.out.filter((i) => i.name === "next").every((i) => i.exists === true));
    for (const name of ["@acme/billing-core", "acme-utils", "corp-private"]) {
      const direct = result.out.filter((i) => i.name === name && i.direct);
      assert.ok(direct.length > 0, `${name}: the item exists`);
      assert.ok(
        direct.every((i) => i.private === true),
        name,
      );
    }
    const control = await network(base, PROVEN);
    assert.deepEqual(
      control.sent,
      ["npm acme-utils", "npm corp-private", "npm next"],
      "control: without the own name and the private tarball they are sent (the link is a place either way)",
    );
  });

  test("a spec holding a slash is a folder: its name is private in every manifest", async () => {
    const files = (spec) => ({
      "package.json": { workspaces: ["web"], dependencies: { "corp-lib": spec } },
      "web/package.json": { dependencies: { "corp-lib": "^1.0.0", react: "^18" } },
    });
    const { before, after } = await expectProofDropped({
      base: files("^1.0.0"),
      changed: files("@corp/lib"),
      name: "npm corp-lib",
      reason: "private",
      ...PROVEN,
    });
    assert.deepEqual(before.sent, ["npm corp-lib", "npm react"], "control");
    assert.deepEqual(after.sent, ["npm react"]);
    assert.equal(after.items.find((i) => i.manifest === "package.json" && i.name === "corp-lib").local, true);
  });
});

// ─── The application's declarations ─────────────────────────────────────────────────────────────────────────────

describe("without any declaration, every npm package is sent", () => {
  // The same application without an .npmrc, a .yarnrc, a .yarnrc.yml or a bunfig.toml: the positive control of every
  // declaration below.
  test("no .npmrc, .yarnrc, .yarnrc.yml or bunfig.toml", () => expectOutcome({}, NONE, "no declaration file"));
});

describe(".npmrc of the application", () => {
  declarationRows(".npmrc", [
    ["a quoted scope key", `"@corp:registry" = ${CORP}\n`, scoped("@corp"), "npm's ini reader decodes quotes"],
    ["a single-quoted scope key", `'@corp:registry'=${CORP}\n`, scoped("@corp"), "single quotes dropped"],
    ["a scope in another case", "  @Corp:registry = x\n", scoped("@corp"), "scopes compare in lower case"],
    [
      "a key escaped in JSON, in single quotes",
      `'"@corp:regis${BACKSLASH}u0074ry"'=${CORP}\n`,
      scoped("@corp"),
      "ini 5",
    ],
    ["a lone CR ends a comment line", `# team\r@corp:registry=${CORP}\n`, scoped("@corp"), "every line break is read"],
    ["a byte order mark hides no first line", `${CH.BOM}@corp:registry=${CORP}\n`, scoped("@corp"), "npm drops it"],
    ["registry replaces the default", `registry=${CORP}\n`, ALL, "every npm package", pub(`registry=${CORP}\n`)],
    [
      "a byte order mark before registry",
      `${CH.BOM}registry=${CORP}\n`,
      ALL,
      "npm drops it",
      pub(`${CH.BOM}registry=${CORP}\n`),
    ],
    [
      "a quoted registry key and value",
      `"registry" = "${CORP}"\n`,
      ALL,
      "ini decodes quotes",
      pub(`"registry" = "${CORP}"\n`),
    ],
    [
      "registry escaped in JSON",
      `"regis${BACKSLASH}u0074ry"=${CORP}\n`,
      ALL,
      "npm decodes a quoted key as JSON",
      pub(`"regis${BACKSLASH}u0074ry"=${CORP}\n`),
    ],
    [
      "registry escaped in JSON, in single quotes",
      `'"regis${BACKSLASH}u0074ry"'=${CORP}\n`,
      ALL,
      "single quotes dropped, then JSON",
      pub(`'"regis${BACKSLASH}u0074ry"'=${CORP}\n`),
    ],
    [
      "a lone CR ends a comment line before registry",
      `; team settings\rregistry=${CORP}\n`,
      ALL,
      "every line break is read",
      pub(`; team settings\rregistry=${CORP}\n`),
    ],
    ["a key that npm expands", `\${CORP_KEY}=${CORP}\n`, ALL, "on a doubt, no name is sent", `CORP_KEY=${CORP}\n`],
    [
      "replace-registry-host",
      "replace-registry-host=npm.corp.internal\n",
      ALL,
      "a registry key the kit does not follow",
      "fetch-retries=2\n",
    ],
    [
      "userconfig loads another file",
      "userconfig=./config/team.npmrc\n",
      ALL,
      "any key holding config",
      "cache=./config/team.npmrc\n",
    ],
    [
      "globalconfig loads another file",
      "globalconfig = ./config/team.npmrc\n",
      ALL,
      "any key holding config",
      "cache = ./config/team.npmrc\n",
    ],
    [
      "npm's own registry with a comment",
      `registry=${PUBLIC} ; the default\n`,
      NONE,
      "a comment after a public value",
      `registry=${CORP} ; the default\n`,
    ],
    [
      "a host's credentials name no registry",
      `//registry.npmjs.org/:_authToken=abc\n; registry=${CORP}\n`,
      NONE,
      "a key starting with // holds credentials; a comment is no setting",
      `//registry.npmjs.org/:_authToken=abc\nregistry=${CORP}\n`,
    ],
  ]);
});

describe(".yarnrc of the application", () => {
  declarationRows(".yarnrc", [
    [
      "a scope, and npm's own registry",
      `"@corp:registry" "${CORP}"\nregistry "https://registry.yarnpkg.com"\n`,
      scoped("@corp"),
      "a quoted key; the default registry is public",
    ],
    [
      "a scope and a registry",
      `"@corp:registry" "${CORP}"\nregistry "${CORP}"\n`,
      allAnd("@corp"),
      "both are declared",
    ],
    ["a registry", `registry ${CORP}\n`, ALL, "replaces the default", pub(`registry ${CORP}\n`)],
    [
      "a registry word as JSON",
      `"regis${BACKSLASH}u0074ry" "${CORP}"\n`,
      ALL,
      "a .yarnrc word is read as JSON",
      pub(`"regis${BACKSLASH}u0074ry" "${CORP}"\n`),
    ],
    [
      "Yarn's own registry with a comment",
      'registry "https://registry.yarnpkg.com" # the default\n',
      NONE,
      "a comment after a public value",
      `registry "${CORP}" # the default\n`,
    ],
  ]);
});

describe(".yarnrc.yml of the application", () => {
  const server = (value) => `npmRegistryServer: ${value}\n`;
  declarationRows(".yarnrc.yml", [
    ["a registry", server(`"${CORP}"`), ALL, "replaces the default", server('"https://registry.yarnpkg.com"')],
    [
      "Yarn's own registry with a comment",
      server('"https://registry.yarnpkg.com" # the default'),
      NONE,
      "a comment after a public value",
      server(`"${CORP}" # the default`),
    ],
    [
      "scopes with their registry",
      "nodeLinker: node-modules\nnpmScopes:\n  corp:\n    npmRegistryServer: https://npm.corp/\n  team:\n    npmAlwaysAuth: true\nenableTelemetry: false\n",
      scoped("@corp", "@team"),
      "a scope is private whatever its settings",
    ],
    [
      "a public registry and a scope",
      `${server('"https://registry.yarnpkg.com"')}npmScopes:\n  corp:\n    npmRegistryServer: "x"\n`,
      scoped("@corp"),
      "only the scope is private",
    ],
    [
      "a quoted key",
      `"npmRegistryServer": "${PUBLIC}"\n`,
      ALL,
      "a form the kit does not follow",
      server(`"${PUBLIC}"`),
    ],
    [
      "a blank before the colon",
      `npmRegistryServer : "${PUBLIC}"\n`,
      ALL,
      "a form the kit does not follow",
      server(`"${PUBLIC}"`),
    ],
    [
      "the value on the next line",
      `npmRegistryServer:\n  ${PUBLIC}\n`,
      ALL,
      "a form the kit does not follow",
      server(`"${PUBLIC}"`),
    ],
    [
      "a scope in flow style",
      `npmScopes:\n  team:\n    npmAlwaysAuth: true\n  corp: { npmRegistryServer: "${CORP}" }\n`,
      allAnd("@team"),
      "the scope before it is read, the flow style is a doubt",
    ],
    [
      "a comment after a scope's key",
      `npmScopes:\n  team:\n    npmAlwaysAuth: true\n  corp: # the team registry\n    npmRegistryServer: "${CORP}"\n`,
      allAnd("@team"),
      "the scope before it is read, a comment after the key is a doubt",
    ],
    [
      "the scopes themselves in flow style",
      `npmScopes: { corp: { npmRegistryServer: "${CORP}" } }\n`,
      ALL,
      "flow style",
    ],
    [
      "a comment after npmScopes",
      "npmScopes: # private\n  corp:\n    npmAlwaysAuth: true\n",
      ALL,
      "a comment after the key",
    ],
    [
      "an indented root",
      `  npmRegistryServer: "${PUBLIC}"\n`,
      ALL,
      "an indented root is not followed",
      server(`"${PUBLIC}"`),
    ],
    [
      "a lone CR ends a comment line",
      `# corp settings\rnpmRegistryServer: "${CORP}"\n`,
      ALL,
      "every line break is read",
      `# corp settings\rnpmRegistryServer: "https://registry.yarnpkg.com"\n`,
    ],
    [
      "an escape inside the key",
      `"npmRegistry${BACKSLASH}x53erver": "${PUBLIC}"\n`,
      ALL,
      "a key with an escape is a doubt",
      server(`"${PUBLIC}"`),
    ],
    [
      "an escape from the key's first letter",
      `"${BACKSLASH}x6epmRegistryServer": "${PUBLIC}"\n`,
      ALL,
      "no npmRegistry left to see, only the escape",
      server(`"${PUBLIC}"`),
    ],
    [
      "a public host, then a quote and a private one",
      `npmRegistryServer: https://registry.npmjs.org"@npm.corp.internal\n`,
      ALL,
      "not one plain URL",
      server("https://registry.npmjs.org"),
    ],
    [
      "two quoted values",
      `npmRegistryServer: 'https://registry.npmjs.org''@npm.corp.internal'\n`,
      ALL,
      "not one plain URL",
      server("'https://registry.npmjs.org'"),
    ],
  ]);
});

describe("bunfig.toml of the application", () => {
  const registry = (value) => `[install] # corp\nregistry = ${value}\n`;
  declarationRows("bunfig.toml", [
    [
      "a registry written as a table, read by its url",
      registry(`{ url = "${CORP}", token = "$NPM_TOKEN" }`),
      ALL,
      "a table's url is the registry",
      registry(`{ url = "${PUBLIC}" }`),
    ],
    [
      "a registry that is a string",
      '[install]\nregistry = "https://npm.corp/"\n',
      ALL,
      "replaces the default",
      `[install]\nregistry = "${PUBLIC}"\n`,
    ],
    [
      "a registry and a scope",
      '[install]\nregistry = "https://npm.corp/"\n\n[install.scopes]\ncorp = "https://npm.corp/"\n',
      allAnd("@corp"),
      "both are declared",
    ],
    [
      "a scope as a table of its own",
      '[install.scopes.corp]\nurl = "https://npm.corp/"\n',
      scoped("@corp"),
      "a table written as a header",
    ],
    [
      "an inline scopes table",
      '[install]\nscopes = { corp = "https://npm.corp/" } # install.scopes\n',
      scoped("@corp"),
      "an inline table is read as its table would be",
    ],
    [
      "a scopes value that is no table",
      '[install]\nscopes = "corp"\n',
      ALL,
      "names no scope: a doubt",
      '[install]\nregistry = "https://registry.npmjs.org/"\n',
    ],
    [
      "a file left open",
      '[install]\nnote = """open\nscopes = { corp = "https://npm.corp.internal/" }\n',
      ALL,
      "TOML cannot be read to its end: a doubt",
      '[install]\nnote = """closed"""\n',
    ],
    [
      "a multi-line registry in double quotes",
      `[install]\nregistry = """${PUBLIC}"""\n`,
      ALL,
      "a value the kit does not read is a doubt, never an empty value",
      `[install]\nregistry = "${PUBLIC}"\n`,
    ],
    [
      "a multi-line registry in single quotes",
      `[install]\nregistry = '''${PUBLIC}'''\n`,
      ALL,
      "a value the kit does not read is a doubt, never an empty value",
      `[install]\nregistry = '${PUBLIC}'\n`,
    ],
    [
      "a quoted key holding = and a triple quote opens no string",
      `[define]\n'a="""' = "1"\n[install]\nregistry = "${CORP}"\n# """\n`,
      ALL,
      "what follows the key is read",
      `[define]\n'a="""' = "1"\n[install]\nregistry = "${PUBLIC}"\n# """\n`,
    ],
  ]);
});

describe("the declarations are read in every folder from the root down to each manifest", () => {
  const scopeRc = "@corp:registry=https://npm.corp.internal/\n";

  test("an .npmrc of a manifest folder or of any folder above it counts", async () => {
    const files = (folder) => ({
      [`${folder}/.npmrc`]: scopeRc,
      "frontend/packages/ui/package.json": { dependencies: { "@corp/tokens": "^1.0.0", react: "^18" } },
    });
    const { before, after } = await expectProofDropped({
      base: files("elsewhere"),
      changed: files("frontend"),
      name: "npm @corp/tokens",
      reason: "private",
      ...PROVEN,
    });
    assert.deepEqual(before.sent, ["npm @corp/tokens", "npm react"], "control: a folder no manifest is under");
    assert.deepEqual(after.sent, ["npm react"], "the workspace root counts");
    assert.deepEqual(after.unreadable, []);
  });

  test("a folder outside the application is never read", async () => {
    await withApp({ "frontend/.npmrc": scopeRc }, (dir) => {
      const known = (items) => [...privateRegistries(dir, { items }).npmScopes];
      assert.deepEqual(known([]), [], "the root alone does not know the scope");
      assert.deepEqual(
        known([{ manifest: "frontend/packages/ui/package.json" }]),
        ["@corp"],
        "the workspace root counts",
      );
      assert.deepEqual(known([{ manifest: "../../package.json" }]), [], "outside: ignored");
    });
  });
});

// ─── Files in UTF-16 ────────────────────────────────────────────────────────────────────────────────────────────

describe("a configuration written in UTF-16 is read as such", () => {
  const FILES = [
    [".npmrc", (host) => `registry=${host}/\n`],
    [".yarnrc", (host) => `registry "${host}/"\n`],
    [".yarnrc.yml", (host) => `npmRegistryServer: "${host}/"\n`],
    ["bunfig.toml", (host) => `[install]\nregistry = "${host}/"\n`],
  ];
  for (const [file, write] of FILES)
    for (const endian of ["le", "be"])
      test(`${file} in UTF-16 ${endian === "le" ? "little" : "big"} endian`, async () => {
        const label = `${file} ${endian}`;
        await expectOutcome({ [file]: utf16(write(HOST.corpNpm), endian) }, ALL, label);
        await expectOutcome({ [file]: utf16(write(HOST.npm), endian) }, NONE, `${label}: control`);
      });
});

// ─── The person's own files ─────────────────────────────────────────────────────────────────────────────────────

describe("the person's own configuration files", () => {
  const HOME_FILES = [
    [".npmrc", `@corp:registry=${CORP}\n`, scoped("@corp")],
    [".npmrc", `registry=${CORP}\n`, ALL, `registry=${PUBLIC}\n`],
    [".yarnrc", `"@corp:registry" "${CORP}"\n`, scoped("@corp")],
    [".yarnrc", `registry "${CORP}"\n`, ALL, `registry "${PUBLIC}"\n`],
    [".yarnrc.yml", "npmScopes:\n  team:\n    npmRegistryServer: https://npm.corp/\n", scoped("@team")],
    [".yarnrc.yml", `npmRegistryServer: "${CORP}"\n`, ALL, `npmRegistryServer: "${PUBLIC}"\n`],
    [".bunfig.toml", `[install]\nregistry = "${CORP}"\n`, ALL, `[install]\nregistry = "${PUBLIC}"\n`],
    [".bunfig.toml", '[install.scopes]\ncorp = "https://npm.corp/"\n', scoped("@corp")],
  ];
  for (const [file, text, outcome, control] of HOME_FILES)
    test(`${file} in the home folder: ${JSON.stringify(text)}`, async () => {
      await expectOutcome({}, outcome, file, { home: { [file]: text } });
      if (control !== undefined) await expectOutcome({}, NONE, `${file}: control`, { home: { [file]: control } });
    });

  test("a bunfig.toml without its dot in the home folder is not bun's file", async () => {
    await expectOutcome({}, NONE, "bunfig.toml in the home", {
      home: { "bunfig.toml": `[install]\nregistry = "${CORP}"\n` },
    });
  });

  test("HOME and USERPROFILE can differ: both are read", async () => {
    await withApp({ ".npmrc": `@corp:registry=${CORP}\n` }, (msys) =>
      withApp({ ".yarnrc.yml": "npmScopes:\n  team:\n    npmRegistryServer: https://npm.corp/\n" }, async (windows) => {
        await expectOutcome({}, scoped("@corp", "@team"), "both homes", { env: { HOME: msys, USERPROFILE: windows } });
        await expectOutcome({}, scoped("@corp"), "HOME alone", { env: { HOME: msys } });
        await expectOutcome({}, scoped("@team"), "USERPROFILE alone", { env: { USERPROFILE: windows } });
      }),
    );
  });

  for (const variable of ["NPM_CONFIG_USERCONFIG", "npm_config_userconfig"])
    test(`${variable} names the person's .npmrc`, async () => {
      await withApp({ "custom-npmrc": `@corp:registry=${CORP}\n` }, async (dir) => {
        await expectOutcome({}, scoped("@corp"), variable, { env: { [variable]: `${dir}/custom-npmrc` } });
      });
      await withApp({ "custom-npmrc": "fetch-retries=2\n" }, async (dir) => {
        await expectOutcome({}, NONE, `${variable}: control, a file declaring nothing`, {
          env: { [variable]: `${dir}/custom-npmrc` },
        });
      });
    });

  test("XDG_CONFIG_HOME holds bun's .bunfig.toml", async () => {
    await withApp({ ".bunfig.toml": `[install]\nregistry = "${CORP}"\n` }, async (xdg) => {
      await expectOutcome({}, ALL, "XDG_CONFIG_HOME", { env: { XDG_CONFIG_HOME: xdg } });
    });
    await withApp({ ".bunfig.toml": `[install]\nregistry = "${PUBLIC}"\n` }, async (xdg) => {
      await expectOutcome({}, NONE, "XDG_CONFIG_HOME: control", { env: { XDG_CONFIG_HOME: xdg } });
    });
  });

  // An npm declaration is about npm: a Python package of the same application stays public (the mirror is in the
  // Python second net's tests).
  const NPM_DECLARATIONS = [
    ["a scope in the home .npmrc", { home: { ".npmrc": `@corp:registry=${CORP}\n` } }, {}],
    ["a registry in the home .npmrc", { home: { ".npmrc": `registry=${CORP}\n` } }, {}],
    ["a registry in the application's .npmrc", {}, { ".npmrc": `registry=${CORP}\n` }],
    ["npm_config_registry", { env: { npm_config_registry: CORP } }, {}],
  ];
  for (const [label, options, extra] of NPM_DECLARATIONS)
    test(`${label} leaves pip public`, async () => {
      const files = { "requirements.txt": "fastapi==0.110.0\n", ...extra };
      const read = await registriesOf(files, options);
      assert.equal(read.pipAll, false, `${label}: no pip package private`);
      await expectSent(files, ["pip fastapi"], { ...PROVEN, ...options, label });
    });
});

// ─── The person's variables ─────────────────────────────────────────────────────────────────────────────────────

describe("the person's npm, yarn and bun variables", () => {
  const REGISTRY_VARIABLES = [
    "BUN_CONFIG_REGISTRY",
    "YARN_NPM_REGISTRY_SERVER",
    "YARN_REGISTRY",
    "npm_config_registry",
    "NPM_CONFIG_REGISTRY",
  ];
  for (const name of REGISTRY_VARIABLES)
    test(`${name}: a private registry makes every npm package private, npm's own does not`, async () => {
      await expectOutcome({}, ALL, `${name} private`, { env: { [name]: CORP } });
      await expectOutcome({}, NONE, `${name} public`, { env: { [name]: PUBLIC } });
    });

  test("Yarn's own registry in a variable is public too", () =>
    expectOutcome({}, NONE, "YARN_NPM_REGISTRY_SERVER", { env: { YARN_NPM_REGISTRY_SERVER: HOST.yarn } }));

  test("an empty variable names nothing", () =>
    expectOutcome({}, NONE, "empty", { env: { BUN_CONFIG_REGISTRY: "", npm_config_registry: "" } }));

  test("npm_config_@scope:registry makes the scope's packages private", async () => {
    await expectOutcome({}, scoped("@team"), "npm_config_@team:registry", {
      env: { "npm_config_@team:registry": CORP },
    });
    await expectOutcome({}, NONE, "no variable: control");
  });

  // SECURITY.md: "an npm scope that has its own registry" — whatever that registry is: a scope given one at all is a
  // team's, and npm's own registry named for it does not make its packages anyone else's.
  test("a scope given npm's own registry is still a scope with its own registry: its packages stay private", async () => {
    await expectOutcome({}, scoped("@team"), "npm_config_@team:registry public", {
      env: { "npm_config_@team:registry": PUBLIC },
    });
    await expectOutcome({ ".npmrc": `@team:registry=${PUBLIC}\n` }, scoped("@team"), ".npmrc @team:registry public");
  });
});

describe("a mixed application: scopes, places and versions", () => {
  test("an @acme scope with its own registry keeps back its packages and the places, not the others", async () => {
    const files = {
      ".npmrc": "@acme:registry=https://npm.acme.internal/\n",
      ...manifest({
        next: "15.0.0",
        "@acme/ui": "^2.1.0",
        "@types/node": "^22.0.0",
        shared: "workspace:*",
        tooling: "file:../tooling",
        fork: "github:acme/fork",
      }),
    };
    const result = await expectSent(files, ["npm @types/node", "npm next"], PROVEN);
    for (const name of ["@acme/ui", "shared", "tooling", "fork"])
      assert.equal(result.kept[`npm ${name}`], "private", name);
    for (const name of ["@acme/ui", "shared", "tooling", "fork"]) {
      const item = result.out.find((i) => i.name === name);
      assert.equal(item.exists, null, name);
    }
    const replaced = await network({ ...files, ".npmrc": "registry=https://npm.acme.internal/\n" }, PROVEN);
    assert.deepEqual(replaced.sent, [], "a registry that replaces the default makes every npm package private");
    const own = await network({ ...files, ".npmrc": `registry=${PUBLIC}\n` }, PROVEN);
    assert.deepEqual(own.sent, ["npm @acme/ui", "npm @types/node", "npm next"], "npm's own registry is public");
  });
});
