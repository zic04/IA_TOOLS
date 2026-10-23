// What a Python lock proves to `--network` (engine/facts/deps/python.mjs, python-locks.mjs; SECURITY.md, Network): a
// name is sent to PyPI only when uv.lock or poetry.lock shows that PyPI itself served the package. Every test here
// compares a lock that proves with the same lock changed by ONE rule, so that "nothing sent" never stands for
// "the lock was not read". The second net (declarations in pyproject.toml, pip.conf…) is in facts-network-second-net-python.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { deps, expectSent, expectNothingSent, expectProofDropped } from "../tools/deps-apps.mjs";
import { HOST, CH, pyproject, poetryProject, uvPackage, uvLock, poetryPackage, poetryLock } from "../tools/locks.mjs";

const NAME = "corp-lib";
const SENT = "pip corp-lib";
const UV_PROJECT = pyproject([NAME]);
const POETRY_PROJECT = poetryProject({ [NAME]: "^1" });

const uvFiles = (...blocks) => ({ "pyproject.toml": UV_PROJECT, "uv.lock": uvLock(...blocks) });
const poetryFiles = (...blocks) => ({ "pyproject.toml": POETRY_PROJECT, "poetry.lock": poetryLock(...blocks) });

/** A uv.lock block written by hand, for the spellings uv's writer never produces: header, name line and source. */
const uvRaw = (header, nameLine, registry = HOST.pypi) =>
  `${header}\n${nameLine}\nversion = "1.0.0"\nsource = { registry = "${registry}" }\n`;
/** A poetry.lock block written by hand: header, name line, then `rest`. */
const poetryRaw = (header, nameLine, rest = "") => `${header}\n${nameLine}\nversion = "1.0.0"\n${rest}`;
const poetryCorpSource = `\n[package.source]\ntype = "legacy"\nurl = "${HOST.corpPypi}"\n`;

/** The lock's own item of NAME exists and is not local: the doubt is not a private block. */
function assertNotLocal(result, manifest) {
  const item = result.items.find((i) => i.manifest === manifest && i.name === NAME);
  assert.ok(item, `${manifest}: the lock's item exists`);
  assert.ok(!("local" in item), `${manifest}: the item is not local`);
}

const PYPI_FILE = `${HOST.pyFiles}/ab/cd/corp_lib-1.0.0-py3-none-any.whl`;
const CORP_FILE = `${HOST.corpFiles}/corp_lib-1.0.0-py3-none-any.whl`;

describe("uv.lock proves a name only from PyPI's registry", () => {
  test("a package from PyPI's registry, its files on PyPI's file host, is sent (the control of every pair below)", async () => {
    await expectSent(uvFiles(uvPackage(NAME)), [SENT]);
  });

  test("only the package from PyPI is sent when a private one sits beside it", async () => {
    const files = {
      "pyproject.toml": pyproject(["fastapi>=0.110", NAME]),
      "uv.lock": uvLock(
        uvPackage("fastapi", { version: "0.110.0" }),
        uvPackage(NAME, { registry: HOST.corpPypi, files: false }),
      ),
    };
    await expectSent(files, ["pip fastapi"]);
  });

  test("a registry that is not PyPI's makes the package private", async () => {
    await expectProofDropped({
      base: uvFiles(uvPackage(NAME)),
      changed: uvFiles(uvPackage(NAME, { registry: HOST.corpPypi, files: false })),
      name: SENT,
      reason: "private",
    });
  });

  // uv writes a source for what it does not take from a registry; none of them is PyPI's.
  const SOURCES = [
    ["a git source", `{ git = "${HOST.corpGit}/lib.git" }`, "uv takes the package from a repository"],
    ["a path source", '{ path = "../corp-lib" }', "uv takes the package from a folder"],
    ["a directory source", '{ directory = "../corp-lib" }', "uv takes the package from a folder"],
    ["an editable source", '{ editable = "../corp-lib" }', "a workspace member or a local package"],
    ["a URL source", `{ url = "${CORP_FILE}" }`, "uv takes the package from an address"],
  ];
  for (const [label, source, why] of SOURCES)
    test(`${label} makes the package private (${why})`, async () => {
      await expectProofDropped({
        base: uvFiles(uvPackage(NAME)),
        changed: uvFiles(uvPackage(NAME, { source })),
        name: SENT,
        reason: "private",
        label,
      });
    });

  test("a registry or a file host written with escapes is read decoded: still PyPI's, still the proof", async () => {
    const block = uvPackage(NAME, {
      source: `{ registry = "https://pypi${CH.BACKSLASH}u002eorg/simple" }`,
      rest: `sdist = { url = "https://files${CH.BACKSLASH}u002epythonhosted.org/packages/ab/cd/corp_lib-1.0.0.tar.gz" }\n`,
    });
    await expectSent(uvFiles(block), [SENT]);
  });
});

