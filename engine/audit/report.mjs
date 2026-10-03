// Rendering of an audit (audit.mjs) in the language of the messages: the Markdown report (.doc-kit/audit.md),
// the JSON report (.doc-kit/audit.json: the result, plus the text of each action) and the compact summary
// printed by the CLI. Every sentence comes from the `cli.audit.*` keys (i18n/<language>/audit.json).

/** Order of the indicators in the reports (standard/maturity.md). */
export const INDICATORS = [
  "written",
  "typed",
  "conformant",
  "completeness",
  "annotated",
  "coverage",
  "proofs",
  "takeover",
  "tooLong",
  "guidance",
  "upToDateCaptures",
  "upToDatePages",
  "glossary",
  "tours",
  "blocking",
  "wideTables",
];
/** Indicators whose thresholds are ratios (shown as percentages). */
const RATIOS = new Set([
  "written",
  "typed",
  "conformant",
  "completeness",
  "annotated",
  "coverage",
  "proofs",
  "tooLong",
  "upToDateCaptures",
  "upToDatePages",
]);
/** Items listed per action in the Markdown report (all of them are in audit.json). */
const MAX_ITEMS = 50;

/** Formatting helpers bound to a translator. */
export function formatter(i18n) {
  const { t } = i18n;
  const nf = new Intl.NumberFormat(i18n.locale);
  const pf = new Intl.NumberFormat(i18n.locale, { style: "percent", maximumFractionDigits: 1 });
  const percent = (x) => pf.format(x);
  const quote = (s) => t("cli.audit.quote", { text: s });
  /** Variables ready to display: lists quoted and joined, ratios as percentages, numbers localised. */
  const vars = (v = {}) =>
    Object.fromEntries(
      Object.entries(v).map(([k, x]) => [
        k,
        Array.isArray(x)
          ? x.map(quote).join(", ")
          : k === "percent"
            ? percent(x)
            : typeof x === "number"
              ? nf.format(x)
              : x,
      ]),
    );
  // `n` stays a number: it selects the plural form.
  const tv = (key, v = {}) => t(key, { ...vars(v), n: v.n });
  /** A number and its noun, in the plural form of the number: "1 page", "2 pages", "1 400 pages". */
  const count = (key, n) => t(key, { n, count: nf.format(n) });

  /** Value of an indicator: "12 / 20 (60 %)", "74 %", "34", "n/a", "not measured". */
  function value(ind) {
    if (!ind || ind.measured === false) return t("cli.audit.notMeasured");
    if (ind.kind === "count") return nf.format(ind.n);
    if (ind.value === null) return t("cli.audit.na");
    if (ind.kind === "average") return percent(ind.value);
    return t("cli.audit.ratio", { n: nf.format(ind.n), total: nf.format(ind.total), percent: percent(ind.value) });
  }
  return { t, tv, value, percent, quote, nf, count, has: (key) => i18n.has(key) };
}

/** Text of a build problem (same message as the build). */
function problemText(f, p) {
  const prefix = p.kind === "validate" ? "cli.validate." : "cli.build.";
  const where = p.kind === "validate" ? `${[p.file, p.path].filter(Boolean).join(" › ")}: ` : "";
  return where + f.tv(prefix + p.key, p.vars);
}

/**
 * Text of an action. When every element must be handled (`need` ≥ `n`), the `.all` form of the sentence says so
 * once ("Document the 4 elements…") instead of "4, at least 4".
 */
function actionText(f, a) {
  const key = `cli.audit.action.${a.key}`;
  const all = a.vars?.need !== undefined && a.vars?.n !== undefined && a.vars.need >= a.vars.n && f.has(`${key}.all`);
  const text = f.tv(all ? `${key}.all` : key, a.vars);
  return a.note ? text + f.tv(`cli.audit.note.${a.note.key}`, a.note.vars) : text;
}

/** Text of an item of an action (without its id), or "" when the id says it all. */
function itemText(f, item) {
  if (item.problem) return problemText(f, item.problem);
  if (!item.key) return "";
  const vars = { ...item.vars, id: item.id };
  if (item.key.startsWith("takeover.")) vars.label = f.t(`cli.audit.takeover.${item.vars.item}`);
  if (item.key === "takeover.rename" && !item.vars.missing?.length)
    return f.tv("cli.audit.item.takeover.typeCheck", vars);
  return f.tv(`cli.audit.item.${item.key}`, vars);
}

