// What proves a name to `--network` in a yarn.lock: Yarn 1's own form (its tarball on a public registry, a lock
// written as Yarn 1 writes it, every block naming the name proving it), and nothing else — berry's and pnpm's locks
// write no registry. Each "no proof" test is a minimal pair: the same lock in Yarn 1's form sends the name.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { HOST, CH, tarball, packageJson, yarnBlock, yarnLock } from "../tools/locks.mjs";
import { network, expectSent, expectNothingSent, expectProofDropped, deps } from "../tools/deps-apps.mjs";

/** The files of an application: its package.json declaring `dependencies`, and this yarn.lock. */
const files = (lock, dependencies = { corp: "^1.0.0" }, extra = {}) => ({
  "package.json": packageJson(dependencies),
  "yarn.lock": lock,
  ...extra,
});

/** A `resolved` line as Yarn 1 writes it (the tarball of `name` on `host`, a sha1 after the `#`). */
const resolvedOn = (name, host = HOST.yarn) => `  resolved "${tarball(name, { host })}#abc"\n`;

/** The item a result read from the yarn.lock (the package.json has its own item of the same name). */
const lockItem = (result, name) => result.items.find((i) => i.manifest === "yarn.lock" && i.name === name);

const HEAD = 'corp@^1.0.0:\n  version "1.0.0"\n';
const PUBLIC = resolvedOn("corp");
const PRIVATE = resolvedOn("corp", HOST.corpNpm);
/** The lock Yarn 1 writes for `corp`: the one every "no proof" test below changes by one rule. */
const BASE = yarnLock(HEAD + PUBLIC);
const SENDS_CORP = ["npm corp"];

describe("a yarn.lock as Yarn 1 writes it proves the name its tarball names", () => {
  const babel =
    '"@babel/code-frame@^7.0.0", "@babel/code-frame@^7.22.13":\n  version "7.22.13"\n' +
    '  resolved "https://registry.yarnpkg.com/@babel/code-frame/-/code-frame-7.22.13.tgz#e3c1"\n' +
    "  integrity sha512-XktuhWlJ5g+3TJXc5upd9Ks1HutSArik6jf2eAjYFyIOf4ej3RN+184cZbzDvbPnuTJIUhPKKJE3cIsYTiAT3w==\n" +
    '  dependencies:\n    "@babel/highlight" "^7.22.13"\n    chalk "^2.4.2"\n';
  const react =
    'react@^18.2.0:\n  version "18.2.0"\n  resolved "https://registry.yarnpkg.com/react/-/react-18.2.0.tgz#555b"\n' +
    '  integrity "sha1-AAAA sha512-BBBB"\n  dependencies:\n    loose-envify "^1.1.0"\n';
  const real = yarnLock(babel, react);
  const declared = { react: "^18.2.0", "@babel/code-frame": "^7.22.13" };

  for (const [label, lock] of [
    ["LF line ends", real],
    ["CRLF line ends", real.replace(/\n/g, "\r\n")],
  ])
    test(`${label}: both names are sent, each with its own tarball`, async () => {
      await expectSent(files(lock, declared), ["npm @babel/code-frame", "npm react"], { label });
    });

  test("the three names Yarn quotes in a header (a scope, a digit first, true/false first) are proven by their blocks", async () => {
    const lock = yarnLock(
      yarnBlock('"@corp/ui@^1.0.0"'),
      yarnBlock('"7zip-bin@^5.0.0"'),
      yarnBlock('"true-case-path@^2.2.1"'),
    );
    const dependencies = { "@corp/ui": "^1.0.0", "7zip-bin": "^5.0.0", "true-case-path": "^2.2.1" };
    await expectSent(files(lock, dependencies), ["npm 7zip-bin", "npm @corp/ui", "npm true-case-path"]);
  });

  test("a name that holds the word __metadata is proven: berry's metadata is told by its own line", async () => {
    const dependencies = { x__metadata: "^1.0.0" };
    await expectSent(files(yarnLock(yarnBlock("x__metadata@^1.0.0")), dependencies), ["npm x__metadata"]);
    await expectProofDropped({
      base: files(yarnLock(yarnBlock("x__metadata@^1.0.0")), dependencies),
      changed: files(`"__metadata":\n  version: 6\n\n${yarnLock(yarnBlock("x__metadata@^1.0.0"))}`, dependencies),
      name: "npm x__metadata",
    });
  });

  test("a dependency named resolved is a dependency, never the block's resolved: the block proves, nothing local", async () => {
    const lock = yarnLock(
      yarnBlock("corp@^1.0.0", { dependencies: { resolved: "^1.0.0" } }),
      yarnBlock("resolved@^1.0.0"),
    );
    const result = await expectSent(files(lock), ["npm corp"]);
    assert.deepEqual(
      result.items.filter((i) => i.manifest === "yarn.lock").map((i) => [i.name, !!i.local, i.public === true]),
      [
        ["corp", false, true],
        ["resolved", false, true],
      ],
      "four spaces are a dependency's line, two the block's field",
    );
  });

  test("a tarball without its sha1 fragment, or on registry.npmjs.org, is the proof too", async () => {
    const lock = yarnLock(
      `corp@^1.0.0:\n  version "1.0.0"\n  resolved "${tarball("corp", { host: HOST.yarn })}"\n`,
      yarnBlock("other@^1.0.0", { resolved: tarball("other", { host: HOST.npm }) }),
    );
    await expectSent(files(lock, { corp: "^1.0.0", other: "^1.0.0" }), ["npm corp", "npm other"]);
  });

  test("a lock in UTF-16, which Yarn does not read, is unreadable and proves nothing", async () => {
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(BASE, "utf16le")]);
    const { after } = await expectProofDropped({
      base: files(BASE),
      changed: files(utf16),
      name: "npm corp",
    });
    assert.deepEqual(after.unreadable, [{ file: "yarn.lock", reason: "read" }]);
    assert.deepEqual(
      after.items.filter((i) => i.manifest === "yarn.lock"),
      [],
      "an unreadable lock gives no item at all",
    );
  });
});

