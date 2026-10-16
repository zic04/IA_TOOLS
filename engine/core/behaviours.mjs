// Behaviour cards and scenarios of a feature sheet (ARCHITECTURE.md §6.8a). The kinds of behaviour come from
// standard/behaviours.json, completed by a project's config.behaviours.file: each kind lists the rubrics a reader
// expects answered (a search: the fields searched, the matching, several words, the trigger…). A card's body is a
// list of "Rubric: value" lines, a scenario's body a list of Given / When / Then steps; both are read line by line,
// without a regular expression on the writer's text. Pure functions, except loadStandardBehaviours (reads the kit's
// file once).
import fs from "node:fs";
import path from "node:path";
import { KIT_ROOT } from "../project/find.mjs";
import { validate } from "../project/validate.mjs";
import { comparable } from "./page-templates.mjs";

/**
 * @typedef {{ en: string, fr?: string }} Text
 * @typedef {{ id: string, label: Text, aliases?: { en?: string[], fr?: string[] }, required: boolean, hint?: Text }} Rubric
 * @typedef {{ id: string, aliases?: string[], title: Text, icon?: string, rubrics: Rubric[] }} BehaviourKind
 * @typedef {{ kinds: Map<string, BehaviourKind>, spellings: Map<string, string>, answers: { na: string[], unknown: string[] } }} BehaviourRegistry
 * @typedef {"answered"|"na"|"unknown"|"missing"} RubricState
 */

/** A label longer than this is prose, not a rubric ("Rubric: value"). */
const MAX_LABEL = 60;

const cache = new Map();

/**
 * The kit's kinds of behaviour and their schema, read and checked once (a defect of the kit throws: tests catch it).
 * @param {string} [kitRoot]
 * @returns {{ data: any, schema: any }}
 */
function loadStandardBehaviours(kitRoot = KIT_ROOT) {
  if (!cache.has(kitRoot)) {
    const read = (rel) => JSON.parse(fs.readFileSync(path.join(kitRoot, rel), "utf8"));
    const data = read("standard/behaviours.json");
    const schema = read("schemas/behaviours.schema.json");
    const { errors } = validate(data, schema);
    if (errors.length)
      throw new Error(`standard/behaviours.json: ${errors.map((e) => `${e.path} ${e.key}`).join("; ")}`);
    if (!data.answers) throw new Error("standard/behaviours.json: answers missing");
    cache.set(kitRoot, { data, schema });
  }
  return cache.get(kitRoot);
}

/**
 * The kinds of a build: the kit's, then those of the project's file (config.behaviours.file, already parsed). A
 * project kind that takes a spelling already used, or a file that does not follow the schema — or whose kind has two
 * rubrics of one id or one spelling — is a problem (the build reports it); its other kinds are kept.
 * @param {{ project?: any, file?: string|null, kitRoot?: string }} [p]
 * @returns {{ registry: BehaviourRegistry, problems: Array<{ key: string, vars: object }> }}
 */
export function behaviourRegistry({ project = null, file = null, kitRoot = KIT_ROOT } = {}) {
  const { data, schema } = loadStandardBehaviours(kitRoot);
  const registry = { kinds: new Map(), spellings: new Map(), answers: data.answers };
  const problems = [];
  const add = (kind) => {
    const names = [kind.id, ...(kind.aliases || [])].map(comparable);
    const taken = names.find((n) => registry.spellings.has(n));
    if (taken) return taken;
    registry.kinds.set(kind.id, kind);
    for (const n of names) registry.spellings.set(n, kind.id);
    return null;
  };
  data.kinds.forEach((kind, i) => {
    const at = ambiguousRubric(kind, `kinds[${i}]`);
    if (at) throw new Error(`standard/behaviours.json: ${at} names a rubric twice`);
    const taken = add(kind);
    if (taken) throw new Error(`standard/behaviours.json: kind spelling "${taken}" used twice`);
  });
  if (project !== null) {
    const { errors } = validate(project, schema);
    if (errors.length) problems.push({ key: "behaviour.file", vars: { file, at: errors[0].path } });
    else if (project.answers) problems.push({ key: "behaviour.file", vars: { file, at: "answers" } });
    else
      project.kinds.forEach((kind, i) => {
        const at = ambiguousRubric(kind, `kinds[${i}]`);
        if (at) return problems.push({ key: "behaviour.file", vars: { file, at } });
        const taken = add(kind);
        if (taken) problems.push({ key: "behaviour.kindTwice", vars: { file, kind: kind.id, spelling: taken } });
      });
  }
  return { registry, problems };
}

