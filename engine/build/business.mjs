// Business space (ARCHITECTURE.md §6.8): the registry of features and business rules, the checks that keep them
// consistent, and the generated tables (`::features`, `::rules`, `::roles`). Pure functions, called by the build:
//   - buildFeatureRegistry(toc): features are declared on toc.json pages (field `feature`, template "feature"),
//     so the registry is complete before any page is rendered;
//   - rules are defined inside the Markdown of any page (`:::rule{id title}`, engine/build/markdown.mjs), so the
//     engine collects them as it renders (`engine.rules`) and citations ([[feature …]], [[rule …]]) are resolved
//     only once every page has been rendered (a rule may be defined in a page further down the table of contents):
//     markdown.mjs leaves a placeholder for each citation and each generated-table directive; resolveBusinessRefs
//     replaces them in a second pass, after the build's page loop.
import { esc } from "../core/text.mjs";

/** A citation placeholder left by the Markdown engine: <span class="ref-feature|rule" data-ref-id="…">id</span>. */
const REF = /<span class="ref-(feature|rule)" data-ref-id="([^"]*)">([^<]*)<\/span>/g;
/** A generated-table placeholder left by the Markdown engine: <div class="biz-directive" data-biz="…"></div>. */
const DIRECTIVE = /<div class="biz-directive" data-biz="(features|rules|roles)"><\/div>/g;
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
 * Second pass, once every page is rendered: resolves the citation and generated-table placeholders left by the
 * Markdown engine (`[[feature …]]`, `[[rule …]]`, `::features{}`, `::rules{}`, `::roles{}`), so that a rule defined
 * in a page further down the table of contents is still found. Mutates `pages[*].html` in place.
 * @param {{ pages: Record<string, { html: string, title: string }>, features: Map, rules: Map, t: Function }} p
 *   rules: engine.rules (id → { title, page, anchor }), collected while rendering (engine/build/markdown.mjs)
 * @returns {{ problems: Array<{ key: string, vars: object, strict: boolean }> }}  key: `feature.unknown` / `rule.unknown`
 */
export function resolveBusinessRefs({ pages, features, rules, t }) {
  const problems = [];
  const citedBy = new Map();
  const pageToFeature = new Map();
  for (const f of features.values()) pageToFeature.set(f.page, f.id);

  for (const [pageId, page] of Object.entries(pages))
    page.html = page.html.replace(REF, (m, kind, id) => {
      if (kind === "feature") {
        const f = features.get(id);
        if (!f) {
          problems.push({ key: "feature.unknown", vars: { page: pageId, id }, strict: true });
          return esc(id);
        }
        return `<a class="puce fonctionnalite" href="#/${esc(f.page)}" title="${esc(f.title)}">${esc(id)}</a>`;
      }
      const r = rules.get(id);
      if (!r) {
        problems.push({ key: "rule.unknown", vars: { page: pageId, id }, strict: true });
        return esc(id);
      }
      const citer = pageToFeature.get(pageId) || pageId;
      const set = citedBy.get(id) ?? citedBy.set(id, new Set()).get(id);
      set.add(citer);
      return `<a class="puce regle" href="#/${esc(r.page)}~${esc(r.anchor)}" title="${esc(r.title)}">${esc(id)}</a>`;
    });

  const tables = {
    features: featuresTable(features, t),
    rules: rulesTable(rules, citedBy, pages, t),
    roles: rolesTable(features, t),
  };
  for (const page of Object.values(pages)) page.html = page.html.replace(DIRECTIVE, (m, kind) => tables[kind]);
  return { problems };
}