/** One line of an item: "`id` — text", "`id`", or the problem's message. */
function itemLine(f, item) {
  if (item.problem) return itemText(f, item);
  const text = itemText(f, item);
  const id = item.id ? `\`${item.id}\`` : "";
  return [id, text].filter(Boolean).join(text.startsWith("→") ? " " : " — ");
}

/** Status of an indicator over the criteria that use it: ✔, ✖, or – (not measured, or n/a). */
function indicatorStatus(result, name) {
  const cs = result.criteria.filter((c) => c.indicator === name);
  if (!cs.length) return "";
  const ind = result.indicators[name];
  if (ind?.measured === false || ind?.value === null) return "–";
  return cs.every((c) => c.ok) ? "✔" : "✖";
}

/** Threshold of a criterion, as displayed: a percentage for the ratios, a number otherwise. */
const thresholdText = (f, c) =>
  c.threshold === undefined ? "" : RATIOS.has(c.indicator) ? f.percent(c.threshold) : f.nf.format(c.threshold);

/** Strictest target of an indicator: "≥ 80 % (level 3)". */
function target(f, result, name) {
  const c = result.criteria.filter((x) => x.indicator === name).at(-1);
  if (!c) return "";
  const op = ["tooLong", "guidance", "blocking", "wideTables"].includes(name)
    ? "≤"
    : ["takeover", "conformant"].includes(name) || (RATIOS.has(name) && c.threshold === 1)
      ? "="
      : "≥";
  return f.t("cli.audit.target", { op, threshold: thresholdText(f, c), level: c.level });
}

const levelName = (f, level) => f.t(`cli.audit.level.${level}`);

/** Display text of every action (stored in audit.json, for agents and continuous integration). */
export function withTexts(result, i18n) {
  const f = formatter(i18n);
  return {
    ...result,
    levelName: levelName(f, result.level),
    actions: result.actions.map((a) => ({
      ...a,
      text: actionText(f, a),
      items: a.items.map((i) => ({ ...i, text: itemText(f, i) })),
    })),
  };
}

