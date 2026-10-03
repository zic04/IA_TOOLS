// Extended Markdown engine (marked + extensions), created by a factory: no global state.
// Syntax (ARCHITECTURE.md §6.6): English and French spellings are equally accepted.
//   ::capture{id title}   ::diagram{id title} (::schema)   ::before-after{before after before-label after-label title} (::avant-apres)
//   :::screen{capture title} … ::: (:::ecran)   :::steps … ::: (:::etapes)
//   > [!TIP|WARNING|CAUTION|PERMISSIONS|NOTE|RECIPE|HOW] (ASTUCE, ATTENTION, ERREUR, DROITS, RECETTE, MECANISME)
//   [[perm …]] ([[droit …]])  [[menu …]]  [[key …]] ([[touche …]])  [[status …]] ([[statut …]])  [[route …]]
// Business space (ARCHITECTURE.md §6.8): [[feature F-03]] ([[fonctionnalite F-03]])  [[rule BR-12]] ([[regle RG-12]])
//   :::rule{id title} … ::: (:::regle)   ::features{} (::fonctionnalites{})   ::rules{} (::regles{})   ::roles{}
//   A citation and a generated table cannot be resolved while their page renders (a rule or a feature sheet may sit
//   further down the table of contents), so they are left as placeholders (`.ref-*`, `.biz-directive`) and resolved
//   once every page has been rendered, after the build's page loop (engine/build/business.mjs, resolveBusinessRefs).
// Takeover space (ARCHITECTURE.md §6.9): ::facts{source columns} (::faits{source colonnes}) renders a table from
//   facts/<source>.json, read at build time; [[verified]] [[deduced]] [[unknown]] (verifie, deduit, inconnu), with
//   or without a file:line proof, are rendered immediately (no cross-page reference to resolve).
// The generated markup (CSS classes, data-* attributes) is the historical one: app.js, style.css and the
// equivalence tests depend on it.
import { Marked } from "marked";
import { esc, attrs, plainText, slug } from "./text.mjs";
import { renderUsage, USAGE_VIEWS } from "../stats/render.mjs";
import { renderErd } from "./erd.mjs";
import { renderChanges } from "../facts/changes.mjs";

/** Spelling → canonical kind. */
const DIRECTIVES = {
  capture: "capture",
  diagram: "diagram",
  schema: "diagram",
  "before-after": "before-after",
  "avant-apres": "before-after",
  features: "features",
  fonctionnalites: "features",
  rules: "rules",
  regles: "rules",
  roles: "roles",
  facts: "facts",
  faits: "facts",
  usage: "usage",
  consommation: "usage",
  erd: "erd",
  mcd: "erd",
  changes: "changes",
  changements: "changes",
};
/** Claim badges (ARCHITECTURE.md §6.9): spelling → canonical status. Unlike BADGES, the text after the kind is optional. */
const CLAIMS = {
  verified: "verified",
  verifie: "verified",
  deduced: "deduced",
  deduit: "deduced",
  unknown: "unknown",
  inconnu: "unknown",
};
/** Canonical claim status → CSS class of the badge. */
const CLAIM_CLASSES = { verified: "verifie", deduced: "deduit", unknown: "inconnu" };
const CONTAINERS = { screen: "screen", ecran: "screen", steps: "steps", etapes: "steps", rule: "rule", regle: "rule" };
const BADGES = {
  perm: "perm",
  droit: "perm",
  menu: "menu",
  key: "key",
  touche: "key",
  status: "status",
  statut: "status",
  route: "route",
  feature: "feature",
  fonctionnalite: "feature",
  rule: "rule",
  regle: "rule",
};
const CALLOUTS = {
  tip: "tip",
  astuce: "tip",
  warning: "warning",
  attention: "warning",
  caution: "caution",
  erreur: "caution",
  permissions: "permissions",
  droits: "permissions",
  note: "note",
  recipe: "recipe",
  recette: "recipe",
  how: "how",
  mecanisme: "how",
};
/** Canonical callout → CSS class (and icon name) of the generated markup. */
const CALLOUT_CLASSES = {
  tip: "astuce",
  warning: "attention",
  caution: "erreur",
  permissions: "droits",
  note: "note",
  recipe: "recette",
  how: "mecanisme",
};
/** French attribute spellings → English. */
const ATTRIBUTES = {
  titre: "title",
  avant: "before",
  apres: "after",
  "libelle-avant": "before-label",
  "libelle-apres": "after-label",
  colonnes: "columns",
};
/** Zone side → CSS class suffix of the pin. */
const SIDE_CLASSES = { corner: "coin", right: "droit", bottom: "bas", "bottom-right": "droit-bas" };

