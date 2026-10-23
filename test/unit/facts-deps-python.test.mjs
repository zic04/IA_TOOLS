// The Python items (engine/facts/deps/python.mjs, python-locks.mjs, graph.mjs): what each manifest and lock declares —
// name, version or `spec`, operator, extras, direct, dev, local, via — whatever the way it is written. What `--network`
// sends for these items is proven in facts-network-*.test.mjs, not here.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { deps } from "../tools/deps-apps.mjs";
import { CH, HOST, pyproject, poetryProject, uvPackage, uvLock, poetryPackage, poetryLock } from "../tools/locks.mjs";

const B = CH.BACKSLASH;

/** The expected items of one manifest, `[name, properties]` each: the ecosystem and the manifest are the same for all. */
const items = (manifest, list) =>
  Object.fromEntries(list.map(([name, props]) => [name, { name, ecosystem: "pip", manifest, ...props }]));

/** What a manifest's item says when it declares (`operator`, `version`, `spec`) and is direct, in the project or dev. */
const declared = (operator, version, spec, extra = {}) => ({
  operator,
  version,
  spec,
  direct: true,
  dev: false,
  ...extra,
});

/** What a lock's item says: its pinned version, whether it is direct, dev, served by PyPI (`public`), local, its chain. */
const locked = (version, extra = {}) => ({ version, direct: false, dev: false, ...extra });

