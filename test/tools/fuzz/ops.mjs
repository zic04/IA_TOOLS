// The operators of the property tests of the lock proof (critic's design, §3): each one pure data, every random draw
// taken when the case is generated and stored in the operator — a position as a u32 taken modulo the line count when
// it is applied —, so that a shrunk case still applies its operators and shrinking never draws again.
//   taint, decl  change the model before it is rendered (R-TAINT: plant negative evidence; R-DECL: a declaration)
//   crlf, bom    neutral rewrites of the text (R-EQ; the other neutral rewrites are the case's `style`)
//   L1…L6, wrap  the perturbations R-LE may assert ⊆ on (L5 at most once a stack)
//   reject       a form the lock's tool refuses as a whole (I7, R-REJECT)
//   any-*        anything, for the invariants and I2′ only
import { PUBLIC, cloneModel } from "./model.mjs";
import { BAD_BYTE, cloneDocs } from "./lines.mjs";
import {
  V3_TWINS,
  V1_TWINS,
  ROOT_LINKS,
  LINK_FIELDS,
  ROOT_SPECS,
  YARN_RESOLVED2,
  YARN_TWINS,
} from "./spellings-npm.mjs";
import { UV_SPELLS, POETRY_SPELLS } from "./render-python.mjs";

/** A taint of every negative kind of a format, as a nested instance (spelled canonically). */
const kindTaints = (format) =>
  format.kinds.negative.map((kind) => ({ label: kind, taint: { inst: { kind, depth: 2, spell: 0 } } }));

/**
 * Two axes of a grammar: their product (`full`, soak.mjs), or every production of the first once, the second turning
 * with it (npm test: each production of each axis at least once, within the time of a test file).
 */
const across = (list, second, make, full) =>
  full
    ? list.flatMap((entry, i) => second.map((x) => make(entry, i, x)))
    : list.map((entry, i) => make(entry, i, second[i % second.length]));

/** The npm taints every lock format shares: a direct spec naming a place, an own workspace member of the name. */
const npmCommon = () => [
  ...ROOT_SPECS.map((spec, i) => ({ label: `root spec ${spec("x")}`, taint: { spec: i } })),
  { label: "own workspace member", taint: { own: true } },
];

/**
 * The TAINT grammar of a format (critic's design, §3, the (E) columns): every way of taking a name from elsewhere the
 * kit must read, each a `{ label, taint }` applied to one package of a model. Run exhaustively as single operators.
 * @param {{ id: string, kinds: { negative: readonly string[] } }} format
 * @param {{ full?: boolean }} [o]  full: every pair of the grammar's axes (soak.mjs), not each production once
 * @returns {Array<{ label: string, taint: object }>}
 */
export function taintGrammar(format, { full = false } = {}) {
  switch (format.id) {
    case "npm-v3":
    case "npm-v2":
      return [
        ...kindTaints(format),
        ...across(
          V3_TWINS,
          ["private", "none"],
          ([label], i, kind) => ({
            label: `location twin: ${label} (${kind})`,
            taint: { inst: { kind, depth: 1, twin: i } },
          }),
          full,
        ),
        ...npmCommon(),
      ];
    case "npm-v1":
      return [
        ...kindTaints(format),
        ...across(
          V1_TWINS,
          ["private", "none"],
          ([label], i, kind) => ({
            label: `top-level twin: ${label} (${kind})`,
            taint: { inst: { kind, depth: 1, twin: i } },
          }),
          full,
        ),
        ...across(
          ROOT_LINKS,
          LINK_FIELDS,
          ([label], i, field) => ({
            label: `link to the root: ${field} ${label}`,
            taint: { inst: { kind: "rootLink", depth: 1, spell: i, field } },
          }),
          full,
        ),
        ...npmCommon(),
      ];
    case "yarn":
      return [
        ...kindTaints(format),
        ...YARN_TWINS.map(([label], i) => ({
          label: `folder twin: ${label}`,
          taint: { inst: { kind: "twin", depth: 1, spell: i } },
        })),
        ...across(
          YARN_RESOLVED2,
          // "other" first: the one plain spelling (the first) is then another package's tarball, which only the
          // count of `resolved` keeps back (a private URL would be local anyway).
          ["other", "private"],
          (spelling, i, target) => ({
            label: `second resolved: ${JSON.stringify(spelling)} (${target})`,
            taint: { inst: { kind: "resolved2", depth: 1, spell: i, target } },
          }),
          full,
        ),
        { label: "conflict whose theirs side is private", taint: { inst: { kind: "conflict", depth: 1 } } },
        ...npmCommon(),
      ];
    case "uv":
    case "poetry":
      return spelledTaints(format, full);
    default:
      return [];
  }
}

