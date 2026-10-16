// The "Behaviours to describe" part of a page's context (ARCHITECTURE.md §6.11, §6.8a): the behaviour hints of the
// code the page depends on (facts/behaviours.json), grouped by family, one line per field and place — a hint of a
// shared file (a layout, an import) marked so —; and, for a feature sheet, the cards to write: the kinds the hints of
// its own (direct) files point to and those its feature names in features.json, each with its rubrics, required ones
// marked, in the site's language. Hints are data, written as the facts are (names in code style, signals as their
// key); only the sentences around them are translated.
import { inLanguage, FAMILY_KINDS, kindsOfHints, findKind } from "../core/behaviours.mjs";
import { sameRoute } from "../sync/feature-files.mjs";

const FAMILIES = Object.keys(FAMILY_KINDS);

/** One line per field and place: "`customer`: contains, caseInsensitive — app/orders/page.tsx:10 (array)". */
function hintLines(items, shared, t) {
  const groups = new Map();
  for (const it of items) {
    const key = `${it.field ?? ""}|${it.file}|${it.line}`;
    const g = groups.get(key) ?? groups.set(key, { it, signals: [] }).get(key);
    const detail = it.values ? ` [${it.values.join(", ")}]` : it.value !== undefined ? ` ${it.value}` : "";
    g.signals.push(`${it.signal}${detail}`);
  }
  return [...groups.values()].map(({ it, signals }) => {
    const where = shared.has(it.file) ? `${it.via}, ${t("cli.context.file.shared")}` : it.via;
    return `- ${it.field ? `\`${it.field}\`: ` : ""}${signals.join(", ")} — ${it.file}:${it.line} (${where})`;
  });
}

/** One card to write: its title, its container in the site's language, its rubrics (* required). */
function cardLine(kind, language) {
  const container = language === "fr" ? "comportement" : "behaviour";
  const attribute = language === "fr" ? "type" : "kind";
  const name = language === "fr" && kind.aliases?.[0] ? kind.aliases[0] : kind.id;
  const rubrics = kind.rubrics.map((r) => `${inLanguage(r.label, language)}${r.required ? "*" : ""}`).join(", ");
  return `- **${inLanguage(kind.title, language)}** (\`:::${container}{${attribute}="${name}"}\`): ${rubrics}`;
}

/**
 * The two parts of "Behaviours to describe" (empty texts when there is nothing to say): the hints, cut like the facts,
 * and a feature sheet's cards, never cut.
 * @param {object} p
 * @param {Array<object>} p.items   facts/behaviours.json items
 * @param {import("../sync/dependencies.mjs").PageDependencies} p.deps
 * @param {boolean} p.sheet         a feature sheet: its cards are listed
 * @param {any} [p.feature]         its feature in features.json (`api`, `behaviours`)
 * @param {import("../core/behaviours.mjs").BehaviourRegistry} p.registry
 * @param {string} p.language
 * @param {string} p.cutLine        the line that replaces the hints when the budget cuts them
 * @param {(key: string, vars?: object) => string} p.t
 * @returns {{ hints: import("./budget.mjs").BudgetPart, cards: import("./budget.mjs").BudgetPart }}
 */
export function behaviourParts({ items, deps, sheet, feature, registry, language, cutLine, t }) {
  const files = deps.files.filter((f) => !f.path.startsWith("doc:"));
  const direct = new Set(files.filter((f) => f.kind === "direct").map((f) => f.path));
  const shared = new Set(files.filter((f) => f.kind !== "direct").map((f) => f.path));
  const routes = [...deps.routes, ...(feature?.api || [])];
  const viaRoute = (it) => it.route && routes.some((r) => sameRoute(it.route, r));
  const hints = (items || []).filter((it) => direct.has(it.file) || shared.has(it.file) || viaRoute(it));
  const byFamily = new Map(FAMILIES.map((f) => [f, hints.filter((h) => h.family === f)]));
  const hintText = hints.length
    ? [
        `## ${t("cli.context.section.behaviours")}`,
        "",
        t("cli.context.behaviours.intro"),
        ...FAMILIES.filter((f) => byFamily.get(f).length).flatMap((f) => [
          "",
          `### ${t(`cli.context.behaviours.family.${f}`)}`,
          ...hintLines(byFamily.get(f), shared, t),
        ]),
      ].join("\n") + "\n"
    : "";
  const hintsPart = /** @type {import("./budget.mjs").BudgetPart} */ ({ kind: "facts", text: hintText, cutLine });
  const none = /** @type {import("./budget.mjs").BudgetPart} */ ({ kind: "sections", text: "", cutLine: "" });
  if (!sheet || !registry) return { hints: hintsPart, cards: none };

  // A layout's search box or a shared schema is not this feature's: the cards come from its own files.
  const kinds = kindsOfHints(hints.filter((it) => direct.has(it.file) || viaRoute(it)));
  const cards = [];
  const unknown = [];
  for (const name of [...kinds, ...(feature?.behaviours || [])]) {
    const kind = findKind(registry, name);
    if (!kind) unknown.push(name);
    else if (!cards.includes(kind)) cards.push(kind);
  }
  if (!cards.length && !unknown.length && !hints.length) return { hints: hintsPart, cards: none };
  const lines = [
    ...(hints.length ? [] : [`## ${t("cli.context.section.behaviours")}`, ""]),
    `### ${t("cli.context.behaviours.cards")}`,
    "",
    ...(cards.length ? cards.map((kind) => cardLine(kind, language)) : [t("cli.context.behaviours.noCard")]),
    ...unknown.map((kind) => `- ${t("cli.context.behaviours.unknownKind", { kind })}`),
  ];
  return { hints: hintsPart, cards: { kind: "sections", text: lines.join("\n") + "\n", cutLine: "" } };
}