/** Asserts that `manifest` of an application made of `files` holds exactly the `expected` items (one per name). */
function assertItems(files, manifest, expected, label) {
  const actual = deps(files)[manifest] ?? {};
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${label ?? manifest}: the names`);
  for (const name of Object.keys(expected))
    assert.deepEqual(actual[name], expected[name], `${label ?? manifest}: ${name}`);
}

describe("pyproject.toml: PEP 621 and PEP 735", () => {
  test("dependencies, extras, groups, markers, comments and exact pins", () => {
    const text = [
      "[project]",
      'name = "app"',
      "dependencies = [",
      '  "fastapi>=0.110",  # the web framework',
      "  \"uvicorn[standard]==0.30.1 ; python_version < '3.13'\",",
      '  "mylib @ file:///opt/mylib",',
      '  "wild==1.*",',
      '  "arbitrary===1.0",',
      "]",
      "[project.optional-dependencies]",
      'pg = ["psycopg==3.1.19"]',
      "[dependency-groups]",
      'dev = ["pytest>=8", { include-group = "lint" }]',
      'lint = ["ruff==0.5.0"]',
      "",
    ].join("\n");
    // psycopg: an optional dependency of the project itself is no dev one; a group is dev; an include-group names no
    // package; a marker is dropped; a wildcard and `===` give no exact version; a direct reference is local.
    assertItems(
      { "pyproject.toml": text },
      "pyproject.toml",
      items("pyproject.toml", [
        ["fastapi", declared(">=", null, ">=0.110")],
        ["uvicorn", declared("==", "0.30.1", "==0.30.1", { extras: ["standard"] })],
        ["mylib", declared(null, null, "@ file:///opt/mylib", { local: true })],
        ["wild", declared("==", null, "==1.*")],
        ["arbitrary", declared("===", null, "===1.0")],
        ["psycopg", declared("==", "3.1.19", "==3.1.19")],
        ["pytest", declared(">=", null, ">=8", { dev: true })],
        ["ruff", declared("==", "0.5.0", "==0.5.0", { dev: true })],
      ]),
    );
  });

  test("a requirement in parentheses (PEP 508) is the same range", () => {
    assertItems(
      { "pyproject.toml": pyproject(["django (>=4.2)"]) },
      "pyproject.toml",
      items("pyproject.toml", [["django", declared(">=", null, ">=4.2")]]),
    );
  });
});

describe("pyproject.toml: Poetry", () => {
  test("an exact version is one, a range is `spec`, a path is local, `python` is no package; the former dev key is dev", () => {
    const files = {
      "pyproject.toml":
        '[tool.poetry.dependencies]\npython = "^3.11"\nhttpx = "0.27.0"\nfastapi = "^0.110"\nlib = { path = "../lib" }\n[tool.poetry.dev-dependencies]\nblack = "^24"\n',
    };
    assertItems(
      files,
      "pyproject.toml",
      items("pyproject.toml", [
        ["httpx", { version: "0.27.0", direct: true, dev: false }],
        ["fastapi", { version: null, spec: "^0.110", direct: true, dev: false }],
        ["lib", { version: null, spec: "*", direct: true, dev: false, local: true }],
        ["black", { version: null, spec: "^24", direct: true, dev: true }],
      ]),
    );
  });

  test("allows-prereleases does not make a dependency local; every source of a list is judged, the second one too", () => {
    const table = [
      'isort = { version = "^5", allows-prereleases = true }',
      'corp-lib = [{ version = "^1", source = "pypi" }, { version = "^1", source = "corp" }]',
      "",
    ].join("\n");
    assertItems(
      { "pyproject.toml": poetryProject({}, table) },
      "pyproject.toml",
      items("pyproject.toml", [
        ["isort", { version: null, spec: "^5", direct: true, dev: false }],
        ["corp-lib", { version: null, spec: "^1", direct: true, dev: false, local: true }],
      ]),
    );
  });
});

describe("pyproject.toml: the dev dependencies of PDM, Rye and uv", () => {
  test("[tool.pdm.dev-dependencies], [tool.rye] and uv's former [tool.uv] key are dev; [project] is not", () => {
    const text = pyproject(
      ["fastapi>=0.110"],
      [
        "[tool.pdm.dev-dependencies]",
        'test = ["pytest>=8"]',
        'lint = ["ruff"]',
        "[tool.rye]",
        'dev-dependencies = ["black==24.1.0"]',
        "[tool.uv]",
        'dev-dependencies = ["mypy>=1"]',
        "",
      ].join("\n"),
    );
    assertItems(
      { "pyproject.toml": text },
      "pyproject.toml",
      items("pyproject.toml", [
        ["fastapi", declared(">=", null, ">=0.110")],
        ["pytest", declared(">=", null, ">=8", { dev: true })],
        ["ruff", declared(null, null, null, { dev: true })],
        ["black", declared("==", "24.1.0", "==24.1.0", { dev: true })],
        ["mypy", declared(">=", null, ">=1", { dev: true })],
      ]),
    );
  });
});

describe("pyproject.toml: a requirement is found by its path, in any TOML form", () => {
  const ref = '"corp-lib @ git+https://git.corp.internal/corp-lib"';
  const reference = (extra) => ({
    "corp-lib": declared(null, null, "@ git+https://git.corp.internal/corp-lib", extra),
  });
  const FORMS = [
    ["a dotted key at the root", `project.dependencies = [${ref}]\n`, { local: true }],
    [
      "an inline table of optional dependencies",
      `[project]\noptional-dependencies = { dev = [${ref}] }\n`,
      { local: true },
    ],
    ["a dotted key of optional dependencies", `[project]\noptional-dependencies.dev = [${ref}]\n`, { local: true }],
    ["a quoted table name", `["project"]\ndependencies = [${ref}]\n`, { local: true }],
    [
      "uv's dev dependencies under [tool] as a dotted key",
      `[tool]\nuv.dev-dependencies = [${ref}]\n`,
      { local: true, dev: true },
    ],
  ];
  for (const [label, text, extra] of FORMS)
    test(label, () => {
      assertItems(
        { "pyproject.toml": text },
        "pyproject.toml",
        items("pyproject.toml", Object.entries(reference(extra))),
        label,
      );
    });

  test("a dotted `project.dependencies` is a dependency like any other", () => {
    assertItems(
      { "pyproject.toml": 'project.dependencies = ["fastapi>=0.110"]\n' },
      "pyproject.toml",
      items("pyproject.toml", [["fastapi", declared(">=", null, ">=0.110")]]),
    );
  });

  // A requirement the kit does not read as a one-line string gives no item (the second net makes every pip package
  // private for it: facts-network-second-net-python.test.mjs; a uv.toml's overrides are judged there too).
  test("a multi-line (triple-quoted) requirement gives no item; written on one line, it does", () => {
    const project = (requirement) => `[project]\nname = "a"\ndependencies = [${requirement}]\n`;
    const url = "corp-lib @ git+https://git.corp.internal/corp-lib";
    assert.deepEqual(deps({ "a/pyproject.toml": project(`"""${url}"""`) }), {});
    const one = deps({ "a/pyproject.toml": project(JSON.stringify(url)) });
    assert.deepEqual(Object.keys(one["a/pyproject.toml"] ?? {}), ["corp-lib"], "the control: one line, one item");
  });
});

describe("pyproject.toml: [tool.uv.sources] makes the item itself local", () => {
  const git = '{ git = "https://git.corp.internal/lib.git" }';
  const FORMS = [
    ["an inline table under [tool.uv]", `[tool.uv]\nsources = { corp-lib = ${git} }\n`],
    ["an inline table under [tool]", `[tool]\nuv = { sources = { corp-lib = ${git} } }\n`],
    ["a key written with an escape", `[tool.uv.sources]\n"corp${B}u002dlib" = ${git}\n`],
  ];
  for (const [label, form] of FORMS)
    test(label, () => {
      assertItems(
        { "pyproject.toml": pyproject(["corp-lib>=1"], form) },
        "pyproject.toml",
        items("pyproject.toml", [["corp-lib", declared(">=", null, ">=1", { local: true })]]),
        label,
      );
    });

  const SOURCES = [
    "[tool.uv.sources]",
    'corp-git-lib = { git = "https://example.com/corp/lib.git" }',
    'corp-path-lib = { path = "../corp-path-lib", editable = true }',
    "",
  ].join("\n");
  const project = pyproject(["corp-git-lib", "corp-path-lib", "fastapi>=0.110"], SOURCES);
  const projectItems = [
    ["corp-git-lib", declared(null, null, null, { local: true })],
    ["corp-path-lib", declared(null, null, null, { local: true })],
    ["fastapi", declared(">=", null, ">=0.110")],
  ];

  test("a package taken from git or a folder is local, with no uv.lock", () => {
    assertItems({ "pyproject.toml": project }, "pyproject.toml", items("pyproject.toml", projectItems));
  });

  test("with a uv.lock: the manifest's items are the same, and a workspace member of the lock is local there", () => {
    const lock = uvLock(
      uvPackage("app", { version: "0.1.0", source: '{ editable = "." }', dependencies: ["corp-path-lib", "fastapi"] }),
      uvPackage("corp-path-lib", { source: '{ editable = "../corp-path-lib" }' }),
      uvPackage("fastapi", { version: "0.110.0" }),
    );
    const files = { "pyproject.toml": project, "uv.lock": lock };
    assertItems(files, "pyproject.toml", items("pyproject.toml", projectItems));
    assertItems(
      files,
      "uv.lock",
      items("uv.lock", [
        ["corp-path-lib", locked("1.0.0", { direct: true, local: true })],
        ["fastapi", locked("0.110.0", { direct: true, public: true })],
      ]),
    );
  });
});

describe("requirements.txt: pip's own way of reading a line", () => {
  test("hashes, written on continued lines or on the line itself, are no part of the version; parentheses give a range", () => {
    const text = `requests==2.31.0 ${B}\n    --hash=sha256:aa ${B}\n    --hash=sha256:bb\nurllib3==2.2.1 --hash=sha256:cc\ndjango (>=4.2)\n`;
    assertItems(
      { "requirements.txt": text },
      "requirements.txt",
      items("requirements.txt", [
        ["requests", declared("==", "2.31.0", "==2.31.0")],
        ["urllib3", declared("==", "2.2.1", "==2.2.1")],
        ["django", declared(">=", null, ">=4.2")],
      ]),
    );
  });

  test("a comment line after a continued one ends it: both lines are requirements", () => {
    assertItems(
      { "requirements.txt": `flask==3.0 ${B}\n# pinned\nrequests==2.31.0\n` },
      "requirements.txt",
      items("requirements.txt", [
        ["flask", declared("==", "3.0", "==3.0")],
        ["requests", declared("==", "2.31.0", "==2.31.0")],
      ]),
    );
  });

  test("a tab before '#' starts a comment: it is no part of the version", () => {
    assertItems(
      { "requirements.txt": "flask==3.0\t# pinned\n" },
      "requirements.txt",
      items("requirements.txt", [["flask", declared("==", "3.0", "==3.0")]]),
    );
  });

  // pip splits lines as Python's str.splitlines does (0x1c to 0x1e break, U+FEFF does not) and strips with str.strip
  // (0x1f is a blank): whichever way, an option line is no item (whether it declares an index is judged in
  // facts-network-second-net-python.test.mjs).
  const index = `--index-url ${HOST.corpPypi}`;
  const BREAKS = [
    [
      "0x1c ends a comment: the option line after it gives no item",
      `# private index${String.fromCharCode(0x1c)}${index}\ncorp-lib==1.0\n`,
      ["corp-lib"],
    ],
    [
      "0x1e ends a requirement line: the option after it gives no item",
      `corp-lib==1.0${String.fromCharCode(0x1e)}--extra-index-url ${HOST.corpPypi}\ncorp-other==2.0\n`,
      ["corp-lib", "corp-other"],
    ],
    [
      "0x1f before an option: the option line gives no item",
      `${String.fromCharCode(0x1f)}${index}\ncorp-lib==1.0\n`,
      ["corp-lib"],
    ],
    [
      "U+FEFF then a comment after an option: the option line gives no item",
      `--pre ${CH.BOM}# ${index}\ncorp-lib==1.0\n`,
      ["corp-lib"],
    ],
  ];
  for (const [label, text, names] of BREAKS)
    test(label, () => {
      const expected = names.map((name) => [
        name,
        declared("==", name === "corp-other" ? "2.0" : "1.0", `==${name === "corp-other" ? "2.0" : "1.0"}`),
      ]);
      assertItems({ "requirements.txt": text }, "requirements.txt", items("requirements.txt", expected), label);
    });
});

