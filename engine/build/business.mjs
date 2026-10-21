// Business space (ARCHITECTURE.md §6.8): the registry of features and business rules, the checks that keep them
// consistent, the generated tables (`::features`, `::rules`, `::roles`, `::stories`) and the links of the stories'
// tickets (config.backlog.refs). Pure functions, called by the build:
//   - buildFeatureRegistry(toc): features are declared on toc.json pages (field `feature`, template "feature"),
//     so the registry is complete before any page is rendered;
//   - rules are defined inside the Markdown of any page (`:::rule{id title}`, engine/build/markdown.mjs), so the
//     engine collects them as it renders (`engine.rules`) and citations ([[feature …]], [[rule …]]) are resolved
//     only once every page has been rendered (a rule may be defined in a page further down the table of contents):
//     markdown.mjs leaves a placeholder for each citation and each generated-table directive; resolveBusinessRefs
//     replaces them in a second pass, after the build's page loop;
//   - stories, behaviour cards and scenarios (§6.8a, engine/build/markdown-product.mjs) are collected the same way:
//     the second pass links a scenario to its story and its card, and counts the acceptance criteria of each story.
import { esc } from "../core/text.mjs";
import { parseRef, refUrl } from "../core/refs.mjs";

/** A citation placeholder left by the Markdown engine: <span class="ref-feature|rule|story|behaviour" data-ref-id="…">id</span>. */
const REF = /<span class="ref-(feature|rule|story|behaviour)" data-ref-id="([^"]*)">([^<]*)<\/span>/g;
/** The place of a story's count of acceptance criteria (engine/build/behaviours.mjs, storyBlock). */
const CRITERIA = /<span class="recit-criteres" data-story="([^"]*)"><\/span>/g;
/** An id as written, from its escaped form in a placeholder (esc of engine/core/text.mjs, undone). */
const unescaped = (s) => s.replace(/&(amp|lt|gt|quot);/g, (m, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"' })[e]);
/** Citation kind → CSS class of its link, and the i18n key of the problem when the id is unknown. */
const CITATIONS = {
  feature: { cls: "fonctionnalite", unknown: "feature.unknown" },
  rule: { cls: "regle", unknown: "rule.unknown" },
  // Not .recit or .comportement: those are the classes of the blocks themselves (style.css).
  story: { cls: "lien-recit", unknown: "story.unknown" },
  behaviour: { cls: "lien-comportement", unknown: "behaviour.unknown" },
};
/** A generated-table placeholder left by the Markdown engine: <div class="biz-directive" data-biz="…"></div>. */
const DIRECTIVE = /<div class="biz-directive" data-biz="(features|rules|roles|stories|board)"><\/div>/g;
/** Where the site draws the Product board (engine/site/lib/board.js, from D.board). */
export const BOARD_PLACEHOLDER = '<div class="tableau-produit" data-board></div>';
/** A ticket reference left by a story block (engine/build/behaviours.mjs): linked when the project has its template. */
const TICKET = /<span class="puce reference" data-ticket="([^"]*)">([^<]*)<\/span>/g;
/** A proof a business page should not carry (ARCHITECTURE.md §6.8, "Business pages cite no code"): an inline
 * code span that looks like a source location ("lib/orders.ts:42"), or a claim badge ([[verified …]], [[deduced
 * …]]) which only makes sense next to one. Deliberately narrow: prose that merely mentions a file name is not a
 * proof, so false positives stay rare. */
const TECHNICAL_PROOF = /`[\w./-]+\.[A-Za-z0-9]{1,10}:\d+`|\[\[(?:verified|verifie|deduced|deduit)\b[^\]]*\]\]/i;

/** The page types of the business space (standard/templates/business.json): the only pages that must cite no code.
 * A screen or editor page keeps its "How it works" with its proofs, whatever its space. */
export const BUSINESS_TYPES = Object.freeze(["feature", "business-rules", "roles-matrix", "process", "release-notes"]);

/** Does a page's Markdown source carry a technical proof (file:line) that belongs in its takeover counterpart? */
export const hasTechnicalProof = (source) => TECHNICAL_PROOF.test(String(source ?? ""));

/**
 * The feature registry, built from the table of contents alone (every `feature` field is known before any page
 * is rendered, unlike rules which live inside the Markdown).
 * @param {{ toc: object }} p
 * @returns {{ features: Map<string, { id: string, title: string, summary: string, permissions: string[], page: string }>,
 *   problems: Array<{ key: string, vars: object, strict: boolean }> }}  key: `feature.<key>`
 */
