// `::c4{title}`: the container view of the application (C4 model, levels 1 and 2), deduced from the facts at build
// time, never guessed: each container is a folder whose manifest declares a known framework, the database comes
// from facts/db.json or a database driver, and each external system from a known service's environment variables
// or packages. Every element carries its evidence (the variable or the package, and where it was found).
// Pure functions: the Markdown engine (markdown.mjs) reads facts/{dependencies,env,api,db}.json and hands them here.

/** Framework packages: the kind of container they make, and its technology. A folder takes the highest kind. */
const FRAMEWORKS = {
  next: ["fullstack", "Next.js"],
  nuxt: ["fullstack", "Nuxt"],
  "@sveltejs/kit": ["fullstack", "SvelteKit"],
  "@remix-run/node": ["fullstack", "Remix"],
  express: ["api", "Express"],
  fastify: ["api", "Fastify"],
  "@nestjs/core": ["api", "NestJS"],
  hono: ["api", "Hono"],
  koa: ["api", "Koa"],
  fastapi: ["api", "FastAPI"],
  flask: ["api", "Flask"],
  django: ["api", "Django"],
  astro: ["web", "Astro"],
  react: ["web", "React"],
  vue: ["web", "Vue"],
  svelte: ["web", "Svelte"],
  "@angular/core": ["web", "Angular"],
  "solid-js": ["web", "Solid"],
};
/** Which kind a folder keeps when it names several frameworks (a full-stack framework, then an API, then a UI). */
const KIND_RANK = { fullstack: 0, api: 1, web: 2 };
/** Left to right in the drawing: what users open first, then what it calls. */
const KIND_ORDER = { fullstack: 0, web: 1, api: 2 };

/** Database drivers and ORMs: the technology they name. */
const DATABASES = {
  prisma: "Prisma",
  "@prisma/client": "Prisma",
  "drizzle-orm": "Drizzle",
  sqlalchemy: "SQLAlchemy",
  mongoose: "MongoDB",
  mongodb: "MongoDB",
  pg: "PostgreSQL",
  postgres: "PostgreSQL",
  psycopg: "PostgreSQL",
  psycopg2: "PostgreSQL",
  "psycopg2-binary": "PostgreSQL",
  mysql2: "MySQL",
  "better-sqlite3": "SQLite",
  sqlite3: "SQLite",
};
const DATABASE_ENV = /^(?:DATABASE_URL|DB_URL|POSTGRES_URL|MONGO(?:DB)?_URI|MYSQL_URL)$/;

/** The prefixes a front-end build exposes environment variables with (VITE_STRIPE_KEY is Stripe's key). */
const PUBLIC_PREFIX = "(?:NEXT_PUBLIC_|NUXT_PUBLIC_|VITE_|REACT_APP_|PUBLIC_)?";

/** Known external services: the stems of their environment variables, and their packages ("/"-ending: a prefix). */
const SERVICES = /** @type {Array<[string, string[], string[]]>} */ ([
  ["Stripe", ["STRIPE_"], ["stripe", "@stripe/stripe-js"]],
  ["OpenAI", ["OPENAI_"], ["openai"]],
  ["Anthropic", ["ANTHROPIC_"], ["@anthropic-ai/sdk", "anthropic"]],
  ["Supabase", ["SUPABASE_"], ["@supabase/supabase-js", "supabase"]],
  ["Firebase", ["FIREBASE_"], ["firebase", "firebase-admin"]],
  ["Clerk", ["CLERK_"], ["@clerk/nextjs", "@clerk/clerk-sdk-node"]],
  ["Auth0", ["AUTH0_"], ["@auth0/nextjs-auth0", "auth0"]],
  ["AWS", ["AWS_"], ["@aws-sdk/", "aws-sdk", "boto3"]],
  ["Google Cloud", ["GOOGLE_", "GCP_", "GCLOUD_"], ["googleapis", "@google-cloud/", "google-cloud-storage"]],
  ["GitHub", ["GITHUB_"], ["@octokit/", "octokit", "PyGithub"]],
  ["SendGrid", ["SENDGRID_"], ["@sendgrid/mail", "sendgrid"]],
  ["Resend", ["RESEND_"], ["resend"]],
  ["Mailgun", ["MAILGUN_"], ["mailgun.js", "mailgun-js"]],
  ["Postmark", ["POSTMARK_"], ["postmark"]],
  ["SMTP server", ["SMTP_"], ["nodemailer"]],
  ["Twilio", ["TWILIO_"], ["twilio"]],
  ["Slack", ["SLACK_"], ["@slack/web-api", "slack-sdk", "slack_sdk"]],
  ["Sentry", ["SENTRY_"], ["@sentry/", "sentry-sdk"]],
  ["PostHog", ["POSTHOG_"], ["posthog-js", "posthog-node", "posthog"]],
  ["Cloudinary", ["CLOUDINARY_"], ["cloudinary"]],
  ["Algolia", ["ALGOLIA_"], ["algoliasearch"]],
  ["Redis", ["REDIS_", "UPSTASH_REDIS_"], ["redis", "ioredis", "@upstash/redis"]],
]).map(([name, stems, packages]) => ({
  name,
  variable: new RegExp(`^${PUBLIC_PREFIX}(?:${stems.join("|")})`),
  packages,
}));