describe("uv.lock proves a name only when its files come from PyPI's file host", () => {
  const block = (rest) => uvPackage(NAME, { files: false, rest });
  const wheels = (...urls) =>
    `wheels = [\n${urls.map((u) => `    { url = "${u}", hash = "sha256:1" },\n`).join("")}]\n`;
  const ON_PYPI = `sdist = { url = "${HOST.pyFiles}/fastapi-0.110.0.tar.gz", hash = "sha256:1" }\n${wheels(PYPI_FILE)}`;

  test("sdist and wheels on PyPI's file host prove the name (the control of every pair below)", async () => {
    await expectSent(uvFiles(block(ON_PYPI)), [SENT]);
  });

  // [label, what the block holds after its source, reason kept back, why]
  const ROWS = [
    [
      "one wheel on another host among others on PyPI's",
      wheels(PYPI_FILE, `${HOST.corpPypi}/corp_lib-1.0.0-py3-none-any.whl`),
      "private",
      "uv downloads the files its lock names: one comes from elsewhere",
    ],
    [
      "an sdist on another host",
      `sdist = { url = "${HOST.corpPypi}/corp_lib-1.0.0.tar.gz", hash = "sha256:1" }\n`,
      "private",
      "the source distribution is downloaded from the company",
    ],
    [
      "an sdist on a corporate file host",
      `sdist = { url = "${CORP_FILE}", hash = "sha256:1" }\n`,
      "private",
      "a file host that is not PyPI's",
    ],
    [
      "an sdist that is a bare string",
      `sdist = "${HOST.pyFiles}/corp_lib-1.0.0.tar.gz"\n`,
      "private",
      "uv writes an inline table with a url; a value other than that counts as elsewhere",
    ],
    [
      "an sdist written as a table of its own",
      `\n[package.sdist]\nurl = "${CORP_FILE}"\n`,
      "unproven",
      "a form uv never writes: the lock cannot be told apart",
    ],
    [
      "an sdist table spelled [package . sdist]",
      `\n[package . sdist]\nurl = "${CORP_FILE}"\n`,
      "unproven",
      "the same table as [package.sdist], read by its decoded path",
    ],
    [
      'an sdist table spelled ["package".sdist]',
      `\n["package".sdist]\nurl = "${CORP_FILE}"\n`,
      "unproven",
      "a quoted key is the same table",
    ],
    [
      "wheels as an array of tables spelled [[package . wheels]]",
      `\n[[package . wheels]]\nurl = "${CORP_FILE}"\n`,
      "unproven",
      "an array of tables of their own: a form uv never writes",
    ],
    [
      "the source written as a table of its own",
      `\n[package.source]\nregistry = "${HOST.corpPypi}"\n`,
      "unproven",
      "uv writes the source as one inline table, with the registry in it",
    ],
  ];
  // The rows that only change the host of a file: their control is the same text on PyPI's own file host.
  const onPyPI = (text) => text.replaceAll(HOST.corpPypi, HOST.pyFiles).replaceAll(HOST.corpFiles, HOST.pyFiles);
  const HOST_ONLY = new Set([
    "one wheel on another host among others on PyPI's",
    "an sdist on another host",
    "an sdist on a corporate file host",
  ]);
  for (const [label, rest, reason, why] of ROWS)
    test(`${label} proves nothing (${why})`, async () => {
      await expectProofDropped({
        base: uvFiles(block(HOST_ONLY.has(label) ? onPyPI(rest) : ON_PYPI)),
        changed: uvFiles(block(rest)),
        name: SENT,
        reason,
        label,
      });
    });
});

