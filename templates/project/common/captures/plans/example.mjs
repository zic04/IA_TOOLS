// Example capture plan. One file per batch of pages; each file exports CAPTURES.
// The same id in two files is an error. Full syntax: at the top of engine/capture/plans.mjs in the kit.
//
// Each entry:
//   id        identifier (= images/<id>.webp + images/zones/<id>.json), cited in the Markdown by :::screen (:::ecran)
//   title     caption shown above the screen
//   route     path opened in the application
//   context   "desktop" (1600×1000, default) or "mobile" (390×844, simulated position)
//   viewport  size override, e.g. { height: 2200 } for a long panel
//   view      { lon, lat, zoom }: framing of a map (when capture.map is set in doc.config.mjs)
//   storage   localStorage keys set before opening the page (a remembered tab, an open panel…)
//   delay     wait after loading, in ms (default 2500; 7000 for a map)
//   actions   steps played before the capture: { click }, { hover }, { type, value }, { select, value },
//             { press }, { scroll }, { wait: ms | target }, { wheel }, { eval }
//   frame     target whose box delimits the image
//   zones     annotated elements, IN THE ORDER of the markers ①②③… (3 to 12). A zone is a target, or
//             { union: [target, …] }: one marker over the bounding box of several targets (fields of one row)
//   masks     targets whose text is replaced by dots (on top of the automatic masking)
//
// A target: { role, name } · { text } · { field } · { label } · { placeholder } · { css } · { block }
//   options: exact, nth, last, has (contains this text), within (parent target), up (climb n levels),
//            framed (nearest bordered box), margin (px around the zone), side
//
// ON PRODUCTION: navigation only (pages, tabs, menus, opening a dialog then Escape, hovering).
// Never Save, Create, Approve, Delete, Sign, Send, Import, Synchronise, Reindex, Sign out.
//
// Take and check:  doc-kit capture "home" --preview   then look at <id>.zones.png in .doc-kit/ (zones in red)
import { button, field } from "../targets.mjs";

export const CAPTURES = [
  {
    // Cited by content/use/getting-started.md (en) or content/utiliser/prise-en-main.md (fr):
    // its legend has 3 items, one per zone, in the same order.
    id: "home",
    title: "{{name}}",
    route: "/",
    delay: 2500,
    zones: [
      { css: "header" }, // ① the top bar
      { css: "nav" }, // ② the menu
      { css: "main" }, // ③ the content of the screen
    ],
  },

  // A dialog opened then captured, without saving anything. The two fields of the same row share one marker:
  // {
  //   id: "use-preferences",
  //   title: "{{name}} › Preferences",
  //   route: "/",
  //   actions: [{ click: button("Preferences") }, { wait: { css: "[role=dialog]" } }],
  //   frame: { css: "[role=dialog]" },
  //   zones: [
  //     { union: [field("Theme"), field("Language")] }, // ① one marker for the whole row
  //     field("Notifications"), // ②
  //     button("Close"), // ③
  //   ],
  // },
];
