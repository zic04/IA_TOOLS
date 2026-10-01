// Screens of THIS documentation site, captured from `doc-kit dev` (start/generated-site, write/markdown).
// A separate plans folder, run without session against the local dev server (see CONTRIBUTING.md):
//   DOC_KIT_NO_OPEN=1 doc-kit dev --port 4401                                    (in a first terminal)
//   KIT_DOCS_URL=http://127.0.0.1:4401 doc-kit capture --plans captures/plans-site --no-session
// The theme choice is kept in localStorage under theme.key ("doc-kit-doc-theme").
const page = "/#/examples/screen~the-screen";
const viewport = { width: 1440, height: 900 };

export const CAPTURES = [
  {
    id: "site-page",
    title: "doc-kit › a page of the generated site",
    route: page,
    viewport,
    delay: 1200,
    zones: [
      { css: "#topnav", caption: "Sections" }, // ①
      { css: "#ouvrir-recherche", caption: "Search" }, // ②
      { css: "#bouton-theme", caption: "Theme" }, // ③
      { css: "#bouton-imprimer", caption: "Print" }, // ④
      { css: "#lateral", margin: 0, caption: "Menu" }, // ⑤
      { css: ".ecran-barre [data-action=visite]", caption: "Guided tour" }, // ⑥
      { css: ".ecran-cadre", margin: 2, caption: "Annotated screen" }, // ⑦
      { css: "#toc", margin: 0, caption: "On this page" }, // ⑧
    ],
  },
  {
    id: "site-home",
    title: "doc-kit › home page",
    route: "/#/",
    viewport,
    delay: 1200,
  },
  {
    id: "site-tour",
    title: "doc-kit › guided tour, step 2",
    route: page,
    viewport,
    delay: 1200,
    actions: [{ click: { css: ".ecran-barre [data-action=visite]" } }, { wait: 600 }, { click: { role: "button", name: "Next" } }, { wait: 600 }],
  },
  {
    id: "site-search",
    title: "doc-kit › search",
    route: "/#/",
    viewport,
    delay: 1200,
    actions: [{ click: { css: "#ouvrir-recherche" } }, { wait: 300 }, { type: { css: "#recherche-champ" }, value: "union" }, { wait: 500 }],
  },
  {
    id: "site-light",
    title: "doc-kit › light theme",
    route: "/#/write/markdown",
    viewport,
    delay: 1200,
    storage: { "doc-kit-doc-theme": "light" },
  },
  {
    id: "site-dark",
    title: "doc-kit › dark theme",
    route: "/#/write/markdown",
    viewport,
    delay: 1200,
    storage: { "doc-kit-doc-theme": "dark" },
  },
];
