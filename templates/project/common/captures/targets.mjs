// Helpers shared by the capture plans (captures/plans/*.mjs) to point at an element:
//   field(label)    a whole form field: the <label> that contains exactly this text
//   toggle(label)   a row with a switch, or a text with its help: the parent of the label's text
//   card(text)      the nearest bordered box (card, panel) that contains this text
//   button(name)    a button by its accessible name; button(name, true) for an exact name
//   link(name)      a link by its accessible name; link(name, true) for an exact name
//   tab(name)       a tab (role=tab) by its name
//   main            the main area of the page, without the side menu or the top bar
export * from "doc-kit/targets";

// Add the project's own helpers here, for example:
// export const dialog = { css: "[role=dialog]" };
