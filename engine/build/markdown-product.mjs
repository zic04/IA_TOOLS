// The product blocks of the Markdown engine (ARCHITECTURE.md §6.8, §6.8a): containers with a body, read by the
// container tokenizer of engine/build/markdown.mjs and rendered here.
//   :::rule{id title} … ::: (:::regle{id titre})                 a business rule, defined once
//   :::story{id title role since ref} … ::: (:::recit{… depuis …}) a user story
//   :::behaviour{kind title id feature} … ::: (:::comportement{type titre id fonctionnalite})
//                                                                 a behaviour card: "Rubric: value" lines
//   :::scenario{title story behaviour} … ::: (:::scenario{titre recit comportement})
//                                                                 an acceptance criterion in Given / When / Then
// A rule, a story and a card are rendered like a heading (an h3 in the page outline, in the search index and a link
// target). Each block is registered as it renders (rules, stories, behaviours, scenarios); the citations and the
// links of a scenario to its story and its behaviour are placeholders, resolved once every page has rendered
// (engine/build/business.mjs, resolveBusinessRefs), since they may point further down the table of contents.
import { esc, plainLines, plainText, slug } from "../core/text.mjs";
import { findKind, readCard, readScenario, inLanguage } from "../core/behaviours.mjs";
import { behaviourCard, storyBlock, scenarioBlock } from "./behaviours.mjs";

/** Spelling → canonical kind of the product containers. */
export const PRODUCT_CONTAINERS = {
  rule: "rule",
  regle: "rule",
  story: "story",
  recit: "story",
  scenario: "scenario",
  behaviour: "behaviour",
  behavior: "behaviour",
  comportement: "behaviour",
};
/** French attribute spellings of the product containers → English (`titre` is common to every container). */
export const PRODUCT_ATTRIBUTES = {
  type: "kind",
  depuis: "since",
  recit: "story",
  comportement: "behaviour",
  fonctionnalite: "feature",
};

/**
 * @typedef {object} ProductState   what the blocks of one build share
 * @property {(strict: boolean, key: string, vars?: object) => void} signal
 * @property {(key: string, vars?: object) => string} t
 * @property {(name: string, cls?: string) => string} icon
 * @property {string} locale
 * @property {{ registry: import("../core/behaviours.mjs").BehaviourRegistry, strict: boolean }} behaviours
 * @property {() => any} context   the state of the page being rendered (markdown.mjs: pageId, slugs, toc)
 * @property {Map<string, object>} rules     id → { title, page, anchor } (§6.8)
 * @property {Map<string, object>} stories   id → { title, page, anchor, role, since, ref, text: its lines }
 * @property {Map<string, object>} cards     id (or page~anchor without one) → { id, kind, title, page, anchor, feature, counts }
 * @property {object[]} scenarios            { title, page, story, behaviour, steps: [{ step, keyword, text }] }
 * @property {number} scenarioCount          scenarios of the page being rendered
 */

/**
 * @param {{ signal: ProductState["signal"], t: ProductState["t"], icon: ProductState["icon"], locale: string,
 *   behaviours: ProductState["behaviours"], context: ProductState["context"] }} p
 */
export function createProductBlocks(p) {
  /** @type {ProductState} */
  const s = { ...p, rules: new Map(), stories: new Map(), cards: new Map(), scenarios: [], scenarioCount: 0 };
  return {
    rules: s.rules,
    stories: s.stories,
    behaviours: s.cards,
    scenarios: s.scenarios,
    /** A new page starts: its scenarios are numbered from 1. */
    startPage() {
      s.scenarioCount = 0;
    },
    /**
     * Reads the body of a card or a scenario into its token (rows, steps), each part lexed as Markdown; true when
     * it did, false for any other container (its body is plain Markdown, lexed by the caller).
     */
    tokenize: (tk, body, lexer) => tokenize(s, tk, body, lexer),
    /** Whether a container kind is a product block. */
    has: (kind) => kind in RENDERERS,
    render: (tk, parser) => RENDERERS[tk.kind](s, tk, parser),
  };
}

function tokenize(s, tk, body, lexer) {
  if (tk.kind === "behaviour") {
    // Without a title or a known kind, the card is reported and its whole body shown as Markdown.
    const kind = tk.a.kind && tk.a.title ? findKind(s.behaviours.registry, tk.a.kind) : null;
    if (!kind) return false;
    const card = readCard(body, kind, s.behaviours.registry.answers);
    tk.card = card;
    tk.kindDef = kind;
    lexer.blockTokens(card.intro, tk.tokens);
    tk.rows = card.rows.map((row) => ({ ...row, tokens: row.value ? lexer.blockTokens(row.value, []) : [] }));
    return true;
  }
  if (tk.kind === "scenario") {
    const scenario = readScenario(body);
    tk.scenario = scenario;
    lexer.blockTokens(scenario.intro, tk.tokens);
    tk.steps = scenario.steps.map((step) => ({ ...step, tokens: lexer.inline(step.text, []) }));
    return true;
  }
  return false;
}