describe("poetry.lock: direct from the pyproject.toml beside it, chains from its dependencies", () => {
  test("FastAPI and fastapi are one PyPI name: it is direct, and starlette comes through it", () => {
    const lock = poetryLock(
      poetryPackage("fastapi", {
        version: "0.110.0",
        rest: 'groups = ["main"]\n\n[package.dependencies]\nstarlette = ">=0.36"\n',
      }),
      poetryPackage("starlette", { version: "0.37.2", rest: 'groups = ["main"]\n' }),
    );
    assertItems(
      { "pyproject.toml": pyproject(["FastAPI>=0.110"]), "poetry.lock": lock },
      "poetry.lock",
      items("poetry.lock", [
        ["fastapi", locked("0.110.0", { direct: true, public: true })],
        ["starlette", locked("0.37.2", { public: true, via: ["fastapi"] })],
      ]),
    );
  });
});

describe("uv.lock", () => {
  const app = uvPackage("app", {
    version: "0.1.0",
    source: '{ editable = "." }',
    dependencies: ["fastapi", "corp"],
    rest: '\n[package.dev-dependencies]\ndev = [{ name = "pytest" }]\n',
  });

  test("the project's own package is no dependency; its dependencies are direct, its dev ones dev, its sources judged", () => {
    const lock = uvLock(
      app,
      uvPackage("fastapi", { version: "0.110.0", dependencies: ["starlette"] }),
      uvPackage("starlette", { version: "0.37.2" }),
      uvPackage("pytest", { version: "8.2.0" }),
      uvPackage("corp", { registry: HOST.corpPypi }),
      uvPackage("fork", { version: "2.0.0", source: '{ git = "https://example.com/fork.git?rev=abc" }' }),
    );
    assertItems(
      { "uv.lock": lock },
      "uv.lock",
      items("uv.lock", [
        ["fastapi", locked("0.110.0", { direct: true, public: true })],
        ["starlette", locked("0.37.2", { public: true, via: ["fastapi"] })],
        ["pytest", locked("8.2.0", { direct: true, dev: true, public: true })],
        ["corp", locked("1.0.0", { direct: true, local: true })],
        ["fork", locked("2.0.0", { local: true })],
      ]),
    );
  });

  // Public only from PyPI's registry; any other source, or none, is local.
  const SOURCES = [
    ["PyPI's registry (with its files): public", uvPackage("corp-lib"), locked("1.0.0", { public: true })],
    ["another registry: local", uvPackage("corp-lib", { registry: HOST.corpPypi }), locked("1.0.0", { local: true })],
    [
      "a git source: local",
      uvPackage("corp-lib", { source: `{ git = "${HOST.corpGit}/lib.git?rev=main#abc" }` }),
      locked("1.0.0", { local: true }),
    ],
    [
      "no source at all: local",
      '[[package]]\nname = "corp-lib"\nversion = "1.0.0"\n\n',
      locked("1.0.0", { local: true }),
    ],
  ];
  for (const [label, block, expected] of SOURCES)
    test(label, () => {
      assertItems({ "uv.lock": block }, "uv.lock", items("uv.lock", [["corp-lib", expected]]), label);
    });
});

