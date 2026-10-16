// `behaviours` source (ARCHITECTURE.md §6.9): what the code says of how a feature behaves — how a list is searched,
// filtered, sorted and paged, which fields a form checks and how, the lists of values offered, what triggers a search,
// the data scope of a query, the exports, imports, notifications and scheduled jobs. Hints for the writer of a feature
// sheet (§6.8a), never a measure: each one is deduced from one line of the code, to be checked in it.
//   item: { family, signal, file, line, field?, value?, values?, route?, via }
//   family: search, filter, sort, pagination, trigger, validation, values, scope, export, import, notification,
//   schedule; signal: the hint (contains, caseInsensitive, orderBy, limit, required, max…); field: the field or
//   parameter named; value: a number or a short token (a page size, asc/desc, a cron expression); values: a list
//   (a select's options, an enum); via: what it was read in (array, prisma, sql, django, zod, html, openapi…).
// What is read: the code of the application (JavaScript, TypeScript, JSX, Vue, Svelte, Python, HTML), its OpenAPI
// documents in JSON, and the files the stack adapters read (Java, C#, PHP…: their `behaviours`); never its tests,
// its comments, its dependencies or a file over 512 KB (engine/facts/code-files.mjs). What is kept of the code:
// names, numbers, short tokens and short lists, each through a whitelist (engine/facts/behaviour-common.mjs).
import path from "node:path";
import { readableFiles, readCode } from "./code-files.mjs";
import { BUILT_IN_STACKS, runningStacks } from "./stacks.mjs";
import { createSink, jsCommentRanges, pyCommentRanges, htmlCommentRanges } from "./behaviour-common.mjs";
import { jsBehaviours } from "./behaviour-js.mjs";
import { sqlBehaviours } from "./behaviour-sql.mjs";
import { pyBehaviours } from "./behaviour-py.mjs";
import { schemaBehaviours } from "./behaviour-schemas.mjs";
import { openapiBehaviours, OPENAPI_FILE, OPENAPI_YAML } from "./openapi.mjs";

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

/** A template, whose HTML comments (<!-- … -->) are comments too. */
const TEMPLATE = /\.(?:vue|svelte)$/;

/** A language whose comments start with "#" (Ruby, Elixir, Perl), for a file only a stack adapter reads. */
const HASH_COMMENTS = /\.(?:rb|ex|exs|pl|pm)$/i;

/**
 * The signals of one file of code: the kit's readers of its language (js, py, html; none for a file only a stack
 * adapter reads), then each stack adapter that reads it; its comments (linear walks that skip strings) never read —
 * C-like (//, /* *\/) for the languages the kit does not read itself, "#" for those of HASH_COMMENTS.
 */
function fileSignals(rel, text, language, stacks) {
  const ranges =
    language === "py" || (!language && HASH_COMMENTS.test(rel))
      ? pyCommentRanges(text)
      : language === "html"
        ? htmlCommentRanges(text)
        : [...jsCommentRanges(text), ...(TEMPLATE.test(rel) ? htmlCommentRanges(text) : [])];
  const sink = createSink(rel, text, ranges);
  if (language === "js") jsBehaviours(text, sink);
  if (language === "py") pyBehaviours(text, sink);
  if (language && language !== "html") sqlBehaviours(text, sink);
  if (language) schemaBehaviours(text, language, sink);
  for (const adapter of stacks)
    if (!sink.full && readsBehaviours(adapter, rel, text)) adapter.behaviours(text, sink, rel);
  return sink.items;
}

/** Whether a stack adapter reads the behaviours of a file (its `files`, then its `marker`). */
const readsBehaviours = (adapter, rel, text) =>
  typeof adapter.behaviours === "function" &&
  rel.search(adapter.files) !== -1 &&
  (!adapter.marker || text.search(adapter.marker) !== -1);

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
 * @param {readonly import("./stacks.mjs").StackAdapter[]} [stacks]
 * @returns {{ items: object[], unreadable: Array<{ file: string, reason: string }> }}
 */
export function collectBehaviours(appDir, stacks = BUILT_IN_STACKS) {
  const items = [];
  const unreadable = [];
  const files = readableFiles(appDir);
  const readers = runningStacks(appDir, stacks, files).filter((a) => typeof a.behaviours === "function");
  for (const rel of files) {
    const openapi = OPENAPI_FILE.test(rel);
    const language = LANGUAGES[path.extname(rel).toLowerCase()];
    const stacked = !language && readers.some((a) => rel.search(a.files) !== -1);
    if (!openapi && !language && !stacked && !OPENAPI_YAML.test(rel)) continue;
    // The limit reached: this file and the next ones are not read, and this says so.
    if (items.length >= MAX_ITEMS) {
      unreadable.push({ file: rel, reason: "limitNext" });
      break;
    }
    if (OPENAPI_YAML.test(rel)) {
      unreadable.push({ file: rel, reason: "yaml" });
      continue;
    }
    const read = readCode(appDir, rel);
    if (!("text" in read)) {
      unreadable.push({ file: rel, reason: read.reason });
      continue;
    }
    const { text } = read;
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
    } else items.push(...fileSignals(rel, text, language, readers));
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