/** The path of the first rubric of a kind whose id, or one of whose spellings, another rubric already has; or null. */
function ambiguousRubric(kind, at) {
  const ids = new Set();
  const spellings = new Map();
  for (const [j, rubric] of kind.rubrics.entries()) {
    if (ids.has(rubric.id)) return `${at}.rubrics[${j}].id`;
    ids.add(rubric.id);
    for (const label of rubricSpellings(rubric)) {
      const owner = spellings.get(comparable(label));
      if (owner !== undefined && owner !== rubric.id) return `${at}.rubrics[${j}].label`;
      spellings.set(comparable(label), rubric.id);
    }
  }
  return null;
}

/** Every spelling of a rubric: its label in each language, then its aliases. */
const rubricSpellings = (rubric) => [
  ...Object.values(rubric.label),
  ...(rubric.aliases?.en || []),
  ...(rubric.aliases?.fr || []),
];

/** The kind a card names (its id or one of its aliases, in any case), or null. */
export function findKind(registry, name) {
  const id = registry.spellings.get(comparable(name ?? ""));
  return id === undefined ? null : registry.kinds.get(id);
}

/** A text of the kit in a language, English when it has none in that language. */
export const inLanguage = (text, language) => text?.[language] ?? text?.en ?? "";

/** Every accepted spelling of a rubric (both languages, aliases included) → the rubric. */
function rubricIndex(kind) {
  const index = new Map();
  for (const rubric of kind.rubrics)
    for (const label of rubricSpellings(rubric))
      if (!index.has(comparable(label))) index.set(comparable(label), rubric);
  return index;
}

/** Removes the emphasis that wraps a label: **Label**, __Label__. */
function unwrap(s) {
  let out = s.trim();
  for (const mark of ["**", "__"]) {
    if (out.startsWith(mark)) out = out.slice(2);
    if (out.endsWith(mark)) out = out.slice(0, -2);
  }
  return out.trim();
}

/** A list marker at the start of a line ("- ", "* ", "+ "), removed. */
function withoutMarker(line) {
  const s = line.trim();
  return s.startsWith("- ") || s.startsWith("* ") || s.startsWith("+ ") ? s.slice(2).trimStart() : s;
}

/** Whether a line starts with a blank (an indented line: it continues the value above, a sub-list item…). */
const indented = (line) => line.length > 0 && line[0].trim() === "";

/**
 * A "Rubric: value" line of a card ("- **Rubric**: value", "**Rubric:** value", "Rubric : value"), or null. A rubric
 * line starts at the beginning of its line: an indented one ("  - Order: …" under "Columns:") continues the value.
 * @returns {{ rubric: Rubric, value: string } | null}
 */
function rubricLine(line, index) {
  if (indented(line)) return null;
  const s = withoutMarker(line);
  // The colon may sit after the emphasis and a blank ("**Rubric** :"): the label itself is at most MAX_LABEL long.
  const colon = s.indexOf(":");
  if (colon < 1 || colon > MAX_LABEL + 6) return null;
  const label = unwrap(s.slice(0, colon));
  if (label.length > MAX_LABEL) return null;
  const rubric = index.get(comparable(label));
  if (!rubric) return null;
  let value = s.slice(colon + 1);
  if (value.startsWith("**") || value.startsWith("__")) value = value.slice(2); // **Rubric:** value
  return { rubric, value: value.trim() };
}

/** Lines joined, without the blank lines at both ends. */
function joined(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  return lines.slice(start, end).join("\n");
}

/** What may follow the word of an explicit answer: its reason or its question, after one of these. */
const SEPARATORS = ["—", "–", "-", ":", ".", ";", ","];

/**
 * The state of a written value: "n/a — reason" is `na`, "unknown — question" is `unknown` (the words of
 * standard/behaviours.json `answers`, in any language and any case, emphasis allowed), when the word stands alone or
 * is followed by a separator (— – - : . ; ,); anything else is `answered` ("Unknown customers are not listed").
 * @returns {RubricState}
 */
export function answerState(value, answers) {
  let v = comparable(value);
  while (v.startsWith("*") || v.startsWith("_")) v = v.slice(1);
  for (const state of /** @type {const} */ (["na", "unknown"]))
    for (const word of answers[state]) {
      const w = comparable(word);
      if (!v.startsWith(w)) continue;
      let i = w.length;
      while (i < v.length && (v[i] === "*" || v[i] === "_" || v[i].trim() === "")) i++;
      if (i === v.length || SEPARATORS.includes(v[i])) return state;
    }
  return "answered";
}