describe("poetry.lock proves a name only from no source, or PyPI's own", () => {
  test("a package without a source is sent (the control of every pair below)", async () => {
    await expectSent(poetryFiles(poetryPackage(NAME)), [SENT]);
  });

  test("a PyPI legacy source (type legacy, url of PyPI) is a proof too", async () => {
    await expectSent(
      poetryFiles(poetryPackage(NAME, { source: { type: "legacy", url: HOST.pypi, reference: "pypi" } })),
      [SENT],
    );
  });

  test("a legacy type written with an escape is read decoded: still PyPI's source", async () => {
    const source = `\n[package.source]\ntype = "l${CH.BACKSLASH}u0065gacy"\nurl = "${HOST.pypi}"\n`;
    await expectSent(poetryFiles(poetryPackage(NAME, { rest: source })), [SENT]);
  });

  test("without a pyproject.toml declaring it, no name is sent and none is kept back", async () => {
    const result = await expectNothingSent({ "poetry.lock": poetryLock(poetryPackage("flask")) }, {});
    assert.deepEqual(result.kept, {});
    const flask = result.items.find((i) => i.manifest === "poetry.lock" && i.name === "flask");
    assert.ok(flask, "the lock is read: its flask item exists");
    assert.equal(flask.public, true, "flask is proven by the lock");
    assert.equal(flask.direct, false, "but no pyproject.toml declares it");
  });

  test("a private package is kept back while a public one beside it is sent", async () => {
    const files = {
      "pyproject.toml": poetryProject({ flask: "^3", [NAME]: "^1" }),
      "poetry.lock": poetryLock(
        poetryPackage("flask", { version: "3.0.0" }),
        poetryPackage(NAME, { source: { type: "legacy", url: HOST.corpPypi, reference: "corp" } }),
      ),
    };
    const result = await expectSent(files, ["pip flask"]);
    assert.equal(result.kept[SENT], "private");
  });

  // [label, what the block holds, reason kept back, why]
  const ROWS = [
    [
      "a directory source, inline",
      'source = { type = "directory", url = "../corp-lib" }\n',
      "private",
      "Poetry took the package from a folder",
    ],
    [
      "a directory source, as a table of its own",
      '\n[package.source]\ntype = "directory"\nurl = "../vendored"\n',
      "private",
      "Poetry took the package from a folder; the base, with no source, is sent",
    ],
    [
      "a source as dotted keys",
      'source.type = "directory"\nsource.url = "../corp-lib"\n',
      "private",
      "the same inline source in another TOML form",
    ],
    [
      'a git source in a table spelled [package."source"]',
      `\n[package."source"]\ntype = "git"\nurl = "${HOST.corpGit}/lib.git"\n`,
      "private",
      "a quoted key is the same table",
    ],
    [
      "a legacy source without a url",
      '\n[package.source]\ntype = "legacy"\n',
      "private",
      "no address says PyPI served it",
    ],
    [
      "PyPI's url without the legacy type",
      `\n[package.source]\nurl = "${HOST.pypi}"\n`,
      "private",
      "Poetry writes the type and the url together; the url alone is not its PyPI source",
    ],
    [
      "a legacy source of a company's index",
      `\n[package.source]\ntype = "legacy"\nurl = "${HOST.corpPypi}"\nreference = "corp"\n`,
      "private",
      "a private index",
    ],
    [
      "a lock left open after the files array, a [metadata] table after it",
      'files = [\n  { file = "corp_lib-1.0.0.whl"\n',
      "unproven",
      "the lock cannot be read to its end: nothing in it is proof",
    ],
  ];
  test("a lock that ends inside the open files array (end of file) proves nothing", async () => {
    // No poetryLock(): the file stops inside the array, with nothing after it.
    const lock = (end) =>
      poetryRaw("[[package]]", `name = "${NAME}"`, `files = [\n  { file = "corp_lib-1.0.0.whl"${end}`);
    await expectProofDropped({
      base: { "pyproject.toml": POETRY_PROJECT, "poetry.lock": lock(" }\n]\n") },
      changed: { "pyproject.toml": POETRY_PROJECT, "poetry.lock": lock("\n") },
      name: SENT,
      label: "the lock cannot be read to its end",
    });
  });

  for (const [label, rest, reason, why] of ROWS)
    test(`${label} proves nothing (${why})`, async () => {
      await expectProofDropped({
        base: poetryFiles(poetryRaw("[[package]]", `name = "${NAME}"`)),
        changed: poetryFiles(poetryRaw("[[package]]", `name = "${NAME}"`, rest)),
        name: SENT,
        reason,
        label,
      });
    });
});

