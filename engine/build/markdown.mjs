// Extended Markdown engine (marked + extensions), created by a factory: no global state.
// Syntax (ARCHITECTURE.md §6.6): English and French spellings are equally accepted.
//   ::capture{id title}   ::diagram{id title} (::schema)   ::before-after{before after before-label after-label title} (::avant-apres)
//   :::screen{capture title} … ::: (:::ecran)   :::steps … ::: (:::etapes)
//   > [!TIP|WARNING|CAUTION|PERMISSIONS|NOTE|RECIPE|HOW] (ASTUCE, ATTENTION, ERREUR, DROITS, RECETTE, MECANISME)
//   [[perm …]] ([[droit …]])  [[menu …]]  [[key …]] ([[touche …]])  [[status …]] ([[statut …]])  [[route …]]
// The generated markup (CSS classes, data-* attributes) is the historical one: app.js, style.css and the
// equivalence tests depend on it.
import { Marked } from "marked";
import { esc, attrs, plainText, slug } from "./text.mjs";

/** Spelling → canonical kind. */
export const DIRECTIVES = { capture: "capture", diagram: "diagram", schema: "diagram", "before-after": "before-after", "avant-apres": "before-after" };
export const CONTAINERS = { screen: "screen", ecran: "screen", steps: "steps", etapes: "steps" };
export const BADGES = { perm: "perm", droit: "perm", menu: "menu", key: "key", touche: "key", status: "status", statut: "status", route: "route" };
export const CALLOUTS = {
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
export const CALLOUT_CLASSES = { tip: "astuce", warning: "attention", caution: "erreur", permissions: "droits", note: "note", recipe: "recette", how: "mecanisme" };
/** French attribute spellings → English. */
export const ATTRIBUTES = { titre: "title", avant: "before", apres: "after", "libelle-avant": "before-label", "libelle-apres": "after-label" };
/** Zone side → CSS class suffix of the pin. */
export const SIDE_CLASSES = { corner: "coin", right: "droit", bottom: "bas", "bottom-right": "droit-bas" };

const alternatives = (table) =>
  Object.keys(table)
    .sort((a, b) => b.length - a.length)
    .join("|");
const RE_DIRECTIVE = new RegExp(`^::(${alternatives(DIRECTIVES)})\\{([^}\\n]*)\\}[ \\t]*(?:\\n+|$)`);
const RE_CONTAINER = new RegExp(`^:::(${alternatives(CONTAINERS)})(?:\\{([^}\\n]*)\\})?[ \\t]*\\n([\\s\\S]*?)\\n:::[ \\t]*(?:\\n+|$)`);
// Lazy content up to the first "]]" not followed by "]": accepts /orders/[id].
const RE_BADGE = new RegExp(`^\\[\\[(${alternatives(BADGES)})\\s+([^\\n]+?)\\]\\](?!\\])`);

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
 * @param {{ images: string, diagrams: string }} [p.paths]
 */
export function createMarkdownEngine({ captures, exists, read, report, t, icon, statuses = {}, paths = { images: "images", diagrams: "diagrams" } }) {
  const usedCaptures = new Set();
  const usedDiagrams = new Set();
  let zoneCount = 0;
  let ctx = null;
  const signal = (strict, key, vars = {}) => report(strict, { kind: key.split(".")[0], key, vars: { page: ctx?.pageId, ...vars } });
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
    if (!exists(`${paths.images}/${c.file}`)) signal(true, "capture.fileMissing", { file: `${paths.images}/${c.file}` });
    usedCaptures.add(id);
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
          `<div class="zone${z.side ? " cote-" + (SIDE_CLASSES[z.side] || z.side) : ""}" data-n="${z.n}" style="left:${z.x}%;top:${z.y}%;width:${z.w}%;height:${z.h}%"><span class="pastille">${z.n}</span></div>`
      )
      .join("");
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
      if (tk.kind === "diagram") {
        const f = `${paths.diagrams}/${tk.a.id}.svg`;
        if (!exists(f)) {
          signal(true, "diagram.notFound", { file: f });
          return "";
        }
        usedDiagrams.add(tk.a.id);
        const svg = read(f).replace(/<\?xml[^>]*>/, "").trim();
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
      if (tk.kind === "steps") return this.parser.parse(tk.tokens).replace(/^<ol(?: start="\d+")?>/, '<ol class="etapes">');
      const id = tk.a.capture;
      const img = captureImage(id, tk.a.title);
      const list = tk.tokens.find((x) => x.type === "list");
      const others = tk.tokens.filter((x) => x !== list && x.type !== "space");
      const items = list ? list.items : [];
      if (!img.ok) return img.html;
      const zones = img.c.zones || [];
      if (items.length !== zones.length) signal(true, "screen.legend", { id, zones: zones.length, items: items.length });
      zoneCount += items.length;
      const legend = items
        .map((it, i) => `<li data-n="${i + 1}"><span class="n">${i + 1}</span><div>${this.parser.parse(it.tokens)}</div></li>`)
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
      if (tk.kind === "key") return v.split("+").map((k) => `<kbd>${esc(k.trim())}</kbd>`).join("+");
      if (tk.kind === "perm") return `<span class="puce droit" title="${esc(t("render.permission"))}">${icon("droits")}${esc(v)}</span>`;
      if (tk.kind === "route") return `<span class="puce route">${esc(v)}</span>`;
      if (tk.kind === "status") {
        const [c, label] = STATUSES[v] || ["var(--line-strong)", v];
        return `<span class="puce statut" style="--c:${c}">${esc(label)}</span>`;
      }
      return `<span class="puce menu">${esc(v)}</span>`;
    },
  };

  md.use({
    extensions: [directiveExtension, containerExtension, badgeExtension],
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

  /** Renders one page: HTML, table of contents, internal links, number of screenshots. */
  function render(source, pageId) {
    ctx = { pageId, slugs: new Set(), toc: [], links: [], captures: 0 };
    let html = md.parse(source);
    html = html.replace(/<table>/g, '<div class="tableau"><table>').replace(/<\/table>/g, "</table></div>");
    // Long code (URLs, paths): clean break opportunities after / . _ ? = , (never inside an HTML entity),
    // so that it wraps in a table cell without widening it or crushing the other columns.
    html = html.replace(/<code>([^<]{28,})<\/code>/g, (m, c) => "<code>" + c.replace(/([/._?=,])(?=\S)/g, "$1<wbr>") + "</code>");
    const r = { html, toc: ctx.toc, links: ctx.links, captures: ctx.captures };
    ctx = null;
    return r;
  }

  return {
    render,
    usedCaptures,
    usedDiagrams,
    get zoneCount() {
      return zoneCount;
    },
  };
}