export function buildFeatureRegistry({ toc }) {
  const problems = [];
  const features = new Map();
  for (const sec of toc.sections)
    for (const g of sec.groups)
      for (const p of g.pages) {
        if (p.feature === undefined) {
          // A page typed "feature" without an id: reported so that the sheet is not forgotten, never blocking.
          if (p.template === "feature") problems.push({ key: "feature.noId", vars: { page: p.id }, strict: false });
          continue;
        }
        if (p.template !== "feature") {
          problems.push({ key: "feature.template", vars: { page: p.id, template: p.template || "—" }, strict: true });
          continue;
        }
        if (features.has(p.feature)) {
          problems.push({
            key: "feature.duplicate",
            vars: { id: p.feature, page: p.id, first: features.get(p.feature).page },
            strict: true,
          });
          continue;
        }
        features.set(p.feature, {
          id: p.feature,
          title: p.title,
          summary: p.summary || "",
          permissions: p.permissions || [],
          page: p.id,
        });
      }
  return { features, problems };
}

/** The "✔" cell of the roles matrix, with a text alternative for assistive technology (render.business.allowed). */
const allowedCell = (t) => `<span class="sr-only">${esc(t("render.business.allowed"))}</span>✔`;

/** `::features{}`: Id · Feature (link) · Summary · Who, in table of contents order. */
function featuresTable(features, t) {
  const rows = [...features.values()]
    .map(
      (f) =>
        `<tr><td>${esc(f.id)}</td><td><a href="#/${esc(f.page)}">${esc(f.title)}</a></td><td>${esc(f.summary)}</td><td>${(f.permissions || []).map(esc).join(", ")}</td></tr>`,
    )
    .join("");
  return `<div class="tableau"><table><thead><tr><th>${esc(t("render.business.col.id"))}</th><th>${esc(t("render.business.col.feature"))}</th><th>${esc(t("render.business.col.summary"))}</th><th>${esc(t("render.business.col.who"))}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/** `::rules{}`: Id (link) · Rule · Defined in (link) · Cited by (feature ids, else page ids), in definition order. */
function rulesTable(rules, citedBy, pages, t) {
  const rows = [...rules.entries()]
    .map(([id, r]) => {
      const cited = citedBy.get(id);
      const citedText = cited && cited.size ? [...cited].join(", ") : "—";
      const page = pages[r.page];
      return `<tr><td><a href="#/${esc(r.page)}~${esc(r.anchor)}">${esc(id)}</a></td><td>${esc(r.title)}</td><td><a href="#/${esc(r.page)}">${esc(page ? page.title : r.page)}</a></td><td>${esc(citedText)}</td></tr>`;
    })
    .join("");
  return `<div class="tableau"><table><thead><tr><th>${esc(t("render.business.col.id"))}</th><th>${esc(t("render.business.col.rule"))}</th><th>${esc(t("render.business.col.definedIn"))}</th><th>${esc(t("render.business.col.citedBy"))}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/** `::roles{}`: rows = feature sheets, columns = their distinct permissions, in order of first appearance. */
function rolesTable(features, t) {
  const feats = [...features.values()];
  const permissions = [];
  for (const f of feats)
    for (const perm of f.permissions || []) if (!permissions.includes(perm)) permissions.push(perm);
  const header =
    `<th>${esc(t("render.business.col.feature"))}</th>` + permissions.map((p) => `<th>${esc(p)}</th>`).join("");
  const rows = feats
    .map((f) => {
      const cells = permissions
        .map((p) => `<td>${(f.permissions || []).includes(p) ? allowedCell(t) : ""}</td>`)
        .join("");
      return `<tr><td><a href="#/${esc(f.page)}">${esc(f.title)}</a></td>${cells}</tr>`;
    })
    .join("");
  return `<div class="tableau"><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/**
 * The rules each page cites, read from the placeholders the Markdown engine left before the second pass: page id →
 * the ids of its [[rule …]] citations (engine/build/backlog.mjs: a feature's rules are those its sheet defines or cites).
 * @param {Record<string, { html: string }>} pages
 * @returns {Map<string, Set<string>>}
 */
export function ruleCitations(pages) {
  const out = new Map();
  for (const [id, page] of Object.entries(pages))
    for (const [, kind, escaped] of page.html.matchAll(REF))
      if (kind === "rule") (out.get(id) ?? out.set(id, new Set()).get(id)).add(unescaped(escaped));
  return out;
}

/** A ticket reference as a link (config.backlog.refs), or as written when the kit has no address for it. */
function ticket(ref, refs, cls = "puce reference") {
  const url = refUrl(parseRef(ref), refs);
  return url
    ? `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(ref)}</a>`
    : `<span class="${cls}">${esc(ref)}</span>`;
}

/**
 * `::stories{}`: Id (link) · Story · Feature (link) · Role · Version · Criteria · Ticket — every user story of a
 * feature sheet, in the order of the features, from the backlog model (engine/build/backlog.mjs).
 */
function storiesTable(backlog, features, refs, t) {
  const rows = (backlog?.stories ?? [])
    .map((s) => {
      const f = features.get(s.feature);
      const cells = [
        `<a href="#/${esc(s.page)}~${esc(s.anchor)}">${esc(s.id)}</a>`,
        esc(s.title),
        f ? `<a href="#/${esc(f.page)}">${esc(f.title)}</a>` : "—",
        esc(s.role ?? "—"),
        esc(s.since ?? t("render.backlog.noVersion")),
        String(s.criteria),
        s.ref ? ticket(s.ref, refs) : "—",
      ];
      return `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
    })
    .join("");
  const head = ["id", "story", "feature", "role", "version", "criteria", "ticket"]
    .map((k) => `<th>${esc(t(`render.backlog.col.${k}`))}</th>`)
    .join("");
  return `<div class="tableau"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/**
 * Second pass, once every page is rendered: resolves the citation and generated-table placeholders left by the
 * Markdown engine (`[[feature …]]`, `[[rule …]]`, `[[story …]]`, a scenario's story and behaviour, `::features{}`,
 * `::rules{}`, `::roles{}`, `::stories{}`, a story's ticket — linked from config.backlog.refs), so that a rule defined in a page further down the table of contents is still found, and
 * writes each story's number of acceptance criteria (its scenarios). Mutates `pages[*].html` in place.
 * @param {{ pages: Record<string, { html: string, title: string }>, features: Map, rules: Map, stories?: Map,
 *   behaviours?: Map, scenarios?: Array<{ story: string|null }>, backlog?: any, refs?: Record<string, string>,
 *   t: Function }} p
 *   backlog: the model of engine/build/backlog.mjs (::stories{}); refs: config.backlog.refs
 *   rules, stories, behaviours, scenarios: engine.* (id → { title, page, anchor }), collected while rendering
 *   (engine/build/markdown-product.mjs); a behaviour card without an id is keyed "page~anchor" and cannot be cited
 * @returns {{ problems: Array<{ key: string, vars: object, strict: boolean }> }}
 *   key: `feature.unknown` / `rule.unknown` / `story.unknown` / `behaviour.unknown`
 */
export function resolveBusinessRefs({
  pages,
  features,
  rules,
  stories = new Map(),
  behaviours = new Map(),
  scenarios = [],
  backlog = null,
  refs = undefined,
  t,
}) {
  const problems = [];
  const citedBy = new Map();
  const pageToFeature = new Map();
  for (const f of features.values()) pageToFeature.set(f.page, f.id);
  const targets = {
    feature: (id) => features.get(id) && { href: features.get(id).page, title: features.get(id).title },
    rule: (id) =>
      rules.get(id) && { href: `${rules.get(id).page}~${rules.get(id).anchor}`, title: rules.get(id).title },
    story: (id) =>
      stories.get(id) && { href: `${stories.get(id).page}~${stories.get(id).anchor}`, title: stories.get(id).title },
    behaviour: (id) =>
      !id.includes("~") &&
      behaviours.get(id) && {
        href: `${behaviours.get(id).page}~${behaviours.get(id).anchor}`,
        title: behaviours.get(id).title,
      },
  };

  for (const [pageId, page] of Object.entries(pages))
    page.html = page.html.replace(REF, (m, kind, escaped) => {
      const id = unescaped(escaped);
      const target = targets[kind](id);
      if (!target) {
        problems.push({ key: CITATIONS[kind].unknown, vars: { page: pageId, id }, strict: true });
        return esc(id);
      }
      if (kind === "rule") {
        const citer = pageToFeature.get(pageId) || pageId;
        const set = citedBy.get(id) ?? citedBy.set(id, new Set()).get(id);
        set.add(citer);
      }
      return `<a class="puce ${CITATIONS[kind].cls}" href="#/${esc(target.href)}" title="${esc(target.title)}">${esc(id)}</a>`;
    });

  // A card that names its feature (a card written outside the feature's own sheet) names a declared one.
  for (const card of behaviours.values())
    if (card.feature && !features.has(card.feature))
      problems.push({ key: "feature.unknown", vars: { page: card.page, id: card.feature }, strict: true });

  // Each story's acceptance criteria: the scenarios that name it.
  const criteria = new Map();
  for (const s of scenarios) if (s.story) criteria.set(s.story, (criteria.get(s.story) || 0) + 1);
  for (const page of Object.values(pages))
    page.html = page.html.replace(CRITERIA, (m, id) => {
      const n = criteria.get(unescaped(id)) || 0;
      return `<span class="puce criteres${n ? "" : " aucun"}">${esc(t(n ? "render.story.criteria" : "render.story.noCriteria", { n }))}</span>`;
    });

  const tables = {
    features: featuresTable(features, t),
    rules: rulesTable(rules, citedBy, pages, t),
    roles: rolesTable(features, t),
    stories: storiesTable(backlog, features, refs, t),
    board: BOARD_PLACEHOLDER,
  };
  for (const page of Object.values(pages))
    page.html = page.html
      .replace(DIRECTIVE, (m, kind) => tables[kind])
      .replace(TICKET, (m, ref) => ticket(unescaped(ref), refs));
  return { problems };
}
