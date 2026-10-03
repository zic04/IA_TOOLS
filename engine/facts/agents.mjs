// `agents` source (ARCHITECTURE.md §6.9): the instruction files AI coding assistants read as a hidden
// specification (AGENTS.md, CLAUDE.md…), their size, and any character invisible to a human reviewer hidden
// inside them (a known prompt-injection trick).
//   item: { file, lines, words, hidden: [{ line, codepoint }] }
import fs from "node:fs";
import path from "node:path";
import { listFiles } from "./common.mjs";

/**
 * Files read as agent instructions, at any depth of the application (ARCHITECTURE.md §6.9): a monorepo often has
 * its own CLAUDE.md or AGENTS.md in each package (api/, frontend/).
 */
export const PATTERNS = [
  /(^|\/)(AGENTS|AGENT|CLAUDE|GEMINI)\.md$/i,
  /(^|\/)\.claude\/.*\.md$/i,
  /(^|\/)\.agents\/.*\.md$/i,
  /(^|\/)\.cursorrules$/i,
  /(^|\/)\.cursor\/rules\/.+/i,
  /(^|\/)\.github\/copilot-instructions\.md$/i,
  /(^|\/)\.github\/instructions\/.+\.md$/i,
  /(^|\/)\.windsurfrules$/i,
  /(^|\/)\.windsurf\/rules\/.+/i,
  /(^|\/)\.clinerules(\/.+)?$/i,
  /(^|\/)\.junie\/guidelines\.md$/i,
  /(^|\/)\.kiro\/steering\/.+\.md$/i,
  /(^|\/)\.aider\.conf\.yml$/i,
  /(^|\/)[^/]*\.prompt\.md$/i,
];

/** Unicode ranges invisible to a human reader (ARCHITECTURE.md §6.9); a BOM at the very start of the file is not one. */
const HIDDEN_RANGES = [
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
  [0xe0000, 0xe007f],
];
const isHidden = (codepoint, atStart) =>
  !(codepoint === 0xfeff && atStart) && HIDDEN_RANGES.some(([a, b]) => codepoint >= a && codepoint <= b);

/** Hidden characters of a text: { line, codepoint: "U+XXXX" }, in reading order. */
export function hiddenCharacters(text) {
  const hidden = [];
  let line = 1;
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i);
    if (isHidden(cp, i === 0)) hidden.push({ line, codepoint: "U+" + cp.toString(16).toUpperCase().padStart(4, "0") });
    if (text[i] === "\n") line++;
    i += cp > 0xffff ? 2 : 1;
  }
  return hidden;
}

/**
 * The `agents` source: every instruction file, its size (lines, words) and the hidden characters it holds.
 * @returns {Array<{file,lines,words,hidden}>} sorted by file
 */
export function collectAgents(appDir) {
  const items = [];
  for (const rel of listFiles(appDir).filter((f) => PATTERNS.some((re) => re.test(f)))) {
    const text = fs.readFileSync(path.join(appDir, rel), "utf8");
    items.push({
      file: rel,
      lines: text.split(/\r?\n/).length,
      words: text.split(/\s+/).filter(Boolean).length,
      hidden: hiddenCharacters(text),
    });
  }
  return items.sort((a, b) => a.file.localeCompare(b.file));
}
