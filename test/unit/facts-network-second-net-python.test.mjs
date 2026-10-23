// The second net for pip packages (engine/facts/declarations.mjs, network.mjs): where a package index other than PyPI,
// or a place a package comes from, can be declared — `[tool.uv.sources]`, the indexes of uv, PDM, Rye, Poetry and
// Pipenv, `[tool.uv.pip]` and uv.toml, requirements files, pip.conf, Poetry's configuration, the variables — and what
// a reader does not understand: every one of those makes pip names private, and a private name is never sent.
// Every application here is judged with `proof: "all"` (a lock file would have proven every item public): what keeps
// a name back is then the second net alone. Each "private" outcome has its positive control, the same files with
// PyPI's own index (or without the declaration), which sends the name.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { app, network, expectSent, expectNothingSent, registriesOf } from "../tools/deps-apps.mjs";
import { CH, HOST, pyproject, uvLock, uvPackage, registryUrl } from "../tools/locks.mjs";

const LIB = "pip corp-lib";
const FASTAPI = "pip fastapi";
const REQUESTS = "pip requests";
const PYPI = HOST.pypi;
const CORP = HOST.corpPypi;
const GIT = `${HOST.corpGit}/corp/lib.git`;
const B = CH.BACKSLASH;
const chr = (code) => String.fromCharCode(code);
const DEPS = ["corp-lib>=1", "fastapi>=0.110"];
/** The usual pyproject.toml: corp-lib and fastapi, then `rest`. */
const project = (rest = "") => pyproject(DEPS, rest);
const ALL = { proof: "all" };
/** A file's bytes in UTF-16 with its byte order mark (little or big endian), as PowerShell 5 or Notepad writes it. */
const utf16 = (text, order) => {
  const le = Buffer.from(text, "utf16le");
  return order === "le"
    ? Buffer.concat([Buffer.from([0xff, 0xfe]), le])
    : Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(le).swap16()]);
};

/**
 * A minimal pair under `proof: "all"`. `base` (without the declaration, or with PyPI's own index) sends `names` and
 * `sent`; `changed` sends only `sent` and keeps every one of `names` back as private. `options` and `baseOptions` are
 * the person's `env` and `home` (the base takes the same by default); `unreadable`: the files `changed` leaves
 * unreadable. Returns both results.
 */
async function expectPair({ base, changed, names, sent = [], unreadable = [], label, options = {}, baseOptions }) {
  const before = await network(base, { ...ALL, ...(baseOptions ?? options) });
  assert.deepEqual(before.sent, [...names, ...sent].sort(), `${label}: the base sends every name`);
  assert.deepEqual(before.unreadable, [], `${label}: the base files are read`);
  const after = await network(changed, { ...ALL, ...options });
  assert.deepEqual(after.sent, [...sent].sort(), `${label}: what is still sent`);
  for (const name of names) assert.equal(after.kept[name], "private", `${label}: ${name} is private`);
  assert.deepEqual(after.unreadable, unreadable, `${label}: unreadable files`);
  return { before, after };
}

/**
 * One row of a table about a declaration: pip's `corp-lib` (a requirements file unless `files` brings its own) stays
 * back as private (`isPrivate`), or is sent. The person's files are `home` (HOME and USERPROFILE), or `folder`: a
 * folder of the person's that `env(dir)` names (APPDATA, XDG_CONFIG_HOME, a variable naming a file…).
 */