describe("a yarn.lock in a form Yarn 1 never writes proves nothing", () => {
  // [label, lock, why, reason]: each lock is `BASE` changed by that one rule; `name` and `dependencies` when it is not `corp`.
  const FORMS = [
    [
      "resolved written twice (the second another package's tarball)",
      HEAD + PUBLIC + resolvedOn("lodash"),
      "Yarn keeps the last `resolved`: another package's tarball",
    ],
    [
      'a quoted key ("resolved")',
      `${HEAD}${PUBLIC}  "resolved" "${tarball("corp", { host: HOST.corpNpm })}"\n`,
      "Yarn reads the quoted key as the field, the kit would not see it",
    ],
    ["a comment after a value", `${HEAD}${PUBLIC.trimEnd()} # pinned\n`, "Yarn 1 writes no comment after a value"],
    ["a tab for the indentation of a field", `${HEAD}${PUBLIC}\tintegrity sha512-aaa\n`, "Yarn indents with spaces"],
    [
      "a tab between resolved and its value",
      `${HEAD}  resolved\t"${tarball("corp", { host: HOST.yarn })}#abc"\n`,
      "Yarn writes one space",
    ],
    ["a tab between version and its value", `corp@^1.0.0:\n  version\t"1.0.0"\n${PUBLIC}`, "Yarn writes one space"],
    ["a space after a value", `corp@^1.0.0:\n  version "1.0.0" \n${PUBLIC}`, "Yarn writes nothing after a value"],
    ["two spaces before a value", `corp@^1.0.0:\n  version  "1.0.0"\n${PUBLIC}`, "Yarn writes one space"],
    [
      "a dependency line at six spaces",
      `${HEAD}${PUBLIC}  dependencies:\n      lodash "^4"\n`,
      "a dependency is written at four spaces",
    ],
    [
      "a line at four spaces under no section of dependencies",
      `${HEAD}${PUBLIC}    lodash "^4"\n`,
      "Yarn 1 writes such a line under dependencies only",
    ],
    [
      "a dependency named resolved, at four spaces, as the block's only tarball",
      'corp@^1.0.0:\n  version "1.0.0"\n  dependencies:\n    resolved "' + tarball("corp", { host: HOST.yarn }) + '"\n',
      "four spaces are a dependency's, never the block's `resolved` (two)",
    ],
    [
      "a blank line inside a block",
      `${HEAD}\n${PUBLIC}`,
      "Yarn may end the block there: its `resolved` is no field of it",
    ],
    ["a comment inside a block", `${HEAD}# merged by hand\n${PUBLIC}`, "a merge fixed by hand, at no indentation"],
    [
      "a lone carriage return between two lines",
      `${HEAD.trimEnd()}${CH.CR}${PUBLIC}`,
      "where Yarn's tokenizer and the kit may part",
    ],
    [
      "a quoted header holding a comma",
      `"corp@^1.0.0, x@^2.0.0":\n  version "1.0.0"\n${PUBLIC}`,
      "Yarn reads one key there, never `corp@^1.0.0`",
    ],
    [
      "berry's metadata above a block in Yarn 1's form",
      `__metadata:\n  version: 6\n\n${HEAD}${PUBLIC}`,
      "berry refuses the block and resolves the name again",
    ],
    [
      "berry's metadata, quoted",
      `"__metadata":\n  version: 6\n\n${HEAD}${PUBLIC}`,
      "quoted or not, it is berry's metadata",
    ],
    [
      "git's conflict markers around fields only",
      `${HEAD}${PUBLIC}<<<<<<< HEAD\n  integrity sha512-aaa\n=======\n  integrity sha512-bbb\n>>>>>>> feature\n`,
      "Yarn reads each side whole and keeps the second's `resolved`: the kit, reading lines, would see the first",
    ],
    [
      "git's conflict markers between blocks",
      `${HEAD}${PUBLIC}\n<<<<<<< HEAD\nx@^1:\n  version "1.0.0"\n=======\n>>>>>>> feature\n`,
      "a merge left unresolved is no lock Yarn reads",
    ],
    ["a block without its version", `corp@^1.0.0:\n${PUBLIC}`, "Yarn 1 writes the version of every block"],
    ["a block with its version twice", `${HEAD}  version "2.0.0"\n${PUBLIC}`, "Yarn 1 writes it once"],
    [
      "a quote left open in another block",
      `${HEAD}${PUBLIC}\nx@^1.0.0:\n  version "1.0.0\n${resolvedOn("x")}`,
      "Yarn's tokenizer reads the string on past its line and refuses the whole lock",
    ],
    [
      "a backslash in a string",
      `${HEAD}${PUBLIC}\nx@^1.0.0:\n  version "1.0.0${CH.BACKSLASH}${CH.BACKSLASH}${CH.BACKSLASH}"\n${resolvedOn("x")}`,
      "Yarn 1 writes none; its tokenizer and JSON read an escape each their own way",
    ],
  ];
  for (const [label, lock, why, reason = "unproven"] of FORMS)
    test(`${label} proves nothing`, async () => {
      const { after } = await expectProofDropped({
        base: files(BASE),
        changed: files(yarnLock(lock)),
        name: "npm corp",
        reason,
        label: `${label} (${why})`,
      });
      assert.deepEqual(after.unreadable, [], label);
    });

  // Yarn quotes what it must (a scope, a digit first, a word it would read as a boolean): an unquoted header is not its.
  for (const [header, name] of [
    ["@corp/ui@^1.0.0", "@corp/ui"],
    ["7zip-bin@^5.0.0", "7zip-bin"],
    ["true-case-path@^2.2.1", "true-case-path"],
  ])
    test(`${name} written without the quotes Yarn 1 puts on its header proves nothing`, async () => {
      const dependencies = { [name]: "^1" };
      await expectProofDropped({
        base: files(yarnLock(yarnBlock(`"${header}"`)), dependencies),
        changed: files(yarnLock(yarnBlock(header)), dependencies),
        name: `npm ${name}`,
      });
    });
});

