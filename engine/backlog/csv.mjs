// CSV files for the backlog tools' importers (RFC 4180): every cell quoted, a quote doubled, a line break kept inside
// its cell. A cell a spreadsheet would read as a formula (one starting with "=", "+", "-", "@", a tab or a carriage
// return: OWASP's CSV injection) starts with an apostrophe instead. No expression.

/** The first characters that make a spreadsheet read a cell as a formula. */
const FORMULA = new Set(["=", "+", "-", "@", "\t", "\r"]);

/**
 * One cell, quoted.
 * @param {unknown} value
 */
function csvCell(value) {
  let s = String(value ?? "");
  if (FORMULA.has(s[0])) s = "'" + s;
  return `"${s.split('"').join('""')}"`;
}

/**
 * A whole file: its rows, each ended by `eol`; `bom` first when the importer needs it to read UTF-8 (Azure DevOps).
 * @param {unknown[][]} rows
 * @param {{ bom?: boolean, eol?: string }} [o]
 */
export function csvFile(rows, { bom = false, eol = "\n" } = {}) {
  return (bom ? "\uFEFF" : "") + rows.map((row) => row.map(csvCell).join(",") + eol).join("");
}