/** The Markdown report. */
export function renderMarkdown(result, i18n) {
  const f = formatter(i18n);
  const { t } = f;
  const out = [];
  const L = result.level;
  out.push(`# ${t("cli.audit.title", { product: result.product })}`, "");
  out.push(
    t("cli.audit.generated", {
      date: result.date.slice(0, 10),
      version: result.version,
      pages: f.count("cli.audit.count.pages", result.pages),
      generator: result.generator,
    }),
    "",
  );
  out.push(
    `**${t("cli.audit.levelReached", { level: L, name: levelName(f, L) })}**${L ? ` — ${t(`cli.audit.levelSentence.${L}`)}` : ""}`,
    "",
  );

  // Spaces (ARCHITECTURE.md §6.1a): the level of each space, and what it misses for the next one.
  if (result.spaces?.length) {
    out.push(`## ${t("cli.audit.spaces.title")}`, "");
    out.push(
      `| ${t("cli.audit.spaces.col.space")} | ${t("cli.audit.spaces.col.pages")} | ${t("cli.audit.spaces.col.level")} | ${t("cli.audit.spaces.col.next")} |`,
      "|---|---|---|---|",
    );
    for (const s of result.spaces) {
      const missing = s.criteria.filter((c) => c.level === s.level + 1 && !c.ok).map((c) => `\`${c.id}\``);
      const next = s.level === 4 ? t("cli.audit.spaces.complete") : missing.join(", ");
      out.push(
        `| ${s.title} (\`${s.id}\`) | ${f.nf.format(s.pages)} | ${s.level} ${levelName(f, s.level)} | ${next} |`,
      );
    }
    out.push("");
  }

  // Languages (ARCHITECTURE.md §6.12): informative, never a criterion.
  if (result.languages?.length) {
    out.push(`## ${t("cli.audit.languages.title")}`, "");
    out.push(
      `| ${t("cli.audit.languages.col.language")} | ${t("cli.audit.languages.col.current")} | ${t("cli.audit.languages.col.stale")} | ${t("cli.audit.languages.col.missing")} | ${t("cli.audit.languages.col.ratio")} |`,
      "|---|---|---|---|---|",
    );
    for (const l of result.languages)
      out.push(
        `| ${l.id} | ${f.nf.format(l.current)} | ${f.nf.format(l.stale)} | ${f.nf.format(l.missing)} | ${l.ratio === null ? "—" : f.nf.format(Math.round(l.ratio * 100)) + " %"} |`,
      );
    out.push("");
  }

  if (result.indicators && Object.keys(result.indicators).length) {
    out.push(`## ${t("cli.audit.indicators")}`, "");
    out.push(
      `| ${t("cli.audit.col.indicator")} | ${t("cli.audit.col.value")} | ${t("cli.audit.col.target")} | | ${t("cli.audit.col.measures")} |`,
      "|---|---|---|---|---|",
    );
    for (const name of INDICATORS) {
      const ind = result.indicators[name];
      if (!ind) continue;
      let v = f.value(ind);
      if (name === "written" && ind.outsideTakeover)
        v += ` · ${t("cli.audit.outsideTakeover", { value: f.value(ind.outsideTakeover) })}`;
      if (name === "written" && (ind.missing || ind.drafts))
        v += ` · ${t("cli.audit.unwrittenDetail", { missing: f.nf.format(ind.missing ?? 0), drafts: f.nf.format(ind.drafts ?? 0) })}`;
      if (name === "coverage" && ind.planned !== undefined)
        v += ` · ${t("cli.audit.coveragePlanned", { planned: f.nf.format(ind.planned), total: f.nf.format(ind.total) })}`;
      if (name === "blocking" && ind.unwritten) v += ` · ${f.count("cli.audit.blockingUnwritten", ind.unwritten)}`;
      out.push(
        `| \`${name}\` | ${v} | ${target(f, result, name)} | ${indicatorStatus(result, name)} | ${t(`cli.audit.ind.${name}`)} |`,
      );
    }
    out.push("");

    out.push(`## ${t("cli.audit.criteria")}`, "");
    out.push(`| ${t("cli.audit.col.level")} | ${t("cli.audit.col.criterion")} | |`, "|---|---|---|");
    for (const c of result.criteria) {
      const mark =
        c.measured === false ? `– ${t("cli.audit.notMeasured")}` : c.na ? `✔ ${t("cli.audit.na")}` : c.ok ? "✔" : "✖";
      out.push(
        `| ${c.level} ${levelName(f, c.level)} | ${f.t(`cli.audit.crit.${c.id}`, { threshold: thresholdText(f, c), n: c.n ?? 0 })} | ${mark} |`,
      );
    }
    out.push("");

    out.push(`## ${t("cli.audit.takeoverTitle", { section: result.takeoverSection ?? "—" })}`, "");
    out.push(`| # | ${t("cli.audit.col.page")} | | ${t("cli.audit.col.found")} |`, "|---|---|---|---|");
    const found = (x) =>
      x.ok && x.page
        ? `\`${x.page}\``
        : x.candidate
          ? t("cli.audit.candidate", { id: x.candidate.id })
          : x.unwritten
            ? t(`cli.audit.unwrittenPage.${x.unwritten.state}`, { id: x.unwritten.id })
            : "";
    result.takeover.forEach((x, i) =>
      out.push(`| ${i + 1} | ${t(`cli.audit.takeover.${x.id}`)} | ${x.ok ? "✔" : "✖"} | ${found(x)} |`),
    );
    out.push("");
  }

  // Facts and claims (ARCHITECTURE.md §6.9): informative, no criterion uses them yet.
  if (result.facts?.files || result.claims?.verified || result.claims?.deduced || result.claims?.unknown) {
    out.push(`## ${t("cli.audit.facts.title")}`, "");
    out.push(
      `- ${f.count("cli.audit.facts.files", result.facts.files)}, ${f.count("cli.audit.facts.stale", result.facts.stale)}`,
    );
    out.push(
      `- ${t("cli.audit.claims.line", { verified: result.claims.verified, deduced: result.claims.deduced, unknown: result.claims.unknown, percent: result.claims.ratio === null ? t("cli.audit.na") : f.percent(result.claims.ratio) })}`,
    );
    out.push("");
  }

  // What to do: next level first, then the following ones.
  out.push(
    `## ${L === 4 ? t("cli.audit.done") : t("cli.audit.next", { level: L + 1, name: levelName(f, L + 1) })}`,
    "",
  );
  if (result.indicators?.typed?.measured && result.indicators.typed.n === 0 && result.pages)
    out.push(
      `> [!NOTE] ${t("cli.audit.untypedTitle")}`,
      `> ${t("cli.audit.untypedNote", { file: result.tocFile, field: result.legacyToc ? "gabarit" : "template" })}`,
      "",
    );
  let current = 0;
  let k = 0;
  for (const a of result.actions) {
    if (a.level !== current) {
      if (current) out.push("");
      if (a.level > L + 1) out.push(`### ${t("cli.audit.then", { level: a.level, name: levelName(f, a.level) })}`, "");
      current = a.level;
    }
    out.push(`${++k}. ${actionText(f, a)}`);
    for (const item of a.items.slice(0, MAX_ITEMS)) out.push(`   - ${itemLine(f, item)}`);
    if (a.items.length > MAX_ITEMS) out.push(`   - ${t("cli.audit.more", { n: a.items.length - MAX_ITEMS })}`);
  }
  if (!result.actions.length && L < 4) out.push(t("cli.audit.noAction"));
  out.push("");

  const unmeasured = INDICATORS.filter((n) => result.indicators?.[n]?.measured === false).map((n) => [
    n,
    result.indicators[n],
  ]);
  const blocking = result.indicators?.blocking;
  if (blocking && blocking.secrets === null)
    unmeasured.push([
      "blocking › secrets",
      { reason: blocking.secretsReason || "skipped", error: blocking.secretsError },
    ]);
  if (unmeasured.length) {
    out.push(`## ${t("cli.audit.notMeasuredTitle")}`, "");
    for (const [name, ind] of unmeasured)
      out.push(
        `- ${t("cli.audit.notMeasuredLine", { name, reason: t(`cli.audit.reason.${ind.reason}`, { error: ind.error || "" }) })}`,
      );
    out.push("");
  }
  out.push(`---`, "", t("cli.audit.footer"), "");
  return out.join("\n");
}

