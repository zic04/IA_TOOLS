// The documentation's text in each tool's markup, always as text, never as markup of its own: HTML (Azure DevOps),
// Jira's wiki markup, Markdown (GitHub, GitLab). In Markdown a mention ("@name") or a reference ("#12", GitLab's "!12",
// "&12"…) is no link either — the import would notify someone, or add a "mentioned in" note to another issue — and,
// in GitLab, a line starting with "/" no quick action. Character by character: no expression.
import { esc } from "../core/text.mjs";

/** U+2060 WORD JOINER: invisible; after "@" or "#", it keeps the text from being a mention or a reference. */
const JOINER = "\u2060";

const isDigit = (ch) => ch !== undefined && ch >= "0" && ch <= "9";
/** A character of a name: a letter, a digit, "_", or any character beyond ASCII (an accented letter). */
const isWord = (ch) =>
  ch !== undefined &&
  (isDigit(ch) || (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_" || ch > "\x7f");

/** The number of digits a line starts with, when "1." or "1)" would make it an ordered list; else 0. */
function orderedMarker(chars) {
  let n = 0;
  while (n < 9 && isDigit(chars[n])) n++;
  return n && (chars[n] === "." || chars[n] === ")") ? n : 0;
}

/** HTML text (Azure DevOps' description and acceptance criteria). */
export const htmlText = (s) => esc(s);

/** Escaped anywhere; "&" too, so that no entity ("&commat;", "&#x40;") is decoded into a mention. */
const MD_ANYWHERE = new Set(["\\", "`", "*", "_", "[", "]", "<", ">", "|", "~", "&"]);
const MD_LINE_START = new Set(["#", "+", "-", "=", ">"]);
/** The signs of a reference before a number: GitHub's issue, GitLab's issue, merge request, epic, snippet, milestone. */
const REF_SIGNS = new Set(["#", "!", "&", "$", "%"]);

/**
 * Whether a joiner goes after the character at i: "@" starting a name ("@alice", not "a@b.org"); a reference's sign
 * before a number, whatever precedes it ("#12", "acme/shop#42", "group/project!12"); GitHub's "GH-12".
 */
function inertAfter(chars, i) {
  const [prev, ch, next] = [chars[i - 1], chars[i], chars[i + 1]];
  if (ch === "@") return !isWord(prev) && isWord(next);
  if (REF_SIGNS.has(ch)) return isDigit(next);
  return ch === "-" && prev === "H" && chars[i - 2] === "G" && !isWord(chars[i - 3]) && isDigit(next);
}

/**
 * One line of Markdown text: its markup characters escaped, its mentions and references inert.
 * @param {string} s
 * @param {{ quickActions?: boolean }} [o]   quickActions: a leading "/" escaped (GitLab)
 */
export function markdownText(s, { quickActions = false } = {}) {
  const chars = [...String(s ?? "")];
  const ordered = orderedMarker(chars);
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const start = i === 0 && (MD_LINE_START.has(ch) || (quickActions && ch === "/"));
    out += start || MD_ANYWHERE.has(ch) || (ordered && i === ordered) ? "\\" + ch : ch;
    if (inertAfter(chars, i)) out += JOINER;
  }
  return out;
}

/**
 * The body of an issue in Markdown (GitHub, GitLab): its lines, the epic and the feature it belongs to, a parent
 * already in the tool, the link of its page, its acceptance criteria.
 * @param {import("./model.mjs").Item} item
 * @param {(key: string, vars?: object) => string} t
 * @param {{ quickActions?: boolean }} [o]
 */
export function markdownBody(item, t, o = {}) {
  const md = (s) => markdownText(s, o);
  const named = (x) => `${x.id} · ${x.title}`;
  const blocks = [
    ...item.lines.map(md),
    item.epic ? md(t("render.backlog.epic", { title: named(item.epic) })) : "",
    item.feature ? md(t("render.backlog.feature", { title: named(item.feature) })) : "",
    item.parentRef ? md(t("render.backlog.parent", { ref: item.parentRef.text })) : "",
    item.link ? `[${md(t("render.backlog.doc"))}](${item.link})` : "",
  ];
  if (item.criteria.length)
    blocks.push(
      `### ${md(t("render.backlog.criteria"))}`,
      ...item.criteria.map((c) =>
        [`**${md(c.title)}**`, "", ...c.steps.map((s) => `- **${md(s.keyword)}** ${md(s.text)}`)].join("\n"),
      ),
    );
  return blocks.filter(Boolean).join("\n\n") + "\n";
}

const WIKI_ANYWHERE = new Set(["\\", "{", "}", "[", "]", "*", "_", "^", "~", "+", "|", "!"]);
const WIKI_LINE_START = new Set(["#", "-"]);

/** One line of Jira wiki text: its markup characters escaped (a mention "[~name]" with them). */
export function wikiText(s) {
  const chars = [...String(s ?? "")];
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const special =
      WIKI_ANYWHERE.has(ch) || (i === 0 && WIKI_LINE_START.has(ch)) || (ch === "?" && chars[i + 1] === "?");
    out += special ? "\\" + ch : ch;
  }
  return out;
}