describe("a private resolved is read wherever the lock puts it, in any form", () => {
  // [label, lock]: the name is private (not merely unproven) and its item is local, so no manifest can send it.
  const LOCALS = [
    ["after a lone carriage return", `${HEAD}${PUBLIC}  dependencies:\n    lodash "^4.17.21"${CH.CR}${PRIVATE}`],
    ["below a blank line inside the block", `${HEAD}${PUBLIC}\n${PRIVATE}`],
    ["before the public one", `${HEAD}${PRIVATE}${PUBLIC}`],
  ];
  for (const [label, lock] of LOCALS)
    test(`a private resolved ${label} makes the name local`, async () => {
      const result = await expectNothingSent(files(yarnLock(lock)), { "npm corp": "private" }, { label });
      assert.equal(lockItem(result, "corp")?.local, true, label);
    });
});

describe("a name is proven only when every block of the yarn.lock naming it proves it", () => {
  const OTHER = (fields) => `\ncorp@^2.0.0:\n${fields}`;
  const VERSION2 = '  version "2.0.0"\n';

  test("two blocks, each Yarn 1's own: the name is sent", async () => {
    await expectSent(files(yarnLock(HEAD + PUBLIC + OTHER(VERSION2 + PUBLIC))), SENDS_CORP);
  });

  // [label, the other block's fields, why, reason]
  const SECOND = [
    [
      "from a private registry, written with a quoted key",
      `${VERSION2}  "resolved" "${tarball("corp", { host: HOST.corpNpm })}"\n`,
      "its tarball is not read, its block is not Yarn 1's",
      "unproven",
    ],
    [
      "from a private registry",
      VERSION2 + PRIVATE,
      "a name taken from elsewhere in one block is local everywhere",
      "private",
    ],
    [
      "from a private registry, without a version",
      PRIVATE,
      "a block with no version has no item, but names the package all the same",
      "private",
    ],
    ["from a folder (file:), without a resolved", null, "a v1 file: block has no resolved line", "private"],
    ["with a public tarball and no version", PUBLIC, "Yarn 1 writes the version of every block", "unproven"],
  ];
  for (const [label, fields, why, reason] of SECOND)
    test(`a second block ${label}: the name is kept back as ${reason}`, async () => {
      const second = fields === null ? '\ncorp@file:../corp:\n  version "2.0.0"\n' : OTHER(fields);
      const { after } = await expectProofDropped({
        base: files(BASE),
        changed: files(yarnLock(HEAD + PUBLIC + second)),
        name: "npm corp",
        reason,
        label: `${label} (${why})`,
      });
      if (reason === "private") assert.equal(lockItem(after, "corp")?.local, true, label);
    });

  test("a header also naming a workspace is judged for its other names all the same", async () => {
    const workspace = `\n"corp@^2.0.0", "app@workspace:.":\n${VERSION2}${PRIVATE}`;
    const { after } = await expectProofDropped({
      base: files(BASE),
      changed: files(yarnLock(HEAD + PUBLIC + workspace)),
      name: "npm corp",
      reason: "private",
    });
    assert.equal(lockItem(after, "corp")?.local, true);
  });

  // [label, the proven name, its twin]: two names Windows or macOS install into one folder, each block its own public
  // tarball — which package the folder holds is not told.
  const E_ACUTE = String.fromCharCode(0xe9);
  const TWINS = [
    ["a trailing dot", "corp", "corp."],
    ["a trailing space", "corp", "corp "],
    ["another case", "corp", "Corp"],
    ["another Unicode form (é composed, then decomposed)", `caf${E_ACUTE}`, `cafe${String.fromCharCode(0x301)}`],
  ];
  for (const [label, name, twin] of TWINS)
    test(`a block for the same folder under another spelling (${label}): neither name is proven`, async () => {
      const header = (n) => (n.endsWith(" ") ? `"${n}@^1.0.0"` : `${n}@^1.0.0`);
      const dependencies = { [name]: "^1.0.0" };
      const base = files(yarnLock(yarnBlock(header(name))), dependencies);
      const changed = files(yarnLock(yarnBlock(header(name)), yarnBlock(header(twin), { name: twin })), dependencies);
      // `café` is never sent at all (no registry holds such a name): the pair is judged on the proof itself.
      if (!/^[\x20-\x7e]*$/.test(name)) {
        const proven = (f) => deps(f)["yarn.lock"][name]?.public === true;
        assert.equal(proven(base), true, `${label}: the base proves ${name}`);
        assert.equal(proven(changed), false, label);
        return;
      }
      await expectProofDropped({ base, changed, name: `npm ${name}`, label });
    });

  test("two names in distinct folders are each proven (the twins' control)", async () => {
    await expectSent(
      files(yarnLock(yarnBlock("corp@^1.0.0"), yarnBlock("corpx@^1.0.0")), { corp: "^1", corpx: "^1" }),
      ["npm corp", "npm corpx"],
    );
  });

  test("a name taken from a folder does not keep back another name of the same lock", async () => {
    const lock = yarnLock(
      yarnBlock("corp-lib@^1"),
      'corp-lib@file:../corp-lib:\n  version "2.0.0"\n',
      yarnBlock("other@^1"),
    );
    const result = await expectSent(files(lock, { "corp-lib": "^1", other: "^1" }), ["npm other"]);
    assert.equal(result.kept["npm corp-lib"], "private");
  });
});