describe("Pipfile and Pipfile.lock", () => {
  const PIPFILE = [
    "[[source]]",
    `url = "${HOST.pypi}"`,
    'name = "pypi"',
    "[[source]]",
    `url = "${HOST.corpPypi}"`,
    'name = "internal"',
    "[packages]",
    'requests = "*"',
    'django = "==4.2.1"',
    'mylib = {path = "./mylib", editable = true}',
    'corp = {version = "*", index = "internal"}',
    "[dev-packages]",
    'pytest = ">=7"',
    "",
  ].join("\n");
  const LOCK = {
    _meta: {
      sources: [
        { name: "pypi", url: HOST.pypi },
        { name: "internal", url: HOST.corpPypi },
      ],
    },
    default: {
      requests: { version: "==2.31.0", index: "pypi" },
      urllib3: { version: "==2.2.1", index: "pypi" },
      corp: { version: "==1.0.0", index: "internal" },
      mylib: { path: "./mylib", editable: true },
    },
    develop: { pytest: { version: "==7.4.0", index: "pypi" }, requests: { version: "==2.31.0" } },
  };
  const files = { Pipfile: PIPFILE, "Pipfile.lock": LOCK };

  test("Pipfile: [packages] and [dev-packages]; a folder or a private index is local", () => {
    assertItems(
      files,
      "Pipfile",
      items("Pipfile", [
        ["requests", { version: null, spec: "*", direct: true, dev: false }],
        ["django", { version: "4.2.1", direct: true, dev: false }],
        ["mylib", { version: null, spec: "*", direct: true, dev: false, local: true }],
        ["corp", { version: null, spec: "*", direct: true, dev: false, local: true }],
        ["pytest", { version: null, spec: ">=7", direct: true, dev: true }],
      ]),
    );
  });

  test("Pipfile.lock: direct from the Pipfile; in default and develop is not dev only; a folder or a private index is local", () => {
    assertItems(
      files,
      "Pipfile.lock",
      items("Pipfile.lock", [
        ["requests", { version: "2.31.0", direct: true, dev: false }],
        ["urllib3", { version: "2.2.1", direct: false, dev: false }],
        ["corp", { version: "1.0.0", direct: true, dev: false, local: true }],
        ["mylib", { version: null, spec: "*", direct: true, dev: false, local: true }],
        ["pytest", { version: "7.4.0", direct: true, dev: true }],
      ]),
    );
  });
});

