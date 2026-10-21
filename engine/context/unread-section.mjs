// The part "Code the kit does not read" of a context file (ARCHITECTURE.md §6.11, source `stack` of §6.9): the
// languages of the application that no reader of the kit reads here (Java without a stack adapter that knows its
// framework, a low-code export…), with their part of the lines of code, and the page's own files in such a language.
// The facts say nothing of that code: the agent reads it itself. Short, never cut.
import { loadAdapters, languageOf } from "../core/adapters.mjs";

/**
 * @param {{ items: Array<{ language: string, lines: number, read: boolean }>, files: string[],
 *   t: (key: string, vars?: object) => string }} p   items: facts/stack.json; files: the page's, relative to the app
 * @returns {string} the part, or "" when the kit reads all the code it measured
 */
export function unreadPart({ items, files, t }) {
  const unread = items.filter((i) => !i.read && i.lines > 0);
  if (!unread.length) return "";
  const total = items.reduce((n, i) => n + i.lines, 0);
  const share = Math.max(1, Math.round((100 * unread.reduce((n, i) => n + i.lines, 0)) / total));
  const { languages } = loadAdapters();
  const titles = unread.map((i) => languages.find((l) => l.id === i.language)?.title ?? i.language);
  const ids = new Set(unread.map((i) => i.language));
  const mine = files.filter((f) => ids.has(languageOf(f)?.id));
  const out = [
    `## ${t("cli.context.section.unread")}`,
    "",
    t("cli.context.unread.app", { languages: titles.join(", "), share }),
  ];
  if (mine.length) out.push("", t("cli.context.unread.files"), ...mine.map((f) => `- ${f}`));
  return out.join("\n") + "\n";
}
