// `db` source (ARCHITECTURE.md §6.9): tables from a Prisma schema, SQLAlchemy models and SQL migrations. Row-level
// security (`rls`) and policies only ever come from SQL (Prisma and SQLAlchemy do not express them): one item is
// written per place a table is defined, so that a Prisma model and the migration that enables RLS on the same
// table both appear, each with its own file and its own share of the information.
//   item: { table, columns, file, rls, policies }
import fs from "node:fs";
import path from "node:path";
import { listFiles } from "./common.mjs";

const NOT_A_COLUMN = /^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)$/i;

/** First file under `appDir` whose name is `name` (anywhere), or null. */
const findFirst = (appDir, name) => listFiles(appDir).find((f) => f === name || f.endsWith("/" + name)) ?? null;

/** Tables of a Prisma schema: `model X { … }`, columns = field names, table = `@@map("…")` or the model name. */
export function collectPrisma(appDir) {
  const rel = findFirst(appDir, "schema.prisma");
  if (!rel) return [];
  const text = fs.readFileSync(path.join(appDir, rel), "utf8");
  const items = [];
  for (const m of text.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const [, model, body] = m;
    let table = model;
    const columns = [];
    for (const raw of body.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("@@map")) {
        const mm = /@@map\(\s*"([^"]+)"/.exec(line);
        if (mm) table = mm[1];
        continue;
      }
      if (line.startsWith("@@") || line.startsWith("//")) continue;
      const f = /^(\w+)\s+/.exec(line);
      if (f) columns.push(f[1]);
    }
    items.push({ table, columns, file: rel, rls: false, policies: [] });
  }
  return items;
}

/** Tables of SQLAlchemy models: `class X(Base): __tablename__ = "…"`, columns = Column(…) / mapped_column(…) names. */
export function collectSqlAlchemy(appDir) {
  const items = [];
  for (const rel of listFiles(appDir).filter((f) => f.endsWith(".py"))) {
    const text = fs.readFileSync(path.join(appDir, rel), "utf8");
    if (!/__tablename__/.test(text)) continue;
    // \r?\n, never a bare \n: a Windows checkout (CRLF) must match just as well as a Unix one (LF).
    for (const m of text.matchAll(/class\s+(\w+)\s*\([^)]*\):\r?\n([\s\S]*?)(?=\r?\nclass\s+\w|\r?\n*$)/g)) {
      const body = m[2];
      const tm = /__tablename__\s*=\s*["']([^"']+)["']/.exec(body);
      if (!tm) continue;
      const columns = [...body.matchAll(/^\s*(\w+)\s*(?::[^=\n]+)?=\s*(?:mapped_column|Column)\(/gm)].map((cm) => cm[1]);
      items.push({ table: tm[1], columns, file: rel, rls: false, policies: [] });
    }
  }
  return items;
}

/** Tables of SQL migrations: CREATE TABLE (columns), ENABLE ROW LEVEL SECURITY (rls), CREATE POLICY … ON (policies). */
export function collectSqlMigrations(appDir) {
  const items = new Map();
  const get = (table, file) => items.get(table) || items.set(table, { table, columns: [], file, rls: false, policies: [] }).get(table);
  for (const rel of listFiles(appDir).filter((f) => f.endsWith(".sql"))) {
    const text = fs.readFileSync(path.join(appDir, rel), "utf8");
    for (const m of text.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"?(\w+)"?\s*\(([\s\S]*?)\)\s*;/gi))
      get(m[1], rel).columns = m[2]
        .split(",")
        .map((c) => c.trim().split(/\s+/)[0].replace(/"/g, ""))
        .filter((c) => c && !NOT_A_COLUMN.test(c));
    for (const m of text.matchAll(/ALTER TABLE\s+"?(\w+)"?\s+ENABLE ROW LEVEL SECURITY/gi)) get(m[1], rel).rls = true;
    for (const m of text.matchAll(/CREATE POLICY\s+"?([\w-]+)"?\s+ON\s+"?(\w+)"?/gi)) get(m[2], rel).policies.push(m[1]);
  }
  return [...items.values()];
}

/**
 * The `db` source: Prisma, SQLAlchemy, then SQL migrations.
 * @returns {Array<{table,columns,file,rls,policies}>} sorted by table then file
 */
export function collectDb(appDir) {
  return [...collectPrisma(appDir), ...collectSqlAlchemy(appDir), ...collectSqlMigrations(appDir)].sort((a, b) => a.table.localeCompare(b.table) || a.file.localeCompare(b.file));
}
