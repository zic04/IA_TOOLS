// The licences read offline from the installed copies of the packages (engine/facts/deps/installed.mjs,
// ARCHITECTURE.md §6.9, SECURITY.md): for an npm or pip item its lock gives no licence, the one its installed copy
// names — the copy Node would load (`node_modules/<name>`, from the manifest's folder up), a virtual environment's
// `*.dist-info/METADATA` (`.venv/`, `venv/`) —, read only inside the application, of the item's name and version,
// within bounds, never executed, never written. Minimal pairs: each refusal beside the closest accepted case.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { collectDependencies } from "../../engine/facts/dependencies.mjs";
import { metadataFields, withInstalledLicences, LISTING_LIMITS } from "../../engine/facts/deps/installed.mjs";
import { app } from "../tools/deps-apps.mjs";
import { packageJson, npmEntry, packageLockV3 } from "../tools/locks.mjs";

/** A token-shaped text, split so that no secret is written in the repository. */
const TOKEN = "gh" + "p_16C7e42F292c6912E7710c838347Ae178B4a";

/** The licence an item was given: `{ license, licenseFrom }`, or {} when it has none. */
const licenceOf = (item) =>
  "license" in item || "licenseFrom" in item ? { license: item.license, licenseFrom: item.licenseFrom } : {};

/** Every file and folder under `dir`, with each file's size: what reading must leave as it was. */
function tree(dir) {
  const out = [];
  const walk = (abs, rel) => {
    for (const name of fs.readdirSync(abs)) {
      const r = `${rel}${name}`;
      const st = fs.lstatSync(path.join(abs, name));
      if (st.isSymbolicLink()) out.push(`${r} -> link`);
      else if (st.isDirectory()) {
        out.push(`${r}/`);
        walk(path.join(abs, name), `${r}/`);
      } else out.push(`${r} ${st.size}`);
    }
  };
  walk(dir, "");
  return out.sort();
}

/**
 * Makes each of `links` ({ path: target }) a directory link under `dir`: a target `outside:<path>` lies in `away`, a
 * target `relative:<path>` is written relative to the link's folder as pnpm writes them on POSIX (Windows has
 * junctions only, to an absolute path), any other one is an absolute path in `dir`. Returns the links made.
 */
function makeLinks(dir, away, links) {
  const made = [];
  for (const [rel, target] of Object.entries(links)) {
    const link = path.join(dir, rel);
    fs.mkdirSync(path.dirname(link), { recursive: true });
    const [kind, where] = /^(outside|relative):/.test(target) ? target.split(/:(.*)/) : ["", target];
    const to = path.join(kind === "outside" ? away : dir, where);
    const written = kind === "relative" && process.platform !== "win32" ? path.relative(path.dirname(link), to) : to;
    fs.symlinkSync(written, link, "junction");
    made.push(link);
  }
  return made;
}

/**
 * The licence of each item of an application made of `files`, by manifest then name (licenceOf). `links` are made
 * first (makeLinks, `outside` the files of the folder beside the application), then `prepare(dir)` runs. Reading
 * never writes in the application (its tree is the same after). `limits`: LISTING_LIMITS, smaller to reach them.
 * Every folder is removed after, each link unlinked first: a junction is never removed recursively, that would empty
 * the folder it points to.
 * @param {Record<string, unknown>} files
 * @param {{ links?: Record<string, string>, outside?: Record<string, unknown>, prepare?: (dir: string) => void,
 *   limits?: { entries: number, distInfos: number } }} [o]
 */