describe("an alias in a yarn.lock is another package under this name: never proven", () => {
  const LODASH = tarball("lodash", { host: HOST.yarn });
  const declared = { "corp-x": "npm:lodash@^4" };
  const OPTIONAL = { "package.json": { optionalDependencies: declared } };

  test("an alias block resolved to another package's tarball: nothing is sent", async () => {
    const lock = `"corp-x@npm:lodash@^4":\n  version "4.17.21"\n  resolved "${LODASH}"\n`;
    const result = await expectNothingSent({ ...OPTIONAL, "yarn.lock": lock }, { "npm corp-x": "private" });
    assert.equal(lockItem(result, "corp-x")?.local, true, "the alias is local in the facts");
  });

  test("a block naming an alias and the real package: the real one is proven, the alias never", async () => {
    const lock = `"corp-x@npm:lodash@^4", lodash@^4:\n  version "4.17.21"\n  resolved "${LODASH}"\n`;
    const result = await expectSent(
      {
        "package.json": { dependencies: { lodash: "^4" }, optionalDependencies: declared },
        "yarn.lock": lock,
      },
      ["npm lodash"],
    );
    const item = (name) => result.items.find((i) => i.manifest === "yarn.lock" && i.name === name);
    assert.equal(result.kept["npm corp-x"], "private");
    assert.equal(item("corp-x").local, true, "the alias of a combined block is local");
    assert.equal(item("lodash").local, undefined, "the real package is not");
  });

  test("an alias without a version (corp-ui@npm:xcorp-ui) is private, its lock item local", async () => {
    // The package.json says a plain range: only the lock names the alias.
    const lock = (header, name) => yarnLock(yarnBlock(header, { name }));
    const { before, after } = await expectProofDropped({
      base: files(lock("corp-ui@^1", "corp-ui"), { "corp-ui": "^1" }),
      changed: files(lock('"corp-ui@npm:xcorp-ui"', "xcorp-ui"), { "corp-ui": "^1" }),
      name: "npm corp-ui",
      reason: "private",
    });
    assert.ok(!("local" in lockItem(before, "corp-ui")), "the plain range's lock item is not local");
    assert.equal(lockItem(after, "corp-ui")?.local, true, "the alias's lock item is local");
    assert.deepEqual(after.sent, [], "nothing is sent");
  });
});