/** An h3 with its anchor link, entered in the page outline. */
function heading(s, anchor, html, title) {
  const ctx = s.context();
  ctx.slugs.add(anchor);
  ctx.toc.push({ id: anchor, title: plainText(title), level: 3 });
  return `<h3 id="${esc(anchor)}">${html}<a class="ancre" href="#/${esc(ctx.pageId)}~${esc(anchor)}" aria-label="${esc(s.t("render.sectionLink"))}">#</a></h3>`;
}

/** A free anchor for a card without an id: its title's slug, made unique in the page. */
function freeAnchor(s, title) {
  const ctx = s.context();
  let anchor = slug(title);
  while (ctx.slugs.has(anchor)) anchor += "-2";
  return anchor;
}

function renderRule(s, tk, parser) {
  const { id, title } = tk.a;
  const body = parser.parse(tk.tokens);
  if (!id || !title) {
    s.signal(true, "rule.attributes", {});
    return `<div class="regle">${body}</div>`;
  }
  if (s.rules.has(id)) s.signal(true, "rule.duplicate", { id });
  else s.rules.set(id, { title, page: s.context().pageId, anchor: id.toLowerCase() });
  // Rendered like a heading, so that the rule appears in the page outline, in the search index (search.mjs
  // splits on `<h[23] id="…">`) and as a link target for its citations: id in lower case, "BR-12 · title".
  const anchor = id.toLowerCase();
  return `<div class="regle">${heading(s, anchor, `${esc(id)} · ${esc(title)}`, `${id} · ${title}`)}${body}</div>`;
}

function renderStory(s, tk, parser) {
  const { id, title, role, since, ref } = tk.a;
  const body = parser.parse(tk.tokens);
  if (!id || !title) {
    s.signal(true, "story.attributes", {});
    return `<div class="recit">${body}</div>`;
  }
  const anchor = id.toLowerCase();
  if (s.stories.has(id)) s.signal(true, "story.duplicate", { id });
  else
    s.stories.set(id, {
      title,
      page: s.context().pageId,
      anchor,
      role: role || null,
      since: since || null,
      ref: ref || null,
      // Its text as plain lines, for the backlog export (engine/backlog/).
      text: plainLines(body),
    });
  const h = heading(s, anchor, `${esc(id)} · ${esc(title)}`, `${id} · ${title}`);
  return storyBlock({ heading: h, id, role, since, ref, bodyHtml: body, t: s.t, icon: s.icon });
}

function renderBehaviour(s, tk, parser) {
  const { kind: name, title, id, feature } = tk.a;
  if (!name || !title) {
    s.signal(true, "behaviour.attributes", {});
    return `<div class="comportement">${parser.parse(tk.tokens)}</div>`;
  }
  if (!tk.card) {
    s.signal(true, "behaviour.kind", { kind: name, known: [...s.behaviours.registry.kinds.keys()].join(", ") });
    return `<div class="comportement">${parser.parse(tk.tokens)}</div>`;
  }
  const { kindDef: kind, card } = tk;
  const page = s.context().pageId;
  const anchor = id ? id.toLowerCase() : freeAnchor(s, title);
  const key = id || `${page}~${anchor}`;
  if (s.cards.has(key)) s.signal(true, "behaviour.duplicate", { id: key });
  else
    s.cards.set(key, {
      id: id || null,
      kind: kind.id,
      title,
      page,
      anchor,
      feature: feature || null,
      counts: card.counts,
      // Its required rubrics still open, in its kind's order: left out, or answered "unknown" (the depth loop).
      open: card.rows
        .filter((r) => r.rubric.required && (r.state === "missing" || r.state === "unknown"))
        .map((r) => ({ id: r.rubric.id, state: r.state })),
    });
  if (card.missing.length)
    s.signal(s.behaviours.strict, "behaviour.missing", {
      title,
      kind: inLanguage(kind.title, s.locale),
      rubrics: card.missing.map((r) => inLanguage(r.label, s.locale)).join(", "),
    });
  return behaviourCard({
    kind,
    heading: heading(s, anchor, esc(title), title),
    id,
    introHtml: parser.parse(tk.tokens),
    rows: tk.rows.map((row) => ({ ...row, html: parser.parse(row.tokens) })),
    language: s.locale,
    t: s.t,
    icon: s.icon,
  });
}

function renderScenario(s, tk, parser) {
  const { title, story, behaviour } = tk.a;
  if (!title) s.signal(true, "scenario.attributes", {});
  if (!tk.scenario.complete) s.signal(false, "scenario.steps", { title: title || "—" });
  s.scenarioCount++;
  const steps = tk.steps.map((step) => ({ ...step, html: parser.parseInline(step.tokens) }));
  s.scenarios.push({
    title: title || "",
    page: s.context().pageId,
    story: story || null,
    behaviour: behaviour || null,
    // Its steps as plain text, for the backlog export (engine/backlog/): given, when, then, and, but.
    steps: steps.map((x) => ({ step: x.step, keyword: x.keyword, text: plainText(x.html) })),
  });
  return scenarioBlock({
    n: s.scenarioCount,
    title: title || "",
    story,
    behaviour,
    introHtml: parser.parse(tk.tokens),
    steps,
  });
}

const RENDERERS = { rule: renderRule, story: renderStory, behaviour: renderBehaviour, scenario: renderScenario };
