// Fields, their checks and the lists of values (ARCHITECTURE.md §6.9, source `behaviours`): what a form asks and
// accepts, and what a list offers — zod schemas, pydantic models, Django forms and DRF serializers, the HTML of a form
// (required, minlength, maxlength, pattern, type, <select> options), TypeScript unions and enums, Python enums and
// Django choices. A method chain (z.string().min(1).max(80).optional()) is read by a linear walk, never by a nested
// expression; every expression is bounded (RULES.md S5, test/tools/redos-worker.mjs).
import { callArguments } from "./behaviour-common.mjs";

const ID = "[A-Za-z_$][\\w$]{0,63}";

/** The expressions of this module, by name (the ReDoS test runs each of them). */
export const SCHEMA_PATTERNS = Object.freeze({
  zodField: new RegExp(
    `\\b(${ID})\\s*:\\s*z\\s*\\.\\s*(string|number|boolean|date|bigint|enum|nativeEnum|array|literal|email|coerce\\s*\\.\\s*\\w{1,12})\\s*\\(`,
    "g",
  ),
  zodEnum: new RegExp(`\\b(?:const|let|var)\\s+(${ID})\\s*=\\s*z\\s*\\.\\s*enum\\(\\s*\\[([^\\]]{0,600})\\]`, "g"),
  pyClass: /^class\s+(\w{1,64})\s*\(([^)\n]{0,200})\)\s*:/gm,
  pyFormField: /^[ \t]+(\w{1,64})\s*=\s*(?:forms|serializers)\.(\w{1,40}Field)\(/,
  pyEnumMember: /^[ \t]+([A-Za-z_]\w{0,63})\s*=\s*(?:["']([^"'\n]{1,40})["']|(\d{1,6}))/,
  djangoChoices: /\bchoices\s*=\s*[[(]/g,
  choicePair: /\(\s*["']([^"'\n]{1,40})["']\s*,\s*(?:_\(\s*)?["']([^"'\n]{1,40})["']/g,
  tsUnion: new RegExp(`\\btype\\s+(${ID})\\s*=\\s*(?=(?:\\|\\s*)?["'])`, "g"),
  tsEnum: new RegExp(`\\benum\\s+(${ID})\\s*\\{`, "g"),
  htmlField: /<(input|textarea|select)\b/gi,
  htmlOption: /<option\b([^<>]{0,200})>([^<]{0,60})<\/option>/gi,
  htmlAttribute: /([A-Za-z][\w:-]{0,30})(?:\s*=\s*(?:"([^"]{0,200})"|'([^']{0,200})'|\{([^{}]{0,200})\}))?/g,
  quoted: /["'`]([^"'`\n]{1,40})["'`]/g,
  keyword: /\b(min_length|max_length|ge|le|gt|lt|pattern|regex|default)\s*=\s*([^,()\n]{1,60})/g,
});

/** The quoted strings of a text ("Open", 'Shipped'). */
const quotedIn = (text) => [...text.matchAll(SCHEMA_PATTERNS.quoted)].map((m) => m[1]);

/** The methods of a chain that starts at `i` (".min(1).max(80)…"): [{ name, args }], 12 at most, by a linear walk. */
function chainAt(text, i) {
  const calls = [];
  let k = i;
  while (calls.length < 12) {
    while (k < text.length && (text[k] === " " || text[k] === "\n" || text[k] === "\t" || text[k] === "\r")) k++;
    if (text[k] !== ".") break;
    k++;
    let name = "";
    while (k < text.length && /\w/.test(text[k]) && name.length < 24) name += text[k++];
    if (!name || text[k] !== "(") break;
    const args = callArguments(text, k, 600);
    calls.push({ name, args });
    k += args.length + 2;
  }
  return calls;
}

/** A number written as an argument (min(3), max_length=80), or undefined. */
const numberIn = (s) => {
  const m = /^\s*(\d{1,9})\b/.exec(s);
  return m ? Number(m[1]) : undefined;
};

/** zod: each field of an object schema, its checks; an enum's values. */
function zod(text, sink) {
  const P = SCHEMA_PATTERNS;
  const push = sink.push;
  P.zodField.lastIndex = 0;
  for (const m of text.matchAll(P.zodField)) {
    if (sink.full) return;
    const field = m[1];
    const open = m.index + m[0].length - 1;
    const typeArgs = callArguments(text, open, 600);
    const kind = m[2].replace(/\s+/g, "");
    const at = m.index;
    if (kind === "enum") push({ family: "values", signal: "enum", field, values: quotedIn(typeArgs), via: "zod" }, at);
    if (kind === "email") push({ family: "validation", signal: "email", field, via: "zod" }, at);
    let optional = false;
    for (const c of chainAt(text, open + typeArgs.length + 2)) {
      const n = numberIn(c.args);
      if (c.name === "min" || c.name === "max" || c.name === "length")
        push({ family: "validation", signal: c.name, field, value: n, via: "zod" }, at);
      else if (c.name === "nonempty") push({ family: "validation", signal: "min", field, value: 1, via: "zod" }, at);
      else if (c.name === "email" || c.name === "url" || c.name === "uuid")
        push({ family: "validation", signal: c.name, field, via: "zod" }, at);
      else if (c.name === "regex") push({ family: "validation", signal: "pattern", field, via: "zod" }, at);
      else if (c.name === "int" || c.name === "positive" || c.name === "nonnegative")
        push({ family: "validation", signal: c.name === "int" ? "integer" : "positive", field, via: "zod" }, at);
      else if (c.name === "optional" || c.name === "nullable" || c.name === "nullish") optional = true;
      else if (c.name === "default") {
        optional = true;
        const value = quotedIn(c.args)[0] ?? numberIn(c.args);
        push({ family: "validation", signal: "default", field, value, via: "zod" }, at);
      }
    }
    push({ family: "validation", signal: optional ? "optional" : "required", field, via: "zod" }, at);
  }
  P.zodEnum.lastIndex = 0;
  for (const m of text.matchAll(P.zodEnum))
    push({ family: "values", signal: "enum", field: m[1], values: quotedIn(m[2]), via: "zod" }, m.index);
}

/** The lines of a Python class body after `index` (its header), up to the first line that is not indented. */
function* classBody(text, index) {
  let start = text.indexOf("\n", index) + 1;
  for (let n = 0; start > 0 && start < text.length && n < 300; n++) {
    const end = text.indexOf("\n", start);
    const line = text.slice(start, end === -1 ? text.length : end);
    if (line.trim() && !/^[ \t]/.test(line)) return;
    yield { line, index: start };
    if (end === -1) return;
    start = end + 1;
  }
}

/**
 * A field line of a pydantic model ("    name: Type = default"), read by hand — the type up to an "=" outside brackets
 * and strings —, as [line, name, type, rest]; null for any other line (a method, model_config = …).
 */
function pyFieldOf(line) {
  let i = 0;
  while (i < line.length && (line[i] === " " || line[i] === "\t")) i++;
  if (i === 0) return null;
  const start = i;
  while (i < line.length && i - start < 64 && /\w/.test(line[i])) i++;
  const name = line.slice(start, i);
  if (!name || /^\d/.test(name)) return null;
  while (line[i] === " " || line[i] === "\t") i++;
  if (line[i] !== ":") return null;
  const eq = topLevelEquals(line, i + 1);
  const type = (eq === -1 ? line.slice(i + 1) : line.slice(i + 1, eq)).trim().slice(0, 400);
  if (!type) return null;
  return [
    line,
    name,
    type,
    eq === -1
      ? ""
      : line
          .slice(eq + 1)
          .trim()
          .slice(0, 400),
  ];
}

/** The index of the first "=" of a line after `from` outside brackets and strings, or -1. */
function topLevelEquals(line, from) {
  let depth = 0;
  let quote = null;
  for (let k = from; k < line.length; k++) {
    const ch = line[k];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === "=" && depth === 0) return k;
  }
  return -1;
}

/** One field of a pydantic model: optional or required, its type's checks, those of `Field(…)`. */
function pydanticField(m, push, at) {
  const [, field, type, rest = ""] = m;
  const optional = /Optional\[|\|\s*None\b|\bNone\s*\|/.test(type);
  const via = "pydantic";
  if (/\bEmailStr\b/.test(type)) push({ family: "validation", signal: "email", field, via }, at);
  if (/\b(?:Http|Any)Url\b/.test(type)) push({ family: "validation", signal: "url", field, via }, at);
  const literal = /\bLiteral\[([^\]]{1,400})\]/.exec(type);
  if (literal) push({ family: "values", signal: "enum", field, values: quotedIn(literal[1]), via }, at);
  let hasDefault = !!rest.trim();
  const KEY = { min_length: "min", max_length: "max", ge: "min", gt: "min", le: "max", lt: "max" };
  for (const part of [type, rest]) {
    SCHEMA_PATTERNS.keyword.lastIndex = 0;
    for (const k of part.matchAll(SCHEMA_PATTERNS.keyword)) {
      if (k[1] in KEY) push({ family: "validation", signal: KEY[k[1]], field, value: numberIn(k[2]), via }, at);
      else if (k[1] === "pattern" || k[1] === "regex")
        push({ family: "validation", signal: "pattern", field, via }, at);
      else
        push({ family: "validation", signal: "default", field, value: quotedIn(k[2])[0] ?? numberIn(k[2]), via }, at);
    }
  }
  // Field(...): the ellipsis as first argument means required.
  if (/^\s*Field\(\s*\.\.\./.test(rest)) hasDefault = false;
  push({ family: "validation", signal: optional || hasDefault ? "optional" : "required", field, via }, at);
}

/** pydantic models, Django forms and DRF serializers, Python enums. */
function python(text, sink) {
  const P = SCHEMA_PATTERNS;
  const push = sink.push;
  P.pyClass.lastIndex = 0;
  for (const m of text.matchAll(P.pyClass)) {
    if (sink.full) return;
    const bases = m[2];
    const isEnum = /\b(?:Enum|IntEnum|StrEnum|TextChoices|IntegerChoices)\b/.test(bases);
    const isModel = /\b(?:BaseModel|SQLModel|Schema|ModelSchema)\b/.test(bases);
    const isForm = /\b(?:Form|ModelForm|Serializer|ModelSerializer)\b/.test(bases);
    if (!isEnum && !isModel && !isForm) continue;
    const values = [];
    for (const { line, index } of classBody(text, m.index)) {
      if (isEnum) {
        const e = P.pyEnumMember.exec(line);
        if (e) values.push(e[2] ?? e[1]);
      } else if (isModel) {
        const f = pyFieldOf(line);
        if (f && f[1] !== "model_config" && f[1] !== "Config") pydanticField(f, push, index);
      } else {
        const f = P.pyFormField.exec(line);
        if (!f) continue;
        // Its arguments from the file's text: a field written over several lines (Black's layout) is read whole.
        const args = callArguments(text, index + line.indexOf("(", line.indexOf(f[2])), 1200, "py");
        const required = !/\brequired\s*=\s*False\b/.test(args);
        push({ family: "validation", signal: required ? "required" : "optional", field: f[1], via: "django" }, index);
        for (const [key, signal] of [
          ["max_length", "max"],
          ["min_length", "min"],
          ["max_value", "max"],
          ["min_value", "min"],
        ]) {
          const v = new RegExp(`\\b${key}\\s*=\\s*(\\d{1,9})`).exec(args);
          if (v) push({ family: "validation", signal, field: f[1], value: Number(v[1]), via: "django" }, index);
        }
        if (/EmailField/.test(f[2])) push({ family: "validation", signal: "email", field: f[1], via: "django" }, index);
      }
    }
    if (isEnum && values.length)
      push({ family: "values", signal: "enum", field: m[1], values, via: "python" }, m.index);
  }
  P.djangoChoices.lastIndex = 0;
  for (const m of text.matchAll(P.djangoChoices)) {
    if (sink.full) return;
    const block = callArguments(text, m.index + m[0].length - 1, 1200, "py");
    const labels = [...block.matchAll(P.choicePair)].map((c) => c[2]);
    if (labels.length) push({ family: "values", signal: "choices", values: labels, via: "django" }, m.index);
  }
}

/** TypeScript: a union of string literals, an enum's members. */
function typescript(text, sink) {
  const P = SCHEMA_PATTERNS;
  const push = sink.push;
  P.tsUnion.lastIndex = 0;
  for (const m of text.matchAll(P.tsUnion)) {
    if (sink.full) return;
    const values = [];
    let k = m.index + m[0].length;
    while (values.length < 30) {
      while (k < text.length && (text[k] === " " || text[k] === "|" || text[k] === "\n" || text[k] === "\t")) k++;
      const q = text[k];
      if (q !== '"' && q !== "'") break;
      const close = text.slice(k + 1, k + 42).indexOf(q);
      if (close === -1) break;
      const end = k + 1 + close;
      values.push(text.slice(k + 1, end));
      k = end + 1;
    }
    if (values.length > 1) push({ family: "values", signal: "union", field: m[1], values, via: "typescript" }, m.index);
  }
  P.tsEnum.lastIndex = 0;
  for (const m of text.matchAll(P.tsEnum)) {
    if (sink.full) return;
    const start = m.index + m[0].length;
    const close = text.slice(start, start + 2001).indexOf("}");
    if (close === -1) continue;
    const end = start + close;
    const values = text
      .slice(start, end)
      .split(",")
      .map((part) => {
        const [name, value = ""] = part.split("=").map((s) => s.trim());
        return quotedIn(value)[0] ?? name;
      })
      .filter(Boolean);
    push({ family: "values", signal: "enum", field: m[1], values, via: "typescript" }, m.index);
  }
}

/** The attributes of an HTML tag's text: name → value ("" for a bare attribute). */
function attributesOf(tag) {
  const out = {};
  SCHEMA_PATTERNS.htmlAttribute.lastIndex = 0;
  for (const a of tag.matchAll(SCHEMA_PATTERNS.htmlAttribute)) out[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? "";
  return out;
}

/**
 * The text of the tag that starts at `start` ("<input …>"), quotes and braces followed so that an arrow "=>" in a JSX
 * attribute does not end it — or null when it does not end within 1,000 characters or meets another "<" first (a
 * generic, <Select<string> …>) — and where the walk stopped: the caller goes on from there. A quote opened in a
 * JavaScript expression ({open ? 'it\'s' : "x"}) follows its escapes and ends at its line, as callSpan's do.
 * @returns {{ tag: string|null, stop: number }}
 */
function tagText(text, start) {
  let depth = 0;
  let quote = null;
  let code = false;
  const end = Math.min(text.length, start + 1000);
  for (let i = start + 1; i < end; i++) {
    const ch = text[i];
    if (quote) {
      if (code && ch === "\\") i++;
      else if (ch === quote || (code && ch === "\n")) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      code = depth > 0;
    } else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (depth <= 0 && ch === ">") return { tag: text.slice(start, i + 1), stop: i + 1 };
    else if (depth <= 0 && ch === "<") return { tag: null, stop: i };
  }
  return { tag: null, stop: end };
}

/** One <input> or <textarea>: its checks. */
function inputField(a, push, at) {
  const field = a.name || a.id;
  const type = (a.type || "text").toLowerCase();
  if (["hidden", "submit", "button", "reset", "image"].includes(type)) return;
  const via = "html";
  if ("required" in a && a.required !== "false" && a.required !== "{false}")
    push({ family: "validation", signal: "required", field, via }, at);
  for (const [key, signal] of [
    ["minlength", "min"],
    ["maxlength", "max"],
    ["min", "min"],
    ["max", "max"],
  ])
    if (key in a) push({ family: "validation", signal, field, value: numberIn(a[key]), via }, at);
  if ("pattern" in a) push({ family: "validation", signal: "pattern", field, via }, at);
  if (["email", "url", "number", "date", "datetime-local", "tel", "search"].includes(type))
    push({ family: "validation", signal: "type", field, value: type, via }, at);
}

/** The HTML of a form: each field's checks, and the options of a <select>. */
function html(text, sink) {
  const P = SCHEMA_PATTERNS;
  const push = sink.push;
  const lower = text.toLowerCase();
  P.htmlField.lastIndex = 0;
  for (let m = P.htmlField.exec(text); m && !sink.full; m = P.htmlField.exec(text)) {
    const { tag, stop } = tagText(text, m.index);
    // The next tag after this one, or from where the walk stopped: each character is read once.
    P.htmlField.lastIndex = Math.max(stop, m.index + 1);
    if (!tag) continue;
    const a = attributesOf(tag.slice(m[0].length, -1));
    if (m[1].toLowerCase() !== "select") {
      inputField(a, push, m.index);
      continue;
    }
    const start = m.index + tag.length;
    const found = lower.slice(start, start + 4001).indexOf("</select>");
    if (found === -1) continue;
    const close = start + found;
    const values = [];
    P.htmlOption.lastIndex = 0;
    for (const o of text.slice(start, close).matchAll(P.htmlOption)) {
      const label = o[2].trim() || attributesOf(o[1]).value || "";
      if (label) values.push(label);
    }
    if (values.length)
      push({ family: "values", signal: "options", field: a.name || a.id, values, via: "html" }, m.index);
  }
}

/**
 * Every field, check and list of values of a text, pushed into the sink of its file (behaviour-common.mjs).
 * @param {string} text
 * @param {"js"|"py"|"html"} language   js: zod, TypeScript and the HTML of JSX/Vue/Svelte; py: Python; html: HTML only
 * @param {{ push: (s: object, index: number) => void, full: boolean }} sink
 */
export function schemaBehaviours(text, language, sink) {
  if (language === "py") return python(text, sink);
  if (language === "js") {
    zod(text, sink);
    typescript(text, sink);
  }
  html(text, sink);
}
