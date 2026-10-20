// The analysis of a feature (ARCHITECTURE.md §6.11a, schemas/behaviour-analysis.schema.json): what scripts/analysis.mjs
// checks in it, the digest each reader gets from it, the open questions, the candidate findings, and the plan of the
// depth loop. Pure: the files, the kinds of behaviour and the messages are given.
//   item     { text, mechanism?, status, proofs?, question?, reason? }   status: verified | deduced | unknown | n/a
//   proof    { file, line, endLine? }   file relative to the application folder, forward slashes

export const FORMAT = "doc-kit/behaviour-analysis@1";
/** An id of feature, story, rule or behaviour (F-01, US-01, BR-01, B-01), as toc.json writes one. */
export const FEATURE_ID = /^[A-Z][A-Z0-9]{0,5}-\d{1,4}$/;
/** The rounds of the depth loop for a feature: then what is still open goes to the open questions. */
export const MAX_ROUNDS = 2;
const PROVEN = new Set(["verified", "deduced"]);
/** An answer the writer can use: proven, or an explicit n/a. */
const ANSWERED = new Set(["verified", "deduced", "n/a"]);
/** The lists of plain items, in the order of a digest (that of the feature sheet). */
const PLAIN_LISTS = ["roles", "flow", "fields", "states", "messages", "permissions", "limits"];
const SECTIONS = Object.freeze([
  "summary",
  "roles",
  "stories",
  "flow",
  "behaviours",
  "rules",
  "fields",
  "states",
  "messages",
  "permissions",
  "criteria",
  "limits",
]);
const SEVERITIES = ["high", "medium", "low"];

/**
 * Every item of an analysis, with where it is — label: the rubric of a behaviour's item.
 * @param {any} doc
 * @returns {Array<{ at: string, section: string, item: any, label?: string }>}
 */
export function itemsOf(doc) {
  const out = [];
  if (doc.summary) out.push({ at: "summary", section: "summary", item: doc.summary });
  for (const section of [...PLAIN_LISTS, "stories", "rules", "criteria"])
    (doc[section] ?? []).forEach((item, i) => out.push({ at: `${section}[${i}]`, section, item }));
  (doc.behaviours ?? []).forEach((b, i) => {
    for (const [rubric, item] of Object.entries(b.rubrics ?? {}))
      out.push({ at: `behaviours[${i}].rubrics.${rubric}`, section: "behaviours", item, label: rubric });
  });
  return out;
}

