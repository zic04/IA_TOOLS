// The translator's dossier of one page (ARCHITECTURE.md §6.12, `context <page> --translate <lang>`), built from
// already-resolved inputs (the CLI reads the disk, git and the table of contents); pure, like
// engine/context/context.mjs (buildContext), which this module deliberately does not reuse: the translator's
// dossier has its own order and never excerpts code, so its budget cut is its own (diff first, then the
// previous translation; the page, the sections, the glossary and the source are never cut).
import { sectionLabel, sectionCount } from "../core/page-templates.mjs";
import { escapeRegex } from "../core/text.mjs";
import { estimateTokens } from "./budget.mjs";

/** `use/orders` + "fr" → `use__orders.fr.md` (ARCHITECTURE.md §6.12): "/" replaced with "__", like contextFileName. */
export const translateContextFileName = (pageId, lang) => `${pageId.replaceAll("/", "__")}.${lang}.md`;

/** The source glossary entries (with their index, to look up the translated one at the same position) whose
 * pattern matches one of `texts`. */
function matchingGlossary(glossary, texts) {
  return glossary
    .map((g, i) => ({ g, i }))
    .filter(({ g }) => {
      const re = new RegExp(g.pattern || escapeRegex(g.term), "iu");
      return texts.some((x) => re.test(x));
    });
}

/**
 * Finds, in the documentation project's own git history, the first commit whose version of `relFile` matches
 * `recorded` (the fingerprint saved by `translate --mark`): the diff since that commit is what changed since the
 * translation was last marked.
 * @param {{ git: ReturnType<typeof import("../sync/git.mjs").createGit>|null, path: string, recorded: string|null,
 *   hashText: (text: string) => string, limit?: number }} p
 * @returns {string|null}
 */
export function findSourceCommit({ git, path: relFile, recorded, hashText, limit = 50 }) {
  if (!git || !recorded || !git.available()) return null;
  const commits = git.log(relFile, limit);
  if (!commits) return null;
  for (const c of commits) {
    const text = git.show(c, relFile);
    if (text !== null && hashText(text) === recorded) return c;
  }
  return null;
}

/**
 * The translator's dossier of one page: everything needed to write or update its translation, without the code
 * excerpts of the writer's own dossier (`buildContext`, context.mjs) — a translator never touches `app.dir`.
 * @param {object} p
 * @param {object} p.page           source page entry (toc.json): id, title, summary, template, file
 * @param {object|null} p.pageL     the SAME page in the translated toc.json (translatedToc merge), or null when
 *   that file is itself missing/unreadable (its `title` then falls back to the source's, like the build)
 * @param {string} p.pageId
 * @param {string} p.lang
 * @param {string} p.sourceFile     content-relative path of the source Markdown
 * @param {string} p.targetFile     translations-relative path shown in the header ("translations/<lang>/<file>")
 * @param {"current"|"stale"|"unmarked"|"missing"} p.state
 * @param {string} p.sourceText     the source Markdown, whole
 * @param {string|null} p.previousText   the existing translation, whole, or null (no file yet)
 * @param {object[]} [p.glossary]   content/glossary.json (source)
 * @param {object[]|null} [p.glossaryL]  the translated glossary.json (same order), or null
 * @param {object|null} p.templates loadPageTemplates() result
 * @param {string|null} [p.diff]   unified diff of the source since the recorded fingerprint, or null (none found)
 * @param {number} [p.budget]      default 16000; cut order: the diff first, then the previous translation
 * @param {(key: string, vars?: object) => string} p.t   translator of the TARGET language (the headings to
 *   write, "Page"/"Glossary"… are shown in <lang>, since that is the language the translator writes in)
 * @returns {{ text: string, tokens: number, cut: Array<{ kind: "diff"|"previous" }> }}
 */
export function buildTranslateContext({
  page,
  pageL,
  pageId,
  lang,
  sourceFile,
  targetFile,
  state,
  sourceText,
  previousText,
  glossary = [],
  glossaryL = null,
  templates,
  diff = null,
  budget = 16000,
  t,
}) {
  const lines = [];
  const push = (s = "") => lines.push(s);

  // 1. The page.
  push(`# ${page.title || pageId} (${pageId}) — ${lang}`);
  push("");
  push(`- ${t("cli.context.translate.meta.target")}: ${targetFile}`);
  push(`- ${t("cli.context.translate.meta.state")}: ${t(`cli.translate.status.state.${state}`)}`);
  if (page.template) push(`- template: ${page.template}`);
  push(`- ${sourceFile}`);
  if (pageL?.title && pageL.title !== page.title) push(`- ${pageL.title}`);
  push("");

  // 2. The sections of its template, in the TARGET language (the labels to write).
  let sectionsText = "";
  if (page.template && templates?.types?.[page.template]) {
    const def = templates.types[page.template];
    const sectionLines = [`## ${t("cli.context.translate.section.sections", { lang })}`, ""];
    for (let i = 0; i < sectionCount(templates, page.template); i++) {
      const label = sectionLabel(templates, page.template, i, lang);
      if (!label) continue;
      sectionLines.push(
        `- ${label}${(def.required || []).includes(i) ? ` (${t("cli.context.section.required")})` : ""}`,
      );
    }
    sectionsText = sectionLines.join("\n") + "\n";
  }

  // 3. The glossary table: source term → translated term, for the terms this page's title/summary cites.
  const matched = matchingGlossary(glossary, [page.title || "", page.summary || ""]);
  let glossaryText = "";
  if (matched.length) {
    const heading = `## ${t("cli.context.translate.section.glossary")}`;
    glossaryText = glossaryL
      ? [
          heading,
          "",
          `| ${t("cli.context.translate.glossary.header")} |`,
          "|---|---|",
          ...matched.map(({ g, i }) => `| ${g.term} | ${glossaryL[i]?.term || "—"} |`),
        ].join("\n") + "\n"
      : [heading, "", t("cli.context.translate.noGlossary"), "", ...matched.map(({ g }) => `- ${g.term}`)].join("\n") +
        "\n";
  }

  const sourceText2 = `## ${t("cli.context.translate.section.source")}\n\n\`\`\`markdown\n${sourceText}\n\`\`\`\n`;
  const previousText2 = previousText
    ? `## ${t("cli.context.translate.section.previous")}\n\n\`\`\`markdown\n${previousText}\n\`\`\`\n`
    : "";
  const diffText = `## ${t("cli.context.translate.section.diff")}\n\n${diff ? `\`\`\`diff\n${diff}\n\`\`\`` : t("cli.context.translate.noDiff")}\n`;

  // Never cut: page, sections, glossary, source. Cut, in this order, when the budget is exceeded: the diff,
  // then the previous translation (ARCHITECTURE.md §6.12). Each dropped part is removed whole (no excerpt here:
  // a translator reads the diff or the whole previous text, never a fragment of either).
  const parts = {
    page: lines.join("\n") + "\n",
    sections: sectionsText,
    glossary: glossaryText,
    source: sourceText2,
    previous: previousText2,
    diff: diffText,
  };
  /** @type {Array<{ kind: "diff"|"previous" }>} */
  const cut = [];
  let total = Object.values(parts).reduce((n, s) => n + estimateTokens(s), 0);
  for (const kind of /** @type {const} */ (["diff", "previous"])) {
    if (total <= budget || !parts[kind]) continue;
    total -= estimateTokens(parts[kind]);
    cut.push({ kind });
    parts[kind] = "";
  }
  const text = [parts.page, parts.sections, parts.glossary, parts.source, parts.previous, parts.diff]
    .filter(Boolean)
    .join("\n");
  return { text, tokens: estimateTokens(text), cut };
}