/** Whether a uv.lock spelling applies to a kind: a source's spellings to a kind with a source, an sdist's to one with files. */
const uvFits = (spell, kind) =>
  !(((spell >= 8 && spell <= 12) || spell === 16) && kind === "none") &&
  !(spell === 13 && !["private", "url", "elsewhere", "none"].includes(kind));

/**
 * The kind a spelling is run with once (npm test) when only one kind makes it bite: an escaped key given twice, the
 * second PyPI's, keeps a name back by its doubt alone for a registry source only.
 */
const BITES_WITH = Object.freeze({ "source key twice (escaped)": "private" });

/** uv.lock and poetry.lock: every kind canonically spelled, then every spelling of a block (with the kinds it fits). */
function spelledTaints(format, full) {
  const spells = format.id === "uv" ? UV_SPELLS : POETRY_SPELLS;
  const fits = format.id === "uv" ? uvFits : () => true;
  const out = full ? [] : kindTaints(format);
  spells.forEach((label, spell) => {
    const kinds = format.kinds.negative.filter((kind) => fits(spell, kind));
    const once = BITES_WITH[label] ?? kinds[spell % kinds.length];
    for (const kind of full ? kinds : spell ? [once] : [])
      out.push({ label: `${kind}, ${label}`, taint: { inst: { kind, depth: 2, spell } } });
  });
  return out;
}

/** Applies a taint to package `pkg` (a u32) of a copy of the model. */
export function applyTaint(model, taint, pkg) {
  const m = cloneModel(model);
  if (!m.packages.length) return m;
  const p = m.packages[pkg % m.packages.length];
  if (taint.own) {
    if (!m.own.includes(p.name)) m.own.push(p.name);
    return m;
  }
  if (taint.spec !== undefined) {
    p.spec = ROOT_SPECS[taint.spec % ROOT_SPECS.length](p.name);
    p.direct = true;
    return m;
  }
  const inst = { ...taint.inst };
  if (inst.kind === "resolved2" || inst.kind === "conflict") {
    // The first public block of the name becomes the negative one (a public one first when it has none).
    let k = p.instances.findIndex((i) => i.kind === PUBLIC);
    if (k < 0) k = p.instances.push({ kind: PUBLIC, depth: 1 }) - 1;
    p.instances[k] = { ...inst, depth: p.instances[k].depth };
    return m;
  }
  // A twin is a second spelling of a folder that exists: the name's own top-level copy first, when it has none.
  if (inst.twin !== undefined && !p.instances.some((i) => i.depth === 1 && i.twin === undefined))
    p.instances.unshift({ kind: PUBLIC, depth: 1 });
  p.instances.push(inst);
  return m;
}

/** The declarations of R-DECL, one canonical spelling each (lines.mjs declarationDocs, render-python.mjs). */
export const DECLS = Object.freeze({ npm: ["npmAll", "npmScope"], pip: ["pipAll", "uvSource"] });

/** Applies a declaration to a copy of the model (`uvSource` names package `pkg`). */
export function applyDecl(model, kind, pkg) {
  const m = cloneModel(model);
  const p = m.packages[pkg % Math.max(m.packages.length, 1)];
  m.decls.push(kind === "uvSource" ? { kind, name: p?.name ?? "corp_lib" } : { kind });
  return m;
}