describe("a name is proven only when every block that names it proves it", () => {
  test("uv.lock: the same name again from another index makes it private everywhere", async () => {
    const result = await expectProofDropped({
      base: uvFiles(uvPackage(NAME), uvPackage(NAME, { version: "1.1.0" })),
      changed: uvFiles(uvPackage(NAME), uvPackage(NAME, { version: "1.1.0", registry: HOST.corpPypi, files: false })),
      name: SENT,
      reason: "private",
    });
    assert.equal(result.after.items.find((i) => i.manifest === "uv.lock").local, true);
  });

  test("poetry.lock: the same name again from a private index makes it private everywhere", async () => {
    await expectProofDropped({
      base: poetryFiles(poetryPackage(NAME), poetryPackage(NAME, { version: "2.0.0" })),
      changed: poetryFiles(
        poetryPackage(NAME),
        poetryPackage(NAME, { version: "2.0.0", source: { type: "legacy", url: HOST.corpPypi } }),
      ),
      name: SENT,
      reason: "private",
    });
  });

  // The second block of the name, however its header and its name are spelled: the lock's tool reads it as a block
  // of the same name (a one-line literal string included), so a private index there is read.
  const SPELLINGS = [
    ['a quoted header ["package"]', '[["package"]]', `name = "${NAME}"`],
    ["a literal, spaced header [[ 'package' ]]", "[[ 'package' ]]", `name = "${NAME}"`],
    ["an escaped key (n\\u0061me)", "[[package]]", `"n${CH.BACKSLASH}u0061me" = "${NAME}"`],
    ["an escaped name (corp\\u002dlib)", "[[package]]", `name = "corp${CH.BACKSLASH}u002dlib"`],
    ["an escaped name (corp\\x2dlib)", "[[package]]", `name = "corp${CH.BACKSLASH}x2dlib"`],
  ];
  for (const [label, header, nameLine] of SPELLINGS) {
    test(`uv.lock: a second block with ${label}, from a private index, is read: private`, async () => {
      await expectProofDropped({
        base: uvFiles(uvPackage(NAME), uvRaw(header, nameLine)),
        changed: uvFiles(uvPackage(NAME), uvRaw(header, nameLine, HOST.corpPypi)),
        name: SENT,
        reason: "private",
        label,
      });
    });
    test(`poetry.lock: a second block with ${label}, from a private index, is read: private`, async () => {
      await expectProofDropped({
        base: poetryFiles(poetryPackage(NAME), poetryRaw(header, nameLine, 'description = ""\n')),
        changed: poetryFiles(poetryPackage(NAME), poetryRaw(header, nameLine, poetryCorpSource)),
        name: SENT,
        reason: "private",
        label,
      });
    });
  }

  test('a second block written [["package"]] from PyPI is read as any other: both names are sent', async () => {
    const files = {
      "pyproject.toml": pyproject([NAME, "fastapi"]),
      "uv.lock": uvLock(uvPackage(NAME), uvRaw('[["package"]]', 'name = "fastapi"')),
    };
    await expectSent(files, ["pip fastapi", SENT]);
  });

  // A name the kit cannot read as the first block's: the lock proves nothing, whatever index the block names.
  const UNREADABLE_NAMES = [
    ["a multi-line basic string", '"""corp-lib"""', "TOML may fold it: the name is not told"],
    ["a multi-line literal string", "'''corp-lib'''", "TOML may fold it: the name is not told"],
    ["a string followed by more", '"corp-lib" "x"', "not a TOML value at all"],
  ];
  for (const [label, value, why] of UNREADABLE_NAMES) {
    test(`uv.lock: a second block named with ${label} is a doubt (${why})`, async () => {
      const nameLine = `name = ${value}`;
      await expectProofDropped({
        base: uvFiles(uvPackage(NAME), uvRaw("[[package]]", `name = "${NAME}"`)),
        changed: uvFiles(uvPackage(NAME), uvRaw("[[package]]", nameLine)),
        name: SENT,
        label,
      });
      const result = await expectNothingSent(uvFiles(uvPackage(NAME), uvRaw("[[package]]", nameLine, HOST.corpPypi)), {
        [SENT]: "unproven",
      });
      assertNotLocal(result, "uv.lock");
    });
    test(`poetry.lock: a second block named with ${label} is a doubt (${why})`, async () => {
      const nameLine = `name = ${value}`;
      await expectProofDropped({
        base: poetryFiles(poetryPackage(NAME), poetryRaw("[[package]]", `name = "${NAME}"`)),
        changed: poetryFiles(poetryPackage(NAME), poetryRaw("[[package]]", nameLine)),
        name: SENT,
        label,
      });
      const result = await expectNothingSent(
        poetryFiles(poetryPackage(NAME), poetryRaw("[[package]]", nameLine, poetryCorpSource)),
        { [SENT]: "unproven" },
      );
      assertNotLocal(result, "poetry.lock");
    });
  }

  test("a one-line literal string is a name as any other: the lock still proves it", async () => {
    await expectSent(uvFiles(uvRaw("[[package]]", "name = 'corp-lib'")), [SENT]);
  });
});

