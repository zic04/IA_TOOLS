// `new --prefill` (ARCHITECTURE.md §6.11): fills a freshly created page's main table from the
// facts (`doc-kit facts`) instead of leaving every cell as a guidance placeholder. The template marks that table
// with a line right before it, `<!-- doc-kit:prefill source="env" -->`; `new` always removes the marker, with or
// without `--prefill` (like the capture variant markers of ARCHITECTURE.md §6.4).
import { KitError, EXIT } from "../project/errors.mjs";

export const PREFILL_MARKER = /^[ \t]*<!--\s*doc-kit:prefill\s+source="([a-z]+)"\s*-->[ \t]*\r?\n/gm;

/** Removes every prefill marker, whatever its source (a template has at most one, but this never assumes it). */
export function stripPrefillMarkers(text) {
  return text.replace(PREFILL_MARKER, "");
}

/** Prefillable page type → facts source (ARCHITECTURE.md §6.9, §6.11). */
export const PREFILL_SOURCES = Object.freeze({
  variables: "env",
  "api-surface": "api",
  "data-model": "db",
  dependencies: "dependencies",
  "agent-instructions": "agents",
});

/** Is this template's own language French (detected from the "consigne" guidance marker it already uses)? */
const isFrench = (text) => /<!--\s*consigne\s*:/i.test(text);

/** A guidance comment in the template's own language. */
const guidanceOf = (text) =>
  isFrench(text) ? (cell) => `<!-- consigne : ${cell} -->` : (cell) => `<!-- guidance: ${cell} -->`;

/** The claim-status badge word of the template's own language (ARCHITECTURE.md §6.9: [[verified]] / [[verifie]]). */
const verifiedOf = (text) => (isFrench(text) ? "verifie" : "verified");

/** path:line[-line] proofs of an env variable's reads, or "—" without any (ARCHITECTURE.md §6.11). */
const filesCell = (files) => (files?.length ? files.map((f) => `\`${f}\``).join(", ") : "—");

/**
 * Key cells of one row, by column index (0-based); a column not returned here falls back to the example row's
 * own text, turned into a guidance comment (ARCHITECTURE.md §6.11). `verified`: the claim-status badge word in the
 * template's own language. `.env.example` stands for the longer "this variable is only known from an example
 * env file" (a short, language-neutral notation, read the same in English and French).
 */
const KEY_CELLS = {
  env: (item) => ({
    0: `\`${item.name}\``,
    2: filesCell(item.files),
    ...(item.example && !item.files?.length ? { 1: "`.env.example`" } : {}),
  }),
  api: (item, verified) => ({ 0: item.method, 1: `\`${item.route}\``, 5: `[[${verified} file]]` }),
  db: (item, verified) => ({ 0: `\`${item.table}\``, 1: (item.columns || []).join(", "), 3: `[[${verified} file]]` }),
  dependencies: (item) => ({ 0: `\`${item.name}\``, 1: item.version, ...(item.license ? { 3: item.license } : {}) }),
  agents: (item) => ({
    0: `\`${item.file}\``,
    1: String(item.lines),
    2: String(item.words),
    3: String(item.hidden?.length || 0),
  }),
};

/** Only the direct dependencies are prefilled (ARCHITECTURE.md §6.11): a dev or transitive package tells a reviewer little. */
const itemsFor = (source, items) => (source === "dependencies" ? items.filter((i) => i.direct === true) : items);

/** Cells of a Markdown table row ("| a | b |" → ["a", "b"]), trimmed. */
function cellsOf(row) {
  const trimmed = row.trim();
  const inner = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((c) => c.trim());
}

const rowOf = (cells) => `| ${cells.join(" | ")} |`;

/**
 * Fills the table right after the `doc-kit:prefill source="<source>"` marker, one row per item, then removes
 * the marker (ARCHITECTURE.md §6.11).
 * @param {string} text
 * @param {{ source: string, items: object[], template?: string }} p   `template`: only for the error message
 * @returns {{ text: string, rows: number }}
 * @throws {KitError} EXIT.USAGE "new.noPrefill" when `text` has no marker for `source`
 */
export function prefillTemplate(text, { source, items, template }) {
  const re = new RegExp(PREFILL_MARKER.source, "gm");
  let m;
  let marker = null;
  while ((m = re.exec(text))) {
    if (m[1] === source) {
      marker = m;
      break;
    }
  }
  if (!marker) throw new KitError(EXIT.USAGE, "new.noPrefill", { template });

  const after = text.slice(marker.index + marker[0].length);
  const lines = after.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  const header = lines[i];
  const separator = lines[i + 1];
  const exampleRow = lines[i + 2];
  const tableEnd = i + 3; // first line after the example row, where the rest of the template resumes

  const rows = itemsFor(source, items);
  const exampleCells = cellsOf(exampleRow);
  const guidance = guidanceOf(text);
  const verified = verifiedOf(text);
  const keyOf = KEY_CELLS[source];

  const dataLines = rows.length
    ? rows.map((item) => {
        const key = keyOf(item, verified);
        return rowOf(exampleCells.map((cell, idx) => (idx in key ? key[idx] : guidance(cell))));
      })
    : [exampleRow];

  const rebuilt = [header, separator, ...dataLines, ...lines.slice(tableEnd)].join("\n");
  const text2 = text.slice(0, marker.index) + rebuilt;
  return { text: text2, rows: rows.length };
}
