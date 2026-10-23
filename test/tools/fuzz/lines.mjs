// The files of a generated case as tagged lines (test/tools/fuzz/): what the renderers write, what the operators
// change, what the oracles read. Every line keeps an id and a tag — "neg" (negative evidence of one group), "direct"
// (a list of direct dependencies), "decl" (a private declaration), "own" (an own name), or null — so that the
// oracle knows, after any stack of operators, whether a planted piece of evidence is still there byte for byte.
import { fmix32 } from "./prng.mjs";

/**
 * @typedef {null|"neg"|"direct"|"decl"|"own"} Tag
 * @typedef {{ id: string, text: string, tag: Tag, group?: string, nameLine?: boolean }} Line
 * @typedef {{ rel: string, kind: "json"|"toml"|"yarn"|"yaml"|"ini"|"text", lock: boolean, lines: Line[],
 *   eol: string, bom: boolean, encoding: "utf8"|"utf16le"|"utf16be", trailing: boolean }} Doc
 *   rel: the path below the folder of the lock; lock: the file whose proof is under test
 * @typedef {{ path: Array<string|number>, field: string, equals?: unknown, missing?: boolean, falsy?: boolean }} Witness
 *   what JSON.parse must still find for a JSON group to be intact: `path` from the root, then `field` equal to
 *   `equals`, or missing, or falsy (critic's design, "intactness": the tool's own parser as the witness)
 * @typedef {{ id: string, kind: "neg"|"decl"|"own", eco: "npm"|"pip", name?: string, decl?: string, rel: string,
 *   lines: Array<[string, string]>, witness?: Witness[] }} Group
 *   lines: [id, text] of every line tagged with the group, as rendered
 * @typedef {{ docs: Doc[], groups: Group[] }} Rendering
 */

/** The character that stands for a byte 0xFF in a line (a lock that is not valid UTF-8): replaced when written. */
export const BAD_BYTE = "";

/**
 * A new file being rendered: `add(text, tag)` appends a line; `doc` is the file.
 * @param {string} rel
 * @param {Doc["kind"]} kind
 * @param {{ lock?: boolean }} [o]
 */
export function docOf(rel, kind, { lock = false } = {}) {
  /** @type {Doc} */
  const doc = { rel, kind, lock, lines: [], eol: "\n", bom: false, encoding: "utf8", trailing: true };
  return {
    doc,
    /** @param {string} text @param {{ tag?: Tag, group?: string, nameLine?: boolean }} [t] */
    add(text, t = {}) {
      doc.lines.push({
        id: `${rel}:${doc.lines.length}`,
        text,
        tag: t.tag ?? null,
        ...(t.group ? { group: t.group } : {}),
        ...(t.nameLine ? { nameLine: true } : {}),
      });
    },
  };
}

/** The groups of a rendering, each with the lines tagged with it (their id and text as rendered). */
export function withLines(docs, groups) {
  return groups.map((g) => {
    const doc = docs.find((d) => d.rel === g.rel);
    const lines = (doc?.lines ?? [])
      .filter((l) => l.group === g.id)
      .map((l) => /** @type {[string, string]} */ ([l.id, l.text]));
    return { ...g, lines };
  });
}

/**
 * A string as JSON writes it, one letter of it written `\u00XX` when `seed` says so (the same string, to JSON.parse:
 * an equal rewrite). `seed` 0: JSON.stringify's own form.
 * @param {string} s
 * @param {number} seed
 */
export function jsonString(s, seed) {
  if (!seed) return JSON.stringify(s);
  let h = fmix32(seed);
  for (let i = 0; i < s.length; i++) h = fmix32(h ^ s.charCodeAt(i));
  const letters = [...s].map((c, i) => (/[a-z]/i.test(c) ? i : -1)).filter((i) => i >= 0);
  if (h % 3 !== 0 || !letters.length) return JSON.stringify(s);
  const at = letters[h % letters.length];
  return `"${[...s].map((c, i) => (i === at ? `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}` : JSON.stringify(c).slice(1, -1))).join("")}"`;
}

/**
 * A JSON value as the lines JSON.stringify(value, null, indent) writes, each line tagged by the nearest tagged path
 * above it (`tagOf(path)`): an entry of a lock and every line inside it carry its group. `escape`: a seed for
 * jsonString (0: none).
 * @param {unknown} value
 * @param {{ indent?: string, escape?: number, tagOf?: (path: Array<string|number>) => ({ tag: Tag, group?: string }|null) }} [o]
 * @returns {Array<{ text: string, tag: Tag, group?: string }>}
 */
