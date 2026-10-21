// Behaviour signals of Python code (ARCHITECTURE.md §6.9, source `behaviours`): Django lookups and Django REST
// framework settings, SQLAlchemy, the query parameters of FastAPI, Flask and Django, and the exports, imports,
// notifications and scheduled jobs (Celery, APScheduler, schedule). Bounded expressions only (RULES.md S5,
// test/tools/redos-worker.mjs).
import { paramSignal } from "./behaviour-common.mjs";

const ID = "[A-Za-z_]\\w{0,63}";

/** The expressions of this module, by name (the ReDoS test runs each of them). */
export const PY_PATTERNS = Object.freeze({
  // ─── Django: lookups, ordering, pagination; Django REST framework settings ─────────────────────────────────────
  // customer__name__icontains=: one lazy, bounded name (it holds its own "__" path), then the lookup
  djangoLookup:
    /\b([A-Za-z]\w{0,120}?)__(icontains|contains|istartswith|startswith|iendswith|endswith|iexact|exact|in|gte|lte|gt|lt|range|search|unaccent|trigram_similar)\s*=/g,
  djangoOrder: /\.order_by\(\s*["'](-?)(\w{1,64})["']/g,
  paginator: /\bPaginator\(\s*[\w.]{1,64}\s*,\s*(\d{1,6})/g,
  pageSize: /^[ \t]*(paginate_by|page_size|max_page_size|PAGE_SIZE)\s*=\s*(\d{1,6})/gm,
  drfFields:
    /^[ \t]*(search_fields|ordering_fields|filterset_fields|filter_fields|ordering)\s*=\s*[[(]([^\])\n]{0,400})[\])]/gm,
  // ─── SQLAlchemy ────────────────────────────────────────────────────────────────────────────────────────────────
  alchemyMatch: new RegExp(`\\.(${ID})\\.(ilike|like|contains|startswith|endswith|in_|between)\\(`, "g"),
  alchemyLower: new RegExp(
    `\\bfunc\\.(lower|upper|unaccent)\\(\\s*[\\w.]{0,40}\\.(${ID})\\s*\\)\\s*\\.(?:i?like|contains)\\(`,
    "g",
  ),
  alchemyOrder: new RegExp(
    `\\.order_by\\(\\s*(?:(desc|asc)\\(\\s*)?[\\w.]{0,40}?\\.(${ID})(?:\\.(desc|asc)\\(\\))?`,
    "g",
  ),
  pyLimit: /\.(limit|offset)\(\s*(?:(\d{1,6})\s*)?\)/g,
  // ─── Query parameters ──────────────────────────────────────────────────────────────────────────────────────────
  fastapiQuery: new RegExp(`\\b(${ID})\\s*:\\s*[^,=()\\n]{1,60}=\\s*Query\\(\\s*([^,()\\n]{0,40})`, "g"),
  argsGet: /\brequest\.(?:args|GET|query_params)\.get\(\s*["'](\w{1,40})["'](?:\s*,\s*["']?(\d{1,6}))?/g,
  argsIndex: /\brequest\.(?:args|GET|query_params)\[\s*["'](\w{1,40})["']\s*\]/g,
  // ─── Scope: a query limited to the reader's own items ──────────────────────────────────────────────────────────
  ownerScope:
    /\b(owner|user|author|created_by|tenant|organization|team|region|account)(?:_id)?\s*=\s*(?:request\.user|current_user|user)\b/g,
  // ─── Export, import, notification, scheduled jobs ──────────────────────────────────────────────────────────────
  exportCsv: /\bcsv\.writer\(|\.to_csv\(|["']text\/csv["']/g,
  exportSheet: /\.to_excel\(|\bopenpyxl\b|\bxlsxwriter\b/g,
  importFile: /\bUploadFile\b|\brequest\.files\b|\bcsv\.(?:reader|DictReader)\(|\bread_csv\(|\bread_excel\(/g,
  email: /\bsend_mail\(|\bsend_mass_mail\(|\bEmailMessage\(|\bsmtplib\b|\bsendgrid\b/g,
  sms: /\btwilio\b/g,
  crontab: /\bcrontab\(\s*([^()\n]{0,120})\)/g,
  schedulerJob: /\b(?:add_job|scheduled_job)\(\s*[^()\n]{0,200}["'](cron|interval)["']/g,
  every: /\bschedule\.every\(\s*(?:(\d{1,6})\s*)?\)\.(\w{1,16})/g,
});

/** A Django lookup → its signal. */
const LOOKUP = {
  icontains: ["search", "contains", true],
  contains: ["search", "contains", false],
  istartswith: ["search", "startsWith", true],
  startswith: ["search", "startsWith", false],
  iendswith: ["search", "endsWith", true],
  endswith: ["search", "endsWith", false],
  iexact: ["filter", "equals", true],
  exact: ["filter", "equals", false],
  in: ["filter", "in", false],
  gte: ["filter", "range", false],
  lte: ["filter", "range", false],
  gt: ["filter", "range", false],
  lt: ["filter", "range", false],
  range: ["filter", "range", false],
  search: ["search", "fullText", false],
  trigram_similar: ["search", "fuzzy", false],
};
/** A SQLAlchemy operator → its signal. */
const ALCHEMY = {
  ilike: ["search", "contains", true],
  like: ["search", "contains", false],
  contains: ["search", "contains", false],
  startswith: ["search", "startsWith", false],
  endswith: ["search", "endsWith", false],
  in_: ["filter", "in", false],
  between: ["filter", "range", false],
};

/** The quoted names of a Python list, tuple or set ("name", 'customer__name'). */
const quotedNames = (s) => [...s.matchAll(/["'](-?\w{1,64})["']/g)].map((m) => m[1]);

/**
 * Every behaviour signal of a Python text, pushed into the sink of its file (engine/facts/behaviour-common.mjs).
 * @param {string} text
 * @param {{ push: (s: object, index: number) => void, full: boolean }} sink
 */
export function pyBehaviours(text, sink) {
  const P = PY_PATTERNS;
  const push = sink.push;
  const each = (re, fn) => {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      if (sink.full) return;
      fn(m, m.index);
    }
  };
  const param = (name, i, via, value) => {
    const { family, signal } = paramSignal(name);
    push({ family, signal, field: name, value, via }, i);
  };
  each(P.djangoLookup, (m, i) => {
    if (m[2] === "unaccent") return push({ family: "search", signal: "accentsIgnored", field: m[1], via: "django" }, i);
    const [family, signal, folded] = LOOKUP[m[2]];
    push({ family, signal, field: m[1], via: "django" }, i);
    if (folded) push({ family: "search", signal: "caseInsensitive", field: m[1], via: "django" }, i);
  });
  each(P.djangoOrder, (m, i) =>
    push({ family: "sort", signal: "orderBy", field: m[2], value: m[1] ? "desc" : "asc", via: "django" }, i),
  );
  each(P.paginator, (m, i) =>
    push({ family: "pagination", signal: "pageSize", value: Number(m[1]), via: "django" }, i),
  );
  each(P.pageSize, (m, i) => push({ family: "pagination", signal: "pageSize", value: Number(m[2]), via: "django" }, i));
  each(P.drfFields, (m, i) => {
    const names = quotedNames(m[2]);
    const FAMILY = {
      search_fields: ["search", "fields"],
      ordering_fields: ["sort", "fields"],
      ordering: ["sort", "default"],
    };
    const [family, signal] = FAMILY[m[1]] || ["filter", "fields"];
    // "-created" is created, newest first: its direction kept ("created desc"); DRF's ^ = @ $ prefixes dropped.
    const values = names.map((n) => (n.startsWith("-") ? `${n.slice(1)} desc` : n.replace(/^[\^=@$]/, "")));
    push({ family, signal, values, via: "drf" }, i);
  });
  each(P.alchemyMatch, (m, i) => {
    const [family, signal, folded] = ALCHEMY[m[2]];
    push({ family, signal, field: m[1], via: "sqlalchemy" }, i);
    if (folded) push({ family: "search", signal: "caseInsensitive", field: m[1], via: "sqlalchemy" }, i);
  });
  each(P.alchemyLower, (m, i) =>
    push(
      {
        family: "search",
        signal: m[1] === "unaccent" ? "accentsIgnored" : "caseInsensitive",
        field: m[2],
        via: "sqlalchemy",
      },
      i,
    ),
  );
  each(P.alchemyOrder, (m, i) =>
    push({ family: "sort", signal: "orderBy", field: m[2], value: m[1] || m[3] || "asc", via: "sqlalchemy" }, i),
  );
  each(P.pyLimit, (m, i) =>
    push({ family: "pagination", signal: m[1], value: m[2] ? Number(m[2]) : undefined, via: "python" }, i),
  );
  each(P.fastapiQuery, (m, i) => param(m[1], i, "fastapi", /^\d{1,6}$/.test(m[2].trim()) ? Number(m[2]) : undefined));
  each(P.argsGet, (m, i) => param(m[1], i, "query", m[2] ? Number(m[2]) : undefined));
  each(P.argsIndex, (m, i) => param(m[1], i, "query"));
  each(P.ownerScope, (m, i) => push({ family: "scope", signal: "owner", field: m[1], via: "python" }, i));
  each(P.exportCsv, (m, i) => push({ family: "export", signal: "csv", via: "python" }, i));
  each(P.exportSheet, (m, i) => push({ family: "export", signal: "spreadsheet", via: "python" }, i));
  each(P.importFile, (m, i) => push({ family: "import", signal: "file", via: "python" }, i));
  each(P.email, (m, i) => push({ family: "notification", signal: "email", via: "python" }, i));
  each(P.sms, (m, i) => push({ family: "notification", signal: "sms", via: "python" }, i));
  each(P.crontab, (m, i) => push({ family: "schedule", signal: "cron", via: "celery" }, i));
  each(P.schedulerJob, (m, i) => push({ family: "schedule", signal: m[1], via: "apscheduler" }, i));
  each(P.every, (m, i) =>
    push({ family: "schedule", signal: "interval", value: m[1] ? `${m[1]} ${m[2]}` : m[2], via: "schedule" }, i),
  );
}