describe("a TOML lock its tool refuses proves nothing", () => {
  // [label, the changed lock, the base lock without the refused form, reason kept back, why]
  const uvOk = uvPackage(NAME);
  const uvSourceTwice = (first, second) =>
    uvPackage(NAME, { source: first, files: false, rest: `source = ${second}\n` });
  const UV_ROWS = [
    [
      "a lock cut off inside a later block",
      uvLock(uvOk, `[[package]]\nname = "x"\nversion = "1\n`),
      uvLock(uvOk, `[[package]]\nname = "x"\nversion = "1"\n`),
      "unproven",
      "a string left open: the lock cannot be read to its end",
    ],
    [
      "a source written twice, the private one first",
      uvLock(uvSourceTwice(`{ registry = "${HOST.corpPypi}" }`, `{ registry = "${HOST.pypi}" }`)),
      uvLock(uvPackage(NAME, { files: false })),
      "unproven",
      "read as the last wins, the block would look like PyPI's",
    ],
    [
      "a registry key given twice in the source",
      uvLock(uvPackage(NAME, { source: `{ registry = "${HOST.corpPypi}", registry = "${HOST.pypi}" }` })),
      uvLock(uvPackage(NAME, { source: `{ registry = "${HOST.pypi}" }` })),
      "unproven",
      "TOML refuses a key twice; the kit must not choose one",
    ],
    [
      "a registry key given twice, one spelled with an escape",
      uvLock(
        uvPackage(NAME, {
          source: `{ "regi${CH.BACKSLASH}u0073try" = "${HOST.corpPypi}", registry = "${HOST.pypi}" }`,
        }),
      ),
      uvLock(uvPackage(NAME, { source: `{ registry = "${HOST.pypi}" }` })),
      "unproven",
      "the escaped key is the same key",
    ],
    [
      "a url given twice in the sdist's inline table",
      uvLock(
        uvPackage(NAME, {
          files: false,
          rest: `sdist = { url = "${CORP_FILE}", url = "${PYPI_FILE}" }\n`,
        }),
      ),
      uvLock(uvPackage(NAME, { files: false, rest: `sdist = { url = "${PYPI_FILE}" }\n` })),
      "unproven",
      "the same refusal inside the files table",
    ],
    [
      "a key of 1,001 characters in the source",
      uvLock(uvPackage(NAME, { source: `{ "${"k".repeat(1001)}" = "x", registry = "${HOST.pypi}" }` })),
      uvLock(uvPackage(NAME, { source: `{ registry = "${HOST.pypi}" }` })),
      "unproven",
      "a name over 1,000 characters is never followed, and the file is a doubt",
    ],
    [
      "a table [package] after the array [[package]]",
      uvLock(`[[package]]\nname = "${NAME}"\nversion = "1.0.0"\n\n[package]\nsource = { registry = "${HOST.pypi}" }\n`),
      uvLock(`[[package]]\nname = "${NAME}"\nversion = "1.0.0"\nsource = { registry = "${HOST.pypi}" }\n`),
      "unproven",
      "TOML refuses a table over an array of tables with the same name; the block has no source of its own",
    ],
    [
      "a private block wrapped in an array",
      uvLock(
        uvPackage(NAME, { rest: "x = [\n" }),
        `${uvPackage(NAME, { version: "2.0.0", registry: HOST.corpPypi, files: false })}]\n`,
      ),
      uvLock(uvPackage(NAME, { rest: 'x = [\n  "a",\n]\n' })),
      "unproven",
      "a header and key = value lines are no array's elements: uv refuses the lock, the kit would read past the block",
    ],
    [
      "a private block wrapped in an inline table",
      uvLock(
        uvPackage(NAME, { rest: "x = {\n" }),
        `${uvPackage(NAME, { version: "2.0.0", registry: HOST.corpPypi, files: false })}}\n`,
      ),
      uvLock(uvPackage(NAME, { rest: 'x = { a = "b" }\n' })),
      "unproven",
      "an inline table expects a key, never a header",
    ],
    [
      "a NUL in a comment",
      `# ${CH.NUL}\n${uvLock(uvOk)}`,
      `# -\n${uvLock(uvOk)}`,
      "unproven",
      "TOML has no control character: uv refuses the lock",
    ],
    [
      "a lone carriage return",
      uvLock(uvOk).replace("\n", CH.CR),
      uvLock(uvOk),
      "unproven",
      "a newline is LF or CRLF: uv refuses the lock",
    ],
    [
      "a [[package]] with no name",
      uvLock(uvOk, '[[package]]\nversion = "2.0.0"\n'),
      uvLock(uvOk, '[[package]]\nname = "other-lib"\nversion = "2.0.0"\n'),
      "unproven",
      "uv refuses a package without a name: what follows it would be its own",
    ],
  ];
  for (const [label, changed, base, reason, why] of UV_ROWS)
    test(`uv.lock: ${label} (${why})`, async () => {
      await expectProofDropped({
        base: { "pyproject.toml": UV_PROJECT, "uv.lock": base },
        changed: { "pyproject.toml": UV_PROJECT, "uv.lock": changed },
        name: SENT,
        reason,
        label,
      });
    });

  const poetryOk = poetryLock(poetryPackage(NAME));
  const poetryBlock = (rest) => poetryLock(poetryRaw("[[package]]", `name = "${NAME}"`, rest));
  const BETWEEN = [
    ["a [[package.files]] array", '[[package.files]]\nfile = "corp_lib-1.0.0-py3-none-any.whl"\n'],
    ["an [[extra.notes]] array with a key", '[[extra.notes]]\nnote = "x"\n'],
    ["an empty [[extra.notes]] array", "[[extra.notes]]\n"],
  ];
  const poetrySource = '[package.source]\ntype = "legacy"\nurl = "https://pypi.org/simple"\n';
  for (const [label, between] of BETWEEN)
    test(`poetry.lock: a [package.source] after ${label} belongs to no block the kit can tell`, async () => {
      await expectProofDropped({
        base: { "pyproject.toml": POETRY_PROJECT, "poetry.lock": poetryBlock(`\n${poetrySource}`) },
        changed: { "pyproject.toml": POETRY_PROJECT, "poetry.lock": poetryBlock(`\n${between}\n${poetrySource}`) },
        name: SENT,
        label,
      });
    });

  test("poetry.lock: an array of tables Poetry never writes, at the end with nothing after it, proves nothing", async () => {
    // No table of a package follows it (no block without a name): the array alone is a form no Poetry writes.
    const lock = poetryLock(poetryPackage(NAME));
    await expectProofDropped({
      base: { "pyproject.toml": POETRY_PROJECT, "poetry.lock": lock },
      changed: { "pyproject.toml": POETRY_PROJECT, "poetry.lock": `${lock}\n[[extra.notes]]\nnote = "x"\n` },
      name: SENT,
    });
  });

  test("poetry.lock: a private source after another array of tables is a doubt, not a private block", async () => {
    for (const [, between] of BETWEEN) {
      const lock = poetryBlock(`\n${between}\n[package.source]\ntype = "legacy"\nurl = "${HOST.corpPypi}"\n`);
      const result = await expectNothingSent(
        { "pyproject.toml": POETRY_PROJECT, "poetry.lock": lock },
        { [SENT]: "unproven" },
      );
      assertNotLocal(result, "poetry.lock");
    }
  });

  test("poetry.lock: Poetry's own [[package]] arrays with their sub-tables are still the proof", async () => {
    const lock =
      '[[package]]\nname = "fastapi"\nversion = "0.110.0"\nfiles = [{ file = "fastapi-0.110.0.tar.gz", hash = "sha256:1" }]\n\n' +
      '[package.dependencies]\nstarlette = ">=0.36"\n\n[[package]]\nname = "starlette"\nversion = "0.36.0"\n';
    await expectSent({ "pyproject.toml": poetryProject({ fastapi: "^0.110" }), "poetry.lock": lock }, ["pip fastapi"]);
  });

  const POETRY_ROWS = [
    [
      "a name given twice in one block",
      poetryLock(poetryRaw("[[package]]", `name = "other-lib"\nname = "${NAME}"`)),
      poetryOk,
      "unproven",
      "the last name wins in the kit's reading, Poetry refuses the lock",
    ],
    [
      "a source written both inline and as a table of its own",
      poetryBlock(`source = { url = "${HOST.pypi}" }\n\n[package.source]\ntype = "legacy"\n`),
      poetryBlock(`\n[package.source]\ntype = "legacy"\nurl = "${HOST.pypi}"\n`),
      "unproven",
      "the url is given twice (an inline table then a table of its own)",
    ],
    [
      "an inline source then a table that repeats its url",
      poetryBlock(`source = { type = "legacy", url = "${HOST.corpPypi}" }\n\n[package.source]\nurl = "${HOST.pypi}"\n`),
      poetryBlock(`\n[package.source]\ntype = "legacy"\nurl = "${HOST.pypi}"\n`),
      "unproven",
      "the private url is first, PyPI's after: the kit must not take the last",
    ],
    [
      "a table [package] after the array [[package]]",
      poetryBlock('\n[package]\ndescription = "x"\n'),
      poetryOk,
      "unproven",
      "a table over an array of tables: TOML refuses it",
    ],
    [
      "a private block wrapped in an array",
      poetryLock(
        poetryPackage(NAME, { rest: "x = [\n" }),
        `${poetryPackage(NAME, { version: "2.0.0", source: { type: "legacy", url: HOST.corpPypi, reference: "corp" } })}]\n`,
      ),
      poetryLock(poetryPackage(NAME, { rest: 'x = [\n  "a",\n]\n' })),
      "unproven",
      "Poetry refuses the lock: its headers and key = value lines are no array's elements",
    ],
    [
      "a [[package]] with no name before a private source",
      poetryLock(poetryPackage(NAME), '[[package]]\n\n[package.source]\ntype = "directory"\nurl = "../corp-lib"\n'),
      poetryLock(poetryPackage(NAME), poetryPackage("other-lib", { rest: "" })),
      "unproven",
      "the source is the nameless block's, taken away from corp-lib's: Poetry cannot read such a lock",
    ],
  ];
  for (const [label, changed, base, reason, why] of POETRY_ROWS)
    test(`poetry.lock: ${label} (${why})`, async () => {
      await expectProofDropped({
        base: { "pyproject.toml": POETRY_PROJECT, "poetry.lock": base },
        changed: { "pyproject.toml": POETRY_PROJECT, "poetry.lock": changed },
        name: SENT,
        reason,
        label,
      });
    });

  test("uv.lock: a name given twice in one block is a doubt (the last name would win)", async () => {
    const lock = uvLock(
      `[[package]]\nname = "fastapi"\nname = "${NAME}"\nversion = "1.0.0"\nsource = { registry = "${HOST.pypi}" }\n`,
    );
    const result = await expectNothingSent({ "pyproject.toml": UV_PROJECT, "uv.lock": lock }, { [SENT]: "unproven" });
    assert.ok(result.items.some((i) => i.manifest === "uv.lock"));
  });
});