// ─── Code in a text for a reader without the code ────────────────────────────
// Linear expressions (RULES.md S5, test/tools/redos-worker.mjs): a backquote, a source file, a file:line, an empty
// call, a snake_case or camelCase identifier.
const CODE = [
  /`/,
  /\b[\w-]{1,80}\.(?:m?[jt]sx?|py|java|kt|cs|php|go|rb|rs|sql|vue|svelte|ya?ml|json)\b/i,
  /\.\w{1,6}:\d{1,7}\b/,
  /\b[A-Za-z_$][\w$]{0,80}\(\)/,
  /\b[a-z][a-z0-9]{0,40}_[a-z0-9]{1,40}\b/,
  /\b[a-z]{2,40}[A-Z][a-z]{1,40}/,
];

/** The first thing in `text` that looks like code, or null. */
export function codeInText(text) {
  const s = String(text ?? "");
  for (const re of CODE) {
    const m = re.exec(s);
    if (m) return m[0];
  }
  return null;
}

// ─── Proofs ──────────────────────────────────────────────────────────────────

/**
 * Whether a proof's file can be looked for in the application folder, from its spelling alone (nothing is read
 * otherwise): relative, forward slashes, no empty, "." or ".." segment, no drive, colon or NUL.
 */
export function safeProofPath(file) {
  const s = String(file ?? "");
  if (!s || s.startsWith("/") || /[\\:\0]/.test(s)) return false;
  return s.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

/**
 * The problems of one proof. `lines(file)` is asked only for a safe path: { count } (its number of lines), or
 * { missing: true }, or { outside: true } (its real path leaves the application folder).
 */
function proofProblems(proof, at, lines) {
  if (!safeProofPath(proof.file)) return [{ key: "proofOutside", vars: { at, file: String(proof.file) } }];
  const r = lines(proof.file);
  if (r.outside) return [{ key: "proofOutside", vars: { at, file: proof.file } }];
  if (r.missing) return [{ key: "proofMissing", vars: { at, file: proof.file } }];
  if (proof.line > r.count) return [{ key: "proofLine", vars: { at, file: proof.file, line: proof.line, n: r.count } }];
  if (proof.endLine !== undefined && (proof.endLine < proof.line || proof.endLine > r.count))
    return [{ key: "proofRange", vars: { at, file: proof.file, line: proof.line, end: proof.endLine, n: r.count } }];
  return [];
}

// ─── The check ───────────────────────────────────────────────────────────────

/** Every text of an analysis, with where it is: titles, each item's and finding's texts and mechanism. */
function textsOf(doc) {
  const out = [{ at: "title", text: doc.title }];
  (doc.behaviours ?? []).forEach((b, i) => out.push({ at: `behaviours[${i}].title`, text: b.title }));
  const fields = ["text", "mechanism", "question", "reason", "given", "when", "then", "role"];
  const entries = [...itemsOf(doc), ...(doc.findings ?? []).map((item, i) => ({ at: `findings[${i}]`, item }))];
  for (const { at, item } of entries)
    for (const f of fields) if (typeof item[f] === "string") out.push({ at: `${at}.${f}`, text: item[f] });
  return out.filter((x) => typeof x.text === "string" && x.text);
}

/**
 * The secrets in the texts of an analysis — a secret would reach the digests, the open questions, the findings, then
 * the pages: each one's place and kind, never its value.
 * @param {any} doc
 * @param {(text: string) => string[]} secrets   the kinds of secret a text holds (the kit's detectors)
 * @returns {Array<{ key: "secret", vars: { at: string, kind: string } }>}
 */
export function secretProblems(doc, secrets) {
  const out = [];
  for (const { at, text } of textsOf(doc))
    for (const kind of new Set(secrets(text)))
      out.push({ key: /** @type {"secret"} */ ("secret"), vars: { at, kind } });
  return out;
}

/** The texts of an item a reader without the code reads. */
const plainTexts = (item) =>
  [item.text, item.question, item.reason, item.given, item.when, item.then, item.role].filter(
    (x) => typeof x === "string",
  );

function itemProblems({ at, item }, lines) {
  const problems = [];
  const said = item.text ?? [item.given, item.when, item.then].filter(Boolean).join(" ");
  if (PROVEN.has(item.status)) {
    if (!item.proofs?.length) problems.push({ key: "proofNeeded", vars: { at } });
    if (!String(said).trim()) problems.push({ key: "textNeeded", vars: { at } });
  }
  if (item.status === "unknown" && !String(item.question ?? "").trim())
    problems.push({ key: "questionNeeded", vars: { at } });
  if (item.status === "n/a" && !String(item.reason ?? "").trim()) problems.push({ key: "reasonNeeded", vars: { at } });
  for (const text of plainTexts(item)) {
    const token = codeInText(text);
    if (token) {
      problems.push({ key: "codeInText", vars: { at, token } });
      break;
    }
  }
  for (const proof of item.proofs ?? []) problems.push(...proofProblems(proof, at, lines));
  return problems;
}

/** Ids given twice in a list. */
function duplicates(list, section) {
  const seen = new Set();
  const out = [];
  for (const x of list ?? []) {
    if (seen.has(x.id)) out.push({ key: "duplicate", vars: { at: section, id: x.id } });
    seen.add(x.id);
  }
  return out;
}

/** The behaviours: a known kind, known rubrics, every required one answered (an explicit unknown or n/a counts). */
function behaviourProblems(doc, kinds) {
  const problems = [];
  (doc.behaviours ?? []).forEach((b, i) => {
    const at = `behaviours[${i}]`;
    const kind = kinds?.get(b.kind);
    if (!kinds) return;
    if (!kind) {
      problems.push({ key: "kind", vars: { at, kind: b.kind, known: [...kinds.keys()].join(", ") } });
      return;
    }
    const ids = kind.rubrics.map((r) => r.id);
    for (const rubric of Object.keys(b.rubrics ?? {}))
      if (!ids.includes(rubric)) problems.push({ key: "rubric", vars: { at, rubric, known: ids.join(", ") } });
    const missing = kind.rubrics.filter((r) => r.required && !(r.id in (b.rubrics ?? {}))).map((r) => r.id);
    if (missing.length) problems.push({ key: "rubricMissing", vars: { at, rubrics: missing.join(", ") } });
  });
  return problems;
}

/**
 * The problems of an analysis whose structure follows the schema.
 * @param {any} doc
 * @param {{ name: string, kinds: Map<string, any>|null, lines: (file: string) => { count?: number,
 *   missing?: boolean, outside?: boolean }, secrets?: (text: string) => string[] }} p   name: the file's name
 *   without .json; kinds: the kinds of behaviour (null: not checked); secrets: the kinds of secret a text holds
 *   (the kit's detectors) — never its value
 * @returns {Array<{ key: string, vars: object }>}   keys of the `analysis` messages
 */
export function checkAnalysis(doc, { name, kinds, lines, secrets = () => [] }) {
  const problems = [];
  problems.push(...secretProblems(doc, secrets));
  if (doc.feature !== name) problems.push({ key: "fileName", vars: { file: `${name}.json`, feature: doc.feature } });
  problems.push(...duplicates(doc.stories, "stories"), ...duplicates(doc.rules, "rules"));
  problems.push(...duplicates(doc.behaviours, "behaviours"));
  const stories = new Set((doc.stories ?? []).map((s) => s.id));
  (doc.criteria ?? []).forEach((c, i) => {
    if (!stories.has(c.story)) problems.push({ key: "criterionStory", vars: { at: `criteria[${i}]`, story: c.story } });
  });
  problems.push(...behaviourProblems(doc, kinds));
  for (const entry of itemsOf(doc)) problems.push(...itemProblems(entry, lines));
  (doc.findings ?? []).forEach((f, i) => {
    const at = `findings[${i}]`;
    if (!f.proofs.length) problems.push({ key: "proofNeeded", vars: { at } });
    for (const proof of f.proofs) problems.push(...proofProblems(proof, at, lines));
  });
  return problems;
}

// ─── Digests ─────────────────────────────────────────────────────────────────

/**
 * The digest of an analysis for one reader (Markdown): every section that has something, each item's text and
 * status; with `mechanism`, how it works; with `proofs`, its proofs and the candidate findings. A reader without the
 * code (noCode) gets neither: no file, no name of code.
 * @param {any} doc
 * @param {{ mechanism: boolean, proofs: boolean, reader: string, t: (key: string, vars?: object) => string,
 *   rubricLabel: (kind: string, rubric: string) => string }} p
 */
export function digest(doc, { mechanism, proofs, reader, t, rubricLabel }) {
  const lines = [`# ${doc.feature} · ${doc.title} — ${t("digest.title", { reader })}`, "", `> ${t("digest.note")}`];
  const said = (item) =>
    item.status === "unknown"
      ? `**${t("status.unknown")}** — ${item.question}`
      : item.status === "n/a"
        ? `${t("status.na")} — ${item.reason}`
        : `${item.text}${item.status === "deduced" ? ` *(${t("status.deduced")})*` : ""}`;
  /** One item: its line (a bullet, its label first), then how it works and its proofs for the readers who get them. */
  const entry = (item, label = "", mark = "- ") => {
    const out = [`${mark}${label}${said(item)}`];
    if (mechanism && item.mechanism) out.push(`  ${t("digest.mechanism")} ${item.mechanism}`);
    if (proofs && item.proofs?.length) out.push(`  ${t("digest.proofs")} ${item.proofs.map(proofText).join(", ")}`);
    return out;
  };
  const section = (key, entries) => {
    if (!entries.length) return;
    lines.push("", `## ${t(`section.${key}`)}`, "");
    for (const e of entries) lines.push(...e);
  };
  const of = (key) => doc[key] ?? [];
  if (doc.summary) section("summary", [entry(doc.summary, "", "")]);
  for (const key of SECTIONS.slice(1)) {
    if (key === "stories")
      section(
        key,
        of(key).map((s) => entry(s, `**${s.id}** — ${s.role}: `)),
      );
    else if (key === "rules")
      section(
        key,
        of(key).map((r) => entry(r, `**${r.id}** — `)),
      );
    else if (key === "criteria")
      section(
        key,
        of(key).map((c) =>
          entry(
            { ...c, text: t("digest.criterion", { given: c.given, when: c.when, then: c.then }) },
            `**${c.story}** — `,
          ),
        ),
      );
    else if (key === "behaviours")
      section(
        key,
        of(key).map((b) => [
          `### ${b.id} · ${b.title} (${b.kind})`,
          "",
          ...Object.entries(b.rubrics ?? {}).flatMap(([r, item]) => entry(item, `**${rubricLabel(b.kind, r)}**: `)),
          "",
        ]),
      );
    else
      section(
        key,
        of(key).map((item) => entry(item)),
      );
  }
  if (proofs && doc.findings?.length)
    section(
      "findings",
      doc.findings.map((f) => entry({ ...f, status: "verified" }, `**${t(`severity.${f.severity}`)}** — `)),
    );
  return lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

/** A proof as the pages and the consolidation file write it: `file:line`, or `file:line-end`. */
export const proofText = (p) => `\`${p.file}:${p.line}${p.endLine && p.endLine !== p.line ? `-${p.endLine}` : ""}\``;

// ─── Open questions and findings ─────────────────────────────────────────────

/**
 * The open questions for the product owner (Markdown): every unknown item of each analysis, and what the depth loop
 * left open after its rounds.
 * @param {any[]} analyses
 * @param {{ left: Array<{ feature: string, title: string, gap: string, section?: string, why: string }>, t: Function,
 *   rubricLabel: (kind: string, rubric: string) => string }} p
 */
export function openQuestions(analyses, { left, t, rubricLabel }) {
  const lines = [`# ${t("questions.title")}`, "", t("questions.intro")];
  const byFeature = new Map();
  const add = (feature, title, line) => {
    if (!byFeature.has(feature)) byFeature.set(feature, { title, lines: [] });
    byFeature.get(feature).lines.push(line);
  };
  for (const doc of analyses)
    for (const { item, section, label } of itemsOf(doc)) {
      if (item.status !== "unknown") continue;
      const behaviour = label ? (doc.behaviours ?? []).find((b) => label in (b.rubrics ?? {})) : null;
      const where = behaviour ? `${behaviour.title} · ${rubricLabel(behaviour.kind, label)}` : t(`section.${section}`);
      add(doc.feature, doc.title, `- [ ] ${item.question} *(${where})*`);
    }
  for (const l of left)
    add(
      l.feature,
      l.title,
      `- [ ] ${t(`questions.${l.why === "notCarried" ? "notCarried" : "notFound"}`, { gap: l.section ? t(`section.${l.section}`) : l.gap })}`,
    );
  if (!byFeature.size) lines.push("", t("questions.none"));
  for (const [feature, { title, lines: items }] of [...byFeature].sort((a, b) => a[0].localeCompare(b[0])))
    lines.push("", `## ${feature} · ${title}`, "", ...items);
  return lines.join("\n") + "\n";
}

/** The candidate findings of the analyses, the most severe first, then by feature. */
export function findingsOf(analyses) {
  return analyses
    .flatMap((doc) => (doc.findings ?? []).map((f) => ({ feature: doc.feature, ...f })))
    .sort(
      (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.feature.localeCompare(b.feature),
    );
}

// ─── The depth loop ──────────────────────────────────────────────────────────

/**
 * The analysis behaviour a card of the sheet stands for: the one of its id, else the only one of its kind.
 * @returns {any|null}
 */
function behaviourOf(doc, card) {
  const list = doc?.behaviours ?? [];
  if (card.id) {
    const same = list.find((b) => b.id === card.id);
    if (same) return same;
  }
  const ofKind = list.filter((b) => b.kind === card.kind);
  return ofKind.length === 1 ? ofKind[0] : null;
}

/**
 * The plan of one round of the depth loop (ARCHITECTURE.md §6.11a), from what the audit found open in each feature
 * sheet (`gaps`) and the analyses: `deepen` what the analysis answers (the writer adds it to the sheet), `reanalyse`
 * what it does not hold (the analyst looks again, at that only); an unknown item is already a question. A feature
 * after MAX_ROUNDS rounds, or whose analysis has nothing more to give, is `left` to the open questions. Pure: the
 * new state is returned.
 * @param {{ features: Array<{ id: string, title: string, page: string, gaps?: any }>,
 *   analyses: Map<string, any>, state: Record<string, { rounds: number }>,
 *   rubricLabel: (kind: string, rubric: string) => string }} p
 *   gaps: { cards: [{ id, kind, title, rubrics: [{ id, state }] }], stories: [story ids without criteria],
 *   noStory: boolean, noRule: boolean }
 */
export function depthPlan({ features, analyses, state, rubricLabel }) {
  const next = structuredClone(state);
  const actions = [];
  const left = [];
  for (const f of features) {
    if (!f.gaps) continue;
    const doc = analyses.get(f.id) ?? null;
    const { plan, open, labels } = weighGaps(f, doc, rubricLabel, left);
    const rounds = next[f.id]?.rounds ?? 0;
    if (rounds >= MAX_ROUNDS) {
      // Answered by the analysis but still not in the sheet, or not found in the code: left to the product owner.
      const of = { feature: f.id, title: f.title };
      for (const g of plan.deepen) left.push({ ...of, ...labels.get(g), why: "notCarried" });
      for (const o of open) left.push({ ...of, ...labels.get(o.gap), why: "notFound" });
      continue;
    }
    plan.reanalyse = doc ? open.map((o) => o.gap) : ["*"];
    // How each gap reads (a card's title and a rubric's label, a story, a section): the writer and the analyst
    // get it with the ids.
    const named = [...plan.deepen, ...plan.reanalyse, ...plan.questions].filter((g) => labels.has(g));
    plan.labels = Object.fromEntries(named.map((g) => [g, labels.get(g).gap]));
    if (plan.deepen.length || plan.reanalyse.length) {
      next[f.id] = { rounds: rounds + 1 };
      actions.push(plan);
    } else if (plan.questions.length) actions.push(plan);
  }
  return { actions, left, state: next };
}

/**
 * The gaps of one feature weighed against its analysis: what to deepen, the questions already asked, and what the
 * analysis does not hold (`open`: the gap, and how the open questions name it). A story or a rule looked for in vain
 * (the analysis lists none) is pushed to `left`. `labels`: how the open questions name each gap — a label, or the
 * section it lacks.
 */
function weighGaps(f, doc, rubricLabel, left) {
  const { gaps } = f;
  const plan = { feature: f.id, title: f.title, page: f.page, deepen: [], reanalyse: [], questions: [] };
  const open = [];
  const labels = new Map();
  /** One gap: what the analysis says about it decides. */
  const weigh = (gap, item, label) => {
    labels.set(gap, { gap: label });
    if (item && ANSWERED.has(item.status)) plan.deepen.push(gap);
    else if (item?.status === "unknown") plan.questions.push(gap);
    else open.push({ gap, label });
  };
  for (const card of gaps.cards ?? []) {
    const b = doc ? behaviourOf(doc, card) : null;
    for (const r of card.rubrics)
      weigh(`${card.id ?? card.title}.${r.id}`, b?.rubrics?.[r.id], `${card.title} · ${rubricLabel(card.kind, r.id)}`);
  }
  for (const story of gaps.stories ?? [])
    weigh(
      `${story}.criteria`,
      (doc?.criteria ?? []).find((x) => x.story === story),
      story,
    );
  // No story, no rule: the analysis holds some (deepen), or it was looked for and none was found (left).
  for (const [flag, list, gap] of [
    [gaps.noStory, doc?.stories, "stories"],
    [gaps.noRule, doc?.rules, "rules"],
  ]) {
    if (!flag) continue;
    labels.set(gap, { gap, section: gap });
    if (list?.some((x) => ANSWERED.has(x.status))) plan.deepen.push(gap);
    else if (doc && Array.isArray(list))
      left.push({ feature: f.id, title: f.title, gap, section: gap, why: "notFound" });
    else open.push({ gap, label: gap });
  }
  return { plan, open, labels };
}
