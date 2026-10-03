// The developer overview (AUDIT.md §4): three directives that turn the facts of `doc-kit facts` into views a
// newcomer reads, instead of raw tables. Pure functions: the facts files are read by the Markdown engine
// (markdown.mjs), which hands their parsed content here.
//   ::modules{limit}   the import graph (facts/modules.json): size, import cycles, the files most depended on, orphans
//   ::hotspots{limit}  where change meets complexity (facts/history.json × facts/quality.json), with the owner of
//                      each file and the bus factor
//   ::health           one summary of the application's state: ratings, security, tests, architecture, knowledge,
//                      dependencies, tooling, and the main risks found in those facts

const DEFAULT_LIMIT = 10;
const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];

/** A positive whole number from a directive attribute, or the default. */
export function limitOf(value, fallback = DEFAULT_LIMIT) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : fallback;
}

const code = (esc, file) => `<code>${esc(file)}</code>`;
const table = (head, rows) =>
  `<div class="tableau" data-generated="developer"><table data-generated="developer"><thead><tr>${head
    .map((h) => `<th>${h}</th>`)
    .join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;

// ─── ::modules ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * @param {{ items: Array<{ file: string, imports: number, importedBy: number, cycle: number|null }>,
 *   summary?: { files: number, edges: number, cycles: string[][], orphans: number } }} data  facts/modules.json
 * @param {{ t: Function, esc: Function, limit?: number }} o
 * @returns {string} HTML ("" when the graph is empty)
 */
export function renderModules(data, { t, esc, limit = DEFAULT_LIMIT }) {
  const items = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) return "";
  const summary = /** @type {any} */ (data.summary || {});
  const cycles = Array.isArray(summary.cycles) ? summary.cycles : [];
  const orphans = items.filter((i) => !i.imports && !i.importedBy).map((i) => i.file);
  const parts = [
    `<p class="dev-summary">${esc(
      t("render.modules.summary", {
        files: summary.files ?? items.length,
        edges: summary.edges ?? items.reduce((n, i) => n + (i.imports || 0), 0),
        cycles: cycles.length,
        orphans: orphans.length,
      }),
    )}</p>`,
  ];
  if (cycles.length)
    parts.push(
      `<h4 class="dev-title">${esc(t("render.modules.cycles"))}</h4><ol class="dev-cycles">${cycles
        .map((c) => `<li>${c.map((f) => code(esc, f)).join(" ↔ ")}</li>`)
        .join("")}</ol>`,
    );
  const top = [...items]
    .filter((i) => i.importedBy > 0)
    .sort((a, b) => b.importedBy - a.importedBy || a.file.localeCompare(b.file))
    .slice(0, limit);
  if (top.length)
    parts.push(
      `<h4 class="dev-title">${esc(t("render.modules.central"))}</h4>` +
        table(
          [t("render.modules.file"), t("render.modules.importedBy"), t("render.modules.imports")].map((h) => esc(h)),
          top.map((i) => `<tr><td>${code(esc, i.file)}</td><td>${i.importedBy}</td><td>${i.imports}</td></tr>`),
        ),
    );
  if (orphans.length)
    parts.push(
      `<h4 class="dev-title">${esc(t("render.modules.orphans"))}</h4><p class="dev-list">${orphans
        .slice(0, limit)
        .map((f) => code(esc, f))
        .join(
          ", ",
        )}${orphans.length > limit ? esc(` ${t("render.modules.more", { n: orphans.length - limit })}`) : ""}</p>`,
    );
  return `<div class="dev-view" data-generated="modules">${parts.join("")}</div>`;
}

// ─── ::hotspots ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The files that change most AND are the most complex: commits × the complexity of their most complex function
 * (lines when no function was measured). Only the source files measured by `quality` (tests, generated and vendored
 * files are not there), so a changelog that changes at every commit is never a hotspot.
 * @returns {Array<{ file, commits, churn, authors, owner, ownerShare, complexity, lines, score }>} highest first
 */
export function hotspots(history, quality) {
  const measured = new Map((quality?.items || []).map((q) => [q.file, q]));
  return (history?.items || [])
    .filter((h) => measured.has(h.file) && h.commits > 0)
    .map((h) => {
      const q = measured.get(h.file);
      const weight = q.complexity || Math.ceil((q.lines || 0) / 50) || 1;
      return { ...h, complexity: q.complexity || 0, lines: q.lines || 0, score: h.commits * weight };
    })
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
}

/**
 * @param {object} history  facts/history.json   @param {object} quality  facts/quality.json
 * @param {{ t: Function, esc: Function, limit?: number }} o
 * @returns {string} HTML ("" when no file is both in the history and measured)
 */
export function renderHotspots(history, quality, { t, esc, limit = DEFAULT_LIMIT }) {
  const s = history?.summary || {};
  if (s.available === false)
    return `<p class="usage-none">${esc(t("render.hotspots.noHistory", { reason: s.reason || "—" }))}</p>`;
  const list = hotspots(history, quality).slice(0, limit);
  if (!list.length) return "";
  const max = list[0].score;
  const head = ["file", "commits", "complexity", "lines", "authors", "owner", "score"].map((k) =>
    esc(t(`render.hotspots.${k}`)),
  );
  const rows = list.map(
    (h) =>
      `<tr><td>${code(esc, h.file)}</td><td>${h.commits}</td><td>${h.complexity}</td><td>${h.lines}</td><td>${h.authors}</td><td>${esc(
        h.owner ? `${h.owner} (${h.ownerShare ?? "—"} %)` : "—",
      )}</td><td><span class="dev-bar" style="--w:${Math.max(4, Math.round((h.score / max) * 100))}%"></span></td></tr>`,
  );
  const intro = t("render.hotspots.summary", {
    commits: s.commits ?? "—",
    authors: s.authors ?? "—",
    since: s.since || "—",
    until: s.until || "—",
    busFactor: s.busFactor ?? "—",
  });
  return `<div class="dev-view" data-generated="hotspots"><p class="dev-summary">${esc(intro)}</p>${table(head, rows)}</div>`;
}

// ─── ::health ───────────────────────────────────────────────────────────────────────────────────────────────────

const countBy = (items, key) =>
  items.reduce((acc, i) => {
    const k = i[key] ?? "—";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, /** @type {Record<string, number>} */ ({}));

/** Each detector reads the facts and returns its risks ({ level, key, vars }); a missing source gives none. */
/** @type {Array<(f: any) => Array<{ level: string, key: string, vars: object }>>} */
const RISK_DETECTORS = [
  // High or critical security findings, one risk per rule (the first place it was found).
  (f) => {
    const byRule = new Map();
    for (const i of (f.security?.items || []).filter((i) => i.severity === "critical" || i.severity === "high"))
      byRule.set(i.rule, [...(byRule.get(i.rule) || []), i]);
    return [...byRule].map(([rule, found]) => ({
      level: found[0].severity,
      key: "security",
      vars: { rule, n: found.length, where: `${found[0].file}:${found[0].line}` },
    }));
  },
  (f) => {
    const secrets = f.secrets?.items || [];
    return secrets.length
      ? [{ level: "high", key: "secrets", vars: { n: secrets.length, where: secrets[0].file } }]
      : [];
  },
  // A dependency its public registry does not know (facts --network): a typo, or a name an AI invented.
  (f) => {
    const missing = (f.dependencies?.items || []).filter((d) => d.exists === false);
    const names = missing.map((d) => d.name).join(", ");
    return missing.length ? [{ level: "high", key: "unknownPackages", vars: { n: missing.length, names } }] : [];
  },
  (f) => {
    const tests = f.tests?.summary;
    if (tests && !tests.files) return [{ level: "high", key: "noTests", vars: {} }];
    const coverage = tests?.coverage;
    return typeof coverage === "number" && coverage < 50
      ? [{ level: "medium", key: "lowCoverage", vars: { coverage } }]
      : [];
  },
  (f) => {
    const h = f.history?.summary;
    return h && h.available !== false && h.busFactor === 1
      ? [{ level: "medium", key: "busFactor", vars: { authors: h.authors } }]
      : [];
  },
  (f) => {
    const n = f.modules?.summary?.cycles?.length || 0;
    return n ? [{ level: "medium", key: "cycles", vars: { n } }] : [];
  },
  (f) =>
    Object.entries(f.quality?.summary?.ratings || {})
      .filter(([, grade]) => grade === "D" || grade === "E")
      .map(([name, grade]) => ({ level: "medium", key: "rating", vars: { name, grade } })),
  (f) =>
    ["ci", "linter", "types"]
      .filter((tool) => f.quality?.summary?.tooling?.[tool] === false)
      .map((tool) => ({ level: "low", key: "tooling", vars: { tool } })),
];

/**
 * The main risks found in the facts, most severe first (at most `limit`): each { level, key, vars }, `key` an i18n
 * key `render.health.risk.<key>`. Deterministic: the same facts always give the same list.
 * @param {Record<string, any>} facts  parsed facts files by source (missing: null)
 */
export function healthRisks(facts, limit = DEFAULT_LIMIT) {
  const order = (r) => SEVERITY_ORDER.indexOf(r.level);
  return RISK_DETECTORS.flatMap((detect) => detect(facts))
    .sort((a, b) => order(a) - order(b))
    .slice(0, limit);
}

/** One card of the health summary: its title, then lines of [label, value], or "not measured" with the command. */
function healthCard(t, esc, { title, source, lines }) {
  const body = lines
    ? lines
        .map(([label, value]) => `<div class="dev-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`)
        .join("")
    : `<p class="dev-missing">${esc(t("render.health.notMeasured", { source }))}</p>`;
  return `<section class="dev-card"><h4>${esc(title)}</h4>${body}</section>`;
}