export function jsonLines(value, { indent = "  ", escape = 0, tagOf = () => null } = {}) {
  const out = [];
  const str = (s) => jsonString(s, escape);
  const walk = (v, prefix, depth, path, inherited, comma) => {
    const t = tagOf(path) ?? inherited;
    const pad = indent.repeat(depth);
    const emit = (text) => out.push({ text, tag: t?.tag ?? null, ...(t?.group ? { group: t.group } : {}) });
    if (v === null || typeof v !== "object") {
      emit(`${pad}${prefix}${typeof v === "string" ? str(v) : JSON.stringify(v)}${comma}`);
      return;
    }
    const entries = Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v);
    const [open, close] = Array.isArray(v) ? ["[", "]"] : ["{", "}"];
    if (!entries.length) {
      emit(`${pad}${prefix}${open}${close}${comma}`);
      return;
    }
    emit(`${pad}${prefix}${open}`);
    entries.forEach(([k, x], i) =>
      walk(
        x,
        Array.isArray(v) ? "" : `${str(String(k))}: `,
        depth + 1,
        [...path, k],
        t,
        i < entries.length - 1 ? "," : "",
      ),
    );
    out.push({ text: `${pad}${close}${comma}`, tag: t?.tag ?? null, ...(t?.group ? { group: t.group } : {}) });
  };
  walk(value, "", 0, [], null, "");
  return out;
}

/** An object whose keys, at every level, are in the order `seed` draws (0: as given). Arrays keep their order. */
export function shuffled(value, seed) {
  if (!seed || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v, i) => shuffled(v, fmix32(seed + i)));
  const keys = Object.keys(value);
  const order = keys.map((k, i) => {
    let h = seed;
    for (let j = 0; j < k.length; j++) h = fmix32(h ^ k.charCodeAt(j));
    return [fmix32(h + i), k];
  });
  order.sort((a, b) => a[0] - b[0]);
  return Object.fromEntries(order.map(([, k]) => [k, shuffled(value[k], fmix32(seed ^ k.length))]));
}

/** The text of a file, before its encoding: its lines joined by its line end (the BAD_BYTE marks kept). */
export const logicalText = (doc) => doc.lines.map((l) => l.text).join(doc.eol) + (doc.trailing ? doc.eol : "");

/** The bytes of a file as written: its byte order mark, its encoding, a BAD_BYTE written as 0xFF. */
export function toBytes(doc) {
  const text = (doc.bom ? "﻿" : "") + logicalText(doc);
  if (doc.encoding === "utf16le") return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
  if (doc.encoding === "utf16be")
    return Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(text, "utf16le").swap16()]);
  const parts = text.split(BAD_BYTE);
  return Buffer.concat(
    parts.flatMap((p, i) => (i ? [Buffer.from([0xff]), Buffer.from(p, "utf8")] : [Buffer.from(p, "utf8")])),
  );
}

/** A deep copy of a rendering's files (the operators change copies). */
export const cloneDocs = (docs) => docs.map((d) => ({ ...d, lines: d.lines.map((l) => ({ ...l })) }));

/** A source of group ids, unique in one rendering. */
export function groupIds() {
  let n = 0;
  return () => `g${n++}`;
}

/**
 * The private declarations of a model (R-DECL), one canonical spelling per kind, each line its own group: an .npmrc
 * that replaces npm's registry (`npmAll`) or gives the `@corp` scope its own (`npmScope`), a pip.conf naming a
 * company index (`pipAll`). `[tool.uv.sources]` lives in a pyproject.toml (render-python.mjs).
 * @param {Array<{ kind: string }>} decls
 * @param {() => string} next
 * @param {Group[]} groups
 * @returns {Doc[]}
 */
export function declarationDocs(decls, next, groups) {
  const docs = [];
  const file = (rel, kind, eco, entries) => {
    if (!entries.length) return;
    const d = docOf(rel, "ini");
    for (const { text, decl } of entries) {
      const id = next();
      groups.push({ id, kind: "decl", eco, decl, rel });
      for (const line of text) d.add(line, { tag: "decl", group: id });
    }
    docs.push(d.doc);
  };
  const npm = [];
  const pip = [];
  for (const { kind } of decls)
    if (kind === "npmAll") npm.push({ text: ["registry=https://npm.corp.internal/"], decl: kind });
    else if (kind === "npmScope") npm.push({ text: ["@corp:registry=https://npm.corp.internal/"], decl: kind });
    else if (kind === "pipAll")
      pip.push({ text: ["[global]", "index-url = https://pypi.corp.internal/simple"], decl: kind });
  file(".npmrc", "ini", "npm", npm);
  file("pip.conf", "ini", "pip", pip);
  return docs;
}
