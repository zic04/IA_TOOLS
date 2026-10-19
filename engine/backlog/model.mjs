// The backlog as the export reads it (ARCHITECTURE.md §6.8b, `doc-kit backlog export`): the model of the build
// (engine/build/backlog.mjs) as one ordered list of items, each before its children — an epic (one with an id), its
// features, each feature's user stories — with what a tool is given: a title, lines of plain text, a story's
// acceptance criteria, a version, the link of its page in the published documentation (config.backlog.docUrl).
// Every text goes through `scrub` (the secret filter, given by the command). What a tool already holds (a reference
// of that tool) is left out unless asked; its children then name it as their parent. Pure.
import { parseRef } from "../core/refs.mjs";
import { oneLine } from "../core/text.mjs";

/** The longest title the tools take (Azure DevOps, Jira, GitLab: 255 characters). */
const MAX_TITLE = 255;

/**
 * @typedef {{ step: string, keyword: string, text: string }} Step
 * @typedef {{ title: string, steps: Step[] }} Criterion
 * @typedef {{ id: string, title: string }} Named
 * @typedef {object} Item
 * @property {string} key            its id in the documentation (E-01, F-01, US-01)
 * @property {"epic"|"feature"|"story"} kind
 * @property {string} id
 * @property {string} title          its title for the tool, its id first when config.backlog.idInTitle
 * @property {string[]} lines        its description, as lines of plain text
 * @property {Criterion[]} criteria  a story's acceptance criteria (its scenarios)
 * @property {string|null} since     its version
 * @property {string|null} link      its page (a story: its heading) in the published documentation
 * @property {import("../core/refs.mjs").TicketRef|null} ref   its item in a tool, when the documentation names one
 * @property {string|null} parent    the key of its parent among the items
 * @property {import("../core/refs.mjs").TicketRef|null} [parentRef]   its parent, already in the tool (left out)
 * @property {Named|null} epic       the epic it belongs to (a feature, a story)
 * @property {Named|null} feature    the feature it belongs to (a story)
 */

/** The tag or label of a version: "v1.2" (its "v" kept when it has one); null without a version. */
export const versionTag = (since) => (since ? (since[0] === "v" || since[0] === "V" ? since : `v${since}`) : null);

/** A title on one line, at most MAX_TITLE characters. */
function clip(text) {
  const chars = [...oneLine(text).trim()];
  return chars.length > MAX_TITLE ? chars.slice(0, MAX_TITLE - 1).join("") + "…" : chars.join("");
}

/**
 * The items of a backlog, each before its children.
 * @param {{ epics: any[], features: any[], stories: any[] }} backlog   engine/build/backlog.mjs
 * @param {{ t: (key: string, vars?: object) => string, docUrl?: string|null, idInTitle?: boolean,
 *   scrub?: (text: string) => string }} o
 *   t: the translator of the documentation's language; docUrl: the published site (https://…, without "#");
 *   scrub: a text without its secrets
 * @returns {Item[]}
 */
export function exportItems(backlog, { t, docUrl = null, idInTitle = true, scrub = (s) => s }) {
  const link = (hash) => (docUrl ? `${docUrl}#/${hash}` : null);
  // Every text of the documentation through the filter: a title, a line, a version, the epic and the feature an item
  // names (an id is an identifier, kept as it is).
  const one = (s) => oneLine(scrub(s));
  const title = (id, text) => clip(idInTitle ? `${id} · ${scrub(text)}` : scrub(text));
  const text = (lines) => lines.filter(Boolean).map(one);
  const version = (v) => (v ? one(v) : null);
  const named = (x) => ({ id: x.id, title: one(x.title) });
  const storiesOf = new Map();
  for (const s of backlog.stories) storiesOf.set(s.feature, [...(storiesOf.get(s.feature) ?? []), s]);
  /** @type {Item[]} */
  const items = [];
  const done = new Set();

  const feature = (f, epic) => {
    done.add(f.id);
    items.push({
      key: f.id,
      kind: "feature",
      id: f.id,
      title: title(f.id, f.title),
      lines: text([
        f.summary,
        f.roles.length ? t("render.backlog.who", { roles: f.roles.join(", ") }) : "",
        f.since ? t("render.backlog.since", { version: f.since }) : "",
      ]),
      criteria: [],
      since: version(f.since),
      link: link(f.page),
      ref: parseRef(f.ref),
      parent: epic?.id ?? null,
      epic,
      feature: null,
    });
    for (const s of storiesOf.get(f.id) ?? [])
      items.push({
        key: s.id,
        kind: "story",
        id: s.id,
        title: title(s.id, s.title),
        lines: text(s.text ?? []),
        criteria: (s.scenarios ?? []).map((c) => ({
          title: one(c.title),
          steps: c.steps.map((x) => ({ step: x.step, keyword: x.keyword, text: one(x.text) })),
        })),
        since: version(s.since),
        link: link(`${s.page}~${s.anchor}`),
        ref: parseRef(s.ref),
        parent: f.id,
        epic,
        feature: named(f),
      });
  };

  const byId = new Map(backlog.features.map((f) => [f.id, f]));
  for (const e of backlog.epics) {
    // A group of feature sheets without an epic is no item: its features stand alone.
    const epic = e.id ? named(e) : null;
    if (epic)
      items.push({
        key: e.id,
        kind: "epic",
        id: e.id,
        title: title(e.id, e.title),
        lines: text([e.summary]),
        criteria: [],
        since: null,
        link: link(e.section),
        ref: parseRef(e.ref),
        parent: null,
        epic: null,
        feature: null,
      });
    for (const id of e.features) if (byId.has(id) && !done.has(id)) feature(byId.get(id), epic);
  }
  for (const f of backlog.features) if (!done.has(f.id)) feature(f, null);
  return items;
}

/**
 * The items a tool does not hold yet: those whose reference is of that tool are left out (unless `all`), and a child
 * of one of them names it as its parent (parentRef) instead.
 * @param {Item[]} items
 * @param {(ref: import("../core/refs.mjs").TicketRef) => boolean} linked   whether a reference is of the tool
 * @param {boolean} all
 * @returns {{ items: Item[], skipped: Item[] }}
 */
export function selectItems(items, linked, all) {
  if (all) return { items, skipped: [] };
  const skipped = new Map(items.filter((x) => x.ref && linked(x.ref)).map((x) => [x.key, x]));
  return {
    items: items
      .filter((x) => !skipped.has(x.key))
      .map((x) =>
        x.parent && skipped.has(x.parent) ? { ...x, parent: null, parentRef: skipped.get(x.parent)?.ref ?? null } : x,
      ),
    skipped: [...skipped.values()],
  };
}
