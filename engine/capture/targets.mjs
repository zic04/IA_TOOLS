// Helpers for capture plans (frequent targets), exported by the package as `doc-kit/targets`:
//   field, toggle, card, button, link, tab, main, union.
// A project's captures/targets.mjs usually re-exports them. Full target syntax: ARCHITECTURE.md §6.3 and the
// header of engine/capture/plans.mjs.

/** Complete form field (label + control + help): the <label> that contains exactly this text. */
export const field = (label) => ({ field: label });

/** Row with a switch, or text + help: the parent of the label text. */
export const toggle = (label) => ({ text: label, up: 1 });

/** Closest bordered box (card, panel) that contains this text. */
export const card = (text) => ({ text, framed: true });

/** Button by its accessible name (label or aria-label). */
export const button = (name, exact = false) => ({ role: "button", name, exact });

/** Link of the side menu or of the page, by its accessible name. */
export const link = (name, exact = false) => ({ role: "link", name, exact });

/** Tab (role=tab) by its name. */
export const tab = (name) => ({ role: "tab", name });

/** Main area of the page (without the side bar or the top bar). */
export const main = { css: "main", margin: 0, marginY: 0 };

/** One zone over the bounding box of several targets (fields of one row): union(field("A"), field("B")). */
export const union = (...targets) => ({ union: targets.flat() });