/** Every expression applied to the application's environment variable names (the ReDoS test runs them). */
export const ENV_PATTERNS = Object.freeze([DATABASE_ENV, ...SERVICES.map((x) => x.variable)]);

/** An environment variable's evidence: its name and the first place it is read (its file without the line). */
function envEvidence(e) {
  const at = e.files?.[0] || ".env.example";
  return { text: `${e.name} (${at})`, source: at.replace(/:\d+$/, "") };
}

const folderOf = (manifest) => (manifest.includes("/") ? manifest.slice(0, manifest.lastIndexOf("/")) : ".");
const packageMatches = (name, wanted) => wanted.some((w) => (w.endsWith("/") ? name.startsWith(w) : name === w));

/** The containers: one per folder whose direct runtime dependencies name a framework (the highest kind wins). */
function containersOf(dependencies) {
  const byFolder = new Map();
  for (const d of dependencies) {
    const fw = d.direct && !d.dev ? FRAMEWORKS[d.name] : null;
    if (!fw) continue;
    const folder = folderOf(d.manifest);
    const current = byFolder.get(folder);
    if (!current || KIND_RANK[fw[0]] < KIND_RANK[current.kind])
      byFolder.set(folder, { kind: fw[0], tech: fw[1], path: folder, evidence: `${d.name} (${d.manifest})` });
  }
  return [...byFolder.values()].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.path.localeCompare(b.path));
}

/** The database: its technologies and the first evidence, or null when nothing names one. */
function databaseOf(dependencies, env, db) {
  const techs = new Set();
  const evidence = [];
  for (const d of dependencies)
    if (DATABASES[d.name] && !d.dev) {
      techs.add(DATABASES[d.name]);
      evidence.push({ text: `${d.name} (${d.manifest})`, source: d.manifest });
    }
  if (db.length) evidence.push({ text: db[0].file, source: db[0].file });
  const variable = env.find((e) => DATABASE_ENV.test(e.name));
  if (variable) evidence.push(envEvidence(variable));
  return evidence.length
    ? { tech: [...techs].sort().join(", "), evidence: evidence[0].text, source: evidence[0].source }
    : null;
}

/** The external systems: a known service named by an environment variable or a runtime package. */
function externalsOf(dependencies, env) {
  const out = [];
  for (const { name, variable, packages } of SERVICES) {
    const e = env.find((x) => variable.test(x.name));
    const p = dependencies.find((d) => !d.dev && packageMatches(d.name, packages));
    if (e || p) {
      const ev = e ? envEvidence(e) : { text: `${p.name} (${p.manifest})`, source: p.manifest };
      out.push({ name, evidence: ev.text, source: ev.source });
    }
  }
  return out;
}

/**
 * The container model of the application, from parsed facts files (a missing one is null).
 * @returns {{ containers: Array<{kind,tech,path,evidence}>, database: {tech,evidence,source}|null,
 *   externals: Array<{name,evidence,source}> }}  source: the file of the evidence, which places its arrow
 */
export function systemModel({ dependencies, env, db }) {
  const deps = dependencies?.items || [];
  const vars = env?.items || [];
  return {
    containers: containersOf(deps),
    database: databaseOf(deps, vars, db?.items || []),
    externals: externalsOf(deps, vars),
  };
}

// ─── Drawing ────────────────────────────────────────────────────────────────────────────────────────────────────

const BOX_W = 170;
const BOX_H = 64;
const GAP_X = 26;
const ROW_Y = [0, 120, 240];

/** Boxes of one row, centred on `width`. */
function row(items, y, width) {
  const total = items.length * BOX_W + (items.length - 1) * GAP_X;
  const x0 = (width - total) / 2;
  return items.map((it, i) => ({ ...it, x: x0 + i * (BOX_W + GAP_X), y, w: BOX_W, h: BOX_H }));
}

/** An arrow from `a` to `b`: from the bottom to the top across rows, from side to side within a row. */
function edge(a, b) {
  const sameRow = a.y === b.y;
  const leftToRight = a.x < b.x;
  const x1 = sameRow ? (leftToRight ? a.x + a.w : a.x) : a.x + a.w / 2;
  const x2 = sameRow ? (leftToRight ? b.x : b.x + b.w) : b.x + b.w / 2;
  const y1 = sameRow ? a.y + a.h / 2 : a.y + a.h;
  const y2 = sameRow ? b.y + b.h / 2 : b.y;
  return `<line class="c4-edge" x1="${x1.toFixed(1)}" y1="${y1}" x2="${x2.toFixed(1)}" y2="${y2}" marker-end="url(#c4-arrow)"/>`;
}