function licences(files, { links = {}, outside = {}, prepare = () => {}, limits } = {}) {
  const dir = app(files);
  const away = app(outside);
  let made = [];
  try {
    made = makeLinks(dir, away, links);
    prepare(dir);
    const before = tree(dir);
    // With other limits, the items as the manifests give them (no licence of a lock here), then the installed ones.
    const items = limits
      ? withInstalledLicences(
          dir,
          collectDependencies(dir).map(({ license, licenseFrom, ...item }) => item),
          limits,
        )
      : collectDependencies(dir);
    assert.deepEqual(tree(dir), before, "nothing written in the application");
    const out = {};
    for (const item of items) (out[item.manifest] ??= {})[item.name] = licenceOf(item);
    return { out, items };
  } finally {
    for (const link of made) fs.unlinkSync(link);
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    fs.rmSync(away, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}

const INSTALLED = (license) => ({ license, licenseFrom: "installed" });

/** An installed package.json: its name, version and licence as npm writes them. */
const pkg = (name, { version = "1.0.0", license = "MIT", ...rest } = {}) => ({ name, version, license, ...rest });

/**
 * Asserts a minimal pair: `kept` gives the item at `at` ([manifest, name], package.json's `x` by default) the licence
 * `licence` from its installed copy; `refused`, the same application but for the rule under test, gives it none.
 */
function pair({ kept, refused, licence = "MIT", at = ["package.json", "x"], options = {} }) {
  const [manifest, name] = at;
  const accepted = licences(kept, options.kept).out[manifest]?.[name];
  assert.deepEqual(accepted, INSTALLED(licence), "the accepted case");
  const denied = licences(refused, options.refused ?? options.kept).out[manifest]?.[name];
  assert.ok(denied, "the refused case still reads the item");
  assert.deepEqual(denied, {}, "the refused case: no licence");
}

describe("npm: the copy Node would load, node_modules/<name>/package.json", () => {
  const exact = packageJson({ x: "1.0.0" });

  for (const [label, files, at, expected] of [
    ["a copy beside its manifest", { "package.json": exact, "node_modules/x/package.json": pkg("x") }],
    [
      "a hoisted copy: a workspace's manifest, the copy at the root",
      { "web/package.json": exact, "node_modules/x/package.json": pkg("x") },
      ["web/package.json", "x"],
    ],
    [
      "the nearest copy first",
      {
        "web/package.json": packageJson({ x: "^1.0.0" }),
        "web/node_modules/x/package.json": pkg("x", { license: "ISC" }),
        "node_modules/x/package.json": pkg("x"),
      },
      ["web/package.json", "x"],
      "ISC",
    ],
    [
      "a scoped name",
      { "package.json": packageJson({ "@s/x": "1.0.0" }), "node_modules/@s/x/package.json": pkg("@s/x") },
      ["package.json", "@s/x"],
    ],
    [
      "a range: any installed version",
      { "package.json": packageJson({ x: "^1.0.0" }), "node_modules/x/package.json": pkg("x", { version: "1.9.3" }) },
    ],
    [
      "the legacy list of licences",
      {
        "package.json": exact,
        "node_modules/x/package.json": { name: "x", version: "1.0.0", licenses: [{ type: "Apache-2.0" }] },
      },
      undefined,
      "Apache-2.0",
    ],
  ])
    test(label, () => {
      const [manifest, name] = at ?? ["package.json", "x"];
      assert.deepEqual(licences(files).out[manifest][name], INSTALLED(expected ?? "MIT"));
    });

  test("a version mismatch: another copy, no licence", () =>
    pair({
      kept: { "package.json": exact, "node_modules/x/package.json": pkg("x") },
      refused: { "package.json": exact, "node_modules/x/package.json": pkg("x", { version: "1.0.1" }) },
    }));

  test("the nearest copy is judged alone: a matching copy further up never stands in for it", () =>
    pair({
      kept: {
        "web/package.json": exact,
        "web/node_modules/x/package.json": pkg("x", { license: "ISC" }),
        "node_modules/x/package.json": pkg("x"),
      },
      refused: {
        "web/package.json": exact,
        "web/node_modules/x/package.json": pkg("x", { version: "2.0.0", license: "ISC" }),
        "node_modules/x/package.json": pkg("x"),
      },
      licence: "ISC",
      at: ["web/package.json", "x"],
    }));

  test("a nearest copy of another name is judged alone: the copy further up never stands in for it", () =>
    pair({
      kept: {
        "web/package.json": exact,
        "web/node_modules/x/package.json": pkg("x", { license: "ISC" }),
        "node_modules/x/package.json": pkg("x"),
      },
      refused: {
        "web/package.json": exact,
        "web/node_modules/x/package.json": pkg("y", { license: "ISC" }),
        "node_modules/x/package.json": pkg("x"),
      },
      licence: "ISC",
      at: ["web/package.json", "x"],
    }));

  for (const [label, name] of [
    ["a name in another case", "X"],
    ["another name", "y"],
    ["no name", undefined],
  ])
    test(`a name mismatch (${label}): no licence`, () =>
      pair({
        kept: { "package.json": exact, "node_modules/x/package.json": pkg("x") },
        refused: { "package.json": exact, "node_modules/x/package.json": pkg(name) },
      }));

  test("1 MB is read, 1 MB and a byte are not", () => {
    const padded = (size) => {
      const json = JSON.stringify(pkg("x"));
      return json + " ".repeat(size - json.length);
    };
    pair({
      kept: { "package.json": exact, "node_modules/x/package.json": padded(1024 * 1024) },
      refused: { "package.json": exact, "node_modules/x/package.json": padded(1024 * 1024 + 1) },
    });
  });

  for (const [label, text] of [
    ["invalid JSON", '{ "name": "x", "license": "MIT"'],
    ["an array", '[{ "name": "x", "license": "MIT" }]'],
  ])
    test(`${label}: no licence, never an error`, () =>
      pair({
        kept: { "package.json": exact, "node_modules/x/package.json": JSON.stringify(pkg("x")) },
        refused: { "package.json": exact, "node_modules/x/package.json": text },
      }));

  test("a licence that is no licence's name: none", () => {
    for (const license of [TOKEN, "MIT\nPermission is hereby granted"]) {
      const { out, items } = licences({
        "package.json": exact,
        "node_modules/x/package.json": pkg("x", { license }),
      });
      assert.deepEqual(out["package.json"].x, {});
      assert.ok(!JSON.stringify(items).includes(TOKEN), "the token is never stored");
    }
  });

  test("a name that is a path is never looked up (`../x` would reach x/ through node_modules)", () => {
    const scoped = { "package.json": packageJson({ "@s/x": "1.0.0" }), "node_modules/@s/x/package.json": pkg("@s/x") };
    assert.deepEqual(licences(scoped).out["package.json"]["@s/x"], INSTALLED("MIT"), "two parts, the first a scope");
    // Both would reach x/package.json, a manifest of the application that names itself so.
    for (const name of ["../x", "@s/../../x"]) {
      const { out } = licences({ "package.json": packageJson({ [name]: "1.0.0" }), "x/package.json": pkg(name) });
      assert.deepEqual(out["package.json"][name], {}, name);
    }
    // npm's form, a scope and a name, but `..` is no entry of the scope's folder: never node_modules/package.json.
    const { out } = licences({
      "package.json": packageJson({ "@s/..": "1.0.0" }),
      "node_modules/@s/y/package.json": pkg("@s/y"),
      "node_modules/package.json": pkg("@s/.."),
    });
    assert.deepEqual(out["package.json"]["@s/.."], {}, "@s/..");
  });
});

describe("npm: links", () => {
  const store = "node_modules/.pnpm/x@1.0.0/node_modules/x";
  const files = { "package.json": packageJson({ x: "1.0.0" }), [`${store}/package.json`]: pkg("x") };

  test("a pnpm link into node_modules/.pnpm, inside the application, is read", () => {
    for (const target of [store, `relative:${store}`])
      assert.deepEqual(
        licences(files, { links: { "node_modules/x": target } }).out["package.json"].x,
        INSTALLED("MIT"),
        target,
      );
  });

  test("a node_modules linked out of the application is judged alone: the one above it never stands in", () =>
    assert.deepEqual(
      licences(
        { "web/package.json": packageJson({ x: "1.0.0" }), "node_modules/x/package.json": pkg("x") },
        { links: { "web/node_modules": "outside:modules" }, outside: { "modules/x/package.json": pkg("x") } },
      ).out["web/package.json"].x,
      {},
    ));

  test("a loop of links: no licence, never an error", () =>
    assert.deepEqual(
      licences(
        { "package.json": packageJson({ x: "1.0.0" }), "loop/.keep": "" },
        { links: { "node_modules/x": "loop/b", "loop/b": "node_modules/x" } },
      ).out["package.json"].x,
      {},
    ));

  test(`${LISTING_LIMITS.entries.toLocaleString("en")} entries a folder listed (here 3): one more, refused`, () => {
    const limits = { ...LISTING_LIMITS, entries: 3 };
    const files = { "package.json": packageJson({ x: "1.0.0" }), "node_modules/x/package.json": pkg("x") };
    const pads = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`node_modules/pad${i}`, ""]));
    assert.deepEqual(licences({ ...files, ...pads(2) }, { limits }).out["package.json"].x, INSTALLED("MIT"));
    assert.deepEqual(licences({ ...files, ...pads(3) }, { limits }).out["package.json"].x, {});
  });

  test("a link to a folder outside the application is never read", () =>
    assert.deepEqual(
      licences(
        { "package.json": packageJson({ x: "1.0.0" }) },
        { links: { "node_modules/x": "outside:x" }, outside: { "x/package.json": pkg("x") } },
      ).out["package.json"].x,
      {},
    ));

  test("a link outside the application is judged alone: the copy above it never stands in", () =>
    assert.deepEqual(
      licences(
        { "web/package.json": packageJson({ x: "1.0.0" }), "node_modules/x/package.json": pkg("x") },
        { links: { "web/node_modules/x": "outside:x" }, outside: { "x/package.json": pkg("x") } },
      ).out["web/package.json"].x,
      {},
    ));

  test("a broken link: no licence, never an error", () =>
    assert.deepEqual(
      licences(files, {
        links: { "node_modules/x": store },
        prepare: (dir) => fs.rmSync(path.join(dir, store), { recursive: true }),
      }).out["package.json"].x,
      {},
    ));
});