async function expectOutcome({ files = {}, isPrivate, home, folder, env, label }) {
  const dir = folder ? app(folder) : null;
  try {
    const options = { ...ALL, home, env: env ? env(dir) : undefined };
    const all = { "requirements.txt": "corp-lib==1.0\n", ...files };
    if (isPrivate) await expectNothingSent(all, { [LIB]: "private" }, { ...options, label });
    else await expectSent(all, [LIB], { ...options, label });
  } finally {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("[tool.uv.sources]: a package uv takes from elsewhere than PyPI is private", () => {
  const spec = `{ git = "${GIT}" }`;
  /** The table in each form `name` can be written in. */
  const FORMS = [
    ["a key of the table", (n) => `[tool.uv.sources]\n${n} = ${spec}\n`, "uv reads each key as a package name"],
    ["a quoted key", (n) => `[tool.uv.sources]\n"${n}" = ${spec}\n`, "quotes change nothing"],
    ["a dotted key", (n) => `[tool.uv.sources]\n${n}.git = "${GIT}"\n`, "a dotted key is the same table"],
    ["a table of its own", (n) => `[tool.uv.sources.${n}]\ngit = "${GIT}"\n`, "a header is the same table"],
  ];

  for (const [label, sources, why] of FORMS)
    test(`${label}: the package is private and its item local, however its name is spelled`, async () => {
      const files = (name) => ({
        "pyproject.toml": pyproject(["corp-git.lib", "fastapi>=0.110"], sources(name)),
      });
      const { after } = await expectPair({
        base: files("Other_Lib"),
        changed: files("Corp_Git_Lib"),
        names: ["pip corp-git.lib"],
        sent: [FASTAPI],
        label: `${label} (${why})`,
      });
      const item = after.items.find((i) => i.manifest === "pyproject.toml" && i.name === "corp-git.lib");
      assert.equal(item?.local, true, `${label}: the item is local`);
    });

  for (const [label, sources] of FORMS)
    test(`the root of a uv workspace, ${label}: a member's dependency is private (its own item is not local)`, async () => {
      const files = (name) => ({
        "pyproject.toml": `[project]\nname = "root"\n[tool.uv.workspace]\nmembers = ["packages/*"]\n${sources(name)}`,
        "packages/api/pyproject.toml": pyproject(["corp-git.lib>=1", "fastapi>=0.110"], "", { name: "api" }),
      });
      const { after } = await expectPair({
        base: files("Other_Lib"),
        changed: files("Corp_Git_Lib"),
        names: ["pip corp-git.lib"],
        sent: [FASTAPI],
        label,
      });
      const member = after.items.find((i) => i.manifest === "packages/api/pyproject.toml" && i.name === "corp-git.lib");
      assert.equal(member?.local, undefined, "the member's manifest does not name the source");
    });

  /** Rows of `[label, pyproject.toml of `name`, why]`: forms of the file itself, the dependency being corp-lib. */
  const FILE_FORMS = [
    [
      "a comment after a header",
      (n) => project(`[tool.uv.sources] # internal\n${n} = ${spec}\n`),
      "a comment is not part of the header",
    ],
    [
      "a comment that opens a bracket before the source",
      (n) => project(`[tool.uv.sources]\n# old = [ see the wiki\n${n} = ${spec}\n`),
      "a comment opens nothing",
    ],
    [
      "sources.<name> under [tool.uv]",
      (n) => project(`[tool.uv]\nsources.${n} = ${spec}\n`),
      "a dotted key below a header",
    ],
    [
      "sources as an inline table under [tool.uv]",
      (n) => project(`[tool.uv]\nsources = { ${n} = ${spec} }\n`),
      "inline",
    ],
    ["uv as an inline table under [tool]", (n) => project(`[tool]\nuv = { sources = { ${n} = ${spec} } }\n`), "inline"],
    [
      "a dotted key before any header",
      (n) => `tool.uv.sources.${n} = ${spec}\n${project()}`,
      "the key is written at the root of the file",
    ],
    [
      "a name written with a \\u escape",
      (n) => project(`[tool.uv.sources]\n"${n.replace("-", "\\u002d")}" = ${spec}\n`),
      "uv reads the decoded key",
    ],
    [
      "a name written with a TOML 1.1 \\x escape",
      (n) => project(`[tool.uv.sources]\n"${n.replace("-", `${B}x2d`)}" = ${spec}\n`),
      "uv reads \\xHH",
    ],
  ];
  for (const [label, build, why] of FILE_FORMS)
    test(`${label}: corp-lib is private and its item local`, async () => {
      const { after } = await expectPair({
        base: { "pyproject.toml": build("other-lib") },
        changed: { "pyproject.toml": build("corp-lib") },
        names: [LIB],
        sent: [FASTAPI],
        label: `${label} (${why})`,
      });
      const item = after.items.find((i) => i.manifest === "pyproject.toml" && i.name === "corp-lib");
      assert.equal(item?.local, true, `${label}: the item is local`);
    });

  test("a quoted name with a dot is one name", async () => {
    const files = (name) => ({
      "pyproject.toml": pyproject(["corp.lib>=1", "fastapi>=0.110"], `[tool.uv.sources]\n"${name}" = ${spec}\n`),
    });
    await expectPair({
      base: files("other.lib"),
      changed: files("corp.lib"),
      names: ["pip corp.lib"],
      sent: [FASTAPI],
    });
  });

  test("the root of a uv workspace: a quoted name with a dot, a comment after the header, the member writes Corp_Lib", async () => {
    const files = (name) => ({
      "pyproject.toml": `[project]\nname = "root"\n[tool.uv.sources] # internal\n"${name}" = ${spec}\n`,
      "packages/api/pyproject.toml": pyproject(["Corp_Lib>=1", "fastapi>=0.110"], "", { name: "api" }),
    });
    await expectPair({
      base: files("other.lib"),
      changed: files("corp.lib"),
      names: ["pip Corp_Lib"],
      sent: [FASTAPI],
    });
  });

  test("with or without a uv.lock: a package from git or a folder is private, the lock's own member local", async () => {
    const sources = `[tool.uv.sources]\ncorp-git-lib = { git = "${GIT}" }\ncorp-path-lib = { path = "../corp-path-lib", editable = true }\n`;
    const deps = ["corp-git-lib", "corp-path-lib", "fastapi>=0.110"];
    const names = ["pip corp-git-lib", "pip corp-path-lib"];
    await expectPair({
      base: { "pyproject.toml": pyproject(deps) },
      changed: { "pyproject.toml": pyproject(deps, sources) },
      names,
      sent: [FASTAPI],
      label: "without a lock",
    });
    const lock = uvLock(
      uvPackage("app", { source: '{ editable = "." }', dependencies: ["corp-path-lib", "fastapi"], files: false }),
      uvPackage("corp-path-lib", { source: '{ editable = "../corp-path-lib" }' }),
      uvPackage("fastapi", { version: "0.110.0" }),
    );
    const locked = await network({ "pyproject.toml": pyproject(deps, sources), "uv.lock": lock }, ALL);
    assert.deepEqual(locked.sent, [FASTAPI], "one fastapi, whatever manifest names it");
    assert.deepEqual(locked.urls, [registryUrl("pip", "fastapi")], "one request, both items");
    for (const name of names) assert.equal(locked.kept[name], "private", name);
    assert.equal(
      locked.items.find((i) => i.manifest === "uv.lock" && i.name === "corp-path-lib")?.local,
      true,
      "a workspace member of uv.lock is a local item",
    );
    // The lock alone, without the sources: the git package is sent again, the member stays local.
    const control = await network({ "pyproject.toml": pyproject(deps), "uv.lock": lock }, ALL);
    assert.deepEqual(control.sent, ["pip corp-git-lib", FASTAPI], "the lock's member stays back, the git name is sent");
    assert.equal(control.kept["pip corp-path-lib"], "private");
  });
});

describe("a package index other than PyPI's makes every pip package private; PyPI's own stays public", () => {
  const FILES = { "requirements.txt": "corp-lib==1.0\nfastapi==0.110.0\n" };
  /** Each way to declare an index at `url`, as a function of the url: the files of the application. */
  const INDEXES = [
    [
      "[tool.uv] extra-index-url, PyPI's own first",
      (u) => ({ "pyproject.toml": project(`[tool.uv]\nextra-index-url = ["${PYPI}", "${u}"]\n`) }),
      "any entry of the list counts",
    ],
    [
      "[tool.uv] index-url",
      (u) => ({ "pyproject.toml": project(`[tool.uv]\nindex-url = "${u}"\n`) }),
      "uv's older keys, in its table",
    ],
    [
      "[tool.uv.pip] index-url",
      (u) => ({ "pyproject.toml": project(`[tool.uv.pip]\nindex-url = "${u}"\n`) }),
      "uv's pip settings",
    ],
    [
      "[tool.uv.pip] extra-index-url",
      (u) => ({ "pyproject.toml": project(`[tool.uv.pip]\nextra-index-url = ["${PYPI}", "${u}"]\n`) }),
      "uv's pip settings, a list",
    ],
    [
      "[[tool.pdm.source]] with a comment on its header",
      (u) => ({ "pyproject.toml": project(`[[tool.pdm.source]] # corp\nname = "corp"\nurl = "${u}"\n`) }),
      "PDM's index",
    ],
    [
      "[[tool.pdm.source]], the plain form",
      (u) => ({ "pyproject.toml": project(`[[tool.pdm.source]]\nname = "corp"\nurl = "${u}"\n`) }),
      "PDM's index",
    ],
    [
      "pdm source as an inline array",
      (u) => ({ "pyproject.toml": project(`[tool.pdm]\nsource = [{ name = "corp", url = "${u}" }]\n`) }),
      "the same table, inline",
    ],
    [
      "[[tool.rye.sources]] with a comment on its header",
      (u) => ({ "pyproject.toml": project(`[[tool.rye.sources]] # corp\nname = "corp"\nurl = "${u}"\n`) }),
      "Rye's index",
    ],
    [
      "[[tool.rye.sources]], the plain form",
      (u) => ({ "pyproject.toml": project(`[[tool.rye.sources]]\nname = "corp"\nurl = "${u}"\n`) }),
      "Rye's index",
    ],
    [
      "[[tool.poetry.source]] with a comment on its header",
      (u) => ({
        "pyproject.toml": project(`[[tool.poetry.source]] # corp\nname = "corp"\nurl = "${u}"\npriority = "primary"\n`),
      }),
      "Poetry's index",
    ],
    [
      "a Pipfile's [[source]] with a comment on its header",
      (u) => ({
        Pipfile: `[[source]] # corp\nname = "corp"\nurl = "${u}"\nverify_ssl = true\n\n[packages]\ncorp-lib = "*"\nfastapi = "*"\n`,
      }),
      "Pipenv's index",
    ],
    ["uv.toml [pip] index-url", (u) => ({ ...FILES, "uv.toml": `[pip]\nindex-url = "${u}"\n` }), "uv's pip settings"],
    ["uv.toml index-url", (u) => ({ ...FILES, "uv.toml": `index-url = "${u}"\n` }), "uv's own setting"],
    [
      "uv.toml [pip] extra-index-url",
      (u) => ({ ...FILES, "uv.toml": `[pip]\nextra-index-url = ["${u}"]\n` }),
      "uv's pip settings, a list",
    ],
  ];
  for (const [label, files, why] of INDEXES)
    test(`${label}: a private index keeps corp-lib and fastapi back, PyPI's own sends both`, async () => {
      await expectPair({
        base: files(PYPI),
        changed: files(CORP),
        names: [LIB, FASTAPI],
        label: `${label} (${why})`,
      });
    });

  /** uv's own index tables: any of them is a declaration, whatever its address (uv may pin a package to it). */
  const UV_INDEX_TABLES = [
    [
      "[[tool.uv.index]] with a comment on its header",
      {
        "pyproject.toml": project(`[[tool.uv.index]] # corp
name = "corp"
url = "${CORP}"
`),
      },
    ],
    [
      "uv index as an inline array",
      {
        "pyproject.toml": project(`[tool.uv]
index = [{ name = "corp", url = "${CORP}" }]
`),
      },
    ],
    [
      "uv.toml [[index]]",
      {
        ...FILES,
        "uv.toml": `[[index]]
name = "corp"
url = "${CORP}"
`,
      },
    ],
  ];
  for (const [label, changed] of UV_INDEX_TABLES)
    test(`${label}: every pip package is private (the control declares nothing)`, async () => {
      const base = changed["uv.toml"] ? FILES : { "pyproject.toml": project() };
      await expectPair({ base, changed, names: [LIB, FASTAPI], label });
    });

  /** A place of packages with no PyPI twin: a folder or an address of wheels. */
  const FIND_LINKS = [
    ["[tool.uv] find-links, a folder", `[tool.uv]\nfind-links = ["./wheels"]\n`],
    ["[tool.uv.pip] find-links, a folder", `[tool.uv.pip]\nfind-links = ["./wheels"]\n`],
    ["[tool.uv] find-links, an address", `[tool.uv]\nfind-links = ["https://wheels.corp.internal/"]\n`],
  ];
  for (const [label, rest] of FIND_LINKS)
    test(`${label}: every pip package is private (the control declares nothing)`, async () => {
      await expectPair({
        base: { "pyproject.toml": project() },
        changed: { "pyproject.toml": project(rest) },
        names: [LIB, FASTAPI],
        label,
      });
    });

  const PUBLIC = [
    [
      "[tool.uv] extra-index-url = PyPI's index",
      { "pyproject.toml": project(`[tool.uv]\nextra-index-url = ["${PYPI}"]\n`) },
    ],
    [
      "[[tool.poetry.source]] the default PyPI, primary",
      {
        "pyproject.toml": project(
          `[[tool.poetry.source]] # the default\nname = "pypi-main"\nurl = "${PYPI}"\npriority = "primary"\n`,
        ),
      },
    ],
    [
      "a Pipfile that declares PyPI explicitly",
      { Pipfile: `[[source]]\nurl = "${PYPI}"\nname = "pypi"\n\n[packages]\ncorp-lib = "*"\nfastapi = "*"\n` },
    ],
    ["find-links on PyPI's file host", { "pyproject.toml": project(`[tool.uv]\nfind-links = ["${HOST.pyFiles}"]\n`) }],
    ["uv.toml index-url on PyPI", { ...FILES, "uv.toml": `index-url = "${PYPI}"\n` }],
  ];
  for (const [label, files] of PUBLIC)
    test(`${label}: the public packages are still sent`, async () => {
      await expectSent(files, [LIB, FASTAPI], { ...ALL, label });
    });

  const LOOKALIKES = [
    ["a host that starts like PyPI's", "https://pypi.org.corp.internal/simple"],
    ["PyPI's name as the user of another host", "https://pypi.org@evil.example/simple"],
    ["PyPI's name inside a path", "https://pypi.corp.internal/pypi.org/simple"],
  ];
  for (const [label, url] of LOOKALIKES)
    test(`${label} is a private index`, async () => {
      await expectPair({
        base: { "pyproject.toml": project(`[tool.uv]\nindex-url = "${PYPI}"\n`) },
        changed: { "pyproject.toml": project(`[tool.uv]\nindex-url = "${url}"\n`) },
        names: [LIB, FASTAPI],
        label,
      });
    });

  test("an index declared at the root counts for a manifest in a folder below it", async () => {
    const files = (url) => ({
      "pyproject.toml": `[project]\nname = "root"\n\n[[tool.pdm.source]]\nname = "corp"\nurl = "${url}"\n`,
      "services/api/requirements.txt": "corp-lib==1.0\nfastapi==0.110.0\n",
    });
    await expectPair({ base: files(PYPI), changed: files(CORP), names: [LIB, FASTAPI] });
  });

  test("an index in a pyproject.toml or a uv.toml of a folder no manifest names counts too", async () => {
    const rows = [
      ["a pyproject.toml", (u) => ({ "tools/pyproject.toml": `[tool.uv]\nindex-url = "${u}"\n` })],
      ["a uv.toml", (u) => ({ "tools/uv.toml": `index-url = "${u}"\n` })],
    ];
    for (const [label, files] of rows)
      await expectPair({
        base: { "requirements.txt": "corp-lib==1.0\n", ...files(PYPI) },
        changed: { "requirements.txt": "corp-lib==1.0\n", ...files(CORP) },
        names: [LIB],
        label,
      });
  });

  test("an application's pip.conf or pip.ini is never read, so its presence is a doubt", async () => {
    for (const file of ["pip.conf", "pip.ini"])
      await expectPair({
        base: { "requirements.txt": "corp-lib==1.0\n" },
        changed: { "requirements.txt": "corp-lib==1.0\n", [file]: "[global]\ntimeout = 60\n" },
        names: [LIB],
        label: file,
      });
  });
});

describe("uv's override and constraint dependencies, and a requirement the kit does not read", () => {
  const FROM_URL = "corp-lib @ https://files.corp.internal/corp_lib-1.0-py3-none-any.whl";
  const OVERRIDES = ["override-dependencies", "constraint-dependencies"];
  for (const key of OVERRIDES)
    test(`[tool.uv] ${key} from a URL: the package is private, the others are sent`, async () => {
      const files = (requirement) => ({
        "pyproject.toml": pyproject(["corp-lib", "fastapi>=0.110"], `[tool.uv]\n${key} = ["${requirement}"]\n`),
      });
      await expectPair({
        base: files("corp-lib>=1.0"),
        changed: files(FROM_URL),
        names: [LIB],
        sent: [FASTAPI],
        label: key,
      });
    });

  test("uv.toml override-dependencies from a URL: every pip package is private", async () => {
    const files = (requirement) => ({
      "requirements.txt": "requests==2.31.0\n",
      "uv.toml": `override-dependencies = ["${requirement}"]\n`,
    });
    await expectPair({ base: files("corp-lib>=1.0"), changed: files(FROM_URL), names: [REQUESTS] });
  });

  /** A requirement written as a multi-line string is text the kit does not read: its package is unknown. */
  const MULTILINE = [
    [
      "pyproject.toml [tool.uv] override-dependencies",
      (req) => ({ "pyproject.toml": project(`[tool.uv]\noverride-dependencies = [${req}]\n`) }),
    ],
    [
      "uv.toml override-dependencies",
      (req) => ({ "pyproject.toml": project(), "uv.toml": `override-dependencies = [${req}]\n` }),
    ],
    ["a PEP 621 dependency", (req) => ({ "pyproject.toml": `[project]\nname = "app"\ndependencies = [${req}]\n` })],
  ];
  const lock = uvLock(
    uvPackage("app", { source: '{ editable = "." }', dependencies: ["corp-lib", "fastapi"], files: false }),
    uvPackage("corp-lib"),
    uvPackage("fastapi"),
  );
  for (const [label, build] of MULTILINE)
    for (const quote of ['"""', "'''"])
      test(`${label} as a ${quote} string: every pip package is private`, async () => {
        const text = (req) => ({ ...build(req), "uv.lock": lock });
        await expectPair({
          base: text('"corp-lib>=1.0"'),
          changed: text(`${quote}corp-lib @ git+${HOST.corpGit}/lib${quote}`),
          names: [LIB, FASTAPI],
          label: `${label} ${quote}`,
        });
      });

  test("a pyproject.toml's requirement from git, in any TOML form, makes that name private everywhere", async () => {
    const ref = '"corp-lib @ git+https://git.corp.internal/corp-lib"';
    const files = (root) => ({
      "pyproject.toml": root,
      "b/pyproject.toml": '[project]\nname = "b"\ndependencies = ["corp-lib"]\n',
      "b/uv.lock": uvLock(uvPackage("corp-lib")),
    });
    const FORMS = [
      ["project.dependencies as a dotted key", (r) => `project.dependencies = [${r}]\n`],
      ["optional-dependencies as an inline table", (r) => `[project]\noptional-dependencies = { dev = [${r}] }\n`],
      ["optional-dependencies.dev as a dotted key", (r) => `[project]\noptional-dependencies.dev = [${r}]\n`],
      ["a quoted project table", (r) => `["project"]\ndependencies = [${r}]\n`],
      ["uv.dev-dependencies under [tool]", (r) => `[tool]\nuv.dev-dependencies = [${r}]\n`],
    ];
    for (const [label, form] of FORMS)
      await expectPair({
        base: files(form('"corp-lib>=1"')),
        changed: files(form(ref)),
        names: [LIB],
        label,
      });
    // The dotted form is read as a dependency too.
    await expectSent({ "pyproject.toml": 'project.dependencies = ["fastapi>=0.110"]\n' }, [FASTAPI], ALL);
  });

  test("a multi-line requirement or an override from git in a folder no manifest names: every pip package private", async () => {
    const proving = {
      "b/pyproject.toml": '[project]\nname = "b"\ndependencies = ["corp-lib"]\n',
      "b/uv.lock": uvLock(uvPackage("corp-lib")),
    };
    const rows = [
      [
        "a pyproject.toml",
        (req) => ({ "a/pyproject.toml": `[project]\nname = "a"\ndependencies = [${req}]\n` }),
        '"""corp-lib @ git+https://git.corp.internal/corp-lib"""',
      ],
      [
        "a uv.toml override",
        (req) => ({ "a/uv.toml": `override-dependencies = [${req}]\n` }),
        '"corp-lib @ git+https://git.corp.internal/corp-lib"',
      ],
    ];
    for (const [label, build, req] of rows)
      await expectPair({
        base: { ...build('"corp-lib>=1"'), ...proving },
        changed: { ...build(req), ...proving },
        names: [LIB],
        label,
      });
  });
});

describe("Poetry: a dependency with a field that is not a registry's is private", () => {
  const NEIGHBOUR = '[tool.poetry.group.docs.dependencies]\nrequests = "^2.31"\n';
  /** `[table, form, registry form]` the same dependency written for a registry, to compare with. */
  const FIELDS = [
    ["dependencies", 'corp-lib.path = "../corp-lib"', 'corp-lib.version = "^1"', "a dotted field"],
    [
      "dependencies",
      `corp-lib.git = "git@git.corp.internal:corp/lib.git"`,
      'corp-lib.version = "^1"',
      "a scp-like git address",
    ],
    ["dependencies", "corp-lib.develop = true", 'corp-lib.version = "^1"', "develop is a path's field"],
    ["dependencies", 'corp-lib = { "path" = "../corp-lib" }', 'corp-lib = { "version" = "^1" }', "a quoted field"],
    [
      "dependencies",
      `corp-lib = { 'git' = "${HOST.corpGit}/lib.git", branch = "main" }`,
      `corp-lib = { 'version' = "^1", python = ">=3.9" }`,
      "a single-quoted field",
    ],
    ["dependencies.corp-lib", 'path = "../corp-lib"', 'version = "^1"', "a table of its own"],
    ["group.dev.dependencies", 'corp-lib.path = "../corp-lib"', 'corp-lib.version = "^1"', "a group's dependency"],
    [
      "dev-dependencies",
      'corp-lib = { version = "^1", source = "corp" }',
      'corp-lib = { version = "^1" }',
      "a source other than PyPI's",
    ],
  ];
  for (const [table, form, registry, why] of FIELDS)
    test(`[tool.poetry.${table}] ${form}: corp-lib is private, the others are sent`, async () => {
      const files = (dependency) => ({
        "pyproject.toml": pyproject(["fastapi>=0.110"], `${NEIGHBOUR}[tool.poetry.${table}]\n${dependency}\n`),
      });
      const { after } = await expectPair({
        base: files(registry),
        changed: files(form),
        names: [LIB],
        sent: [FASTAPI, REQUESTS],
        label: why,
      });
      const item = after.items.find((i) => /^corp-lib/.test(i.name));
      assert.equal(item?.name, "corp-lib", `${why}: the name, not name.field`);
    });

  test("a dependency with the registry's own fields (version, extras, python) is public", async () => {
    const result = await expectSent(
      {
        "pyproject.toml": pyproject(
          ["fastapi>=0.110"],
          '[tool.poetry.dependencies]\nrequests = { version = "^2.31", extras = ["socks"], python = ">=3.9" }\n',
        ),
      },
      [FASTAPI, REQUESTS],
      ALL,
    );
    assert.equal(result.items.find((i) => i.name === "requests").local, undefined, "the item is not local");
  });

  test("path, git, url and private-source dependencies together, then a private Poetry source", async () => {
    const dependencies = [
      "[tool.poetry.dependencies]",
      'python = "^3.12"',
      'corp-path = { path = "../corp-path" }',
      `corp-git = { git = "${HOST.corpGit}/x.git" }`,
      'corp-url = { url = "https://files.corp.internal/x.whl" }',
      'corp-src = { version = "^1", source = "corp" }',
      'fastapi = "^0.110"',
    ].join("\n");
    const names = ["pip corp-path", "pip corp-git", "pip corp-url", "pip corp-src"];
    const files = (extra = "") => ({
      "pyproject.toml": `[tool.poetry]\nname = "acme-orders"\n\n${dependencies}\n${extra}`,
    });
    const places = await network(files(), ALL);
    assert.deepEqual(places.sent, [FASTAPI]);
    for (const name of names) assert.equal(places.kept[name], "private", name);
    // A private Poetry source: even fastapi is private.
    const source = `\n[[tool.poetry.source]]\nname = "corp"\nurl = "${CORP}"\n`;
    const declared = await network(files(source), ALL);
    assert.deepEqual(declared.sent, [], "a private Poetry source: every pip package is private");
    for (const name of [...names, FASTAPI]) assert.equal(declared.kept[name], "private", name);
  });

  test("a constraint list with a place in one of its entries makes the name private", async () => {
    const files = (first, second) => ({
      "pyproject.toml": [
        "[tool.poetry.dependencies]",
        `corp-a = [ ${first}, { version = "^1" } ]`,
        "corp-b = [",
        `  ${second},`,
        "]",
        'fastapi = "^0.110"',
      ].join("\n"),
    });
    await expectPair({
      base: files(`{ version = "^1", markers = "sys_platform == 'linux'" }`, '{ version = "^1" }'),
      changed: files(`{ path = "../a", markers = "sys_platform == 'linux'" }`, '{ version = "^1", source = "corp" }'),
      names: ["pip corp-a", "pip corp-b"],
      sent: [FASTAPI],
    });
  });
});

describe("Pipfile: the same allowlist; an index not declared as PyPI's is local", () => {
  const SOURCES = `[[source]]\nname = "pypi"\nurl = "${PYPI}"\nverify_ssl = true\n\n`;
  const FORMS = [
    ["a path", 'corp-lib.path = "../corp-lib"', 'corp-lib.version = "*"'],
    ["an editable path, dotted", 'corp-lib.editable = true\ncorp-lib.path = "."', 'corp-lib.version = "*"'],
    ["a quoted path field", 'corp-lib = { "path" = "../corp-lib" }', 'corp-lib = { "version" = "*" }'],
    [
      "an index other than PyPI's",
      'corp-lib = { version = "*", index = "corp" }',
      'corp-lib = { version = "*", index = "pypi" }',
    ],
    [
      "a git field, quoted, beside a ref",
      `corp-lib = { ref = "main", "git" = "${HOST.corpGit}/lib.git" }`,
      'corp-lib = { "version" = "*" }',
    ],
  ];
  for (const [label, form, registry] of FORMS)
    test(`${label}: corp-lib is private, requests (index pypi) is sent`, async () => {
      const files = (dependency) => ({
        Pipfile: `${SOURCES}[packages]\n${dependency}\nrequests = { version = "*", index = "pypi" }\n`,
      });
      await expectPair({ base: files(registry), changed: files(form), names: [LIB], sent: [REQUESTS], label });
    });

  test("a Pipfile.lock as Pipenv writes it (hashes, index, markers): the second net keeps only the path package back", async () => {
    const lock = (corp) => ({
      _meta: { sources: [{ name: "pypi", url: PYPI, verify_ssl: true }] },
      default: {
        django: {
          hashes: ["sha256:aa", "sha256:bb"],
          index: "pypi",
          markers: "python_version >= '3.10'",
          version: "==5.0.1",
        },
        "corp-lib": corp,
      },
      develop: { pytest: { hashes: ["sha256:cc"], index: "pypi", version: "==8.0.0" } },
    });
    const files = (corpDependency, corpLock) => ({
      Pipfile: `[[source]]\nname = "pypi"\nurl = "${PYPI}"\n\n[packages]\ndjango = "*"\ncorp-lib = ${corpDependency}\n\n[dev-packages]\npytest = "*"\n`,
      "Pipfile.lock": lock(corpLock),
    });
    const { after } = await expectPair({
      base: files('"*"', { hashes: ["sha256:dd"], index: "pypi", version: "==1.0.0" }),
      changed: files('{ path = "../corp-lib", editable = true }', { editable: true, path: "../corp-lib" }),
      names: [LIB],
      sent: ["pip django", "pip pytest"],
    });
    const django = after.items.find((i) => i.manifest === "Pipfile.lock" && i.name === "django");
    assert.equal(django?.local, undefined, "the lock's PyPI package is not local");
  });
});

describe("Poetry's PyPI mirror plugin: its mirror is written in no poetry.lock, so every pip package is private", () => {
  const POETRY_DIR = ".config/pypoetry/config.toml";
  // POETRY_PYPI_MIRROR_URL, with the same two values, is a row of the variables' describe below.
  const ROWS = [
    [
      "a project's poetry.toml [plugins.pypi_mirror]",
      { files: { "poetry.toml": `[plugins.pypi_mirror]\nurl = "${CORP}"\n` } },
      {},
      true,
    ],
    [
      "requires-plugins in [tool.poetry.requires-plugins]",
      { files: { "pyproject.toml": '[tool.poetry.requires-plugins]\npoetry-plugin-pypi-mirror = ">=0.4"\n' } },
      {},
      true,
    ],
    [
      "requires-plugins as an inline table, the plugin's name spelled otherwise",
      {
        files: {
          "pyproject.toml":
            '[tool.poetry]\nrequires-plugins = { "Poetry_Plugin.PyPI-Mirror" = { version = ">=0.4" } }\n',
        },
      },
      {},
      true,
    ],
    [
      "the person's config.toml [plugins] pypi_mirror",
      { home: { [POETRY_DIR]: `[plugins]\npypi_mirror = { url = "${CORP}" }\n` } },
      {},
      true,
    ],
    [
      "another plugin in requires-plugins",
      { files: { "pyproject.toml": '[tool.poetry.requires-plugins]\npoetry-plugin-export = ">=1.8"\n' } },
      {},
      false,
    ],
    ["another plugin's table in poetry.toml", { files: { "poetry.toml": '[plugins.other]\nkey = "x"\n' } }, {}, false],
  ];
  for (const [label, { files, home }, { env }, isPrivate] of ROWS)
    test(`${label}: ${isPrivate ? "corp-lib is private" : "corp-lib is sent"}`, async () => {
      await expectOutcome({ files, home, env, isPrivate, label });
    });
});

describe("requirements files: any option that is not a harmless one names a place of packages", () => {
  const index = `--index-url ${CORP}`;
  const OWN = "corp-lib==1.0\n";
  const BOTH = { base: "flask==3.0\ncorp-lib==1.0\n", names: ["pip flask", LIB] };
  /** `[label, requirements.txt, why, extra files, { base, names, baseExtra }]` of a file that declares a place. */
  const PLACES = [
    ["--index-url", `${index}\n${OWN}`, "the declaration itself"],
    ["--extra-index-url", `--extra-index-url ${CORP}\n${OWN}`, "the declaration itself"],
    ["-i with its value attached", `-i${CORP}\n${OWN}`, "pip reads -iURL"],
    ["--index, abbreviated", `--index ${CORP}\n${OWN}`, "pip accepts every abbreviation"],
    ["--extra-index, abbreviated", `--extra-index ${CORP}\n${OWN}`, "pip accepts every abbreviation"],
    ["--find, abbreviated", `--find ./wheels\n${OWN}`, "pip accepts every abbreviation"],
    ["--no-index", `--no-index\n${OWN}`, "packages come from find-links only"],
    ["--INDEX-URL, in upper case", `--INDEX-URL ${CORP}\n${OWN}`, "pip reads options in any case"],
    ["-f, a folder", `-f ./wheels\n${OWN}`, "a folder of wheels"],
    ["--find-links, an address", `--find-links https://wheels.corp.internal/\n${OWN}`, "an address of wheels"],
    [
      "--trusted-host, then --extra-index-url",
      `--trusted-host pypi.corp.internal --extra-index-url ${CORP}\n${OWN}`,
      "every option of a line is judged",
    ],
    ["--pre, then -i", `--pre -i ${CORP}\n${OWN}`, "every option of a line is judged"],
    [
      "--prefer-binary, then --find-links=",
      `--prefer-binary --find-links=/opt/wheels\n${OWN}`,
      "every option of a line is judged",
    ],
    ["--hash, then --index-url", `--hash=sha256:abc ${index}\n${OWN}`, "every option of a line is judged"],
    [
      "--trusted-host continued on the next line, then --index-url",
      `--trusted-host ${B}\n  pypi.corp.internal ${index}\n${OWN}`,
      "a continued option line is judged too",
    ],
    [
      "a comment line ending with a backslash (a Windows path)",
      `# wheels built in C:${B}wheels${B}\n--extra-index-url ${CORP}\n${OWN}`,
      "a comment line never goes on",
    ],
    [
      "a comment line after a continued one",
      `flask==3.0 ${B}\n# pinned ${B}\n--extra-index-url ${CORP}\ncorp-lib==1.0\n`,
      "a comment line ends the continuation",
      {},
      BOTH,
    ],
    [
      "a form feed",
      `flask==3.0  # pinned\f--extra-index-url ${CORP}\ncorp-lib==1.0\n`,
      "pip splits lines at \\f",
      {},
      BOTH,
    ],
    [
      "a lone CR",
      `flask==3.0\r--extra-index-url ${CORP}\rcorp-lib==1.0\r`,
      "pip splits lines at \\r",
      {},
      { base: "flask==3.0\rcorp-lib==1.0\r", names: ["pip flask", LIB] },
    ],
    ["U+2028", `flask==3.0${CH.LS}--extra-index-url ${CORP}\ncorp-lib==1.0\n`, "pip splits lines at U+2028", {}, BOTH],
    ["0x1c ends a line", `# private index${chr(0x1c)}--index-url ${CORP}\n${OWN}`, "pip splits lines at 0x1c"],
    [
      "0x1e ends a line",
      `corp-lib==1.0${chr(0x1e)}--extra-index-url ${CORP}\ncorp-other==2.0\n`,
      "pip splits lines at 0x1e",
      {},
      { base: "corp-lib==1.0\ncorp-other==2.0\n", names: [LIB, "pip corp-other"] },
    ],
    ["0x1f is a blank", `${chr(0x1f)}--index-url ${CORP}\n${OWN}`, "pip strips 0x1f"],
    [
      "U+FEFF is no blank: the # after it starts no comment",
      `--pre ${CH.BOM}# --index-url ${CORP}\n${OWN}`,
      "pip does not strip U+FEFF",
    ],
    [
      "a byte order mark before the first line",
      `${CH.BOM}${index}\n${OWN}`,
      "a BOM hides no first line",
      {},
      { base: `${CH.BOM}${OWN}` },
    ],
    ["a double-quoted option", `--pre "--extra-index-url=${CORP}"\n${OWN}`, "pip reads options with shlex"],
    ["a quoted option name", `--prefer-binary '-i' ${CORP}\n${OWN}`, "pip reads options with shlex"],
    ["an escaped option", `--pre ${B}-${B}-index-url=${CORP}\n${OWN}`, "pip reads options with shlex"],
    ["an escaped first option", `${B}--extra-index-url ${CORP} ${B}\n\n${OWN}`, "pip reads options with shlex"],
    ["a variable standing for options", `\${CORP_PIP_OPTIONS}\n${OWN}`, "pip expands the variables first"],
    [
      "a variable in a hash",
      `corp-lib==1.0 --hash=\${HASH}\nflask==3.0.0\n`,
      "pip expands the variables first: the whole file is a doubt",
      {},
      { base: "corp-lib==1.0\nflask==3.0.0\n", names: [LIB, "pip flask"] },
    ],
  ];
  for (const [label, text, why, extra = {}, { base = OWN, names = [LIB] } = {}] of PLACES)
    test(`${label}: the packages are private`, async () => {
      await expectPair({
        base: { "requirements.txt": base, ...extra },
        changed: { "requirements.txt": text, ...extra },
        names,
        label: `${label} (${why})`,
      });
    });

  /** `[label, files]`: includes the kit follows and cannot follow. */
  const INCLUDES = [
    [
      "-r, an index in the included file",
      { "requirements.txt": `-r base.txt\n${OWN}`, "base.txt": `${index}\n` },
      { "base.txt": "requests==2.31.0\n" },
    ],
    [
      "-r then -c, two levels down",
      { "requirements.txt": `-r base.txt\n${OWN}`, "base.txt": "-c more/c.txt\n", "more/c.txt": "-f ./wheels\n" },
      { "more/c.txt": "pkg==1.0\n" },
    ],
    [
      "--requirem, an abbreviated include",
      { "requirements.txt": `--requirem base.txt\n${OWN}`, "base.txt": `${index}\n` },
      { "base.txt": "requests==2.31.0\n" },
    ],
    [
      "--cons=, an abbreviated include with its value attached",
      { "requirements.txt": `--cons=c.txt\n${OWN}`, "c.txt": "-f ./wheels\n" },
      { "c.txt": "pkg==1.0\n" },
    ],
    [
      "an include that does not exist",
      { "requirements.txt": `--requirement=missing.txt\n${OWN}` },
      { "missing.txt": "requests==2.31.0\n" },
    ],
    [
      "an include outside the application, which does not exist",
      { "requirements.txt": `-r ../../outside.txt\n${OWN}` },
      { "requirements.txt": `-r base.txt\n${OWN}`, "base.txt": "requests==2.31.0\n" },
    ],
    [
      "17 files chained",
      {
        "requirements.txt": `-r r0.txt\n${OWN}`,
        ...Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`r${i}.txt`, `-r r${i + 1}.txt\n`])),
        "r16.txt": "requests==2.31.0\n",
      },
      {
        "requirements.txt": `-r r0.txt\n${OWN}`,
        ...Object.fromEntries(Array.from({ length: 3 }, (_, i) => [`r${i}.txt`, `-r r${i + 1}.txt\n`])),
        "r3.txt": "requests==2.31.0\n",
      },
    ],
  ];
  for (const [label, changed, control] of INCLUDES)
    test(`${label}: the packages are private (an include the kit cannot read is a doubt)`, async () => {
      // The control reads the same include, without the index (or reachable): corp-lib is sent.
      await expectPair({ base: { ...changed, ...control }, changed, names: [LIB], label });
    });

  test("an include outside the application is a doubt even when the file exists", async () => {
    const outside = app({ "base.txt": "requests==2.31.0\n" });
    try {
      const rel = path.join(outside, "base.txt").split(path.sep).join("/");
      await expectPair({
        base: { "requirements.txt": `-r base.txt\n${OWN}`, "base.txt": "requests==2.31.0\n" },
        changed: { "requirements.txt": `-r ${rel}\n${OWN}` },
        names: [LIB],
      });
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  test("an include that climbs out of the application by a relative path is a doubt even when the file exists", async () => {
    const outside = app({ "base.txt": "requests==2.31.0\n" });
    try {
      const rel = `../${path.basename(outside)}/base.txt`;
      // The base reads the same file inside the application: no doubt, corp-lib is sent. Outside, every pip package is
      // private, though the path is relative and the file exists.
      await expectPair({
        base: { "requirements.txt": `-r base.txt\n${OWN}`, "base.txt": "requests==2.31.0\n" },
        changed: { "requirements.txt": `-r ${rel}\n${OWN}` },
        names: [LIB],
        label: rel,
      });
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  /** `[label, files, sent, why]`: files whose options are harmless, or are no option, or whose lines join. */
  const HARMLESS = [
    ["--pre", `--pre\n${OWN}`, [LIB], "a harmless option"],
    ["-e ./tools", `-e ./tools\n${OWN}`, [LIB], "a harmless option"],
    ["-e./tools, its value attached", `-e./tools\n${OWN}`, [LIB], "a short option's value may follow it at once"],
    ["--require-hashes", `--require-hashes\n${OWN}`, [LIB], "a harmless option"],
    ["--trusted-host pypi.org", `--trusted-host pypi.org\n${OWN}`, [LIB], "a harmless option"],
    [
      "--pre, then an index in a comment",
      `--pre # see --index-url in the wiki\n${OWN}`,
      [LIB],
      "a # after a blank is a comment",
    ],
    ["a name split by a backslash", `corp-${B}\nlib==1.0\n`, [LIB], "joined with nothing, as pip does"],
    [
      "a comment line after a continued line",
      `flask==3.0 ${B}\n# pinned\nrequests==2.31.0\n`,
      ["pip flask", REQUESTS],
      "the comment ends the continuation: both lines are packages",
    ],
    ["a tab before the #", "flask==3.0\t# pinned\n", ["pip flask"], "a tab then # starts a comment"],
  ];
  for (const [label, text, sent, why] of HARMLESS)
    test(`${label}: no place is declared, the packages are sent`, async () => {
      await expectSent({ "requirements.txt": text }, sent, { ...ALL, label: `${label} (${why})` });
    });

  test("an abbreviated include chained once more, with no index in it: the packages are sent", async () => {
    await expectSent(
      {
        "requirements.txt": `-r base.txt\n${OWN}`,
        "base.txt": "--requirem more.txt\n",
        "more.txt": "requests==2.31.0\n",
      },
      [LIB],
      ALL,
    );
  });

  test("PEP 508 direct references, URLs and archives are no package of PyPI", async () => {
    const result = await expectSent(
      {
        "requirements.txt": [
          "mylib @ file:///opt/mylib",
          "corp-sdk @ git+https://git.corp.internal/sdk.git",
          "git+https://git.corp.internal/other.git#egg=other",
          "./vendored/pkg",
          "corp_lib-1.0-py3-none-any.whl",
          "corp-tools-2.0.tar.gz",
          "vendor/corp-pkg",
          "requests==2.32.0",
        ].join("\n"),
      },
      [REQUESTS],
      ALL,
    );
    assert.equal(result.kept["pip mylib"], "private", "a direct reference keeps its item, private");
    assert.equal(result.kept["pip corp-sdk"], "private");
    // corp-sdk is a PEP 508 reference to a git URL: it keeps its name and its item is local. The lines without a
    // name (an egg, ./vendored/pkg, a wheel, an sdist, vendor/corp-pkg) give no item at all.
    assert.deepEqual(
      result.items.map((i) => i.name).sort(),
      ["corp-sdk", "mylib", "requests"],
      "the items read: the two references and requests, no archive or folder taken for a name",
    );
  });

  test("the usual public ranges are sent, not taken for places", async () => {
    const result = await expectSent(
      { "requirements.txt": "a~=2.0\nb==1.*\nc>=1,<2\nd[extra]==1.0 ; python_version >= '3.9'\ne\n" },
      ["pip a", "pip b", "pip c", "pip d", "pip e"],
      ALL,
    );
    for (const item of result.items) assert.equal(item.local, undefined, `${item.name} is no place`);
  });

  test("hashed and continued lines are read as pip reads them: --hash lines and a comment after a tab", async () => {
    const result = await expectSent(
      {
        "requirements.txt": `requests==2.31.0 ${B}\n    --hash=sha256:aa ${B}\n    --hash=sha256:bb\nflask==3.0\t# pinned\n`,
      },
      [REQUESTS, "pip flask"],
      ALL,
    );
    assert.equal(result.items.find((i) => i.name === "flask").version, "3.0", "the comment is not part of the version");
  });
});

describe("the person's pip.conf: a key as pip reads it names an index or a place of packages", () => {
  const CONF = ".config/pip/pip.conf";
  const ROWS = [
    ["index_url", `index_url = ${CORP}`, true, "_ for -"],
    ["index-url with a colon", `index-url: ${CORP}`, true, ":"],
    ["Extra-Index-Url, in any case", `Extra-Index-Url = ${CORP}`, true, "any case"],
    ["find_links", "find_links = /srv/wheels", true, "a place of packages"],
    ["no-index", "no-index = true", true, "packages from find-links only"],
    ["index-url naming PyPI itself", `index-url = ${PYPI}`, true, "the value is not read: any index key counts"],
    ["timeout", "timeout = 60", false, "no place"],
    ["cert, its value holding 'index'", "cert = /etc/ssl/index.pem", false, "only the key counts"],
    ["cert with a colon, its value holding 'find'", "cert: /etc/ssl/find-me.pem", false, "only the key counts"],
    ["an index-url in a comment", `# index-url = ${CORP}`, false, "a comment"],
    ["an index-url in a ; comment", `; index-url = ${CORP}`, false, "a comment"],
  ];
  for (const [label, line, isPrivate, why] of ROWS)
    test(`${label}: ${isPrivate ? "private" : "public"}`, async () => {
      await expectOutcome({ home: { [CONF]: `[global]\n${line}\n` }, isPrivate, label: `${label} (${why})` });
    });

  test("a lone CR ends a comment line: the index-url after it is read", async () => {
    await expectOutcome({
      home: { [CONF]: `[global]\n# corp mirror\rindex-url = ${CORP}\n` },
      isPrivate: true,
      label: "lone CR",
    });
    await expectOutcome({
      home: { [CONF]: "[global]\n# corp mirror\rtimeout = 60\n" },
      isPrivate: false,
      label: "control",
    });
  });

  const FILES = [
    [".config/pip/pip.conf", "XDG-style folder of the home"],
    [".pip/pip.conf", "the legacy folder"],
    ["pip/pip.ini", "Windows' folder of the home"],
    ["Library/Application Support/pip/pip.conf", "macOS"],
  ];
  for (const [file, why] of FILES) {
    test(`${file} (${why}): an index-url is private, a timeout is not`, async () => {
      await expectOutcome({ home: { [file]: `[global]\nindex-url = ${CORP}\n` }, isPrivate: true, label: file });
      await expectOutcome({
        home: { [file]: "[global]\ntimeout = 60\n" },
        isPrivate: false,
        label: `${file}: control`,
      });
    });
  }

  test("HOME and USERPROFILE can differ: a pip.conf in either is read", async () => {
    const msys = app({ "Library/Application Support/pip/pip.conf": `[global]\nextra-index-url = ${CORP}\n` });
    const windows = app({ "pip/pip.ini": `[global]\nindex-url = ${CORP}\n` });
    const quiet = app({ "pip/pip.ini": "[global]\ntimeout = 60\n" });
    try {
      const files = { "requirements.txt": "corp-lib==1.0\n" };
      await expectNothingSent(files, { [LIB]: "private" }, { ...ALL, env: { HOME: msys, USERPROFILE: quiet } });
      await expectNothingSent(files, { [LIB]: "private" }, { ...ALL, env: { HOME: quiet, USERPROFILE: windows } });
      await expectSent(files, [LIB], { ...ALL, env: { HOME: quiet, USERPROFILE: quiet } });
    } finally {
      for (const dir of [msys, windows, quiet]) fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the person's Poetry config.toml: a repository other than PyPI makes every pip package private", () => {
  const CONFIG = ".config/pypoetry/config.toml";
  // The [plugins] pypi_mirror table of this file is a row of the mirror plugin's describe.
  const ROWS = [
    ["a repository as a table", `[repositories.corp]\nurl = "${CORP}"\n`, true, "poetry config repositories.corp URL"],
    [
      "a repository as an inline table, after a header with a comment",
      `[repositories] # corp\ncorp = { url = "${CORP}" }\n`,
      true,
      "the same path, inline",
    ],
    ["a repository whose url is PyPI's own", `[repositories.main]\nurl = "${PYPI}"\n`, false, "PyPI is public"],
    ["a setting that is no repository", "[virtualenvs]\nin-project = true\n", false, "no place declared"],
    ["a repository whose url is left open", '[repositories.corp]\nurl = "open\n', true, "a doubt"],
  ];
  for (const [label, text, isPrivate, why] of ROWS)
    test(`${label}: ${isPrivate ? "private" : "public"}`, async () => {
      await expectOutcome({ home: { [CONFIG]: text }, isPrivate, label: `${label} (${why})` });
    });

  test("a project's poetry.toml [repositories] is read too", async () => {
    await expectOutcome({
      files: { "poetry.toml": `[repositories.corp]\nurl = "${CORP}"\n` },
      isPrivate: true,
      label: "private",
    });
    await expectOutcome({
      files: { "poetry.toml": `[repositories.main]\nurl = "${PYPI}"\n` },
      isPrivate: false,
      label: "PyPI's own",
    });
  });
});

describe("the person's configuration: every place pip, uv and Poetry look in", () => {
  // pip.conf's index keys are declarations whatever their address: the quiet pip.conf has another key.
  const DECLARING = {
    pip: `[global]\nindex-url = ${CORP}\n`,
    uv: `[pip]\nindex-url = "${CORP}"\n`,
    poetry: `[repositories.corp]\nurl = "${CORP}"\n`,
  };
  const QUIET = {
    pip: "[global]\ntimeout = 60\n",
    uv: `[pip]\nindex-url = "${PYPI}"\n`,
    poetry: `[repositories.main]\nurl = "${PYPI}"\n`,
  };
  // The home files ~/.config/pip/pip.conf and ~/.config/pypoetry/config.toml, with the same two contents, are the first
  // tests of the pip.conf and Poetry config.toml describes above.
  /** `[label, kind, file in the folder, how the folder is named]`: "home" (HOME and USERPROFILE) or a variable. */
  const PLACES = [
    ["~/.config/uv/uv.toml", "uv", ".config/uv/uv.toml", "home"],
    [
      "~/Library/Application Support/pypoetry/config.toml",
      "poetry",
      "Library/Application Support/pypoetry/config.toml",
      "home",
    ],
    ["APPDATA/pip/pip.ini", "pip", "pip/pip.ini", (dir) => ({ APPDATA: dir })],
    ["APPDATA/uv/uv.toml", "uv", "uv/uv.toml", (dir) => ({ APPDATA: dir })],
    ["APPDATA/pypoetry/config.toml", "poetry", "pypoetry/config.toml", (dir) => ({ APPDATA: dir })],
    ["XDG_CONFIG_HOME/pip/pip.conf", "pip", "pip/pip.conf", (dir) => ({ XDG_CONFIG_HOME: dir })],
    ["XDG_CONFIG_HOME/uv/uv.toml", "uv", "uv/uv.toml", (dir) => ({ XDG_CONFIG_HOME: dir })],
    ["XDG_CONFIG_HOME/pypoetry/config.toml", "poetry", "pypoetry/config.toml", (dir) => ({ XDG_CONFIG_HOME: dir })],
    ["POETRY_CONFIG_DIR/config.toml", "poetry", "config.toml", (dir) => ({ POETRY_CONFIG_DIR: dir })],
    [
      "PIP_CONFIG_FILE, a file of any name",
      "pip",
      "custom-pip.ini",
      (dir) => ({ PIP_CONFIG_FILE: path.join(dir, "custom-pip.ini") }),
    ],
    [
      "UV_CONFIG_FILE, a uv.toml of any name",
      "uv",
      "custom-uv.toml",
      (dir) => ({ UV_CONFIG_FILE: path.join(dir, "custom-uv.toml") }),
    ],
    [
      "uv_config_file, in lower case",
      "uv",
      "custom-uv.toml",
      (dir) => ({ uv_config_file: path.join(dir, "custom-uv.toml") }),
    ],
  ];
  for (const [label, kind, file, naming] of PLACES)
    test(`${label}: a private index is private, PyPI's own is sent`, async () => {
      for (const [text, isPrivate] of [
        [DECLARING[kind], true],
        [QUIET[kind], false],
      ]) {
        const row = { isPrivate, label: `${label}: ${isPrivate ? "private index" : "quiet control"}` };
        if (naming === "home") await expectOutcome({ ...row, home: { [file]: text } });
        else await expectOutcome({ ...row, folder: { [file]: text }, env: naming });
      }
    });

  test("a uv.toml of the person with a top-level index-url, and one with an override from a URL", async () => {
    const rows = [
      [`index-url = "${CORP}"\n`, true],
      [`index-url = "${PYPI}"\n`, false],
      ['override-dependencies = ["corp-lib @ https://files.corp.internal/corp_lib-1.0.whl"]\n', true],
      ['override-dependencies = ["corp-lib>=1.0"]\n', false],
    ];
    for (const [text, isPrivate] of rows)
      await expectOutcome({ home: { ".config/uv/uv.toml": text }, isPrivate, label: text });
  });

  test("the person's uv.toml [pip] extra-index-url, and their pip.conf find-links", async () => {
    await expectOutcome({
      home: { ".config/uv/uv.toml": `[pip]\nextra-index-url = ["${CORP}"]\n` },
      isPrivate: true,
      label: "uv.toml extra-index-url",
    });
    await expectOutcome({
      home: { ".config/pip/pip.conf": "[global]\nfind-links = /srv/corp-wheels\n" },
      isPrivate: true,
      label: "pip.conf find-links",
    });
  });
});

describe("the pip, uv and Poetry variables: a private value makes every pip package private, PyPI's own does not", () => {
  const VARIABLES = [
    ["PIP_INDEX_URL", CORP, PYPI],
    ["PIP_EXTRA_INDEX_URL", CORP, PYPI],
    ["UV_INDEX_URL", CORP, PYPI],
    ["UV_EXTRA_INDEX_URL", CORP, PYPI],
    ["UV_DEFAULT_INDEX", CORP, PYPI],
    ["UV_INDEX", CORP, PYPI],
    ["PIPENV_PYPI_MIRROR", CORP, PYPI],
    ["POETRY_PYPI_MIRROR_URL", CORP, PYPI],
    ["POETRY_REPOSITORIES_CORP_URL", CORP, PYPI],
    ["pip_index_url", CORP, PYPI],
  ];
  for (const [name, corp, pypi] of VARIABLES)
    test(`${name}: a private address is private, PyPI's own is sent`, async () => {
      await expectOutcome({ env: () => ({ [name]: corp }), isPrivate: true, label: `${name}=${corp}` });
      // PyPI's own address: sent for every variable that names an index (the mirror ones too: it is PyPI).
      await expectOutcome({ env: () => ({ [name]: pypi }), isPrivate: false, label: `${name}=${pypi}` });
    });

  const PLACES = [
    ["PIP_FIND_LINKS", "/srv/corp-wheels", "a folder of wheels"],
    ["UV_FIND_LINKS", "https://wheels.corp.internal/", "an address of wheels"],
    ["PIP_EXTRA_INDEX_URL", `${PYPI} ${CORP}`, "a list separated by spaces: each address counts"],
  ];
  for (const [name, value, why] of PLACES)
    test(`${name}=${value}: private (${why})`, async () => {
      await expectOutcome({ env: () => ({ [name]: value }), isPrivate: true, label: name });
    });

  // A pip declaration is about pip: an npm package of the same application stays public (the mirror, an npm
  // declaration leaving pip public, is in the npm second net's tests).
  const PIP_DECLARATIONS = [
    [
      "a private index in the person's pip.conf",
      { home: { ".config/pip/pip.conf": `[global]\nindex-url = ${CORP}\n` } },
    ],
    ["PIP_INDEX_URL", { env: { PIP_INDEX_URL: CORP } }],
  ];
  for (const [label, options] of PIP_DECLARATIONS)
    test(`${label} leaves npm public`, async () => {
      const files = { "requirements.txt": "corp-lib==1.0\n", "package.json": { dependencies: { react: "^18.0.0" } } };
      const read = await registriesOf(files, options);
      assert.equal(read.npmAll, false, `${label}: no npm package private`);
      assert.equal(read.pipAll, true, `${label}: every pip package private`);
      await expectSent(files, ["npm react"], { ...ALL, ...options, label });
    });

  test("a list of PyPI's own addresses, an empty variable and an unrelated one declare nothing", async () => {
    for (const env of [
      { PIP_EXTRA_INDEX_URL: `${PYPI} ${HOST.pyFiles}` },
      { PIP_INDEX_URL: "" },
      { PIP_TIMEOUT: "60" },
    ])
      await expectOutcome({ env: () => env, isPrivate: false, label: JSON.stringify(env) });
  });
});

describe("a declaration after a TOML trap is still read: a quote, a bracket or an escape hides nothing", () => {
  const TRAP = `[tool.mycorp]\n'a="""' = 1\n`;
  const LATER = '# """\n';
  const tail = `${LATER}`;
  const source = (n) => `[tool.uv.sources]\n${n} = { git = "${GIT}" }\n`;
  /** `[label, rest(url): the declaration of an index after the trap, why]`: PyPI's address is the control. */
  const INDEX_AFTER = [
    [
      "a quoted key holding = then a triple quote",
      (u) => `${TRAP}[[tool.uv.index]]\nname = "corp"\nurl = "${u}"\n${tail}`,
      "the key opens no string",
      () => `${TRAP}${tail}`,
    ],
    [
      "the same trap before a Poetry source",
      (u) => `${TRAP}[[tool.poetry.source]]\nname = "corp"\nurl = "${u}"\n${tail}`,
      "the key opens no string",
    ],
    [
      "an array holding a triple-quoted string ended by 4 quotes",
      (u) => `keywords = ["""say "hi""""]\n[[tool.pdm.source]]\nurl = "${u}"\n`,
      "the string is closed",
    ],
    [
      "a multi-line string holding an escaped quote, then another one",
      (u) => `description = """\nHe wrote ${B}"""\nx = """\n[[tool.pdm.source]]\nurl = "${u}"\n`,
      "an escaped quote closes nothing",
    ],
    [
      "a header written with a \\x escape inside a key",
      (u) => `[[tool.uv."ind${B}x65x"]]\nurl = "${u}"\n`,
      "\\x65 is e: uv reads [[tool.uv.index]]",
      () => "",
    ],
    [
      "a table named by an escaped first part",
      (u) => `["${B}x74ool".uv]\nindex-url = "${u}"\n`,
      "\\x74 is t: uv reads [tool.uv]",
    ],
  ];
  for (const [label, rest, why, control] of INDEX_AFTER)
    test(`${label}: the index after it is read`, async () => {
      // The control has PyPI's address, or — for a uv index table, a declaration whatever its address — no index.
      const base = { "pyproject.toml": project(control ? control() : rest(PYPI)) };
      const changed = { "pyproject.toml": project(rest(CORP)) };
      await expectPair({ base, changed, names: [LIB, FASTAPI], label: `${label} (${why})` });
    });

  test("a quoted key holding = then a triple quote, in a Pipfile and in a uv.toml", async () => {
    const pipfile = (url) =>
      `[scripts]\n'a="""' = "x"\n[[source]]\nname = "corp"\nurl = "${url}"\n[packages]\ncorp-lib = "*"\nfastapi = "*"\n${tail}`;
    await expectPair({
      base: { Pipfile: pipfile(PYPI) },
      changed: { Pipfile: pipfile(CORP) },
      names: [LIB, FASTAPI],
      label: "Pipfile",
    });
    const uvToml = (url) => `[cache]\n'a="""' = 1\n[pip]\nindex-url = "${url}"\n${tail}`;
    await expectPair({
      base: { "requirements.txt": "corp-lib==1.0\n", "uv.toml": uvToml(PYPI) },
      changed: { "requirements.txt": "corp-lib==1.0\n", "uv.toml": uvToml(CORP) },
      names: [LIB],
      label: "uv.toml",
    });
  });

  /** `[label, rest(name): a source for `name` after the trap, why]`: a source for another package is the control. */
  const SOURCE_AFTER = [
    [
      "a triple string with a lone quote in an array",
      (n) => `keywords = ['''it's''']\n${source(n)}`,
      "a lone quote closes nothing",
    ],
    [
      "a triple string with quotes inside, in an array",
      (n) => `keywords = ["""say "hi" """]\n${source(n)}`,
      "inner quotes close nothing",
    ],
    [
      "a triple string with a lone quote on its own line, in an array",
      (n) => `keywords = [\n  '''a ' b''',\n]\n${source(n)}`,
      "a lone quote closes nothing",
    ],
    [
      "a triple string ended by 4 quotes in an inline table",
      (n) => `[tool.uv]\nsources = { a = { path = """x"""" }, ${n} = { git = "${GIT}" } }\n`,
      "the fourth quote belongs to the text",
    ],
    [
      "a triple string ended by 5 quotes in an inline table",
      (n) => `[tool.uv]\nsources = { a = { path = '''x''''' }, ${n} = { git = "${GIT}" } }\n`,
      "the fourth and fifth quotes belong to the text",
    ],
    [
      "an escaped quote in a multi-line string",
      (n) => `description = """\nHe wrote ${B}"""\nstill text\n"""\n${source(n)}`,
      "an escaped quote closes nothing",
    ],
    ["a quoted key holding = then a triple quote", (n) => `${TRAP}${source(n)}${tail}`, "the key opens no string"],
  ];
  for (const [label, rest, why] of SOURCE_AFTER)
    test(`${label}: the source after it is read`, async () => {
      const files = (name) => ({ "pyproject.toml": project(rest(name)) });
      const { after } = await expectPair({
        base: files("other-lib"),
        changed: files("corp-lib"),
        names: [LIB],
        sent: [FASTAPI],
        label: `${label} (${why})`,
      });
      // The item itself is local too (python.mjs), not only kept back by the declarations (network.mjs).
      const item = after.items.find((i) => i.manifest === "pyproject.toml" && i.name === "corp-lib");
      assert.equal(item?.local, true, `${label}: the item is local`);
    });

  test("a field after a triple string, in a Poetry dependency and in a Pipfile", async () => {
    const markers = '"""sys_platform == "linux""""';
    const poetry = (field) => ({
      "pyproject.toml": project(`[tool.poetry.dependencies]\ncorp-lib = { markers = ${markers}, ${field} }\n`),
    });
    await expectPair({
      base: poetry('version = "^1"'),
      changed: poetry('path = "../corp-lib"'),
      names: [LIB],
      sent: [FASTAPI],
      label: "Poetry",
    });
    const pipfile = (field) => ({
      Pipfile: `[packages]\ncorp-lib = { markers = ${markers}, ${field} }\nrequests = "*"\n`,
    });
    await expectPair({
      base: pipfile('version = "*"'),
      changed: pipfile('path = "../corp-lib"'),
      names: [LIB],
      sent: [REQUESTS],
      label: "Pipfile",
    });
  });
});

describe("a doubt makes every pip package private: TOML the kit cannot read tells nothing", () => {
  /** `[label, broken, repaired, why]`: a pyproject.toml tail that is no TOML as the kit reads it, and its repair. */
  const DOUBTS = [
    [
      "a multi-line string left open",
      `description = """never closed\n[tool.uv.sources]\ncorp-lib = { git = "x" }\n`,
      `description = """closed"""\n[tool.uv.sources]\nother-lib = { git = "x" }\n`,
      "everything after it is text",
    ],
    ["an array left open", 'keywords = ["a", "b"\n', 'keywords = ["a", "b"]\n', "its end is never found"],
    [
      "a one-line string left open, an index after it",
      `description = "open\n[[tool.pdm.source]]\nurl = "${PYPI}" # "\n`,
      `description = "closed"\n[[tool.pdm.source]]\nurl = "${PYPI}" # "\n`,
      "the line ends the string, and the file is a doubt",
    ],
    ["a line that is no TOML", "just words\n", "# just words\n", "not a key, a header or a comment"],
    ["a bracket never opened", "a = 1]\n", "a = 1\n", "a stray bracket"],
    ["a header left open", "[tool.uv\n", "[tool.uv]\n", "a header with no end"],
    ["a header followed by a key", "[t] x = 1\n", "[t]\nx = 1\n", "TOML wants a line break"],
    ["an array-of-tables header half closed", "[[a]\n", "[[a]]\n", "a header with no end"],
    [
      "an escape TOML does not know in a key",
      `[tool.mycorp]\n"a${B}q" = 1\n`,
      `[tool.mycorp]\n"a${B}t" = 1\n`,
      "the key cannot be told",
    ],
    [
      "an escape TOML does not know in an inline table's key",
      `[tool.uv]\nsources = { "a${B}q" = 1 }\n`,
      `[tool.uv]\nsources = { "a${B}t" = 1 }\n`,
      "the key cannot be told",
    ],
    [
      "a source whose name has an escape TOML does not know, beside a known one",
      `[tool.uv.sources]\n"corp${B}x2dlib" = { git = "${GIT}" }\n[tool.mycorp]\n"a${B}q" = 1\n`,
      `[tool.uv.sources]\n"corp${B}x2dlib" = { git = "${GIT}" }\n[tool.mycorp]\n"a${B}t" = 1\n`,
      "the unknown escape makes the file a doubt, the known one is read",
    ],
    [
      "a table path over 1,000 characters (tool.uv.sources. and a 985-character name)",
      `[tool.uv.sources.${"g".repeat(985)}]\ngit = "x"\n`,
      `[tool.uv.sources.${"g".repeat(984)}]\ngit = "x"\n`,
      "a name past the bound is left out, and the file is a doubt",
    ],
  ];
  for (const [label, broken, repaired, why] of DOUBTS)
    test(`${label}: corp-lib and fastapi are private`, async () => {
      const files = (tail) => ({ "pyproject.toml": project(tail) });
      // The repaired file may still name a source (other-lib) or a deliberate one (corp-lib, x2d): the control sends
      // fastapi at least, and the changed file sends nothing.
      const control = await network(files(repaired), ALL);
      assert.ok(control.sent.includes(FASTAPI), `${label}: the repaired file sends fastapi (${control.sent})`);
      assert.deepEqual(control.unreadable, [], `${label}: the repaired file is read`);
      const doubt = await network(files(broken), ALL);
      assert.deepEqual(doubt.sent, [], `${label} (${why})`);
      assert.equal(doubt.kept[FASTAPI], "private", `${label}: fastapi is private`);
      assert.equal(doubt.kept[LIB], "private", `${label}: corp-lib is private`);
    });

  test("an own name written as a multi-line string: the application's own name cannot be told", async () => {
    for (const quote of ['"""', "'''"]) {
      const own = (name) => ({
        "pyproject.toml": `[project]\nname = ${name}\ndependencies = ["corp-lib", "fastapi>=0.110"]\n`,
      });
      await expectPair({
        base: own('"app"'),
        changed: own(`${quote}corp-lib${quote}`),
        names: [LIB, FASTAPI],
        label: `${quote} own name`,
      });
    }
  });

  test("the application's own name is private: [project] name and [tool.poetry] name", async () => {
    const rows = [
      ["[project] name", (name) => `[project]\nname = "${name}"\ndependencies = ["corp-lib", "fastapi>=0.110"]\n`],
      [
        "[tool.poetry] name",
        (name) =>
          `[tool.poetry]\nname = "${name}"\n\n[tool.poetry.dependencies]\ncorp-lib = "^1"\nfastapi = "^0.110"\n`,
      ],
    ];
    for (const [label, build] of rows)
      await expectPair({
        base: { "pyproject.toml": build("app") },
        changed: { "pyproject.toml": build("corp-lib") },
        names: [LIB],
        sent: [FASTAPI],
        label,
      });
  });

  test("an own name and a source written with escapes are read decoded", async () => {
    const own = (name) => ({
      "pyproject.toml": `[project]\nname = "${name}"\ndependencies = ["corp-lib"]\n`,
      "uv.lock": uvLock(uvPackage("corp-lib")),
    });
    await expectPair({ base: own("app"), changed: own("corp\\u002dlib"), names: [LIB], label: "own name" });
    const sources = (lockName) => ({
      "pyproject.toml": `[project]\nname = "app"\ndependencies = ["corp-lib"]\n\n[tool.uv.sources]\ncorp-lib = { path = "../corp-lib" }\n`,
      "uv.lock": uvLock(uvPackage(lockName)),
    });
    const escaped = await network(sources("corp\\u002dlib"), ALL);
    assert.deepEqual(escaped.urls, [], "the source's package is never sent, never as %5C");
    assert.equal(escaped.kept[LIB], "private");
  });

  test("a Pipfile left open: every pip package is private", async () => {
    const pipfile = (end) =>
      `[[source]]\nname = "pypi"\nurl = "${PYPI}"\n[packages]\nrequests = { version = "*"${end}\n`;
    await expectPair({ base: { Pipfile: pipfile(" }") }, changed: { Pipfile: pipfile("") }, names: [REQUESTS] });
  });

  test("a uv.toml left open: every pip package is private", async () => {
    const files = (end) => ({
      "requirements.txt": "requests==2.31.0\n",
      "uv.toml": `index-url = "${PYPI}"\nextra = [${end}\n`,
    });
    await expectPair({ base: files("]"), changed: files(""), names: [REQUESTS] });
  });

  test("Poetry's own configuration left open: every pip package is private", async () => {
    const config = (url) => `[repositories.corp]\nurl = ${url}\n`;
    await expectPair({
      base: { "requirements.txt": "corp-lib==1.0\n" },
      changed: { "requirements.txt": "corp-lib==1.0\n" },
      names: [LIB],
      options: { home: { ".config/pypoetry/config.toml": config('"open') } },
      baseOptions: { home: { ".config/pypoetry/config.toml": config(`"${PYPI}"`) } },
    });
  });
});

describe("pyproject.toml, Pipfile, uv.toml and the person's pip.conf in UTF-16 are read as such", () => {
  const FILES = { "requirements.txt": "corp-lib==1.0\nfastapi==0.110.0\n" };
  for (const order of ["le", "be"]) {
    const label = order === "le" ? "UTF-16 LE" : "UTF-16 BE";
    test(`${label}: a pyproject.toml's dependencies and its private index`, async () => {
      const files = (url) => ({
        "pyproject.toml": utf16(project(`[[tool.pdm.source]]\nname = "corp"\nurl = "${url}"\n`), order),
      });
      await expectPair({ base: files(PYPI), changed: files(CORP), names: [LIB, FASTAPI], label });
    });

    test(`${label}: a pyproject.toml's [tool.uv.sources]`, async () => {
      const files = (name) => ({
        "pyproject.toml": utf16(project(`[tool.uv.sources]\n${name} = { git = "${GIT}" }\n`), order),
      });
      await expectPair({
        base: files("other-lib"),
        changed: files("corp-lib"),
        names: [LIB],
        sent: [FASTAPI],
        label,
      });
    });

    test(`${label}: a Pipfile's packages and its private source`, async () => {
      const files = (url) => ({
        Pipfile: utf16(
          `[[source]]\nname = "corp"\nurl = "${url}"\n\n[packages]\ncorp-lib = "*"\nfastapi = "*"\n`,
          order,
        ),
      });
      await expectPair({ base: files(PYPI), changed: files(CORP), names: [LIB, FASTAPI], label });
    });

    test(`${label}: a uv.toml's private index`, async () => {
      const files = (url) => ({ ...FILES, "uv.toml": utf16(`[pip]\nindex-url = "${url}"\n`, order) });
      await expectPair({ base: files(PYPI), changed: files(CORP), names: [LIB, FASTAPI], label });
    });

    test(`${label}: a requirements file's index option`, async () => {
      const files = (head) => ({ "requirements.txt": utf16(`${head}corp-lib==1.0\r\n`, order) });
      await expectPair({
        base: files(""),
        changed: files(`--index-url ${CORP}\r\n`),
        names: [LIB],
        label,
      });
    });

    test(`${label}: the person's pip.conf`, async () => {
      const home = (line) => ({ home: { ".config/pip/pip.conf": utf16(`[global]\n${line}\n`, order) } });
      await expectPair({
        base: FILES,
        changed: FILES,
        names: [LIB, FASTAPI],
        options: home(`index-url = ${CORP}`),
        baseOptions: home("timeout = 60"),
        label,
      });
    });

    test(`${label}: the person's Poetry config.toml`, async () => {
      const home = (url) => ({
        home: { ".config/pypoetry/config.toml": utf16(`[repositories.corp]\nurl = "${url}"\n`, order) },
      });
      await expectPair({
        base: FILES,
        changed: FILES,
        names: [LIB, FASTAPI],
        options: home(CORP),
        baseOptions: home(PYPI),
        label,
      });
    });

    test(`${label}: the person's uv.toml`, async () => {
      const home = (url) => ({
        home: { ".config/uv/uv.toml": utf16(`[pip]\nindex-url = "${url}"\n`, order) },
      });
      await expectPair({
        base: FILES,
        changed: FILES,
        names: [LIB, FASTAPI],
        options: home(CORP),
        baseOptions: home(PYPI),
        label,
      });
    });
  }
});