const text = (v) => (v === undefined || v === null ? "—" : String(v));

/** The cards of the health summary, in order: each reads one source; `lines` returns null when it is missing. */
const HEALTH_CARDS = [
  {
    title: "maintainability",
    source: "quality",
    lines: (f, t) => {
      const ratings = f.quality?.summary?.ratings;
      return ratings ? Object.entries(ratings).map(([k, v]) => [t(`render.health.rating.${k}`), v]) : null;
    },
  },
  {
    title: "security",
    source: "security",
    lines: (f, t) => {
      if (!f.security) return null;
      const sev = countBy(f.security.items || [], "severity");
      return [
        ...SEVERITY_ORDER.filter((s) => sev[s]).map((s) => [t(`render.health.severity.${s}`), String(sev[s])]),
        [t("render.health.secrets"), f.secrets ? String(f.secrets.items?.length || 0) : "—"],
      ];
    },
  },
  {
    title: "tests",
    source: "tests",
    lines: (f, t) => {
      const s = f.tests?.summary;
      if (!s) return null;
      const coverage = typeof s.coverage === "number" ? `${s.coverage} %` : "—";
      return [
        [t("render.health.testFiles"), text(s.files ?? 0)],
        [t("render.health.testCount"), text(s.tests ?? 0)],
        [t("render.health.coverage"), coverage],
      ];
    },
  },
  {
    title: "architecture",
    source: "modules",
    lines: (f, t) => {
      const s = f.modules?.summary;
      return s
        ? [
            [t("render.health.files"), text(s.files ?? 0)],
            [t("render.health.cycles"), text(s.cycles?.length ?? 0)],
            [t("render.health.orphans"), text(s.orphans ?? 0)],
          ]
        : null;
    },
  },
  {
    title: "knowledge",
    source: "history",
    lines: (f, t) => {
      const s = f.history?.summary;
      if (!s || s.available === false) return null;
      return [
        [t("render.health.authors"), text(s.authors)],
        [t("render.health.busFactor"), text(s.busFactor)],
        [t("render.health.period"), `${s.since || "—"} → ${s.until || "—"}`],
      ];
    },
  },
  {
    title: "dependencies",
    source: "dependencies",
    lines: (f, t) => {
      const deps = f.dependencies?.items;
      if (!deps) return null;
      const checked = deps.some((d) => "exists" in d);
      return [
        [t("render.health.direct"), String(deps.filter((d) => d.direct && !d.dev).length)],
        [t("render.health.outdated"), text(f.quality?.summary?.outdated)],
        [t("render.health.unknownPackages"), checked ? String(deps.filter((d) => d.exists === false).length) : "—"],
      ];
    },
  },
  {
    title: "tooling",
    source: "quality",
    lines: (f, t) => {
      const tooling = f.quality?.summary?.tooling;
      return tooling
        ? ["linter", "types", "formatter", "ci"].map((k) => [t(`render.health.tool.${k}`), tooling[k] ? "✔" : "—"])
        : null;
    },
  },
];