/** Compact summary for the terminal: level, indicators on two lines, the 5 first actions. */
export function renderSummary(result, i18n, { md, json } = {}) {
  const f = formatter(i18n);
  const { t } = f;
  const lines = [
    t("cli.audit.summary.level", {
      level: result.level,
      name: levelName(f, result.level),
      pages: f.count("cli.audit.count.pages", result.pages),
      product: result.product,
    }),
  ];
  const w = result.indicators?.written;
  // How many pages remain to write, said once: the plan alone is not written documentation.
  if (w?.measured && w.n < w.total)
    lines.push(
      t("cli.audit.summary.pages", {
        n: w.n,
        count: f.nf.format(w.n),
        total: f.nf.format(w.total),
        left: f.nf.format(w.total - w.n),
        missing: f.nf.format(w.missing ?? 0),
        drafts: f.nf.format(w.drafts ?? 0),
      }),
    );
  if (result.indicators && Object.keys(result.indicators).length) {
    const parts = INDICATORS.filter((n) => result.indicators[n]).map((n) => {
      const s = indicatorStatus(result, n);
      const ind = result.indicators[n];
      const v =
        ind.measured === false
          ? t("cli.audit.notMeasured")
          : ind.kind === "count"
            ? f.nf.format(ind.n)
            : ind.value === null
              ? t("cli.audit.na")
              : f.percent(ind.value);
      return `${s ? s + " " : ""}${n} ${v}`;
    });
    lines.push("  " + parts.slice(0, 8).join(" · "), "  " + parts.slice(8).join(" · "));
  }
  if (result.level < 4) {
    const missing = result.criteria.filter((c) => c.level === result.level + 1 && !c.ok).length;
    lines.push(
      "",
      t("cli.audit.summary.next", { level: result.level + 1, name: levelName(f, result.level + 1), n: missing }),
    );
    // The actions of the next level (5 at most), without the Markdown code marks; the others are in the report.
    const next = result.actions.filter((a) => a.level === result.level + 1).slice(0, 5);
    next.forEach((a, i) => {
      const ids = a.items.filter((x) => x.id).map((x) => x.id);
      const shown = ids.slice(0, 3).join(", ") + (ids.length > 3 ? ` +${ids.length - 3}` : "");
      lines.push(`  ${i + 1}. ${actionText(f, a).replace(/`/g, "")}${shown ? ` (${shown})` : ""}`);
    });
    if (result.actions.length > next.length)
      lines.push(t("cli.audit.summary.later", { n: result.actions.length - next.length }));
  } else lines.push("", t("cli.audit.done"));
  if (md) lines.push("", t("cli.audit.summary.report", { md, json }));
  return lines.join("\n");
}
