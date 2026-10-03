// `doc-kit pack` (AUDIT.md §4): the files the next AI working on the application needs, written in the documentation
// project, never in the application. Pure functions; cli/commands/pack.mjs reads the files and writes the result.
//   llms.txt       the outline of the documentation (llmstxt.org): one line per page, its link and its summary
//   llms-full.txt  the whole documentation as Markdown, in reading order, without the writers' guidance comments
//   AGENTS.md      the application in one page, from the facts: stack, commands, environment, data, API, tests,
//                  conventions, the main risks and hotspots, and the agent instructions it already has
//   CLAUDE.md      one line importing AGENTS.md (Claude Code reads CLAUDE.md, other agents AGENTS.md)
// Every file goes through the secret detectors of `check secrets` (engine/check/secrets.mjs): a line where one fires
// is replaced by a notice, and reported.
import { systemModel } from "../build/c4.mjs";
import { healthRisks, hotspots } from "../build/developer.mjs";
import { scanText } from "../check/secrets.mjs";

/** The writers' guidance (`<!-- guidance: … -->`, `<!-- consigne : … -->`) and any other HTML comment. */
const COMMENT = /<!--[\s\S]*?-->\n?/g;

/**
 * The pages of a table of contents in reading order: the home page, then each section's introduction (when its file
 * exists) and its pages.
 * @param {object} toc   content/toc.json, normalised
 * @param {(rel: string) => boolean} exists   relative to the content folder
 * @returns {Array<{ id: string, title: string, summary: string, file: string, section: string }>}
 */
export function readingOrder(toc, exists) {
  const out = [];
  if (exists("home.md"))
    out.push({ id: "", title: toc.title, summary: toc.tagline || "", file: "home.md", section: "" });
  for (const s of toc.sections || []) {
    if (exists(`${s.id}/index.md`))
      out.push({ id: s.id, title: s.title, summary: s.subtitle || "", file: `${s.id}/index.md`, section: s.title });
    for (const g of s.groups || [])
      for (const p of g.pages || [])
        out.push({
          id: p.id,
          title: p.title,
          summary: p.summary || "",
          file: p.file || `${p.id}.md`,
          section: s.title,
        });
  }
  return out;
}

/**
 * llms.txt: `# title`, `> tagline`, then one `## section` per section and one link per page.
 * @param {{ toc: object, pages: ReturnType<typeof readingOrder>, site: string }} p   site: the built file's name
 */