describe("TOML escapes are decoded before a Python item is judged", () => {
  const uvRoot = (dependency) =>
    uvPackage("app", { version: "0.1.0", source: `{ editable = "${B}u002e" }`, dependencies: [dependency] });

  test("PyPI's registry and file host written with an escape are still PyPI's: the item is public, not local", () => {
    const lock = uvLock(
      uvPackage("corp-lib", {
        registry: `https://pypi${B}u002eorg/simple`,
        files: false,
        rest: `sdist = { url = "https://files${B}u002epythonhosted.org/packages/ab/cd/corp_lib-1.0.0.tar.gz" }\n`,
      }),
    );
    assertItems({ "uv.lock": lock }, "uv.lock", items("uv.lock", [["corp-lib", locked("1.0.0", { public: true })]]));
  });

  test("Poetry's legacy source type written with an escape is still the legacy PyPI source: the item is not local", () => {
    const source = `\n[package.source]\ntype = "l${B}u0065gacy"\nurl = "${HOST.pypi}"\n`;
    assertItems(
      { "poetry.lock": poetryLock(poetryPackage("corp-lib", { rest: source })) },
      "poetry.lock",
      items("poetry.lock", [["corp-lib", locked("1.0.0", { public: true })]]),
    );
  });

  test("a Poetry [package.source] table of type directory is a place: the item is local", () => {
    const source = { type: "directory", url: "../vendored" };
    assertItems(
      { "poetry.lock": poetryLock(poetryPackage("corp-lib", { source })) },
      "poetry.lock",
      items("poetry.lock", [["corp-lib", locked("1.0.0", { local: true })]]),
    );
  });

  test('the root\'s `editable = "."` and a dependency name written escaped: the root is no item, the dependency is direct', () => {
    const lock = uvLock(uvRoot(`corp${B}u002dlib`), uvPackage("corp-lib"));
    assertItems(
      { "uv.lock": lock },
      "uv.lock",
      items("uv.lock", [["corp-lib", locked("1.0.0", { direct: true, public: true })]]),
    );
  });

  test("a Poetry group written with an escape is still `main`: the item is no dev one", () => {
    const lock = poetryLock(poetryPackage("corp-lib", { rest: `groups = ["m${B}u0061in"]\n` }));
    const read = deps({ "poetry.lock": lock })["poetry.lock"]["corp-lib"];
    assert.equal(read.dev, false);
  });

  test("a dependency name written with an escape in pyproject.toml is read decoded", () => {
    assertItems(
      { "pyproject.toml": `[project]\nname = "app"\ndependencies = ["corp${B}u002dlib>=1"]\n` },
      "pyproject.toml",
      items("pyproject.toml", [["corp-lib", declared(">=", null, ">=1")]]),
    );
  });

  test("a name a [tool.uv.sources] takes elsewhere is local, whichever spelling the uv.lock gives it", () => {
    const sources = pyproject(["corp-lib"], '[tool.uv.sources]\ncorp-lib = { path = "../corp-lib" }\n');
    const read = deps({
      "pyproject.toml": sources,
      "uv.lock": uvLock(
        uvPackage("corp-lib", { source: undefined }).replace('name = "corp-lib"', `name = "corp${B}u002dlib"`),
      ),
    });
    assert.equal(read["pyproject.toml"]["corp-lib"].local, true);
    assert.deepEqual(Object.keys(read["uv.lock"]), ["corp-lib"], "the lock's item has the decoded name");
  });
});
