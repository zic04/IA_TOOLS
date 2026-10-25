// Proofs ("file:line" code spans, ARCHITECTURE.md §6.10 §2.4): extraction, recording (hash + first cited line,
// at marking time) and locating them again later (intact, moved, or broken) after the application has changed.
import fs from "node:fs";
import { hashText } from "../core/hash.mjs";
import { listFiles } from "../facts/common.mjs";
import { fileInside } from "../core/confine.mjs";

/**
 * Same file family as `PROOF` of engine/audit/audit.mjs (tested for parity: every PROOF_REF match is a PROOF
 * match too), with capturing groups: 1 = file, 2 = from line, 3 = to line (optional, a range). Linear (RULES.md
 * S5): the text up to the ":" is read once and its end checked behind (a lazy start before a file name would try
 * every split of a long word), and the line number is never split before the rest of the span.
 */
export const PROOF_REF =
  /`([^`\n:]*)(?<=[\w-]\.[A-Za-z]\w{0,7}|Dockerfile|Makefile|Procfile|Jenkinsfile):(\d+)(?:-(\d+))?(?!\d)[^`\n]*`/g;

/**
 * Every `file:line` (or `file:line-line`) proof of a Markdown page. Ignored: a code span that is a URL (`://`),
 * and one that starts with "[[" (a badge written in a code span to show its syntax, e.g. `[[verified a.ts:4]]`).
 * The file is the last word before ":line" (`see lib/orders.ts:42` → `lib/orders.ts`).
 * With `appDir`, each proof also gets `path`: the file in the application (resolveProofFile), or null.
 * @returns {Array<{ ref: string, file: string, path?: string|null, from: number, to: number|undefined, span: string, index: number }>}
 */
export function extractProofs(markdown, { appDir } = /** @type {{ appDir?: string }} */ ({})) {
  const out = [];
  const push = (span, index, file, from, to) => {
    const proof = { ref: to !== undefined ? `${file}:${from}-${to}` : `${file}:${from}`, file, from, to, span, index };
    if (appDir) proof.path = resolveProofFile(appDir, file);
    out.push(proof);
  };
  for (const m of markdown.matchAll(PROOF_REF)) {
    const span = m[0];
    if (span.includes("://") || span.startsWith("`[[")) continue;
    push(span, m.index, m[1].split(/\s+/).pop(), Number(m[2]), m[3] !== undefined ? Number(m[3]) : undefined);
  }
  // A verified claim badge naming its source (`[[verified lib/orders.ts:42]]`, ARCHITECTURE.md §6.9) is a proof too.
  // Code spans are blanked first (same length, so the indexes hold): a badge shown in one only explains the syntax.
  const masked = markdown.replace(/`[^`\n]*`/g, (s) => " ".repeat(s.length));
  for (const m of masked.matchAll(PROOF_BADGE)) {
    const ref = FILE_LINE.exec(m[1]);
    if (!ref) continue;
    push(
      markdown.slice(m.index, m.index + m[0].length),
      m.index,
      ref[1],
      Number(ref[2]),
      ref[3] !== undefined ? Number(ref[3]) : undefined,
    );
  }
  return out.sort((a, b) => a.index - b.index);
}

/**
 * A verified claim badge (en, fr), its text in group 1: from its first character that is not a blank, 500 characters
 * at most (badges never closed are not each read to the end of their line).
 */
const PROOF_BADGE = /\[\[(?:verified|verifie)\s+([^\s\]][^\]\n]{0,500}?)\]\](?!\])/g;
/** A file:line(-line) inside a badge's text: 1 = file, 2 = from, 3 = to. Same file family as PROOF_REF. */
const FILE_LINE = /((?:[\w@./-]*[\w-]\.[A-Za-z]\w{0,7}|Dockerfile|Makefile|Procfile|Jenkinsfile)):(\d+)(?:-(\d+))?/;

const appFilesCache = new Map();

/**
 * The file of the application a proof names. Writers cite a short path once the full one was given
 * (`tokens-table.tsx:42` after `frontend/src/components/admin/tokens-table.tsx`), or a path relative to a sub-project
 * (`app/routers/tokens.py` in `api/`): the path as written when it exists, else the one file of the application
 * whose path ends with it (a whole-segment suffix), else null — two candidates are never guessed between. A path
 * as written that lies outside the application (`../`, a link or a junction followed: proofFile), present there or
 * missing, is none, and is never looked for by its end inside: the answer never tells whether a file outside exists.
 * The application's files are listed once per folder (listFiles: no node_modules, no documentation project, no link).
 */
export function resolveProofFile(appDir, file) {
  const clean = file.replace(/\\/g, "/").replace(/^\.\//, "");
  const written = proofFile(appDir, { file: clean });
  // Neither `clean` (the proof's path, a dependency of the page) nor a file inside that ends like it.
  if (written === "outside") return null;
  if (written) return clean;
  if (!appFilesCache.has(appDir)) appFilesCache.set(appDir, listFiles(appDir));
  const found = appFilesCache.get(appDir).filter((f) => f.endsWith("/" + clean));
  return found.length === 1 ? found[0] : null;
}

/**
 * The file a proof cites (`proof.path` when it was resolved, extractProofs with appDir, else as written): its real
 * path when it is a file of the application; "outside" when it climbs out of it (`../`) or lies outside it, present
 * there or missing (a link or a junction followed, SECURITY.md: never read); null when there is no such file
 * (fileInside).
 * @param {string} appDir
 * @param {{ file: string, path?: string|null }} proof
 * @returns {string|null}
 */
export const proofFile = (appDir, proof) => fileInside(appDir, proof.path || proof.file);

/**
 * Records a proof at marking time: the hash of the cited lines and the first one's trimmed text (120 characters),
 * used later to find the lines again even if they moved. Null when the file does not exist, is outside the application
 * (proofFile: never read), or `from` is beyond the file's last line.
 */
export function recordProof(appDir, proof) {
  const real = proofFile(appDir, proof);
  if (!real || real === "outside") return null;
  const lines = fs.readFileSync(real, "utf8").split(/\r?\n/);
  if (proof.from > lines.length) return null;
  const to = proof.to ?? proof.from;
  return {
    hash: hashText(lines.slice(proof.from - 1, to).join("\n")),
    text: lines[proof.from - 1].trim().slice(0, 120),
  };
}

/**
 * Finds a recorded proof again in the application as it is now.
 * @param {{ current: string|null, renamedTo: string|null, recorded: { hash: string, text: string }, proof: object }} p
 *   current: the text of the file that now holds the proof (the original file if it still exists, else the file
 *   it was renamed to, read by the caller); null when neither exists. renamedTo: the new name, when git reports
 *   one (only used to name the result; the caller already read its content into `current`).
 * @returns {{ status: "intact" }|{ status: "moved", newFile: string, newFrom: number, newTo: number }|
 *   { status: "broken", reason: "fileDeleted"|"textNotFound"|"ambiguous" }}
 */
export function locateProof({ current, renamedTo, recorded, proof }) {
  if (current === null) return { status: "broken", reason: "fileDeleted" };
  const target = recorded.text.trim().slice(0, 120);
  if (!target) return { status: "broken", reason: "textNotFound" }; // a blank line cited: never matched back
  const lines = current.split(/\r?\n/);
  const to = proof.to ?? proof.from;
  if (proof.from <= lines.length && hashText(lines.slice(proof.from - 1, to).join("\n")) === recorded.hash)
    return { status: "intact" };
  const matches = [];
  for (let i = 0; i < lines.length; i++) if (lines[i].trim().slice(0, 120) === target) matches.push(i);
  if (matches.length === 1) {
    const newFrom = matches[0] + 1;
    return { status: "moved", newFile: renamedTo || proof.file, newFrom, newTo: newFrom + (to - proof.from) };
  }
  return { status: "broken", reason: matches.length === 0 ? "textNotFound" : "ambiguous" };
}

/** Rewrites every occurrence of `proof.span` in `markdown`, moving only its "file:from(-to)" reference (same
 * range length); the rest of the span, and the rest of the page, is untouched. */
export function rewriteProof(markdown, proof, { newFile, newFrom, newTo }) {
  const oldRef = proof.to !== undefined ? `${proof.file}:${proof.from}-${proof.to}` : `${proof.file}:${proof.from}`;
  const newRef = proof.to !== undefined ? `${newFile}:${newFrom}-${newTo}` : `${newFile}:${newFrom}`;
  const newSpan = proof.span.split(oldRef).join(newRef);
  return markdown.split(proof.span).join(newSpan);
}
