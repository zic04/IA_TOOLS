// Behaviour signals of JavaScript and TypeScript code (ARCHITECTURE.md §6.9, source `behaviours`), JSX, Vue and
// Svelte included: how a list is searched, filtered, sorted and paged, in the browser (an array's `.filter`) or in a
// query (Prisma, Drizzle, Knex, Sequelize, TypeORM, Mongoose, a search engine), which events trigger it, which query
// parameters the server reads, and the exports, imports, notifications and scheduled jobs. Every expression is
// bounded, without two blank runs side by side (RULES.md S5, test/tools/redos-worker.mjs); a call's arguments are read
// once, by a linear walk (callSpan), the next match starting after them.
import { callSpan, paramSignal } from "./behaviour-common.mjs";

const ID = "[A-Za-z_$][\\w$]{0,63}";

/** The expressions of this module, by name (the ReDoS test runs each of them). */
export const JS_PATTERNS = Object.freeze({
  // ─── In the browser: an array narrowed by `.filter(…)` ────────────────────────────────────────────────────────
  arrayFilter: /\.filter\(/g,
  // o.customer.toLowerCase().includes(q): the field, the transformations, the comparison
  textMatch: new RegExp(
    `\\.(${ID})((?:\\.\\w{1,24}\\([^()]{0,40}\\)){0,4})\\.(includes|startsWith|endsWith|indexOf)\\(`,
    "g",
  ),
  equality: new RegExp(`\\.(${ID})\\s*(===|==)\\s*(?!null\\b|undefined\\b|true\\b|false\\b)[\\w$"'\`]`, "g"),
  range: new RegExp(`\\.(${ID})\\s*(>=|<=|>|<)\\s*[\\w$(]`, "g"),
  localeSort: new RegExp(
    `\\.sort\\(\\s*(?:\\(\\s*)?(${ID})\\s*,\\s*${ID}\\s*(?:\\)\\s*)?=>\\s*[^;]{0,120}?\\1\\.(${ID})\\s*\\.localeCompare\\(`,
    "g",
  ),
  inputTrim: /\.value\s*\.trim\(\)/g,
  // ─── Triggers ──────────────────────────────────────────────────────────────────────────────────────────────────
  domEvent: /addEventListener\(\s*["'](input|change|keyup|keydown|keypress|submit|search)["']/g,
  jsxEvent: /\bon(Change|Input|KeyUp|KeyDown|KeyPress|Submit|Search)\s*=\s*\{/g,
  vueEvent: /(?:@|v-on:)(input|change|keyup|keydown|submit)\b/g,
  debounce: /\b(debounce|useDebounce|useDebouncedValue|useDebouncedCallback|throttle)\s*\(/g,
  // ─── Queries: Prisma (and the object syntax shared by TypeORM), Sequelize, Mongoose ────────────────────────────
  prismaCall: /\.(findMany|findFirst|findUnique|findAll|findAndCountAll|find|count|aggregate|groupBy|findAndCount)\(/g,
  objectOperator: new RegExp(
    `\\b(${ID})\\s*:\\s*\\{\\s*(contains|startsWith|endsWith|equals|search|in|gte|lte|gt|lt|not)\\s*:`,
    "g",
  ),
  insensitive: /\bmode\s*:\s*["']insensitive["']/g,
  objectOrder: new RegExp(
    `\\b(?:orderBy|order)\\s*:\\s*(?:\\[\\s*)?\\{\\s*(${ID})\\s*:\\s*["'](asc|desc|ASC|DESC)["']`,
    "g",
  ),
  takeSkip: /\b(take|skip|cursor|limit|offset)\s*:\s*(\d{1,6}\b)?/g,
  sequelizeOp: new RegExp(
    `\\b(${ID})\\s*:\\s*\\{\\s*\\[Op\\.(like|iLike|substring|startsWith|endsWith|in|gte|lte|gt|lt|between)\\]`,
    "g",
  ),
  sequelizeOrder: /\border\s*:\s*\[\s*\[\s*["'](\w{1,64})["']\s*,\s*["'](ASC|DESC|asc|desc)["']/g,
  typeormLike: new RegExp(`\\b(${ID})\\s*:\\s*(ILike|Like)\\(`, "g"),
  mongoRegex: new RegExp(`\\b(${ID})\\s*:\\s*\\{\\s*\\$regex\\s*:`, "g"),
  mongoOptions: /\$options\s*:\s*["'][a-z]{0,6}i/g,
  mongoText: /\$text\s*:\s*\{\s*\$search/g,
  mongoSort: new RegExp(`\\.sort\\(\\s*\\{\\s*["']?(${ID})["']?\\s*:\\s*(-1|1|["'](?:asc|desc)["'])`, "g"),
  // ─── Query builders: Drizzle, Knex ─────────────────────────────────────────────────────────────────────────────
  drizzleLike: new RegExp(`\\b(ilike|like)\\(\\s*[\\w$.]{0,40}\\.(${ID})\\s*,`, "g"),
  drizzleOrder: new RegExp(`\\.orderBy\\(\\s*(asc|desc)\\(\\s*[\\w$.]{0,40}\\.(${ID})`, "g"),
  knexWhereLike: /\.(?:where|orWhere|andWhere)\(\s*["'](\w{1,64})["']\s*,\s*["'](like|ilike|LIKE|ILIKE)["']/g,
  knexOrder: /\.orderBy\(\s*["'](\w{1,64})["'](?:\s*,\s*["'](asc|desc)["'])?/g,
  chainLimit: /\.(limit|offset|skip)\(\s*(?:(\d{1,6})\s*)?\)/g,
  // ─── Search engines ────────────────────────────────────────────────────────────────────────────────────────────
  engineImport:
    /["'](@elastic\/elasticsearch|@opensearch-project\/opensearch|algoliasearch|meilisearch|typesense|fuse\.js|minisearch|flexsearch|lunr)["']/g,
  fuzzy: /\bfuzziness\s*:|\bthreshold\s*:\s*0?\.\d/g,
  // ─── Query parameters read by the server, or by the page ───────────────────────────────────────────────────────
  searchParam: /\b(?:searchParams|params|urlParams|query)\s*\.\s*get\(\s*["'](\w{1,40})["']\s*\)/g,
  reqQuery: /\breq(?:uest)?\.query\.(\w{1,40})\b/g,
  reqQueryIndex: /\breq(?:uest)?\.query\[\s*["'](\w{1,40})["']\s*\]/g,
  reqQueryDestructure: /\{([^{}]{1,300})\}\s*=\s*(?:req|request)\.query\b/g,
  // ─── Scope: a query limited to the reader's own items ──────────────────────────────────────────────────────────
  ownerScope:
    /\b(userId|ownerId|authorId|createdById|tenantId|orgId|organizationId|teamId|regionId|region|accountId)\s*:\s*(?:session|user|currentUser|ctx|req|auth|me|viewer)\b/g,
  // ─── Export, import, notification, scheduled jobs ──────────────────────────────────────────────────────────────
  exportCsv: /["']text\/csv["']|\bjson2csv\b|\bPapa\.unparse\(|\bto_csv\b|\.csv["'`]\s*[,)]/g,
  exportSheet: /\bXLSX\.(?:utils\.json_to_sheet|writeFile)\(|\bnew\s+ExcelJS\.Workbook\(|\bexceljs\b/g,
  download: /["']Content-Disposition["']\s*[:,]\s*[`"']attachment|\.download\s*=\s*["'`]/g,
  importFile:
    /\bPapa\.parse\(|["']csv-parse(?:\/sync)?["']|\bmulter\(|\btype=["']file["']|\bXLSX\.read\(|\.get\(\s*["']file["']\s*\)/g,
  email:
    /["'](nodemailer|@sendgrid\/mail|resend|postmark|mailgun\.js|@aws-sdk\/client-ses)["']|\.sendMail\(|\.emails\.send\(/g,
  sms: /["']twilio["']|\.messages\.create\(/g,
  push: /["']web-push["']|\.sendNotification\(|\bnew\s+Notification\(/g,
  cron: /\b(?:cron\.schedule|schedule\.scheduleJob|new\s+CronJob)\(\s*["'`]([^"'`\n]{1,64})["'`]|@Cron\(\s*["'`]([^"'`\n]{1,64})["'`]/g,
  interval: /\bsetInterval\(/g,
});

/** Fields an equality or a comparison names that are never a criterion of the reader's (an array's size, the DOM). */
const NOT_A_FIELD = new Set(["length", "keyCode", "target", "readyState"]);

/** A library named by an import, as a signal keeps it (engine/facts/behaviour-common.mjs). */
const LIBRARY = {
  "@elastic/elasticsearch": "elasticsearch",
  "@opensearch-project/opensearch": "opensearch",
  "fuse.js": "fuse",
  "@sendgrid/mail": "sendgrid",
  "mailgun.js": "mailgun",
  "@aws-sdk/client-ses": "ses",
};
const library = (spec) => LIBRARY[spec] ?? spec;

/**
 * Each call matched by `re` (ending with "("), its arguments read once: `fn(args, base, m)`, `base` being the index of
 * `args` in the text; the next match starts after them, so that nested calls are not read again. Stops when the sink
 * is full.
 */
function eachCall(re, text, sink, fn) {
  re.lastIndex = 0;
  for (let m = re.exec(text); m && !sink.full; m = re.exec(text)) {
    const open = m.index + m[0].length - 1;
    const { args, end } = callSpan(text, open);
    fn(args, open + 1, m);
    re.lastIndex = Math.max(end, re.lastIndex);
  }
}

/** Runs `re` on `text`, `base` being the index of `text` in the file, and calls `fn(m, index)` on each match. */
function scan(re, text, base, fn) {
  re.lastIndex = 0;
  for (const m of text.matchAll(re)) fn(m, base + m.index);
}

/** In the browser: an array narrowed by `.filter(…)`, sorted by `localeCompare`. */
function arrays(text, sink) {
  const P = JS_PATTERNS;
  const push = sink.push;
  eachCall(P.arrayFilter, text, sink, (args, base) => {
    scan(P.textMatch, args, base, (t, i) => {
      const chain = t[2];
      const signal = t[3] === "startsWith" ? "startsWith" : t[3] === "endsWith" ? "endsWith" : "contains";
      push({ family: "search", signal, field: t[1], via: "array" }, i);
      if (/\.to(?:Locale)?(?:Lower|Upper)Case\(/.test(chain))
        push({ family: "search", signal: "caseInsensitive", field: t[1], via: "array" }, i);
      if (chain.includes(".normalize("))
        push({ family: "search", signal: "accentsIgnored", field: t[1], via: "array" }, i);
    });
    scan(P.equality, args, base, (e, i) => {
      if (!NOT_A_FIELD.has(e[1])) push({ family: "filter", signal: "equals", field: e[1], via: "array" }, i);
    });
    scan(P.range, args, base, (r, i) => {
      if (!NOT_A_FIELD.has(r[1])) push({ family: "filter", signal: "range", field: r[1], via: "array" }, i);
    });
  });
  scan(P.localeSort, text, 0, (m, i) => push({ family: "sort", signal: "client", field: m[2], via: "array" }, i));
  scan(P.inputTrim, text, 0, (m, i) => push({ family: "trigger", signal: "trim", via: "dom" }, i));
}

/** The events that run a search or a filter, and a delay before it. */
function triggers(text, sink) {
  const P = JS_PATTERNS;
  const push = sink.push;
  scan(P.domEvent, text, 0, (m, i) => push({ family: "trigger", signal: m[1], via: "dom" }, i));
  scan(P.jsxEvent, text, 0, (m, i) => push({ family: "trigger", signal: m[1].toLowerCase(), via: "jsx" }, i));
  scan(P.vueEvent, text, 0, (m, i) => push({ family: "trigger", signal: m[1], via: "vue" }, i));
  eachCall(P.debounce, text, sink, (args, base, m) => {
    const delay = /,\s*(\d{1,5})\s*$/.exec(args.slice(-60));
    push({ family: "trigger", signal: "debounce", value: delay ? Number(delay[1]) : undefined, via: "js" }, m.index);
  });
}

/** A query's object (Prisma, TypeORM, Sequelize, Mongoose): its criteria, its order, its page. */
function objectQueries(text, sink) {
  const P = JS_PATTERNS;
  const push = sink.push;
  const OPERATOR = {
    contains: ["search", "contains"],
    startsWith: ["search", "startsWith"],
    endsWith: ["search", "endsWith"],
    search: ["search", "fullText"],
    equals: ["filter", "equals"],
    not: ["filter", "not"],
    in: ["filter", "in"],
    gte: ["filter", "range"],
    lte: ["filter", "range"],
    gt: ["filter", "range"],
    lt: ["filter", "range"],
  };
  const SEQUELIZE = {
    like: "contains",
    iLike: "contains",
    substring: "contains",
    startsWith: "startsWith",
    endsWith: "endsWith",
  };
  eachCall(P.prismaCall, text, sink, (args, base, m) => {
    const via = m[1].startsWith("findA") || m[1] === "findAndCountAll" ? "sequelize" : "orm";
    scan(P.objectOperator, args, base, (o, i) => {
      const [family, signal] = OPERATOR[o[2]];
      push({ family, signal, field: o[1], via }, i);
    });
    scan(P.insensitive, args, base, (o, i) => push({ family: "search", signal: "caseInsensitive", via }, i));
    scan(P.objectOrder, args, base, (o, i) =>
      push({ family: "sort", signal: "orderBy", field: o[1], value: o[2].toLowerCase(), via }, i),
    );
    scan(P.takeSkip, args, base, (o, i) => {
      const signal = o[1] === "take" || o[1] === "limit" ? "limit" : o[1] === "cursor" ? "cursor" : "offset";
      push({ family: "pagination", signal, value: o[2] ? Number(o[2]) : undefined, via }, i);
    });
    scan(P.sequelizeOp, args, base, (o, i) => {
      if (o[2] in SEQUELIZE) {
        push({ family: "search", signal: SEQUELIZE[o[2]], field: o[1], via: "sequelize" }, i);
        if (o[2] === "iLike") push({ family: "search", signal: "caseInsensitive", field: o[1], via: "sequelize" }, i);
      } else push({ family: "filter", signal: o[2] === "in" ? "in" : "range", field: o[1], via: "sequelize" }, i);
    });
    scan(P.sequelizeOrder, args, base, (o, i) =>
      push({ family: "sort", signal: "orderBy", field: o[1], value: o[2].toLowerCase(), via: "sequelize" }, i),
    );
    scan(P.typeormLike, args, base, (o, i) => {
      push({ family: "search", signal: "contains", field: o[1], via: "typeorm" }, i);
      if (o[2] === "ILike") push({ family: "search", signal: "caseInsensitive", field: o[1], via: "typeorm" }, i);
    });
    scan(P.mongoRegex, args, base, (o, i) => push({ family: "search", signal: "regex", field: o[1], via: "mongo" }, i));
    scan(P.mongoOptions, args, base, (o, i) => push({ family: "search", signal: "caseInsensitive", via: "mongo" }, i));
    scan(P.mongoText, args, base, (o, i) => push({ family: "search", signal: "fullText", via: "mongo" }, i));
  });
  scan(P.mongoSort, text, 0, (m, i) =>
    push(
      { family: "sort", signal: "orderBy", field: m[1], value: m[2].startsWith("-") ? "desc" : "asc", via: "mongo" },
      i,
    ),
  );
}

/** Query builders (Drizzle, Knex) and chained limits. */
function builders(text, sink) {
  const P = JS_PATTERNS;
  const push = sink.push;
  scan(P.drizzleLike, text, 0, (m, i) => {
    push({ family: "search", signal: "contains", field: m[2], via: "drizzle" }, i);
    if (m[1] === "ilike") push({ family: "search", signal: "caseInsensitive", field: m[2], via: "drizzle" }, i);
  });
  scan(P.drizzleOrder, text, 0, (m, i) =>
    push({ family: "sort", signal: "orderBy", field: m[2], value: m[1], via: "drizzle" }, i),
  );
  scan(P.knexWhereLike, text, 0, (m, i) => {
    push({ family: "search", signal: "contains", field: m[1], via: "knex" }, i);
    if (m[2].toLowerCase() === "ilike")
      push({ family: "search", signal: "caseInsensitive", field: m[1], via: "knex" }, i);
  });
  scan(P.knexOrder, text, 0, (m, i) =>
    push({ family: "sort", signal: "orderBy", field: m[1], value: m[2] || undefined, via: "knex" }, i),
  );
  scan(P.chainLimit, text, 0, (m, i) =>
    push(
      {
        family: "pagination",
        signal: m[1] === "limit" ? "limit" : "offset",
        value: m[2] ? Number(m[2]) : undefined,
        via: "js",
      },
      i,
    ),
  );
  scan(P.engineImport, text, 0, (m, i) =>
    push({ family: "search", signal: "engine", value: library(m[1]), via: "js" }, i),
  );
  scan(P.fuzzy, text, 0, (m, i) => push({ family: "search", signal: "fuzzy", via: "js" }, i));
}

/** The query parameters the code reads: each one's role from its name (paramSignal). */
function params(text, sink) {
  const P = JS_PATTERNS;
  const push = sink.push;
  const param = (name, i, via) => {
    const { family, signal } = paramSignal(name);
    push({ family, signal, field: name, via }, i);
  };
  scan(P.searchParam, text, 0, (m, i) => param(m[1], i, "query"));
  scan(P.reqQuery, text, 0, (m, i) => param(m[1], i, "query"));
  scan(P.reqQueryIndex, text, 0, (m, i) => param(m[1], i, "query"));
  scan(P.reqQueryDestructure, text, 0, (m, i) => {
    for (const part of m[1].split(",")) {
      const name = part.split(/[:=]/)[0].trim();
      if (/^\w{1,40}$/.test(name)) param(name, i, "query");
    }
  });
}

/** Scope, exports, imports, notifications and scheduled jobs. */
function effects(text, sink) {
  const P = JS_PATTERNS;
  const push = sink.push;
  scan(P.ownerScope, text, 0, (m, i) => push({ family: "scope", signal: "owner", field: m[1], via: "js" }, i));
  scan(P.exportCsv, text, 0, (m, i) => push({ family: "export", signal: "csv", via: "js" }, i));
  scan(P.exportSheet, text, 0, (m, i) => push({ family: "export", signal: "spreadsheet", via: "js" }, i));
  scan(P.download, text, 0, (m, i) => push({ family: "export", signal: "download", via: "js" }, i));
  scan(P.importFile, text, 0, (m, i) => push({ family: "import", signal: "file", via: "js" }, i));
  scan(P.email, text, 0, (m, i) =>
    push({ family: "notification", signal: "email", value: m[1] && library(m[1]), via: "js" }, i),
  );
  scan(P.sms, text, 0, (m, i) => push({ family: "notification", signal: "sms", via: "js" }, i));
  scan(P.push, text, 0, (m, i) => push({ family: "notification", signal: "push", via: "js" }, i));
  scan(P.cron, text, 0, (m, i) => push({ family: "schedule", signal: "cron", value: m[1] || m[2], via: "js" }, i));
  eachCall(P.interval, text, sink, (args, base, m) => {
    const every = /,\s*(\d{3,9})\s*$/.exec(args.slice(-40));
    if (every) push({ family: "schedule", signal: "interval", value: Number(every[1]), via: "js" }, m.index);
  });
}

/**
 * Every behaviour signal of a JavaScript or TypeScript text, pushed into the sink of its file (createSink).
 * @param {string} text
 * @param {{ push: (s: object, index: number) => void, full: boolean }} sink
 */
export function jsBehaviours(text, sink) {
  for (const read of [arrays, triggers, objectQueries, builders, params, effects]) if (!sink.full) read(text, sink);
}