const alternatives = (table) =>
  Object.keys(table)
    .sort((a, b) => b.length - a.length)
    .join("|");
const RE_DIRECTIVE = new RegExp(`^::(${alternatives(DIRECTIVES)})\\{([^}\\n]*)\\}[ \\t]*(?:\\n+|$)`);
const RE_CONTAINER = new RegExp(
  `^:::(${alternatives(CONTAINERS)})(?:\\{([^}\\n]*)\\})?[ \\t]*\\n([\\s\\S]*?)\\n:::[ \\t]*(?:\\n+|$)`,
);
// Lazy content up to the first "]]" not followed by "]": accepts /orders/[id].
const RE_BADGE = new RegExp(`^\\[\\[(${alternatives(BADGES)})\\s+([^\\n]+?)\\]\\](?!\\])`);
// Claim badges (§6.9): the text after the kind is optional ([[verified]] alone, or [[verified lib/orders.ts:42]]).
const RE_CLAIM = new RegExp(`^\\[\\[(${alternatives(CLAIMS)})(?:\\s+([^\\n]+?))?\\]\\](?!\\])`);

function attributes(s) {
  const a = attrs(s);
  for (const [fr, en] of Object.entries(ATTRIBUTES)) if (fr in a && !(en in a)) a[en] = a[fr];
  return a;
}