describe("a lock is read as its tool reads it", () => {
  test("a uv.lock root written with escapes is no dependency, and its dependency is the package's own name", async () => {
    const root = `[[package]]\nname = "app"\nversion = "0.1.0"\nsource = { editable = "${CH.BACKSLASH}u002e" }\ndependencies = [{ name = "corp${CH.BACKSLASH}u002dlib" }]\n\n`;
    const read = deps({ "uv.lock": `${root}${uvPackage(NAME)}` });
    assert.deepEqual(Object.keys(read["uv.lock"]), [NAME]);
    assert.equal(read["uv.lock"][NAME].direct, true);
    assert.equal(read["uv.lock"][NAME].public, true);
  });

  test("a poetry.lock group written with an escape is still main", async () => {
    const block = poetryRaw("[[package]]", `name = "${NAME}"`, `groups = ["m${CH.BACKSLASH}u0061in"]\n`);
    const read = deps({ "poetry.lock": block });
    assert.equal(read["poetry.lock"][NAME].dev, false);
  });
});

describe("a Pipfile.lock proves nothing", () => {
  // Pipenv's mirror (PIPENV_PYPI_MIRROR) is not written in the lock, which still names PyPI for a package a company
  // mirror served: that mirror may host private packages too.
  const PIPFILE = '[packages]\nrequests = "*"\nother = "*"\n';
  const PIPFILE_LOCK = {
    _meta: { sources: [{ name: "pypi", url: HOST.pypi }] },
    default: { requests: { index: "pypi", version: "==2.31.0", hashes: ["sha256:aa"] }, other: { version: "==1.0" } },
  };

  test("its packages, from PyPI by its own words, are kept back as unproven and its items carry no proof", async () => {
    const result = await expectNothingSent(
      { Pipfile: PIPFILE, "Pipfile.lock": PIPFILE_LOCK },
      { "pip requests": "unproven", "pip other": "unproven" },
    );
    const fromLock = result.items.filter((i) => i.manifest === "Pipfile.lock");
    assert.deepEqual(fromLock.map((i) => i.name).sort(), ["other", "requests"]);
    assert.deepEqual(
      fromLock.filter((i) => i.public),
      [],
    );
  });

  test("a uv.lock beside it is what proves the name (the pair: without it nothing is sent)", async () => {
    const files = {
      Pipfile: PIPFILE,
      "Pipfile.lock": PIPFILE_LOCK,
      "pyproject.toml": pyproject(["requests"]),
    };
    await expectProofDropped({
      base: { ...files, "uv.lock": uvLock(uvPackage("requests")) },
      changed: files,
      name: "pip requests",
    });
  });
});