describe("berry's and pnpm's locks prove nothing: they write no registry", () => {
  const YARN1 = 'react@^18:\n  version "18.3.1"\n  resolved "https://registry.yarnpkg.com/react/-/react-18.3.1.tgz"\n';
  const BERRY = `__metadata:\n  version: 6\n\n"react@npm:^18":\n  version: 18.3.1\n  resolution: "react@npm:18.3.1"\n`;
  const PNPM = `lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies:\n      react:\n        specifier: ^18\n        version: 18.3.1\n\npackages:\n\n  react@18.3.1:\n    resolution: {integrity: sha512-aaa}\n`;
  const dependencies = { react: "^18" };

  test("Yarn 1's block of react is the control: react is sent", async () => {
    await expectSent(files(YARN1, dependencies), ["npm react"]);
  });

  test("berry's yarn.lock sends nothing, react kept back as unproven", async () => {
    await expectProofDropped({
      base: files(YARN1, dependencies),
      changed: files(BERRY, dependencies),
      name: "npm react",
    });
  });

  test("in a berry lock, a block react@npm:^18.2.0 is berry's own protocol: its item is not local", async () => {
    const berry = `__metadata:\n  version: 6\n\n"react@npm:^18.2.0":\n  version: 18.3.1\n  resolution: "react@npm:18.3.1"\n`;
    const result = await network(files(berry, dependencies));
    const item = lockItem(result, "react");
    assert.ok(item, "the berry lock's own item exists");
    assert.ok(!("local" in item), "npm:<range> is not an alias in a berry lock");
    assert.equal(result.kept["npm react"], "unproven");
  });

  test("pnpm-lock.yaml sends nothing, react kept back as unproven", async () => {
    const { after } = await expectProofDropped({
      base: files(YARN1, dependencies),
      changed: { "package.json": packageJson(dependencies), "pnpm-lock.yaml": PNPM },
      name: "npm react",
    });
    assert.ok(
      after.items.some((i) => i.manifest === "pnpm-lock.yaml" && i.name === "react"),
      "pnpm lock was read",
    );
  });

  test("the package.json alone sends nothing (no lock, no proof)", async () => {
    const result = await network({ "package.json": packageJson(dependencies) });
    assert.deepEqual(result.sent, []);
    assert.equal(result.kept["npm react"], "unproven");
  });
});
