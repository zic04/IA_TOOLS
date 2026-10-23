// The Python files of a generated case, as tagged lines (lines.mjs): pyproject.toml, then one lock — uv.lock or
// poetry.lock — written as uv or Poetry writes it unless a style says otherwise (the neutral rewrites of R-EQ: spaces
// around "=", `[[ package ]]`, quoted keys, literal strings, escapes decoded the same, comments, block order…). A
// negative instance is a block of its own, every line of it tagged with its group; its `spell` writes it in one of
// the forms the tool reads alike (TAINT (E)) or in one the kit must take as a doubt. Pipfile.lock is rendered for the
// invariants only: it never proves a name.
import { HOST } from "../locks.mjs";
import { docOf, jsonLines, jsonString, withLines, groupIds, declarationDocs } from "./lines.mjs";
import { PUBLIC, versionOf, isNegative } from "./model.mjs";

const SHA = "0".repeat(40);
/** A file name as a wheel or an sdist writes a package's name. */
const fileName = (name) => name.replace(/[-.]/g, "_").toLowerCase();
/** A name PEP 503 reads as the same package (separators turned, its first letter in capitals). */
export const pep503Variant = (name) =>
  name
    .replace(/[-_.]/g, (c) => ({ "-": ".", _: "-", ".": "_" })[c])
    .replace(/^./, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()));
/** A TOML basic string with its character `at` written `\u00XX` (decoded the same by the tool). */
const escapedAt = (s, at) =>
  `"${[...s].map((c, i) => (i === at ? `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}` : JSON.stringify(c).slice(1, -1))).join("")}"`;

/**
 * How one file's TOML is written: `eq` around "=", the header of an array of tables and of a sub-table, keys quoted,
 * literal strings, a seed for escapes, comments after some values.
 * @param {any} style
 */