describe("a lock its tool cannot decode (UTF-16, UTF-8 not valid) is unreadable: it proves nothing", () => {
  const utf16le = (text) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
  const utf16be = (text) => {
    const bytes = Buffer.from(text, "utf16le");
    bytes.swap16();
    return Buffer.concat([Buffer.from([0xfe, 0xff]), bytes]);
  };
  const LOCKS = [
    ["uv.lock", "uv.lock", UV_PROJECT, uvLock(uvPackage(NAME))],
    ["poetry.lock", "poetry.lock", POETRY_PROJECT, poetryLock(poetryPackage(NAME))],
  ];
  for (const [file, , project, text] of LOCKS)
    for (const [encoding, encode] of [
      ["UTF-16 LE", utf16le],
      ["UTF-16 BE", utf16be],
      // uv and Poetry refuse bytes that are not UTF-8 (npm and Yarn read them replaced): here in a comment line.
      [
        "UTF-8 not valid",
        (text) => Buffer.concat([Buffer.from("# "), Buffer.from([0xc3, 0x28]), Buffer.from(`\n${text}`)]),
      ],
    ])
      test(`${file} in ${encoding}: unreadable, no proof (its tool does not read it)`, async () => {
        const { after } = await expectProofDropped({
          base: { "pyproject.toml": project, [file]: text },
          changed: { "pyproject.toml": project, [file]: encode(text) },
          name: SENT,
          label: `${file} ${encoding}`,
        });
        assert.deepEqual(after.unreadable, [{ file, reason: "read" }], file);
        assert.deepEqual(
          after.items.filter((i) => i.manifest === file),
          [],
          `${file}: no item read from it`,
        );
      });
});