/**
 * Reads a card's body: the text before its first rubric line (an introduction), then each rubric with its value —
 * its line and the lines after it, up to the next rubric line. The rows come in the kind's order; a required
 * rubric absent or left empty is a `missing` row, an optional one is left out.
 * @param {string} body
 * @param {BehaviourKind} kind
 * @param {{ na: string[], unknown: string[] }} answers
 * @returns {{ intro: string, rows: Array<{ rubric: Rubric, value: string, state: RubricState }>, missing: Rubric[],
 *   counts: { required: number, answered: number, na: number, unknown: number, missing: number } }}
 */
export function readCard(body, kind, answers) {
  const index = rubricIndex(kind);
  const intro = [];
  /** @type {Map<string, string[]>} */
  const found = new Map();
  let current = intro;
  for (const raw of String(body ?? "").split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const hit = rubricLine(line, index);
    if (!hit) {
      current.push(line);
      continue;
    }
    // A rubric written twice: its two values, one after the other.
    current = found.get(hit.rubric.id) ?? found.set(hit.rubric.id, []).get(hit.rubric.id);
    if (current.length) current.push("");
    current.push(hit.value);
  }
  const rows = [];
  const missing = [];
  const counts = { required: 0, answered: 0, na: 0, unknown: 0, missing: 0 };
  for (const rubric of kind.rubrics) {
    const value = joined(found.get(rubric.id) || []);
    if (rubric.required) counts.required++;
    if (!value) {
      if (!rubric.required) continue;
      missing.push(rubric);
      counts.missing++;
      rows.push({ rubric, value: "", state: /** @type {RubricState} */ ("missing") });
      continue;
    }
    const state = answerState(value, answers);
    if (rubric.required) counts[state]++;
    rows.push({ rubric, value, state });
  }
  return { intro: joined(intro), rows, missing, counts };
}

/** The steps of a scenario: canonical step → its keywords, compared folded (no case, no accents). */
const STEP_WORDS = /** @type {Array<[string, string[]]>} */ ([
  ["given", ["given", "soit", "etant donne que", "etant donne qu'", "etant donne", "sachant que", "sachant qu'"]],
  ["when", ["when", "quand", "lorsque", "lorsqu'"]],
  ["then", ["then", "alors"]],
  ["and", ["and", "et"]],
  ["but", ["but", "mais"]],
])
  .flatMap(([step, words]) => words.map((w) => ({ step, word: [...w] })))
  .sort((a, b) => b.word.length - a.word.length);

/** One character folded: lower case, without its accent, one kind of apostrophe. */
function fold(ch) {
  if (ch === "’" || ch === "ʼ") return "'";
  return String.fromCodePoint(/** @type {number} */ (ch.normalize("NFD").codePointAt(0))).toLowerCase();
}

/**
 * A step line of a scenario ("Given …", "- **When** …", "Étant donné qu'…"), or null: the keyword as written, its
 * canonical step and the rest of the line.
 * @returns {{ step: string, keyword: string, text: string } | null}
 */
export function stepLine(line) {
  let s = withoutMarker(line);
  for (const mark of ["**", "__"])
    if (s.startsWith(mark)) {
      const end = s.indexOf(mark, 2);
      if (end > 2) {
        s = s.slice(2, end) + s.slice(end + 2);
      }
    }
  const chars = [...s.normalize("NFC")];
  const folded = chars.map(fold);
  for (const { step, word } of STEP_WORDS) {
    if (folded.length < word.length || word.some((ch, i) => folded[i] !== ch)) continue;
    // After the keyword: the end, a blank of any kind (a tab, a no-break space), or "," or ":".
    const next = folded[word.length];
    if (word[word.length - 1] !== "'" && next !== undefined && next.trim() !== "" && next !== "," && next !== ":")
      continue;
    let rest = chars.slice(word.length).join("").trimStart();
    if (rest.startsWith(",") || rest.startsWith(":")) rest = rest.slice(1);
    return { step, keyword: chars.slice(0, word.length).join(""), text: rest.trim() };
  }
  return null;
}

/**
 * Reads a scenario's body: the text before its first step (an introduction), then its steps — a line that does not
 * start with a keyword continues the step above it.
 * @param {string} body
 * @returns {{ intro: string, steps: Array<{ step: string, keyword: string, text: string }>, complete: boolean }}
 *   `complete`: a Then with a Given or a When before it
 */
export function readScenario(body) {
  const intro = [];
  const steps = [];
  for (const raw of String(body ?? "").split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const step = stepLine(line);
    if (step) steps.push(step);
    else if (!line.trim()) {
      if (!steps.length) intro.push(line);
    } else if (steps.length) steps[steps.length - 1].text += "\n" + line.trim();
    else intro.push(line);
  }
  let started = false;
  let complete = false;
  for (const s of steps) {
    if (s.step === "given" || s.step === "when") started = true;
    else if (s.step === "then" && started) complete = true;
  }
  return { intro: joined(intro), steps, complete };
}