function tomlWriter(style) {
  const bare = (k) => /^[A-Za-z0-9_-]+$/.test(k);
  const key = (k) => (style.quoteKeys || !bare(k) ? JSON.stringify(k) : k);
  const str = (s) => (style.literal && !/['\n]/.test(s) ? `'${s}'` : jsonString(s, style.escape ?? 0));
  const comment = (text) => (style.comments && text.length % 3 === 0 ? `${text} # c` : text);
  return {
    key,
    str,
    kv: (k, v) => comment(`${key(k)}${style.eq ?? " = "}${v}`),
    inline: (pairs) => `{ ${pairs.map(([k, v]) => `${k} = ${v}`).join(", ")} }`,
    array: (name) => [`[[${name}]]`, `[[ ${name} ]]`, `[["${name}"]]`, `[[ '${name}' ]]`][(style.header ?? 0) % 4],
    table: (a, b) => [`[${a}.${b}]`, `[${a} . ${b}]`, `["${a}".${b}]`][(style.sub ?? 0) % 3],
  };
}

/** The spellings of a negative uv.lock block (TAINT (E)): read alike by uv, or a form the kit must doubt. */
export const UV_SPELLS = Object.freeze([
  "canonical",
  "[[ package ]]",
  '[["package"]]',
  "quoted keys",
  "escaped name key",
  "escaped name value",
  "literal strings",
  "PEP 503 variant",
  "escaped key in the source",
  "source twice",
  "source key twice (escaped)",
  "dotted source key",
  "[package.source] table",
  "[package . sdist] table",
  "multi-line name",
  "name followed by more",
  "nameless [[package]] before the source",
]);

/** The spellings of a negative poetry.lock block (TAINT (E)). */
export const POETRY_SPELLS = Object.freeze([
  "canonical",
  "[[ package ]]",
  '[["package"]]',
  "quoted keys",
  "escaped name key",
  "escaped name value",
  "literal strings",
  "PEP 503 variant",
  "source inline",
  "source dotted keys",
  "[package . source]",
  '["package".source]',
  "multi-line name",
  "name followed by more",
  "source inline and as a table",
  "source after another array of tables",
  "[package] after [[package]]",
  "nameless [[package]] before the source",
]);

/** The style a spelling (its label: the two lists number them apart) writes one block with, over the file's. */
function spelled(style, label) {
  const s = { ...style, escape: 0 };
  if (label === "[[ package ]]") s.header = 1;
  if (label === '[["package"]]') s.header = 2;
  if (label === "quoted keys") s.quoteKeys = true;
  if (label === "literal strings") s.literal = true;
  return s;
}

/** The `name = …` line of a block in a spelling (its label). */
function nameLine(w, name, label) {
  if (label === "escaped name key") return `"n\\u0061me" = ${w.str(name)}`;
  if (label === "escaped name value") return `${w.key("name")} = ${escapedAt(name, 0)}`;
  if (label === "PEP 503 variant") return w.kv("name", w.str(pep503Variant(name)));
  if (label === "multi-line name") return `${w.key("name")} = """${name}"""`;
  if (label === "name followed by more") return `${w.key("name")} = ${w.str(name)} "x"`;
  return w.kv("name", w.str(name));
}

/** A uv.lock source (its inline table's key and value), the files of the block, by kind. */
function uvParts(kind, name, version, w, style) {
  const pypi = style.registrySlash ? `${HOST.pypi}/` : HOST.pypi;
  const file = (host) => `${host}/ab/cd/${fileName(name)}-${version}.tar.gz`;
  const wheel = `${HOST.pyFiles}/ab/cd/${fileName(name)}-${version}-py3-none-any.whl`;
  const sdist = (host) =>
    w.inline([
      ["url", w.str(file(host))],
      ["hash", w.str("sha256:00")],
      ["size", "1"],
    ]);
  const pub = { source: ["registry", w.str(pypi)], sdist: sdist(HOST.pyFiles), wheels: wheel };
  switch (kind) {
    case PUBLIC:
      return pub;
    case "private":
      return { source: ["registry", w.str(HOST.corpPypi)], sdist: sdist(HOST.corpFiles) };
    case "git":
      return { source: ["git", w.str(`${HOST.corpGit}/corp/${name}?rev=main#${SHA}`)] };
    case "path":
      return { source: ["path", w.str(`../wheels/${fileName(name)}-${version}-py3-none-any.whl`)] };
    case "url":
      return {
        source: ["url", w.str(`${HOST.corpFiles}/${fileName(name)}-${version}.tar.gz`)],
        sdist: w.inline([["hash", w.str("sha256:00")]]),
      };
    case "editable":
      return { source: ["editable", w.str(`packages/${fileName(name)}`)] };
    case "elsewhere":
      return { source: pub.source, sdist: sdist(HOST.corpFiles) };
    default: // "none": no source at all
      return { sdist: pub.sdist, wheels: wheel };
  }
}

/** The lines of one uv.lock `[[package]]` block of `name` at `version`, in `spell`. */
function uvBlock(name, version, kind, deps, style, spell = 0) {
  const w = tomlWriter(spelled(style, UV_SPELLS[spell]));
  const parts = uvParts(kind, name, version, w, style);
  // The key twice: the files on PyPI's host, so that the doubled key alone says where the package came from.
  if (spell === 10) Object.assign(parts, { ...uvParts(PUBLIC, name, version, w, style), source: parts.source });
  const lines = [w.array("package"), nameLine(w, name, UV_SPELLS[spell]), w.kv("version", w.str(version))];
  if (parts.source) {
    const [k, v] = parts.source;
    const ek = escapedAt(k, 1);
    // A header with no name before the source: the source is the nameless block's (uv refuses a block without one).
    if (spell === 16) lines.push("[[package]]");
    if (spell === 8) lines.push(w.kv("source", w.inline([[ek, v]])));
    // The key twice, the second (escaped) PyPI's for a registry: uv refuses it; a reader keeping the last would prove.
    else if (spell === 10)
      lines.push(
        w.kv(
          "source",
          w.inline([
            [k, v],
            [ek, k === "registry" ? w.str(HOST.pypi) : v],
          ]),
        ),
      );
    else if (spell === 11) lines.push(`source.${k} = ${v}`);
    else if (spell !== 12) lines.push(w.kv("source", w.inline([[k, v]])));
    // Source twice, the second PyPI's: uv refuses the key given twice; a reader keeping the last would prove it.
    if (spell === 9) lines.push(w.kv("source", w.inline([["registry", w.str(HOST.pypi)]])));
  }
  if (deps.length) lines.push("dependencies = [", ...deps.map((d) => `    { name = ${w.str(d)} },`), "]");
  if (parts.sdist && spell !== 13) lines.push(w.kv("sdist", parts.sdist));
  if (parts.wheels)
    lines.push(
      ...(style.wheelsOneLine
        ? [
            `wheels = [${w.inline([
              ["url", w.str(parts.wheels)],
              ["hash", w.str("sha256:00")],
            ])}]`,
          ]
        : [
            "wheels = [",
            `    ${w.inline([
              ["url", w.str(parts.wheels)],
              ["hash", w.str("sha256:00")],
            ])},`,
            "]",
          ]),
    );
  if (spell === 12 && parts.source)
    lines.push("", w.table("package", "source"), `${parts.source[0]} = ${parts.source[1]}`);
  if (spell === 13 && parts.sdist)
    lines.push("", "[package . sdist]", `url = ${w.str("https://files.pythonhosted.org/packages/x.tar.gz")}`);
  return lines;
}

/** The project's own block of a uv.lock: its direct dependencies, its dev ones (all tagged "direct"). */
function uvRoot(model, own, w, style) {
  const prod = model.packages.filter((p) => p.direct && !p.dev).map((p) => p.name);
  const dev = model.packages.filter((p) => p.direct && p.dev).map((p) => p.name);
  const names = (list) => list.map((n) => `    { name = ${w.str(n)} },`);
  const lines = [w.array("package"), w.kv("name", w.str(own)), w.kv("version", w.str("0.1.0"))];
  lines.push(w.kv("source", w.inline([[style.virtual ? "virtual" : "editable", w.str(".")]])));
  if (prod.length) lines.push("dependencies = [", ...names(prod), "]");
  if (dev.length) lines.push("", w.table("package", "dev-dependencies"), "dev = [", ...names(dev), "]");
  lines.push("", w.table("package", "metadata"));
  lines.push(
    `requires-dist = [${prod
      .map((n) =>
        w.inline([
          ["name", w.str(n)],
          ["specifier", w.str(">=1.0")],
        ]),
      )
      .join(", ")}]`,
  );
  return lines;
}

/** Blocks in a style's order (uv sorts them by name; any order reads the same). */
const ordered = (blocks, seed) =>
  seed
    ? blocks
        .map((b, i) => [(Math.imul(i + 1, 2654435761) ^ seed) >>> 0, b])
        .sort((a, b) => a[0] - b[0])
        .map(([, b]) => b)
    : blocks;

/** A line that gives a block's `name` (a flipped character there may name another package: L5 keeps off it). */
const NAME_KEY = /^\s*["']?name["']?\s*=/;

/** Adds blocks to a document, a blank line before each, every line tagged with its block's group. */
function addBlocks(d, blocks, style) {
  for (const b of blocks) {
    d.add("");
    if (style.comments) d.add("# block");
    const tag = b.group === "direct" ? { tag: "direct" } : b.group ? { tag: "neg", group: b.group } : null;
    for (const text of b.lines) d.add(text, tag ?? { nameLine: NAME_KEY.test(text) });
  }
}

/** uv.lock: its version lines, the project's block, every instance's block. */
function uvLock(model, style, next, groups) {
  const w = tomlWriter(style);
  const own = model.own[0] ?? "app";
  const blocks = [{ lines: uvRoot(model, own, w, style), group: "direct" }];
  for (const p of model.packages)
    p.instances.forEach((inst, k) => {
      const group = isNegative(inst) ? next() : null;
      if (group) groups.push({ id: group, kind: "neg", eco: "pip", name: p.name, rel: "uv.lock" });
      // A workspace member's dependencies are direct ones (uv): a member block lists none, so that the model says what is.
      const deps = inst.kind === "editable" ? [] : p.deps;
      blocks.push({ lines: uvBlock(p.name, versionOf(k), inst.kind, deps, style, inst.spell ?? 0), group });
    });
  const d = docOf("uv.lock", "toml", { lock: true });
  d.add(w.kv("version", "1"));
  if (style.revision) d.add(w.kv("revision", "2"));
  d.add(w.kv("requires-python", w.str(">=3.11")));
  if (style.manifest) for (const l of ["", "[manifest]", `members = [${w.str(own)}]`]) d.add(l);
  addBlocks(d, ordered(blocks, style.order), style);
  return d.doc;
}

/** A poetry.lock `[package.source]` of a kind (its fields), or null for PyPI's own (no source written). */
function poetrySource(kind, name) {
  switch (kind) {
    case "private":
      return [
        ["type", "legacy"],
        ["url", HOST.corpPypi],
        ["reference", "corp"],
      ];
    case "git":
      return [
        ["type", "git"],
        ["url", `${HOST.corpGit}/corp/${name}.git`],
        ["reference", "main"],
        ["resolved_reference", SHA],
      ];
    case "directory":
      return [
        ["type", "directory"],
        ["url", `../corp-${fileName(name)}`],
      ];
    case "file":
      return [
        ["type", "file"],
        ["url", `../wheels/${fileName(name)}-1.0.0.tar.gz`],
      ];
    case "url":
      return [
        ["type", "url"],
        ["url", `${HOST.corpFiles}/${fileName(name)}-1.0.0.tar.gz`],
      ];
    case "pypi-explicit":
      return [
        ["type", "legacy"],
        ["url", HOST.pypi],
        ["reference", "pypi"],
      ];
    default:
      return null;
  }
}

/** The lines of one poetry.lock `[[package]]` block, in `spell`. */
function poetryBlock(p, version, kind, style, spell = 0) {
  const w = tomlWriter(spelled(style, POETRY_SPELLS[spell]));
  const lines = [w.array("package"), nameLine(w, p.name, POETRY_SPELLS[spell]), w.kv("version", w.str(version))];
  lines.push(w.kv("description", w.str("")), w.kv("optional", "false"), w.kv("python-versions", w.str(">=3.8")));
  if (style.groups) lines.push(w.kv("groups", `[${w.str(p.dev ? "dev" : "main")}]`));
  const file = w.inline([
    ["file", w.str(`${fileName(p.name)}-${version}.tar.gz`)],
    ["hash", w.str("sha256:00")],
  ]);
  lines.push(...(style.filesOneLine ? [`files = [${file}]`] : ["files = [", `    ${file},`, "]"]));
  const source = poetrySource(kind, p.name);
  const inline = source && w.kv("source", w.inline(source.map(([k, v]) => [w.key(k), w.str(v)])));
  // A source both inline and as a table, split so that their fields together read as PyPI's: TOML refuses the table
  // defined twice (so does Poetry); a reader that merged them would prove the name.
  const split = source && spell === 14;
  if (split) lines.push(w.kv("source", w.inline([[w.key("reference"), w.str("corp")]])));
  if (source && spell === 8) lines.push(inline);
  if (source && spell === 9) lines.push(...source.map(([k, v]) => `source.${k} = ${w.str(v)}`));
  if (p.deps.length) lines.push("", w.table("package", "dependencies"), ...p.deps.map((d) => w.kv(d, w.str(">=1.0"))));
  if (spell === 15) lines.push("", "[[package.zz]]", "x = 1");
  if (spell === 16) lines.push("", "[package]", "x = 1");
  // A header with no name before the source: Poetry reads the source as the nameless block's, and refuses that block.
  if (spell === 17) lines.push("", "[[package]]");
  if (source && ![8, 9].includes(spell)) {
    const header =
      spell === 10 ? "[package . source]" : spell === 11 ? '["package".source]' : w.table("package", "source");
    const fields = split
      ? [
          ["type", "legacy"],
          ["url", HOST.pypi],
        ]
      : source;
    lines.push("", header, ...fields.map(([k, v]) => w.kv(k, w.str(v))));
  }
  return lines;
}

/** poetry.lock: Poetry's comment, every instance's block, its `[metadata]`. */
function poetryLock(model, style, next, groups) {
  const w = tomlWriter(style);
  const blocks = [];
  for (const p of model.packages)
    p.instances.forEach((inst, k) => {
      const group = isNegative(inst) ? next() : null;
      if (group) groups.push({ id: group, kind: "neg", eco: "pip", name: p.name, rel: "poetry.lock" });
      blocks.push({ lines: poetryBlock(p, versionOf(k), inst.kind, style, inst.spell ?? 0), group });
    });
  const d = docOf("poetry.lock", "toml", { lock: true });
  if (style.headerComment)
    d.add("# This file is automatically @generated by Poetry 2.1.3 and should not be changed by hand.");
  addBlocks(d, ordered(blocks, style.order), style);
  d.add("");
  for (const l of [
    "[metadata]",
    w.kv("lock-version", w.str("2.1")),
    w.kv("python-versions", w.str("^3.11")),
    w.kv("content-hash", w.str("00")),
  ])
    d.add(l);
  return d.doc;
}

/**
 * pyproject.toml beside the lock: the project's own name, its direct dependencies (PEP 621 for uv; Poetry's tables,
 * or PEP 621 with a style), its dev ones, and the `[tool.uv.sources]` a declaration plants.
 */
function pyproject(model, style, poetry, next, groups) {
  const w = tomlWriter({ ...style, escape: 0, comments: false });
  const d = docOf("pyproject.toml", "toml");
  const own = model.own[0] ?? "app";
  const ownId = next();
  groups.push({ id: ownId, kind: "own", eco: "pip", name: own, rel: "pyproject.toml" });
  const prod = model.packages.filter((p) => p.direct && !p.dev);
  const dev = model.packages.filter((p) => p.direct && p.dev);
  const pep = (list) => ["dependencies = [", ...list.map((p) => `    ${w.str(`${p.name}>=1.0`)},`), "]"];
  const direct = { tag: "direct" };
  if (poetry && !style.pep621) {
    d.add("[tool.poetry]", direct);
    d.add(w.kv("name", w.str(own)), { tag: "own", group: ownId });
    for (const l of [w.kv("version", w.str("0.1.0")), "", "[tool.poetry.dependencies]", w.kv("python", w.str("^3.11"))])
      d.add(l, direct);
    for (const p of prod) d.add(w.kv(p.name, w.str("^1.0")), direct);
  } else {
    d.add("[project]", direct);
    d.add(w.kv("name", w.str(own)), { tag: "own", group: ownId });
    d.add(w.kv("version", w.str("0.1.0")), direct);
    for (const l of pep(prod)) d.add(l, direct);
  }
  if (dev.length && poetry)
    for (const l of ["", "[tool.poetry.group.dev.dependencies]", ...dev.map((p) => w.kv(p.name, w.str("^1.0")))])
      d.add(l, direct);
  else if (dev.length)
    for (const l of ["", "[dependency-groups]", "dev = [", ...dev.map((p) => `    ${w.str(`${p.name}>=1.0`)},`), "]"])
      d.add(l, direct);
  const sources = model.decls.filter((x) => x.kind === "uvSource");
  if (sources.length) {
    d.add("");
    d.add("[tool.uv.sources]", { tag: "decl" });
    for (const s of sources) {
      const id = next();
      groups.push({ id, kind: "decl", eco: "pip", decl: "uvSource", name: s.name, rel: "pyproject.toml" });
      d.add(w.kv(s.name, w.inline([["git", w.str(`${HOST.corpGit}/corp/${s.name}`)]])), { tag: "decl", group: id });
    }
  }
  return d.doc;
}

/** Pipfile and Pipfile.lock (invariants only: Pipenv's mirror is written nowhere, the lock never proves a name). */
function pipfiles(model) {
  const pipfile = docOf("Pipfile", "toml");
  for (const l of ["[[source]]", `url = "${HOST.pypi}"`, "verify_ssl = true", 'name = "pypi"', "", "[packages]"])
    pipfile.add(l);
  for (const p of model.packages.filter((x) => x.direct && !x.dev))
    pipfile.add(`${JSON.stringify(p.name)} = "*"`, { tag: "direct" });
  pipfile.add("");
  pipfile.add("[dev-packages]");
  for (const p of model.packages.filter((x) => x.direct && x.dev))
    pipfile.add(`${JSON.stringify(p.name)} = "*"`, { tag: "direct" });
  const entry = (p, k, inst) => ({
    hashes: ["sha256:00"],
    ...(inst.kind === "private" ? { index: "corp" } : { index: "pypi" }),
    version: `==${versionOf(k)}`,
  });
  const lock = {
    _meta: { "pipfile-spec": 6, sources: [{ name: "pypi", url: HOST.pypi, verify_ssl: true }] },
    default: Object.fromEntries(
      model.packages
        .filter((p) => !p.dev && p.instances.length)
        .map((p) => [p.name.toLowerCase(), entry(p, 0, p.instances[0])]),
    ),
    develop: Object.fromEntries(
      model.packages
        .filter((p) => p.dev && p.instances.length)
        .map((p) => [p.name.toLowerCase(), entry(p, 0, p.instances[0])]),
    ),
  };
  const d = docOf("Pipfile.lock", "json", { lock: true });
  for (const l of jsonLines(lock, { indent: "    " })) d.add(l.text, l);
  return [pipfile.doc, d.doc];
}

/** The neutral rewrites a TOML lock may be written with (R-EQ): each draw stored in the case's style. */
const tomlStyle = (r) => ({
  eq: r.pick([" = ", " = ", "=", "  =  "]),
  header: r.chance(0.4) ? r.int(4) : 0,
  sub: r.chance(0.3) ? r.int(3) : 0,
  quoteKeys: r.chance(0.2),
  literal: r.chance(0.2),
  escape: r.chance(0.3) ? r.u32() || 1 : 0,
  comments: r.chance(0.3),
  order: r.chance(0.5) ? r.u32() || 1 : 0,
});

/** A renderer: pyproject.toml, the lock, the declarations. */
const pyRender = (lock, poetry) => (model, style) => {
  const next = groupIds();
  const groups = [];
  const docs = [
    pyproject(model, style, poetry, next, groups),
    lock(model, style, next, groups),
    ...declarationDocs(model.decls, next, groups),
  ];
  return { docs, groups: withLines(docs, groups) };
};

/** The Python formats under test: their kinds, their neutral styles, their renderers. */
export const PY_FORMATS = Object.freeze({
  uv: {
    id: "uv",
    eco: "pip",
    lock: "uv.lock",
    kinds: { eco: "pip", negative: ["private", "git", "path", "url", "editable", "elsewhere", "none"], neutral: [] },
    spells: UV_SPELLS,
    style: (r) => ({
      ...tomlStyle(r),
      revision: r.chance(0.5),
      manifest: r.chance(0.3),
      virtual: r.chance(0.3),
      wheelsOneLine: r.chance(0.3),
      registrySlash: r.chance(0.2),
    }),
    render: pyRender(uvLock, false),
  },
  poetry: {
    id: "poetry",
    eco: "pip",
    lock: "poetry.lock",
    kinds: { eco: "pip", negative: ["private", "git", "directory", "file", "url"], neutral: ["pypi-explicit"] },
    spells: POETRY_SPELLS,
    style: (r) => ({
      ...tomlStyle(r),
      groups: r.chance(0.6),
      filesOneLine: r.chance(0.3),
      headerComment: r.chance(0.5),
      pep621: r.chance(0.3),
    }),
    render: pyRender(poetryLock, true),
  },
  pipfile: {
    id: "pipfile",
    eco: "pip",
    lock: "Pipfile.lock",
    invariantsOnly: true,
    kinds: { eco: "pip", negative: ["private"], neutral: [] },
    spells: ["canonical"],
    style: () => ({}),
    render: (model) => {
      const docs = pipfiles(model);
      return { docs, groups: [] };
    },
  },
});
