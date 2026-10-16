// The behaviour cards of a build and the markup of a feature sheet's product blocks (ARCHITECTURE.md §6.8a): the
// kinds of a project (loadBehaviours in a build, projectBehaviours outside one: they read its file), then a behaviour
// card (a specification, one row per rubric with its state), a user story, a scenario in Given / When / Then — pure
// functions of what engine/build/markdown-product.mjs has read and rendered; the CSS classes are in style.css.
import fs from "node:fs";
import path from "node:path";
import { esc } from "../core/text.mjs";
import { inLanguage, behaviourRegistry } from "../core/behaviours.mjs";

/**
 * The kinds of behaviour cards of a build (§6.8a): the kit's, and those of the project's file (config.behaviours.file),
 * whose problems are errors of the build; with whether a rubric left out fails the strict build.
 * @param {any} b   the build context (engine/build/build-context.mjs)
 * @returns {{ registry: import("../core/behaviours.mjs").BehaviourRegistry, strict: boolean }}
 */
export function loadBehaviours(b) {
  const file = b.config.behaviours?.file ?? null;
  let project = null;
  if (file) {
    if (!b.existsFs(file)) b.report(true, { kind: "behaviour", key: "behaviour.fileMissing", vars: { file } });
    else project = b.readJson(file) ?? null;
    if (project !== null && !b.validateContent(project, "behaviours", file)) project = null;
  }
  const { registry, problems } = behaviourRegistry({ project, file });
  for (const problem of problems) b.report(true, { kind: "behaviour", ...problem });
  return { registry, strict: !!b.config.behaviours?.strict };
}

/**
 * The kinds of a project read outside a build (translate's page outlines): the kit's and those of its file, when it
 * reads and follows the schema; the build reports its problems.
 * @param {string} root   the documentation project
 * @param {any} config
 */
export function projectBehaviours(root, config) {
  const file = config.behaviours?.file ?? null;
  let project = null;
  try {
    if (file) project = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  } catch {
    project = null; // reported by the build
  }
  return { registry: behaviourRegistry({ project, file }).registry, strict: false };
}

/** Rubric state → CSS class of its row and icon of the kit's set. */
const STATE = {
  answered: { cls: "renseignee", icon: "valide" },
  na: { cls: "sans-objet", icon: "sans-objet" },
  unknown: { cls: "a-confirmer", icon: "question" },
  missing: { cls: "manquante", icon: "manque" },
};

/** Canonical step of a scenario → CSS class of its keyword. */
const STEP_CLASSES = { given: "soit", when: "quand", then: "alors", and: "et", but: "mais" };

/**
 * A behaviour card: header (icon, id and kind, title as an h3 with its anchor link, the count of its rows by state),
 * an optional introduction, then one row per rubric.
 * @param {object} p
 * @param {import("../core/behaviours.mjs").BehaviourKind} p.kind
 * @param {string} p.heading       the h3, already built (id, anchor link)
 * @param {string} [p.id]          the card's id (B-01), shown before the kind
 * @param {string} p.introHtml
 * @param {Array<{ rubric: any, state: string, html: string }>} p.rows   each row's value, already rendered
 * @param {string} p.language
 * @param {(key: string, vars?: object) => string} p.t
 * @param {(name: string, cls?: string) => string} p.icon
 */
export function behaviourCard({ kind, heading, id, introHtml, rows, language, t, icon }) {
  const label = inLanguage(kind.title, language);
  // What the reader sees: every row, optional rubrics included (the registry keeps the required ones, for depth).
  const counts = { answered: 0, na: 0, unknown: 0, missing: 0 };
  for (const row of rows) counts[row.state]++;
  const pills = [
    counts.answered + counts.na
      ? `<span class="pastille-etat renseignee">${esc(t("render.behaviour.count.answered", { n: counts.answered + counts.na }))}</span>`
      : "",
    counts.unknown
      ? `<span class="pastille-etat a-confirmer">${esc(t("render.behaviour.count.unknown", { n: counts.unknown }))}</span>`
      : "",
    counts.missing
      ? `<span class="pastille-etat manquante">${esc(t("render.behaviour.count.missing", { n: counts.missing }))}</span>`
      : "",
  ].join("");
  const body = rows
    .map(({ rubric, state, html }) => {
      const s = STATE[state];
      const value = state === "missing" ? `<p>${esc(t("render.behaviour.notDescribed"))}</p>` : html;
      return `<div class="rubrique ${s.cls}"><dt>${icon(s.icon, "ico etat")}${esc(inLanguage(rubric.label, language))}<span class="sr-only"> (${esc(t(`render.behaviour.state.${state}`))})</span></dt><dd>${value}</dd></div>`;
    })
    .join("");
  return `<div class="comportement" data-kind="${esc(kind.id)}"><div class="comportement-tete"><span class="comportement-glyphe">${icon(kind.icon || "note")}</span><div class="comportement-nom"><span class="comportement-type">${id ? `${esc(id)} · ` : ""}${esc(label)}</span>${heading}</div><span class="comportement-bilan">${pills}</span></div>${introHtml ? `<div class="comportement-intro">${introHtml}</div>` : ""}<dl class="rubriques">${body}</dl></div>`;
}

/**
 * A user story: its heading (id · title, an h3), its labels (role, version, ticket, and the number of its
 * acceptance criteria, filled once every page has rendered: engine/build/business.mjs), then its text.
 * @param {{ heading: string, id: string, role?: string, since?: string, ref?: string, bodyHtml: string,
 *   t: (key: string, vars?: object) => string, icon: (name: string, cls?: string) => string }} p
 */
export function storyBlock({ heading, id, role, since, ref, bodyHtml, t, icon }) {
  const labels = [
    role ? `<span class="puce role">${icon("personne", "ico")}${esc(role)}</span>` : "",
    since ? `<span class="puce version">${esc(t("render.story.since", { version: since }))}</span>` : "",
    ref ? `<span class="puce reference">${esc(ref)}</span>` : "",
    `<span class="recit-criteres" data-story="${esc(id)}"></span>`,
  ].join("");
  return `<div class="recit"><div class="recit-tete">${heading}<span class="recit-etiquettes">${labels}</span></div><div class="recit-corps">${bodyHtml}</div></div>`;
}

/**
 * A scenario: its number in the page, its title, the story and the behaviour it checks (placeholders resolved once
 * every page has rendered), an optional introduction, then its steps.
 * @param {{ n: number, title: string, story?: string, behaviour?: string, introHtml: string,
 *   steps: Array<{ step: string, keyword: string, html: string }> }} p
 */
export function scenarioBlock({ n, title, story, behaviour, introHtml, steps }) {
  const refs = [
    story ? `<span class="ref-story" data-ref-id="${esc(story)}">${esc(story)}</span>` : "",
    behaviour ? `<span class="ref-behaviour" data-ref-id="${esc(behaviour)}">${esc(behaviour)}</span>` : "",
  ].join("");
  const list = steps
    .map(
      (s) =>
        `<li class="${STEP_CLASSES[s.step]}"><span class="mot">${esc(s.keyword)}</span><span class="pas">${s.html}</span></li>`,
    )
    .join("");
  return `<div class="scenario"><div class="scenario-tete"><span class="scenario-n" aria-hidden="true">${n}</span><p class="scenario-titre">${esc(title)}</p>${refs ? `<span class="scenario-liens">${refs}</span>` : ""}</div>${introHtml ? `<div class="scenario-intro">${introHtml}</div>` : ""}<ul class="gherkin">${list}</ul></div>`;
}