export function llmsIndex({ toc, pages, site }) {
  const lines = [`# ${toc.title}`, "", ...(toc.tagline ? [`> ${toc.tagline}`, ""] : [])];
  let section = null;
  for (const p of pages) {
    if (p.section !== section) {
      section = p.section;
      if (section) lines.push("", `## ${section}`, "");
    }
    lines.push(`- [${p.title}](${site}#/${p.id})${p.summary ? `: ${p.summary}` : ""}`);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

/**
 * llms-full.txt: every page's Markdown, in reading order, under its title, without HTML comments.
 * @param {{ toc: object, pages: ReturnType<typeof readingOrder>, read: (rel: string) => string|null }} p
 */
export function llmsFull({ toc, pages, read }) {
  const parts = [`# ${toc.title}`, ...(toc.tagline ? [`> ${toc.tagline}`] : [])];
  for (const p of pages) {
    const text = read(p.file);
    if (text === null) continue;
    const body = text.replace(COMMENT, "").trim();
    parts.push(`---\n\n# ${p.title}${p.id ? ` (#/${p.id})` : ""}\n\n${body}`);
  }
  return parts.join("\n\n") + "\n";
}

// ─── AGENTS.md ──────────────────────────────────────────────────────────────────────────────────────────────────

/** At most this many lines per list: AGENTS.md stays readable; llms-full.txt and the site hold the rest. */
const MAX_LINES = 40;
/** A Markdown list of `items`, cut after MAX_LINES with `more(n)` as its last line. */
const bulletList = (items, more) =>
  items.length
    ? [...items.slice(0, MAX_LINES), ...(items.length > MAX_LINES ? [more(items.length - MAX_LINES)] : [])]
        .map((x) => `- ${x}`)
        .join("\n")
    : "";
const code = (s) => `\`${String(s).replace(/`/g, "'").replace(/\s+/g, " ").trim()}\``;

/** One section per subject; a subject whose facts are missing or empty is left out. */
/** @type {Array<[string, (p: any) => string]>} */
const AGENT_SECTIONS = [
  [
    "stack",
    ({ facts, t, list, pair }) => {
      const m = systemModel({ dependencies: facts.dependencies, env: facts.env, db: facts.db });
      return list([
        ...m.containers.map((c) => pair(t(`render.c4.kind.${c.kind}`), `${c.tech}, ${code(c.path)}`)),
        ...(m.database ? [pair(t("render.c4.database"), `${m.database.tech || "—"} · ${m.database.evidence}`)] : []),
        ...m.externals.map((x) => pair(x.name, x.evidence)),
      ]);
    },
  ],
  [
    "commands",
    ({ scripts, list, pair }) =>
      list(
        scripts.flatMap(({ folder, entries }) =>
          Object.entries(entries).map(([name, run]) =>
            pair(`${code(name)}${folder === "." ? "" : ` (${code(folder)})`}`, code(run)),
          ),
        ),
      ),
  ],
  [
    "environment",
    ({ facts, list, pair }) =>
      list((facts.env?.items || []).map((e) => (e.files?.[0] ? pair(code(e.name), e.files[0]) : code(e.name)))),
  ],
  [
    "data",
    ({ facts, list }) =>
      list(
        [...new Map((facts.db?.items || []).map((d) => [d.table, d])).values()].map(
          (d) => `${code(d.table)} (${d.file})`,
        ),
      ),
  ],
  [
    "api",
    ({ facts, t, list, pair }) =>
      list(
        (facts.api?.items || []).map((r) =>
          pair(
            `${r.method} ${code(r.route)}`,
            `${r.file}:${r.line}${r.auth ? ` · ${t("render.agents.auth", { auth: r.auth })}` : ""}`,
          ),
        ),
      ),
  ],
  [
    "tests",
    ({ facts, t }) => {
      const s = facts.tests?.summary;
      return s
        ? t("render.agents.testsLine", { files: s.files ?? 0, tests: s.tests ?? 0, coverage: s.coverage ?? "—" })
        : "";
    },
  ],
  [
    "conventions",
    ({ facts, t, list, pair }) => {
      const tooling = facts.quality?.summary?.tooling;
      if (!tooling) return "";
      return list(
        ["linter", "types", "formatter", "ci"].map((k) => pair(t(`render.health.tool.${k}`), tooling[k] ? "✔" : "—")),
      );
    },
  ],
  [
    "risks",
    ({ facts, t, list, pair }) =>
      list(
        healthRisks(facts).map((r) =>
          pair(t(`render.health.severity.${r.level}`), t(`render.health.risk.${r.key}`, riskText(t, r))),
        ),
      ),
  ],
  [
    "hotspots",
    ({ facts, t, list, pair }) =>
      list(
        hotspots(facts.history, facts.quality)
          .slice(0, 10)
          .map((h) => {
            const owner = h.owner ? `${h.owner} (${h.ownerShare} %)` : "—";
            return pair(
              code(h.file),
              t("render.agents.hotspotLine", { commits: h.commits, complexity: h.complexity, owner }),
            );
          }),
      ),
  ],
  [
    "instructions",
    ({ facts, t, list }) =>
      list((facts.agents?.items || []).map((a) => `${code(a.file)} (${t("render.agents.lines", { n: a.lines })})`)),
  ],
];

/** The variables of a risk's text with the names of ratings and tools translated (as the site does). */
function riskText(t, r) {
  if (r.key === "rating") return { ...r.vars, name: t(`render.health.rating.${r.vars.name}`) };
  if (r.key === "tooling") return { ...r.vars, tool: t(`render.health.tool.${r.vars.tool}`) };
  return r.vars;
}

/**
 * AGENTS.md of the application, in the project's language.
 * @param {{ product: string, facts: Record<string, any>, scripts: Array<{ folder: string, entries: Record<string, string> }>,
 *   commit: string|null, generated: string, docs: string, t: Function }} p
 */
export function agentsFile({ product, facts, scripts, commit, generated, docs, t }) {
  const parts = [
    `# ${t("render.agents.title", { product })}`,
    `> ${t("render.agents.notice", { date: generated.slice(0, 10), commit: commit ? commit.slice(0, 7) : "—", docs })}`,
  ];
  const list = (items) => bulletList(items, (n) => t("render.agents.more", { n }));
  const pair = (label, value) => t("render.agents.pair", { label, value });
  for (const [key, section] of AGENT_SECTIONS) {
    const body = section({ facts, scripts, t, list, pair });
    if (body) parts.push(`## ${t(`render.agents.${key}`)}\n\n${body}`);
  }
  return parts.join("\n\n") + "\n";
}

// ─── Secrets ────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The text with every line where a secret detector fires replaced by a notice (the value is never kept).
 * @param {string} text
 * @param {object[]} detectorList   engine/check/secrets.mjs detectors()
 * @param {(kind: string) => string} notice   the replacement line, from the kind of secret
 * @param {(value: string, token: string) => string|null} [ignore]   ignoreRules(config.masking)
 * @returns {{ text: string, removed: Array<{ line: number, kind: string }> }}
 */
export function withoutSecrets(text, detectorList, notice, ignore = undefined) {
  const found = scanText(text, detectorList, ignore);
  if (!found.length) return { text, removed: [] };
  const byLine = new Map(found.map((f) => [f.line, f.kind]));
  const lines = text.split("\n").map((l, i) => (byLine.has(i + 1) ? notice(byLine.get(i + 1)) : l));
  return {
    text: lines.join("\n"),
    removed: [...byLine].map(([line, kind]) => ({ line, kind })).sort((a, b) => a.line - b.line),
  };
}
