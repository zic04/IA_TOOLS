// `::erd{tables?}` (`::mcd`): the entity-relationship diagram of the application, drawn at build time from
// facts/db.json (doc-kit facts --source db): one box per table with its columns, one arrow per reference (a Prisma
// relation, a SQLAlchemy ForeignKey, a SQL REFERENCES). Inline SVG, coloured by the site's theme (classes erd-*),
// so it follows light and dark like the hand-drawn diagrams.

const BOX_W = 200;
const HEAD_H = 28;
const ROW_H = 18;
const MAX_ROWS = 10;
const GAP_X = 60;
const GAP_Y = 56;

/** Tables of the db facts, merged by name (a table defined in several places), sorted by links then name. */
export function erdTables(items, only = null) {
  const byName = new Map();
  for (const it of items || []) {
    if (!it || typeof it.table !== "string") continue;
    const t = byName.get(it.table) || { table: it.table, columns: [], references: new Set() };
    for (const c of it.columns || []) if (!t.columns.includes(c)) t.columns.push(c);
    for (const r of it.references || []) t.references.add(r);
    byName.set(it.table, t);
  }
  let tables = [...byName.values()];
  if (only) tables = tables.filter((t) => only.includes(t.table));
  const names = new Set(tables.map((t) => t.table));
  for (const t of tables) t.references = [...t.references].filter((r) => names.has(r) && r !== t.table).sort();
  const degree = (t) => t.references.length + tables.filter((o) => o.references.includes(t.table)).length;
  return tables.sort((a, b) => degree(b) - degree(a) || a.table.localeCompare(b.table));
}

/** Where a segment from the centre of box `a` towards point (x, y) leaves the box. */
function border(a, x, y) {
  const cx = a.x + a.w / 2;
  const cy = a.y + a.h / 2;
  const dx = x - cx;
  const dy = y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const s = Math.min(dx ? a.w / 2 / Math.abs(dx) : Infinity, dy ? a.h / 2 / Math.abs(dy) : Infinity);
  return { x: cx + dx * s, y: cy + dy * s };
}

/**
 * SVG of the diagram, or "" when there is no table.
 * @param {object[]} items   facts/db.json items
 * @param {{ esc: Function, title?: string, only?: string[]|null, more?: (n: number) => string }} o
 */
export function renderErd(items, { esc, title = "", only = null, more = (n) => `+${n}` }) {
  const tables = erdTables(items, only);
  if (!tables.length) return "";
  const cols = Math.max(1, Math.ceil(Math.sqrt(tables.length)));
  const boxes = new Map();
  const rowHeights = [];
  tables.forEach((t, i) => {
    const shown = Math.min(t.columns.length, MAX_ROWS) + (t.columns.length > MAX_ROWS ? 1 : 0);
    const h = HEAD_H + Math.max(1, shown) * ROW_H + 8;
    const r = Math.floor(i / cols);
    rowHeights[r] = Math.max(rowHeights[r] || 0, h);
    boxes.set(t.table, { t, w: BOX_W, h, col: i % cols, row: r });
  });
  const rowY = [];
  rowHeights.reduce((y, h, r) => ((rowY[r] = y), y + h + GAP_Y), 0);
  for (const b of boxes.values()) {
    b.x = b.col * (BOX_W + GAP_X);
    b.y = rowY[b.row];
  }
  const width = Math.min(cols, tables.length) * (BOX_W + GAP_X) - GAP_X;
  const height = rowY.at(-1) + rowHeights.at(-1);
  const pad = 12;

  const edges = [];
  for (const b of boxes.values())
    for (const ref of b.t.references) {
      const target = boxes.get(ref);
      const from = border(b, target.x + target.w / 2, target.y + target.h / 2);
      const to = border(target, b.x + b.w / 2, b.y + b.h / 2);
      edges.push(`<line class="erd-edge" x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${to.x.toFixed(1)}" y2="${to.y.toFixed(1)}" marker-end="url(#erd-arrow)"/>`);
    }
  const shapes = [...boxes.values()].map((b) => {
    const rows = b.t.columns.slice(0, MAX_ROWS).map((c, i) => `<text class="erd-col" x="${b.x + 10}" y="${b.y + HEAD_H + 14 + i * ROW_H}">${esc(c)}</text>`);
    if (b.t.columns.length > MAX_ROWS) rows.push(`<text class="erd-col erd-more" x="${b.x + 10}" y="${b.y + HEAD_H + 14 + MAX_ROWS * ROW_H}">${esc(more(b.t.columns.length - MAX_ROWS))}</text>`);
    return `<g class="erd-table"><rect class="erd-box" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="6"/><path class="erd-head" d="M${b.x} ${b.y + HEAD_H}V${b.y + 6}a6 6 0 0 1 6 -6H${b.x + b.w - 6}a6 6 0 0 1 6 6V${b.y + HEAD_H}Z"/><text class="erd-name" x="${b.x + 10}" y="${b.y + 19}">${esc(b.t.table)}</text>${rows.join("")}</g>`;
  });
  return `<svg class="erd" xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${width + 2 * pad} ${height + 2 * pad}" width="${width + 2 * pad}" role="img" aria-label="${esc(title)}"><defs><marker id="erd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="erd-arrow" d="M0 0L10 5L0 10z"/></marker></defs>${edges.join("")}${shapes.join("")}</svg>`;
}