function box(esc, b) {
  return `<g class="c4-${b.cls}"><rect x="${b.x.toFixed(1)}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.cls === "person" ? 28 : 8}"/><text class="c4-name" x="${(b.x + b.w / 2).toFixed(1)}" y="${b.y + (b.sub ? 27 : 37)}" text-anchor="middle">${esc(b.label)}</text><text class="c4-tech" x="${(b.x + b.w / 2).toFixed(1)}" y="${b.y + 46}" text-anchor="middle">${esc(b.sub)}</text></g>`;
}

/** The boxes of the three rows (users, containers, then the database and the external systems) and the size. */
function layout(model, t) {
  const { containers, database, externals } = model;
  const middle = containers.map((c) => ({
    cls: "container",
    kind: c.kind,
    label: t(`render.c4.kind.${c.kind}`),
    sub: `${c.tech} · ${c.path}`,
    path: c.path,
  }));
  const bottom = [
    ...(database
      ? [{ cls: "database", label: t("render.c4.database"), sub: database.tech || "—", source: database.source }]
      : []),
    ...externals.map((x) => ({ cls: "external", label: x.name, sub: t("render.c4.external"), source: x.source })),
  ];
  const width = Math.max(middle.length, bottom.length, 1) * (BOX_W + GAP_X) - GAP_X;
  const lowY = middle.length ? ROW_Y[2] : ROW_Y[1];
  return {
    people: row([{ cls: "person", label: t("render.c4.users"), sub: "" }], ROW_Y[0], width),
    mid: row(middle, ROW_Y[1], width),
    low: row(bottom, lowY, width),
    width,
    height: (bottom.length ? lowY : ROW_Y[1]) + BOX_H,
  };
}

/** Users → the web containers (or every container); web → API; a container → the database and the systems it calls. */
function edgesOf({ people, mid, low }) {
  const fronts = mid.filter((m) => m.kind !== "api");
  const apis = mid.filter((m) => m.kind === "api");
  const back = mid.find((m) => m.kind !== "web") || mid[0] || people[0];
  // A system is called by the container whose folder holds its evidence (the deepest one), else by the back end.
  const owner = (l) =>
    mid
      .filter((m) => m.path === "." || String(l.source || "").startsWith(`${m.path}/`))
      .sort((a, b) => b.path.length - a.path.length)[0] || back;
  return [
    ...(mid.length ? (fronts.length ? fronts : mid) : []).map((m) => edge(people[0], m)),
    ...mid.filter((m) => m.kind === "web").flatMap((w) => apis.map((a) => edge(w, a))),
    ...low.map((l) => edge(owner(l), l)),
  ];
}

/**
 * HTML of the view (SVG, then one row per element with its evidence), or "" when the facts name nothing.
 * @param {ReturnType<typeof systemModel>} model
 * @param {{ t: Function, esc: Function, title?: string }} o
 */
export function renderC4(model, { t, esc, title = "" }) {
  const { containers, database, externals } = model;
  if (!containers.length && !database && !externals.length) return "";
  const boxes = layout(model, t);
  const { width, height } = boxes;
  const pad = 10;
  const svg = `<svg class="c4" xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${width + 2 * pad} ${height + 2 * pad}" width="${width + 2 * pad}" role="img" aria-label="${esc(title)}"><defs><marker id="c4-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="c4-arrow" d="M0 0L10 5L0 10z"/></marker></defs>${edgesOf(boxes).join("")}${[...boxes.people, ...boxes.mid, ...boxes.low].map((b) => box(esc, b)).join("")}</svg>`;
  const rows = [
    ...containers.map((c) => [t(`render.c4.kind.${c.kind}`), `${c.tech} · ${c.path}`, c.evidence]),
    ...(database ? [[t("render.c4.database"), database.tech || "—", database.evidence]] : []),
    ...externals.map((x) => [t("render.c4.external"), x.name, x.evidence]),
  ].map(
    ([kind, what, proof]) => `<tr><td>${esc(kind)}</td><td>${esc(what)}</td><td><code>${esc(proof)}</code></td></tr>`,
  );
  const head = ["element", "technology", "evidence"].map((k) => `<th>${esc(t(`render.c4.${k}`))}</th>`).join("");
  return `<div class="dev-view" data-generated="c4"><figure class="schema c4-figure">${svg}</figure><div class="tableau" data-generated="developer"><table data-generated="developer"><thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table></div></div>`;
}