/** The METADATA of a Python distribution: its header fields in order, a blank line, then `body`. */
const metadata = (fields, body = "") => `${fields.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${body}`;
/** A METADATA's usual first fields, then `more`. */
const header = (more = [], { name = "x", version = "1.0.0" } = {}) => [
  ["Metadata-Version", "2.1"],
  ["Name", name],
  ["Version", version],
  ...more,
];
const POSIX = ".venv/lib/python3.12/site-packages";
const WINDOWS = ".venv/Lib/site-packages";
const MIT = ["Classifier", "License :: OSI Approved :: MIT License"];

/** An application whose requirements.txt names `requirement`, with a dist-info folder for each `copies` entry. */
const venvApp = (requirement, copies, { at = POSIX } = {}) => ({
  "requirements.txt": `${requirement}\n`,
  ...Object.fromEntries(Object.entries(copies).map(([dir, text]) => [`${at}/${dir}/METADATA`, text])),
});

describe("pip: a virtual environment's dist-info METADATA", () => {
  const at = ["requirements.txt", "x"];
  const mit = metadata(header([["License", "MIT"]]));

  for (const [label, files, expected, where] of [
    ["the POSIX layout, lib/python*/site-packages", venvApp("x==1.0.0", { "x-1.0.0.dist-info": mit })],
    ["the Windows layout, Lib/site-packages", venvApp("x==1.0.0", { "x-1.0.0.dist-info": mit }, { at: WINDOWS })],
    ["a venv/ folder", venvApp("x==1.0.0", { "x-1.0.0.dist-info": mit }, { at: "venv/lib/python3.11/site-packages" })],
    [
      "a .venv above its manifest",
      {
        "api/requirements.txt": "x==1.0.0\n",
        [`${POSIX}/x-1.0.0.dist-info/METADATA`]: mit,
      },
      "MIT",
      ["api/requirements.txt", "x"],
    ],
    [
      "a name as PEP 503 normalises it",
      venvApp("My.Lib==1.0.0", {
        "my_lib-1.0.0.dist-info": metadata(header([["License", "MIT"]], { name: "My-Lib" })),
      }),
      "MIT",
      ["requirements.txt", "My.Lib"],
    ],
    [
      "License-Expression first",
      venvApp("x==1.0.0", {
        "x-1.0.0.dist-info": metadata(header([["License-Expression", "Apache-2.0"], ["License", "MIT"], MIT])),
      }),
      "Apache-2.0",
    ],
    ["the classifiers", venvApp("x==1.0.0", { "x-1.0.0.dist-info": metadata(header([MIT])) }), "MIT License"],
    [
      "a multi-line License (a folded line): the classifiers",
      venvApp("x==1.0.0", {
        "x-1.0.0.dist-info": metadata(header([["License", "Copyright (c) 2024\n        Permission is granted"], MIT])),
      }),
      "MIT License",
    ],
    [
      "a range: the only copy installed",
      venvApp("x>=1", { "x-1.4.0.dist-info": metadata(header([["License", "MIT"]], { version: "1.4.0" })) }),
    ],
    [
      "two copies of one name: the item's own version",
      venvApp("x==2.0.0", {
        "x-1.0.0.dist-info": mit,
        "x-2.0.0.dist-info": metadata(header([["License", "ISC"]], { version: "2.0.0" })),
      }),
      "ISC",
    ],
  ])
    test(label, () => {
      const [manifest, name] = where ?? at;
      assert.deepEqual(licences(files).out[manifest][name], INSTALLED(expected ?? "MIT"));
    });

  test("another version: no licence", () =>
    pair({
      kept: venvApp("x==1.0.0", { "x-1.0.0.dist-info": mit }),
      refused: venvApp("x==1.0.0", {
        "x-2.0.0.dist-info": metadata(header([["License", "MIT"]], { version: "2.0.0" })),
      }),
      at,
    }));

  test("a folder's name is no proof: its METADATA's version must be the item's", () =>
    pair({
      kept: venvApp("x==1.0.0", { "x-1.0.0.dist-info": mit }),
      refused: venvApp("x==1.0.0", {
        "x-1.0.0.dist-info": metadata(header([["License", "MIT"]], { version: "2.0.0" })),
      }),
      at,
    }));

  test("a METADATA of another name: no licence", () =>
    pair({
      kept: venvApp("x==1.0.0", { "x-1.0.0.dist-info": mit }),
      refused: venvApp("x==1.0.0", { "x-1.0.0.dist-info": metadata(header([["License", "MIT"]], { name: "y" })) }),
      at,
    }));

  test("two copies of one name and no version to choose: no licence", () =>
    pair({
      kept: venvApp("x>=1", { "x-1.0.0.dist-info": mit }),
      refused: venvApp("x>=1", {
        "x-1.0.0.dist-info": mit,
        "x-2.0.0.dist-info": metadata(header([["License", "MIT"]], { version: "2.0.0" })),
      }),
      at,
    }));

  test("a token-shaped License is never stored: the classifiers, else none", () => {
    const withClassifier = licences(
      venvApp("x==1.0.0", { "x-1.0.0.dist-info": metadata(header([["License", TOKEN], MIT])) }),
    );
    assert.deepEqual(withClassifier.out["requirements.txt"].x, INSTALLED("MIT License"));
    const alone = licences(venvApp("x==1.0.0", { "x-1.0.0.dist-info": metadata(header([["License", TOKEN]])) }));
    assert.deepEqual(alone.out["requirements.txt"].x, {});
    for (const { items } of [withClassifier, alone]) assert.ok(!JSON.stringify(items).includes(TOKEN));
  });

  test("a METADATA over 64 KB: only its header is read, never its description", () =>
    pair({
      kept: venvApp("x==1.0.0", {
        "x-1.0.0.dist-info": metadata(header([["License-Expression", "MIT"]]), "x".repeat(100_000)),
      }),
      refused: venvApp("x==1.0.0", {
        "x-1.0.0.dist-info": metadata(header(), `License-Expression: GPL-3.0-only\n${"x".repeat(100_000)}`),
      }),
      at,
    }));

  test("a header longer than 64 KB: the fields read whole before the cut, none after it", () => {
    const padding = Array.from({ length: 1500 }, () => ["Classifier", "Programming Language :: Python :: 3"]);
    pair({
      kept: venvApp("x==1.0.0", { "x-1.0.0.dist-info": metadata(header([["License", "MIT"], ...padding])) }),
      refused: venvApp("x==1.0.0", { "x-1.0.0.dist-info": metadata(header([...padding, ["License", "MIT"]])) }),
      at,
    });
  });

  test("a .venv that is a file (a path to elsewhere, for some tools) is never followed", () =>
    pair({
      kept: venvApp("x==1.0.0", { "x-1.0.0.dist-info": mit }),
      refused: {
        "requirements.txt": "x==1.0.0\n",
        ".venv": "envs/main\n",
        "envs/main/lib/python3.12/site-packages/x-1.0.0.dist-info/METADATA": mit,
      },
      at,
    }));

  test("a .venv linked inside the application is read, one linked outside never is", () => {
    const files = { "requirements.txt": "x==1.0.0\n" };
    const env = { "envs/main/lib/python3.12/site-packages/x-1.0.0.dist-info/METADATA": mit };
    assert.deepEqual(
      licences({ ...files, ...env }, { links: { ".venv": "envs/main" } }).out["requirements.txt"].x,
      INSTALLED("MIT"),
    );
    assert.deepEqual(
      licences(files, { links: { ".venv": "outside:envs/main" }, outside: env }).out["requirements.txt"].x,
      {},
    );
  });

  test(`${LISTING_LIMITS.distInfos.toLocaleString("en")} dist-info folders a site-packages (here 2): one more, refused`, () => {
    const limits = { ...LISTING_LIMITS, distInfos: 2 };
    const files = venvApp("x==1.0.0", { "x-1.0.0.dist-info": mit });
    const pads = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${POSIX}/p${i}-1.0.dist-info`, ""]));
    assert.deepEqual(licences({ ...files, ...pads(1) }, { limits }).out["requirements.txt"].x, INSTALLED("MIT"));
    assert.deepEqual(licences({ ...files, ...pads(2) }, { limits }).out["requirements.txt"].x, {});
  });

  test("the bounds SECURITY.md promises", () => assert.deepEqual(LISTING_LIMITS, { entries: 10_000, distInfos: 5000 }));

  test("4 python* folders in a virtual environment's lib/; 5 are refused", () => {
    const files = venvApp("x==1.0.0", { "x-1.0.0.dist-info": mit });
    const others = (list) => Object.fromEntries(list.map((p) => [`.venv/lib/${p}/.keep`, ""]));
    assert.deepEqual(
      licences({ ...files, ...others(["python3.9", "python3.10", "python3.11"]) }).out["requirements.txt"].x,
      INSTALLED("MIT"),
    );
    assert.deepEqual(
      licences({ ...files, ...others(["python3.9", "python3.10", "python3.11", "python3.13"]) }).out["requirements.txt"]
        .x,
      {},
    );
  });

  test("a header cut inside a field: that field is left out (License: MIT-0 is never read as MIT)", () => {
    const top = "Metadata-Version: 2.1\nName: x\nVersion: 1.0.0\n";
    const field = "License: MIT";
    const summary = `Summary: ${"a".repeat(64 * 1024 - top.length - field.length - "Summary: \n".length)}\n`;
    assert.equal((top + summary + field).length, 64 * 1024, "the cut falls right after `License: MIT`");
    pair({
      // The field before the cut may go on past it, so it is left out too: here an author, not the licence.
      kept: venvApp("x==1.0.0", { "x-1.0.0.dist-info": `${top}${field}-0\nAuthor: a\n${summary}\nbody` }),
      refused: venvApp("x==1.0.0", { "x-1.0.0.dist-info": `${top}${summary}${field}-0\n\nbody` }),
      licence: "MIT-0",
      at,
    });
  });
});

describe("pip: the nearest virtual environment that names the package, judged alone", () => {
  const item = "api/requirements.txt";
  const at = [item, "x"];
  const mit = metadata(header([["License", "MIT"]]));
  const isc = (o = {}) => metadata(header([["License", "ISC"]], o));
  /** api/ with its own .venv holding `near`, the application's .venv holding x 1.0.0 (MIT). */
  const nested = (requirement, near) => ({
    [item]: `${requirement}\n`,
    [`${POSIX}/x-1.0.0.dist-info/METADATA`]: mit,
    ...Object.fromEntries(Object.entries(near).map(([dir, text]) => [`api/${POSIX}/${dir}/METADATA`, text])),
  });

  test("the nearest first", () =>
    assert.deepEqual(licences(nested("x>=1", { "x-1.0.0.dist-info": isc() })).out[item].x, INSTALLED("ISC")));

  for (const [label, near] of [
    ["another version only", { "x-2.0.0.dist-info": isc({ version: "2.0.0" }) }],
    ["a METADATA of another version", { "x-1.0.0.dist-info": isc({ version: "2.0.0" }) }],
    ["a METADATA of another name", { "x-1.0.0.dist-info": isc({ name: "y" }) }],
  ])
    test(`${label}: no licence, never the one further up`, () =>
      pair({
        kept: nested("x==1.0.0", { "x-1.0.0.dist-info": isc() }),
        refused: nested("x==1.0.0", near),
        licence: "ISC",
        at,
      }));

  test("a virtual environment linked out of the application stops the search", () => {
    const env = { "env/lib/python3.12/site-packages/x-1.0.0.dist-info/METADATA": isc() };
    const files = { [item]: "x==1.0.0\n", [`${POSIX}/x-1.0.0.dist-info/METADATA`]: mit };
    assert.deepEqual(
      licences({ ...files, ...env }, { links: { "api/.venv": "env" } }).out[item].x,
      INSTALLED("ISC"),
      "linked inside",
    );
    assert.deepEqual(licences(files, { links: { "api/.venv": "outside:env" }, outside: env }).out[item].x, {});
  });

  test("a dist-info folder linked inside the application is read, one linked out of it never is", () => {
    const files = { "requirements.txt": "x==1.0.0\n", [`${POSIX}/.keep`]: "" };
    const store = { "store/x-1.0.0.dist-info/METADATA": mit };
    const link = `${POSIX}/x-1.0.0.dist-info`;
    assert.deepEqual(
      licences({ ...files, ...store }, { links: { [link]: "store/x-1.0.0.dist-info" } }).out["requirements.txt"].x,
      INSTALLED("MIT"),
    );
    assert.deepEqual(
      licences(files, { links: { [link]: "outside:store/x-1.0.0.dist-info" }, outside: store }).out["requirements.txt"]
        .x,
      {},
    );
  });
});

describe("what the installed copies never change", () => {
  test("a lock's licence beats an installed one", () => {
    const { out } = licences({
      "package.json": packageJson({ x: "^1.0.0" }),
      "package-lock.json": packageLockV3({ x: "^1.0.0" }, { "node_modules/x": npmEntry("x", { license: "MIT" }) }),
      "node_modules/x/package.json": pkg("x", { license: "ISC" }),
    });
    assert.deepEqual(out["package-lock.json"].x, { license: "MIT", licenseFrom: "lock" });
    assert.deepEqual(out["package.json"].x, INSTALLED("ISC"), "the manifest's own item, which no lock gave one");
  });

  test("the other ecosystems: never looked up", () => {
    const { out } = licences({
      "Cargo.toml": '[package]\nname = "app"\nversion = "0.1.0"\n\n[dependencies]\nx = "1.0.0"\n',
      "node_modules/x/package.json": pkg("x"),
      [`${POSIX}/x-1.0.0.dist-info/METADATA`]: metadata(header([["License", "MIT"]])),
    });
    assert.deepEqual(out["Cargo.toml"].x, {});
  });

  test("an application with no installed copy: the items as they were", () => {
    const { out } = licences({ "package.json": packageJson({ x: "1.0.0" }), "requirements.txt": "y==1.0.0\n" });
    assert.deepEqual(out, { "package.json": { x: {} }, "requirements.txt": { y: {} } });
  });
});

describe("metadataFields: a METADATA header as Python's email parser reads it", () => {
  test("its fields, the first of each, every classifier; a folded line kept as a second line", () => {
    const text =
      "Name: x\nVersion: 1.0\nLicense: MIT\n  and more\nLicense: ISC\nClassifier: A\nClassifier: B\n\nName: y";
    assert.deepEqual(metadataFields(text), {
      name: "x",
      version: "1.0",
      expression: null,
      license: "MIT\n  and more",
      classifiers: ["A", "B"],
    });
  });

  test("a folded field of a CRLF header: its lines joined by a LF, each CR before a line break left out", () => {
    const text = "Name: x\r\nLicense: MIT\r\n  and more\r\n\tand a tab\r\nVersion: 1.0\r\n  folded too\r";
    assert.deepEqual(metadataFields(text), {
      name: "x",
      version: "1.0\n  folded too",
      expression: null,
      license: "MIT\n  and more\n\tand a tab",
      classifiers: [],
    });
  });

  test("the header ends at a blank line, or at a line that is no field", () => {
    assert.equal(metadataFields("Name: x\r\n\r\nLicense: MIT").license, null, "a blank line (CRLF)");
    assert.equal(metadataFields("Name: x\nsome prose\nLicense: MIT").license, null, "a line with no field");
    assert.equal(metadataFields("Name: x\nNot a field: MIT").license, null, "a field name with a blank");
    assert.equal(metadataFields("Name: x\r\nLicense: MIT\r\n").license, "MIT", "CRLF line ends");
  });

  test("a cut header: its last line and the field it belongs to are left out", () => {
    assert.deepEqual(metadataFields("Name: x\nLicense: MIT\nClassifier: A\nClass", { cut: true }).classifiers, []);
    assert.equal(metadataFields("Name: x\nLicense: MIT\n  more", { cut: true }).license, null, "it may go on");
    assert.equal(metadataFields("Name: x\nLicense: MIT\nClassifier: A\n", { cut: true }).license, "MIT");
    assert.equal(metadataFields("Name: x\n\nLicense: MIT\n", { cut: true }).name, "x", "ended before the cut");
  });
});