/** Status colour: token name ("st-0" → var(--st-0)), #hex, or var(--x) as is. */
export function statusColour(c) {
  if (/^#|^var\(/.test(c)) return c;
  return `var(--${c})`;
}

/**
 * Factory of the Markdown engine of one build.
 * @param {object} p
 * @param {Record<string, object>} p.captures       screenshot metadata (normalised zone files), by id
 * @param {(file: string) => boolean} p.exists      does a project file exist
 * @param {(file: string) => string} p.read         reads a project text file
 * @param {(strict: boolean, s: {kind: string, key: string, vars: object}) => void} p.report
 * @param {(key: string, vars?: object) => string} p.t   translator (render.*, callouts.*)
 * @param {(name: string, cls?: string) => string} p.icon
 * @param {Record<string, [string, string]>} [p.statuses]  coloured [[status X]] badges
 * @param {{ images: string, diagrams: string, facts: string }} [p.paths]
 * @param {any[]} [p.usage]      production statistics records (usage/<version>.jsonl)
 * @param {any} [p.llm]          `config.llm`
 * @param {string} [p.locale]    language of the page
 * @param {any[]} [p.changes]    recorded changes of the application, by version
 */
export function createMarkdownEngine({
  captures,
  exists,
  read,
  report,
  t,
  icon,
  statuses = {},
  paths = { images: "images", diagrams: "diagrams", facts: "facts" },
  usage = [],
  llm = {},
  locale = "en",
  changes = [],
}) {
  const usedCaptures = new Set();
  const usedDiagrams = new Set();
  // Business rules (ARCHITECTURE.md §6.8), registered as `:::rule` containers render: id → { title, page, anchor }.
  // Citations ([[rule …]]) and the generated tables are resolved once every page has rendered (engine/build/business.mjs).
  const rules = new Map();
  let zoneCount = 0;
  let ctx = null;
  const signal = (strict, key, vars = {}) =>
    report(strict, { kind: key.split(".")[0], key, vars: { page: ctx?.pageId, ...vars } });
  const STATUSES = Object.fromEntries(Object.entries(statuses).map(([k, [c, label]]) => [k, [statusColour(c), label]]));

  function captureImage(id, alt) {
    const c = captures[id];
    if (!c) {
      signal(true, "capture.notFound", { id });
      return {
        ok: false,
        html: `<div class="encadre attention">${icon("attention")}<div class="encadre-corps"><div class="encadre-titre">${esc(t("render.captureToProduce"))}</div><p><code>${esc(id)}</code></p></div></div>`,
      };
    }
    if (!exists(`${paths.images}/${c.file}`))
      signal(true, "capture.fileMissing", { file: `${paths.images}/${c.file}` });
    usedCaptures.add(id);
    ctx.used.images.add(id);
    ctx.captures++;
    return {
      ok: true,
      c,
      html: `<img data-img="${esc(id)}" alt="${esc(alt || c.title || id)}" width="${c.width}" height="${c.height}" loading="lazy">`,
    };
  }

  function zonesHtml(c) {
    return (c.zones || [])
      .map(
        (z) =>
          `<div class="zone${z.side ? " cote-" + (SIDE_CLASSES[z.side] || z.side) : ""}" data-n="${z.n}" style="left:${z.x}%;top:${z.y}%;width:${z.w}%;height:${z.h}%"><span class="pastille">${z.n}</span></div>`,
      )
      .join("");
  }

  /** Header label of a facts column: render.facts.column.<key> when translated, else the raw key. */
  function factsLabel(column) {
    const key = `render.facts.column.${column}`;
    const label = t(key);
    return label === key ? column : label;
  }

  /** One cell of a facts table (ARCHITECTURE.md §6.9): lists joined with commas, booleans ✔ / —, "—" when absent.
   * A path-like scalar value (a file path, a route — contains "/") is wrapped in `<code>`, so that it gets the
   * same break opportunities as hand-written inline code (below, `render()`): a long nested path (a Next.js
   * route such as `frontend/src/app/admin/orders/[id]/…`) must be able to wrap, never widen the table. */
  function factsCell(value) {
    if (value === null || value === undefined) return "—";
    if (typeof value === "boolean") return value ? "✔" : "—";
    if (Array.isArray(value)) {
      if (!value.length) return "—";
      return esc(value.map((x) => (x && typeof x === "object" ? Object.values(x).join(":") : String(x))).join(", "));
    }
    const text = String(value);
    return text.includes("/") ? `<code>${esc(text)}</code>` : esc(text);
  }

  const md = new Marked({ gfm: true });

  const directiveExtension = {
    name: "directive",
    level: "block",
    start: (src) => src.match(/^::(?!:)/m)?.index,
    tokenizer(src) {
      const m = RE_DIRECTIVE.exec(src);
      if (m) return { type: "directive", raw: m[0], kind: DIRECTIVES[m[1]], a: attributes(m[2]) };
    },
    renderer(tk) {
      // Business space generated tables (§6.8): resolved after every page has rendered (a feature or a rule may be
      // defined further down the table of contents), so only a placeholder is left here.
      if (tk.kind === "features" || tk.kind === "rules" || tk.kind === "roles")
        return `<div class="biz-directive" data-biz="${tk.kind}"></div>`;
      // What changed in the application, version by version (doc-kit changes --record → changes/<version>.json).
      if (tk.kind === "changes") {
        const version = tk.a.version || null;
        const sources = tk.a.sources
          ? tk.a.sources
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean)
          : null;
        const html = changes.length ? renderChanges(changes, { t, esc, version, sources }) : "";
        if (!html) {
          signal(false, "changes.empty", { version: version || "—" });
          return `<p class="usage-none">${esc(t("render.changes.empty"))}</p>`;
        }
        return `<div class="changes" data-generated="changes">${html}</div>`;
      }
      // Entity-relationship diagram from facts/db.json (doc-kit facts --source db).
      if (tk.kind === "erd") {
        const f = `${paths.facts}/db.json`;
        let data;
        try {
          data = exists(f) ? JSON.parse(read(f)) : null;
        } catch {
          data = null;
        }
        if (!data) {
          signal(true, "facts.missing", { source: "db", file: f });
          return "";
        }
        const only = tk.a.tables
          ? tk.a.tables
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean)
          : null;
        const title = tk.a.title || t("render.erd.title");
        const svg = renderErd(data.items, { esc, title, only, more: (n) => t("render.erd.more", { n }) });
        if (!svg) {
          signal(false, "erd.empty", { file: f });
          return `<p class="usage-none">${esc(t("render.erd.empty"))}</p>`;
        }
        const commit = data.commit ? data.commit.slice(0, 7) : t("render.facts.commitUnknown");
        const caption = t("render.facts.caption", {
          source: "db",
          date: String(data.generated || "").slice(0, 10) || "—",
          commit,
        });
        return `<figure class="schema erd-figure">${svg}<figcaption>${esc(tk.a.title ? `${tk.a.title} · ${caption}` : caption)}</figcaption></figure>`;
      }
      // Production statistics (ARCHITECTURE.md §6.14): usage/<version>.jsonl, read by the build.
      if (tk.kind === "usage") {
        const view = tk.a.view || tk.a.vue;
        if (view && !USAGE_VIEWS.includes(view)) {
          signal(true, "usage.view", { view, expected: USAGE_VIEWS.join(", ") });
          return "";
        }
        if (!usage.length) {
          signal(false, "usage.empty", {});
          return `<p class="usage-none">${esc(t("render.usage.empty"))}</p>`;
        }
        return renderUsage(usage, view, { t, esc, prices: llm.prices || {}, currency: llm.currency || null, locale });
      }
      if (tk.kind === "facts") {
        const source = tk.a.source || "";
        const f = `${paths.facts}/${source}.json`;
        let data;
        try {
          data = source && exists(f) ? JSON.parse(read(f)) : null;
        } catch {
          data = null;
        }
        if (!data) {
          signal(true, "facts.missing", { source, file: f });
          return "";
        }
        const items = Array.isArray(data.items) ? data.items : [];
        const requested = tk.a.columns
          ? tk.a.columns
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean)
          : Object.keys(items[0] || {});
        // No items: nothing to validate a column name against (an empty facts file is not a column error).
        const known = new Set(items.flatMap((it) => Object.keys(it)));
        if (items.length)
          for (const c of requested) if (!known.has(c)) signal(true, "facts.column", { source, column: c });
        const header = requested.map((c) => `<th>${esc(factsLabel(c))}</th>`).join("");
        const rows = items
          .map((it) => `<tr>${requested.map((c) => `<td>${factsCell(it[c])}</td>`).join("")}</tr>`)
          .join("");
        const commit = data.commit ? data.commit.slice(0, 7) : t("render.facts.commitUnknown");
        const date = String(data.generated || "").slice(0, 10) || "—";
        const caption = `<caption>${esc(t("render.facts.caption", { source, date, commit }))}</caption>`;
        // data-generated: so that the wrapping div below can be told apart from a table the writer wrote by
        // hand in Markdown (check tables, ARCHITECTURE.md §6.9: a directive's own table is never too narrow a
        // column to fix — only a hand-written one is reported).
        return `<table data-generated="facts">${caption}<thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`;
      }
      if (tk.kind === "diagram") {
        const f = `${paths.diagrams}/${tk.a.id}.svg`;
        if (!exists(f)) {
          signal(true, "diagram.notFound", { file: f });
          return "";
        }
        usedDiagrams.add(tk.a.id);
        ctx.used.diagrams.add(tk.a.id);
        const svg = read(f)
          .replace(/<\?xml[^>]*>/, "")
          .trim();
        return `<figure class="schema">${svg}${tk.a.title ? `<figcaption>${esc(tk.a.title)}</figcaption>` : ""}</figure>`;
      }
      if (tk.kind === "capture") {
        const img = captureImage(tk.a.id, tk.a.title);
        if (!img.ok) return img.html;
        if ((img.c.zones || []).length) signal(true, "capture.hasZones", { id: tk.a.id });
        return `<figure class="ecran" data-capture="${esc(tk.a.id)}" data-titre="${esc(tk.a.title || "")}">
        <div class="ecran-barre"><span class="ecran-points"><i></i><i></i><i></i></span><span class="ecran-titre">${esc(tk.a.title || "")}</span>
        <button class="bouton" type="button" data-action="zoom">${icon("agrandir")}<span class="libelle-long">${esc(t("render.enlarge"))}</span></button></div>
        <div class="ecran-cadre" data-action="zoom">${img.html}</div></figure>`;
      }
      // before-after
      const before = t("render.before");
      const after = t("render.after");
      const b = captureImage(tk.a.before, before);
      const a = captureImage(tk.a.after, after);
      if (!b.ok || !a.ok) return b.html + a.html;
      return `<figure class="comparer"><div class="comparer-scene" tabindex="0" aria-label="${esc(t("render.compare"))}">
      ${b.html}<div class="comparer-apres">${a.html}</div><div class="comparer-poignee"></div>
      <span class="comparer-etiquette avant">${esc(tk.a["before-label"] || before)}</span><span class="comparer-etiquette apres">${esc(tk.a["after-label"] || after)}</span></div>
      ${tk.a.title ? `<figcaption>${esc(tk.a.title)}</figcaption>` : ""}</figure>`;
    },
  };

  const containerExtension = {
    name: "container",
    level: "block",
    start: (src) => src.match(/^:::/m)?.index,
    tokenizer(src) {
      const m = RE_CONTAINER.exec(src);
      if (!m) return;
      const tk = { type: "container", raw: m[0], kind: CONTAINERS[m[1]], a: attributes(m[2]), tokens: [] };
      this.lexer.blockTokens(m[3], tk.tokens);
      return tk;
    },
    renderer(tk) {
      if (tk.kind === "steps")
        return this.parser.parse(tk.tokens).replace(/^<ol(?: start="\d+")?>/, '<ol class="etapes">');
      if (tk.kind === "rule") {
        const { id, title } = tk.a;
        const body = this.parser.parse(tk.tokens);
        if (!id || !title) {
          signal(true, "rule.attributes", {});
          return `<div class="regle">${body}</div>`;
        }
        if (rules.has(id)) signal(true, "rule.duplicate", { id });
        else rules.set(id, { title, page: ctx.pageId, anchor: id.toLowerCase() });
        // Rendered like a heading, so that the rule appears in the page outline, in the search index (search.mjs
        // splits on `<h[23] id="…">`) and as a link target for its citations: id in lower case, "BR-12 · title".
        const anchor = id.toLowerCase();
        ctx.slugs.add(anchor);
        ctx.toc.push({ id: anchor, titre: plainText(`${id} · ${title}`), niveau: 3 });
        const heading = `<h3 id="${esc(anchor)}">${esc(id)} · ${esc(title)}<a class="ancre" href="#/${ctx.pageId}~${anchor}" aria-label="${esc(t("render.sectionLink"))}">#</a></h3>`;
        return `<div class="regle">${heading}${body}</div>`;
      }
      const id = tk.a.capture;
      const img = captureImage(id, tk.a.title);
      const list = tk.tokens.find((x) => x.type === "list");
      const others = tk.tokens.filter((x) => x !== list && x.type !== "space");
      const items = list ? list.items : [];
      if (!img.ok) return img.html;
      const zones = img.c.zones || [];
      if (items.length !== zones.length)
        signal(true, "screen.legend", { id, zones: zones.length, items: items.length });
      zoneCount += items.length;
      ctx.used.zones += items.length;
      const legend = items
        .map(
          (it, i) =>
            `<li data-n="${i + 1}"><span class="n">${i + 1}</span><div>${this.parser.parse(it.tokens)}</div></li>`,
        )
        .join("");
      return `<figure class="ecran" data-capture="${esc(id)}" data-titre="${esc(tk.a.title || "")}">
      <div class="ecran-barre"><span class="ecran-points"><i></i><i></i><i></i></span><span class="ecran-titre">${esc(tk.a.title || "")}</span>
      ${items.length ? `<button class="bouton primaire" type="button" data-action="visite">${icon("lecture")}<span>${esc(t("render.guidedTour"))}<span class="libelle-long"> · ${esc(t("render.steps", { n: items.length }))}</span></span></button>` : ""}
      <button class="bouton" type="button" data-action="zoom">${icon("agrandir")}<span class="libelle-long">${esc(t("render.enlarge"))}</span></button></div>
      <div class="ecran-cadre" data-action="zoom">${img.html}${zonesHtml(img.c)}</div>
      ${others.length ? `<div class="legende-figure">${this.parser.parse(others)}</div>` : ""}
      ${legend ? `<ol class="legende">${legend}</ol>` : ""}</figure>`;
    },
  };

  const badgeExtension = {
    name: "badge",
    level: "inline",
    start: (src) => src.indexOf("[["),
    tokenizer(src) {
      const m = RE_BADGE.exec(src);
      if (m) return { type: "badge", raw: m[0], kind: BADGES[m[1]], value: m[2].trim() };
    },
    renderer(tk) {
      const v = tk.value;
      // Business space citations (§6.8): the sheet or the rule may not have rendered yet, so a placeholder is left
      // for engine/build/business.mjs (resolveBusinessRefs), once every page has rendered.
      if (tk.kind === "feature" || tk.kind === "rule")
        return `<span class="ref-${tk.kind}" data-ref-id="${esc(v)}">${esc(v)}</span>`;
      if (tk.kind === "key")
        return v
          .split("+")
          .map((k) => `<kbd>${esc(k.trim())}</kbd>`)
          .join("+");
      if (tk.kind === "perm")
        return `<span class="puce droit" title="${esc(t("render.permission"))}">${icon("droits")}${esc(v)}</span>`;
      if (tk.kind === "route") return `<span class="puce route">${esc(v)}</span>`;
      if (tk.kind === "status") {
        const [c, label] = STATUSES[v] || ["var(--line-strong)", v];
        return `<span class="puce statut" style="--c:${c}">${esc(label)}</span>`;
      }
      return `<span class="puce menu">${esc(v)}</span>`;
    },
  };

  const claimExtension = {
    name: "claim",
    level: "inline",
    start: (src) => src.indexOf("[["),
    tokenizer(src) {
      const m = RE_CLAIM.exec(src);
      if (m) return { type: "claim", raw: m[0], kind: CLAIMS[m[1]], value: (m[2] || "").trim() };
    },
    renderer(tk) {
      const cls = CLAIM_CLASSES[tk.kind];
      const label = t(`render.claim.${tk.kind}`);
      return `<span class="puce affirmation ${cls}" title="${esc(label)}">${esc(label)}${tk.value ? ` <code>${esc(tk.value)}</code>` : ""}</span>`;
    },
  };

  md.use({
    extensions: [directiveExtension, containerExtension, badgeExtension, claimExtension],
    renderer: {
      heading({ tokens, depth, text }) {
        const html = this.parser.parseInline(tokens);
        if (depth > 3) return `<h${depth}>${html}</h${depth}>`;
        let id = slug(plainText(html) || text);
        while (ctx.slugs.has(id)) id += "-2";
        ctx.slugs.add(id);
        ctx.toc.push({ id, titre: plainText(html), niveau: Math.max(2, depth) });
        const n = Math.max(2, depth);
        return `<h${n} id="${id}">${html}<a class="ancre" href="#/${ctx.pageId}~${id}" aria-label="${esc(t("render.sectionLink"))}">#</a></h${n}>\n`;
      },
      link({ href }) {
        if (href && href.startsWith("#/")) ctx.links.push(href);
        return false;
      },
      blockquote({ tokens }) {
        const html = this.parser.parse(tokens);
        // Callout title: up to the end of the first line; inline tags allowed (e.g. <code>).
        const m = /^<p>\[!([A-ZÉÈ]+)\][ \t]*(.*?)[ \t]*(\n|<\/p>)/.exec(html);
        if (!m) return `<blockquote>${html}</blockquote>\n`;
        const word = m[1].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        const kind = CALLOUTS[word];
        if (!kind) signal(false, "callout.unknown", { type: m[1] });
        const cls = kind ? CALLOUT_CLASSES[kind] : word;
        // m[2] is already escaped by marked: do not escape it again (otherwise "d&amp;#39;un").
        const title = m[2].trim() || esc(kind ? t(`callouts.${kind}`) : m[1]);
        let rest = html.slice(m[0].length);
        if (m[3] === "\n") rest = "<p>" + rest;
        rest = rest.replace(/^<p>\s*<\/p>/, "");
        return `<aside class="encadre ${cls}">${icon(cls)}<div class="encadre-corps"><div class="encadre-titre">${title}</div>${rest}</div></aside>\n`;
      },
    },
  });

  /**
   * Renders one page: HTML, table of contents, internal links, number of screenshots, and what it uses (screenshot
   * and diagram ids, legend items), so that an export per space recounts its own (engine/build/spaces.mjs).
   */
  function render(source, pageId) {
    ctx = {
      pageId,
      slugs: new Set(),
      toc: [],
      links: [],
      captures: 0,
      used: { images: new Set(), diagrams: new Set(), zones: 0 },
    };
    let html = /** @type {string} */ (md.parse(source)); // synchronous: no async extension is registered
    // A table's own data-generated (set above, ::facts/::faits) is carried onto its wrapping div, so that
    // `check tables` can tell a directive's table apart from one the writer wrote by hand in Markdown.
    html = html
      .replace(
        /<table( data-generated="[^"]*")?>/g,
        (m, generated) => `<div class="tableau"${generated || ""}><table${generated || ""}>`,
      )
      .replace(/<\/table>/g, "</table></div>");
    // Long code (URLs, paths): clean break opportunities after / . _ ? = , (never inside an HTML entity),
    // so that it wraps in a table cell without widening it or crushing the other columns.
    html = html.replace(
      /<code>([^<]{28,})<\/code>/g,
      (m, c) => "<code>" + c.replace(/([/._?=,])(?=\S)/g, "$1<wbr>") + "</code>",
    );
    const r = { html, toc: ctx.toc, links: ctx.links, captures: ctx.captures, used: ctx.used };
    ctx = null;
    return r;
  }

  return {
    render,
    usedCaptures,
    usedDiagrams,
    rules,
    get zoneCount() {
      return zoneCount;
    },
  };
}
