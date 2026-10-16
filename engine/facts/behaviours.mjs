// `behaviours` source (ARCHITECTURE.md §6.9): what the code says of how a feature behaves — how a list is searched,
// filtered, sorted and paged, which fields a form checks and how, the lists of values offered, what triggers a search,
// the data scope of a query, the exports, imports, notifications and scheduled jobs. Hints for the writer of a feature
// sheet (§6.8a), never a measure: each one is deduced from one line of the code, to be checked in it.
//   item: { family, signal, file, line, field?, value?, values?, route?, via }
//   family: search, filter, sort, pagination, trigger, validation, values, scope, export, import, notification,
//   schedule; signal: the hint (contains, caseInsensitive, orderBy, limit, required, max…); field: the field or
//   parameter named; value: a number or a short token (a page size, asc/desc, a cron expression); values: a list
//   (a select's options, an enum); via: what it was read in (array, prisma, sql, django, zod, html, openapi…).
// What is read: the code of the application (JavaScript, TypeScript, JSX, Vue, Svelte, Python, HTML) and its OpenAPI
// documents in JSON; never its tests, its comments, its dependencies (SKIP_DIRS) or a file over 512 KB. What is kept
// of the code: names, numbers, short tokens and short lists, each through a whitelist (engine/facts/behaviour-common.mjs).
import fs from "node:fs";
import path from "node:path";
import { listFiles } from "./common.mjs";
import { createSink, jsCommentRanges, pyCommentRanges, htmlCommentRanges } from "./behaviour-common.mjs";
import { jsBehaviours } from "./behaviour-js.mjs";
import { sqlBehaviours } from "./behaviour-sql.mjs";
import { pyBehaviours } from "./behaviour-py.mjs";
import { schemaBehaviours } from "./behaviour-schemas.mjs";
import { openapiBehaviours, OPENAPI_FILE, OPENAPI_YAML } from "./openapi.mjs";

/** A file larger than this is not read (a bundle, a generated file). */
const MAX_BYTES = 512 * 1024;
/** At most this many items in all. */
const MAX_ITEMS = 5000;

/** The language of a file of code, by its extension; null: not read. */
const LANGUAGES = {
  ".js": "js",
  ".jsx": "js",
  ".ts": "js",
  ".tsx": "js",
  ".mjs": "js",
  ".cjs": "js",
  ".vue": "js",
  ".svelte": "js",
  ".py": "py",
  ".html": "html",
  ".htm": "html",
};

/** A test, a fixture or a story: never the behaviour of the application itself. */
const TEST_FILE =
  /(^|\/)(__tests__|__mocks__|tests?|spec|e2e|cypress|playwright|fixtures?|stories)\/|\.(test|spec|stories|cy)\.[cm]?[jt]sx?$|(^|\/)(test_[^/]*|[^/]*_test|conftest)\.py$/;
/** A minified bundle or a generated declaration. */
const GENERATED = /\.min\.[cm]?js$|\.d\.ts$|(^|\/)(vendor|public\/build|static\/dist)\//;

/** A template, whose HTML comments (<!-- … -->) are comments too. */
const TEMPLATE = /\.(?:vue|svelte)$/;

/** The signals of one file of code, by its language; its comments (linear walks that skip strings) never read. */
function fileSignals(rel, text, language) {
  const ranges =
    language === "py"
      ? pyCommentRanges(text)
      : language === "html"
        ? htmlCommentRanges(text)
        : [...jsCommentRanges(text), ...(TEMPLATE.test(rel) ? htmlCommentRanges(text) : [])];
  const sink = createSink(rel, text, ranges);
  if (language === "js") jsBehaviours(text, sink);
  if (language === "py") pyBehaviours(text, sink);
  if (language !== "html") sqlBehaviours(text, sink);
  schemaBehaviours(text, language, sink);
  return sink.items;
}

/** One item per family, signal, file, line and field: the same hint found twice is kept once. */
function deduplicated(items) {
  const seen = new Set();
  return items.filter((it) => {
    const key = `${it.family}|${it.signal}|${it.file}|${it.line}|${it.field ?? ""}|${it.route ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The behaviour signals of the application, in file then line order.
 * @param {string} appDir
 * @returns {{ items: object[], unreadable: Array<{ file: string, reason: string }> }}
 */
export function collectBehaviours(appDir) {
  const items = [];
  const unreadable = [];
  for (const rel of listFiles(appDir)) {
    if (TEST_FILE.test(rel) || GENERATED.test(rel)) continue;
    const openapi = OPENAPI_FILE.test(rel);
    const language = LANGUAGES[path.extname(rel).toLowerCase()];
    if (!openapi && !language && !OPENAPI_YAML.test(rel)) continue;
    // The limit reached: this file and the next ones are not read, and this says so.
    if (items.length >= MAX_ITEMS) {
      unreadable.push({ file: rel, reason: "limitNext" });
      break;
    }
    if (OPENAPI_YAML.test(rel)) {
      unreadable.push({ file: rel, reason: "yaml" });
      continue;
    }
    const abs = path.join(appDir, rel);
    let text;
    try {
      if (fs.statSync(abs).size > MAX_BYTES) {
        unreadable.push({ file: rel, reason: "tooLarge" });
        continue;
      }
      text = fs.readFileSync(abs, "utf8");
    } catch {
      unreadable.push({ file: rel, reason: "read" });
      continue;
    }
    if (openapi) {
      let doc;
      try {
        doc = JSON.parse(text);
      } catch {
        unreadable.push({ file: rel, reason: "json" });
        continue;
      }
      const sink = createSink(rel, text, []);
      try {
        openapiBehaviours(doc, text, sink);
      } catch {
        unreadable.push({ file: rel, reason: "openapi" }); // a document the kit cannot follow: the others are read
        continue;
      }
      items.push(...sink.items);
    } else items.push(...fileSignals(rel, text, language));
    // This file took the last hints the limit allows: its others, and the next files, are not read — and this says so.
    if (items.length > MAX_ITEMS) {
      items.length = MAX_ITEMS;
      unreadable.push({ file: rel, reason: "limit" });
      break;
    }
  }
  const kept = deduplicated(items)
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line))
    .slice(0, MAX_ITEMS);
  return { items: kept, unreadable };
}