/** The variables of a risk's text, with the names of ratings and tools in the reader's language. */
function riskVars(t, r) {
  if (r.key === "rating") return { ...r.vars, name: t(`render.health.rating.${r.vars.name}`) };
  if (r.key === "tooling") return { ...r.vars, tool: t(`render.health.tool.${r.vars.tool}`) };
  return r.vars;
}

/**
 * @param {Record<string, object|null>} facts  parsed facts files by source; a missing source is null
 * @param {{ t: Function, esc: Function, limit?: number }} o
 * @returns {string} HTML
 */
export function renderHealth(facts, { t, esc, limit = DEFAULT_LIMIT }) {
  const cards = HEALTH_CARDS.map((c) =>
    healthCard(t, esc, { title: t(`render.health.${c.title}`), source: c.source, lines: c.lines(facts, t) }),
  ).join("");
  const risks = healthRisks(facts, limit);
  const list = risks.length
    ? `<ol class="dev-risks">${risks
        .map(
          (r) =>
            `<li class="dev-risk dev-${esc(r.level)}"><span class="dev-level">${esc(t(`render.health.severity.${r.level}`))}</span> ${esc(
              t(`render.health.risk.${r.key}`, riskVars(t, r)),
            )}</li>`,
        )
        .join("")}</ol>`
    : `<p class="dev-summary">${esc(t("render.health.noRisk"))}</p>`;
  return `<div class="dev-view dev-health" data-generated="health"><div class="dev-cards">${cards}</div><h4 class="dev-title">${esc(
    t("render.health.risks"),
  )}</h4>${list}</div>`;
}