/** The model of a case once its model operators are applied (taint, decl), in their order. */
export function modelOf(c) {
  let m = c.model;
  for (const op of c.ops)
    if (op.op === "taint") m = applyTaint(m, op.taint, op.pkg);
    else if (op.op === "decl") m = applyDecl(m, op.kind, op.pkg);
  return m;
}

// ─── Text operators ─────────────────────────────────────────────────────────────────────────────────────────────

const isProtected = (l) => l?.tag != null;
const spanKey = (l) => l.group ?? l.tag;
/** Whether the boundary before line `i` falls strictly inside a protected span (between two of its lines). */
const insideSpan = (lines, i) =>
  i > 0 &&
  i < lines.length &&
  isProtected(lines[i - 1]) &&
  isProtected(lines[i]) &&
  spanKey(lines[i - 1]) === spanKey(lines[i]);
const TRIPLE = /"""|'''/;
/** The characters L5 and any-flip put in a line: TOML's, JSON's and Yarn's own tokens, and plain ones. */
const FLIPS = Object.freeze([
  '"',
  "'",
  "#",
  "[",
  "]",
  "{",
  "}",
  "=",
  ",",
  "\\",
  ".",
  ":",
  "@",
  "/",
  " ",
  "\t",
  "a",
  "0",
  "-",
]);

/** The comment line, the fresh unknown key, of a file's kind. */
const comment = (doc) => (doc.kind === "json" ? "// zz-fuzz" : "# zz-fuzz");
function unknownKey(doc, k, next) {
  if (doc.kind === "json") return `${(next?.text.match(/^\s*/) ?? [""])[0]}"zz-fuzz-${k}": 1,`;
  if (doc.kind === "yarn") return '  zzfuzz "1"';
  if (doc.kind === "yaml") return `zz-fuzz-${k}: 1`;
  return `zz-fuzz-${k} = 1`;
}

/**
 * The doc an operator works on: the lock for `target: "lock"` (and every rejection), one of the other files for
 * `target: "manifest"`, else `file` (a u32) picks the lock twice as often as any other file.
 */
export function pickDoc(docs, op) {
  const lock = docs.find((d) => d.lock) ?? docs[0];
  if (op.op === "reject" || op.target === "lock") return lock;
  const others = docs.filter((d) => !d.lock);
  if (op.target === "manifest") return others.length ? others[(op.file ?? 0) % others.length] : null;
  const i = (op.file ?? 0) % (docs.length + 2);
  return i < docs.length ? docs[i] : lock;
}

const newLine = (id, text) => ({ id, text, tag: null });

/** The k-th element (a u32) of the indexes of `list` that `ok` keeps, or -1. */
function nth(list, ok, k) {
  const keep = [];
  list.forEach((x, i) => ok(x, i) && keep.push(i));
  return keep.length ? keep[k % keep.length] : -1;
}

const MARKERS = Object.freeze(["<<<<<<< ours", "=======", ">>>>>>> theirs"]);

/** Inserts `text` at the boundary `at` (a u32) of a doc, or wraps lines a…b between two inserted lines. */
const insert = (lines, at, line) => lines.splice(at % (lines.length + 1), 0, line);
function wrapSpan(lines, op, id, open, close) {
  const a = op.at % (lines.length + 1);
  const b = Math.min(lines.length, a + 1 + (op.len % 6));
  lines.splice(b, 0, ...close.map((t, j) => newLine(id(j + 1), t)));
  lines.splice(a, 0, newLine(id(0), open));
}

/** Cuts a doc at line `i` (its column `col`, a u32), the lines after it dropped and no line end at the end. */
function cut(doc, i, col) {
  const t = doc.lines[i].text;
  doc.lines[i] = { ...doc.lines[i], text: t.slice(0, col % (t.length + 1)) };
  doc.lines.length = i + 1;
  doc.trailing = false;
}

/** Substitutes one character (L5: outside the protected spans, and off a TOML block's `name`; any-flip: anywhere). */
function flip(doc, op, any) {
  const lines = doc.lines;
  const ok = (l) => l.text.length > 0 && (any || (!isProtected(l) && !(doc.kind === "toml" && l.nameLine)));
  const i = nth(lines, ok, op.at);
  if (i < 0) return;
  const t = lines[i].text;
  const col = op.col % t.length;
  lines[i] = { ...lines[i], text: t.slice(0, col) + FLIPS[op.ch % FLIPS.length] + t.slice(col + 1) };
}

/** The text operators, by name: each `(doc, op, id)` changes `doc` in place (`id(j)`: the id of a line it adds). */
const TEXT_OPS = Object.freeze({
  crlf: (doc) => void (doc.eol = "\r\n"),
  bom: (doc) => void (doc.kind === "json" && (doc.bom = true)),
  L1: (doc, op, id) => insert(doc.lines, op.at, newLine(id(), comment(doc))),
  // A conflict marker alone (one draw in three), or a span wrapped as git leaves a conflict.
  L2: (doc, op, id) =>
    op.len % 3 === 0
      ? insert(doc.lines, op.at, newLine(id(), MARKERS[Math.floor(op.len / 3) % 3]))
      : wrapSpan(doc.lines, op, id, MARKERS[0], [MARKERS[1], MARKERS[2]]),
  // TOML only: a span wrapped in an array (`zz = [` … `]`), which no TOML value holds unless it is values.
  wrap: (doc, op, id) => doc.kind === "toml" && wrapSpan(doc.lines, op, id, "zz-fuzz-wrap = [", ["]"]),
  L3(doc, op, id) {
    const i = nth(doc.lines, (l) => !isProtected(l) && !TRIPLE.test(l.text), op.at);
    if (i >= 0) doc.lines.splice(i + 1, 0, newLine(id(), doc.lines[i].text));
  },
  L4(doc, op, id) {
    const lines = doc.lines;
    // In JSON, only before a property that follows an opening brace or a comma: the text stays JSON.
    const json = (i) => /^\s*"/.test(lines[i]?.text ?? "") && /[{,]$/.test(lines[i - 1]?.text ?? "");
    const i = nth([...lines, null], (_, j) => !insideSpan(lines, j) && (doc.kind !== "json" || json(j)), op.at);
    if (i >= 0) lines.splice(i, 0, newLine(id(), unknownKey(doc, op.at % 1000, lines[i])));
  },
  L5: (doc, op) => flip(doc, op, false),
  "any-flip": (doc, op) => flip(doc, op, true),
  L6(doc, op) {
    let last = -1;
    doc.lines.forEach((l, i) => isProtected(l) && (last = i));
    if (last + 1 < doc.lines.length) cut(doc, last + 1 + (op.at % (doc.lines.length - last - 1)), op.col);
  },
  "any-cut": (doc, op) => doc.lines.length && cut(doc, op.at % doc.lines.length, op.col),
  "any-delete": (doc, op) => doc.lines.length && doc.lines.splice(op.at % doc.lines.length, 1),
  "any-dup"(doc, op, id) {
    if (!doc.lines.length) return;
    const i = op.at % doc.lines.length;
    doc.lines.splice(i + 1, 0, newLine(id(), doc.lines[i].text));
  },
  reject: (doc, op, id) => applyReject(doc, op, id),
});

/** One text operator applied to `docs` (changed in place); `n`: its index in the stack (ids of the lines it adds). */
function applyText(docs, op, n) {
  const doc = pickDoc(docs, op);
  if (doc) TEXT_OPS[op.op]?.(doc, op, (j = 0) => `op${n}.${j}`);
}

/**
 * TOML errors the tool refuses, in TOML 1.0 and 1.1 alike (critic's design, §3 "TOML error catalogue (E)"): each the
 * lines inserted at one place of the lock.
 */
export const TOML_ERRORS = Object.freeze([
  ["unterminated string", ['zz-fuzz = "abc']],
  ["unknown escape", ['zz-fuzz = "a\\qb"']],
  ["key without a value", ["zz-fuzz ="]],
  ["bare key with a space", ["zz fuzz = 1"]],
  ["key twice", ["zz-fuzz = 1", "zz-fuzz = 2"]],
  ["table twice", ["[zz-fuzz]", "[zz-fuzz]"]],
  ["table over an array of tables", ["[[zz-fuzz]]", "[zz-fuzz]"]],
  ["array of tables over a table", ["[zz-fuzz]", "[[zz-fuzz]]"]],
  ["junk after a header", ["[zz-fuzz] x"]],
  ["value followed by more", ['zz-fuzz = "a" b']],
  ["closing bracket never opened", ["zz-fuzz = 1]"]],
  ["array content that is no value", ["zz-fuzz = [foo]"]],
  ["raw control character", ['zz-fuzz = "a\u0001b"']],
  ["lone CR", ['zz-fuzz = "a\rb"']],
  ["unknown escape in a quoted key", ['"zz\\qfuzz" = 1']],
]);

/** JSON npm refuses (JSON.parse does): each the line inserted before a property, or the text cut. */
export const JSON_ERRORS = Object.freeze([
  ["a comment", (indent) => `${indent}// zz-fuzz`],
  ["a single-quoted key", (indent) => `${indent}'zz-fuzz': 1,`],
  ["an unquoted key", (indent) => `${indent}zz-fuzz: 1,`],
  ["NaN", (indent) => `${indent}"zz-fuzz": NaN,`],
  ["a trailing comma", null],
  ["the text cut", null],
]);

/** A `packages` npm cannot read as a map (I7): written last, so that JSON.parse keeps it. */
export const PACKAGES_VALUES = Object.freeze(["true", '"x"', "1", "[]"]);

/** The catalogue of a format's rejections (I7): `what` of a `reject` operator, with a label. */
export function rejectCatalogue(format) {
  const utf16 = ["utf16le", "utf16be"].map((what) => ({ label: `UTF-16 (${what})`, what }));
  if (format.lock === "uv.lock" || format.lock === "poetry.lock")
    return [
      ...utf16,
      { label: "not valid UTF-8", what: "bad-utf8" },
      ...TOML_ERRORS.map(([label], i) => ({ label: `TOML: ${label}`, what: `toml:${i}` })),
    ];
  if (format.lock === "package-lock.json")
    return [
      ...utf16,
      ...JSON_ERRORS.map(([label], i) => ({ label: `JSON: ${label}`, what: `json:${i}` })),
      ...PACKAGES_VALUES.map((v) => ({ label: `packages: ${v}`, what: `packages:${v}` })),
    ];
  if (format.id === "yarn")
    return [
      ...utf16,
      { label: "a quote left open", what: "yarn:quote" },
      { label: "a backslash", what: "yarn:backslash" },
    ];
  return utf16;
}

/** A rejection applied to the lock (`doc`): its encoding, an inserted error, a line changed. */
function applyReject(doc, op, id) {
  const lines = doc.lines;
  const [kind, arg] = [op.what.slice(0, op.what.indexOf(":") >>> 0), op.what.slice(op.what.indexOf(":") + 1)];
  if (op.what === "utf16le" || op.what === "utf16be") doc.encoding = op.what;
  else if (op.what === "bad-utf8") {
    const i = op.at % Math.max(lines.length, 1);
    if (lines[i]) lines[i] = { ...lines[i], text: BAD_BYTE + lines[i].text };
  } else if (kind === "toml") {
    const at = op.at % (lines.length + 1);
    lines.splice(at, 0, ...TOML_ERRORS[Number(arg)][1].map((t, j) => newLine(id(j), t)));
  } else if (kind === "json") rejectJson(lines, Number(arg), op.at, id);
  else if (kind === "packages") {
    // The last property of the root object gets a comma, then `"packages": <value>` closes it.
    const close = lines.length - 1;
    if (close < 1) return;
    lines[close - 1] = { ...lines[close - 1], text: `${lines[close - 1].text},` };
    lines.splice(close, 0, newLine(id(), `${(lines[1].text.match(/^\s*/) ?? [""])[0]}"packages": ${arg}`));
  } else if (kind === "yarn") {
    // Yarn's tokenizer skips a comment: the quote or backslash goes on a line it reads.
    const i = nth(lines, (l) => l.text.trim() !== "" && !l.text.trim().startsWith("#"), op.at);
    if (i >= 0) lines[i] = { ...lines[i], text: lines[i].text + (arg === "quote" ? '"' : "\\") };
  }
}

/** A JSON error of JSON_ERRORS put in the lock's lines. */
function rejectJson(lines, which, at, id) {
  if (which === 4) {
    // A trailing comma: after the last property of an object, before its `}`.
    const i = nth(lines, (l, j) => j > 0 && /^\s*[}\]],?$/.test(l.text) && !/[{[,]$/.test(lines[j - 1].text), at);
    if (i > 0) lines[i - 1] = { ...lines[i - 1], text: `${lines[i - 1].text},` };
    return;
  }
  if (which === 5) {
    lines.length = Math.max(1, Math.floor(lines.length / 2));
    return;
  }
  const i = nth(lines, (l, j) => j > 0 && /^\s*"/.test(l.text) && /[{,]$/.test(lines[j - 1].text), at);
  if (i > 0) lines.splice(i, 0, newLine(id(), JSON_ERRORS[which][1]((lines[i].text.match(/^\s*/) ?? [""])[0])));
}

/** The docs of a case once its text operators are applied (a copy: the rendering is never changed). */
export function applyTextOps(docs, ops) {
  const out = cloneDocs(docs);
  ops.forEach((op, n) => {
    if (op.op !== "taint" && op.op !== "decl") applyText(out, op, n);
  });
  return out;
}

// ─── Drawing operators ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * A perturbation of R-LE drawn from `r`: L1–L6 (and a TOML array wrap); `flip` false keeps L5 out (once a stack);
 * `target`: "lock", "manifest", or any file.
 */
export function drawLe(r, { flip = true, toml = false, target } = {}) {
  const kinds = ["L1", "L2", "L3", "L4", "L6", ...(flip ? ["L5"] : []), ...(toml ? ["wrap"] : [])];
  const op = r.pick(kinds);
  return { op, file: r.u32(), at: r.u32(), len: r.u32(), col: r.u32(), ch: r.u32(), ...(target ? { target } : {}) };
}

/** A stack of 1 to `max` perturbations, L5 at most once (critic's design, R-LE composition limits). */
export function drawLeStack(r, max, toml, target) {
  const ops = [];
  const n = 1 + r.int(max);
  for (let i = 0; i < n; i++) ops.push(drawLe(r, { flip: !ops.some((o) => o.op === "L5"), toml, target }));
  return ops;
}

/** Any text operator, for the invariants and I2′: the perturbations, and edits anywhere. */
export function drawAny(r, toml) {
  if (r.chance(0.5)) return drawLe(r, { toml });
  return {
    op: r.pick(["any-flip", "any-delete", "any-dup", "any-cut"]),
    file: r.u32(),
    at: r.u32(),
    col: r.u32(),
    ch: r.u32(),
  };
}

/** A taint of a format's grammar, on a package drawn from `r`. */
export const drawTaint = (r, grammar) => ({ op: "taint", taint: r.pick(grammar).taint, pkg: r.u32() });

/** A rejection of a format's catalogue, at a place drawn from `r`. */
export const drawReject = (r, catalogue) => ({ op: "reject", what: r.pick(catalogue).what, file: 0, at: r.u32() });
