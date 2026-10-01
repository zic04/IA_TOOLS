// Écrans de CE site de documentation, capturés depuis `doc-kit dev` (start/generated-site, write/markdown).
// Un dossier de plans à part, lancé sans session sur le serveur de développement local (voir CONTRIBUTING.md) :
//   DOC_KIT_NO_OPEN=1 doc-kit dev --port 4401                                    (dans un premier terminal)
//   KIT_DOCS_URL=http://127.0.0.1:4401 doc-kit capture --plans captures/plans-site --no-session
// Le choix du thème est gardé dans localStorage sous theme.key (« doc-kit-doc-theme »).
const page = "/#/examples/screen~l-ecran";
const viewport = { width: 1440, height: 900 };

export const CAPTURES = [
  {
    id: "site-page",
    title: "doc-kit › une page du site généré",
    route: page,
    viewport,
    delay: 1200,
    zones: [
      { css: "#topnav", caption: "Sections" }, // ①
      { css: "#ouvrir-recherche", caption: "Recherche" }, // ②
      { css: "#bouton-theme", caption: "Thème" }, // ③
      { css: "#bouton-imprimer", caption: "Imprimer" }, // ④
      { css: "#lateral", margin: 0, caption: "Menu" }, // ⑤
      { css: ".ecran-barre [data-action=visite]", caption: "Visite guidée" }, // ⑥
      { css: ".ecran-cadre", margin: 2, caption: "Écran annoté" }, // ⑦
      { css: "#toc", margin: 0, caption: "Sur cette page" }, // ⑧
    ],
  },
  {
    id: "site-home",
    title: "doc-kit › page d’accueil",
    route: "/#/",
    viewport,
    delay: 1200,
  },
  {
    id: "site-tour",
    title: "doc-kit › visite guidée, étape 2",
    route: page,
    viewport,
    delay: 1200,
    actions: [{ click: { css: ".ecran-barre [data-action=visite]" } }, { wait: 600 }, { click: { role: "button", name: "Suivant" } }, { wait: 600 }],
  },
  {
    id: "site-search",
    title: "doc-kit › recherche",
    route: "/#/",
    viewport,
    delay: 1200,
    actions: [{ click: { css: "#ouvrir-recherche" } }, { wait: 300 }, { type: { css: "#recherche-champ" }, value: "union" }, { wait: 500 }],
  },
  {
    id: "site-light",
    title: "doc-kit › thème clair",
    route: "/#/write/markdown",
    viewport,
    delay: 1200,
    storage: { "doc-kit-doc-theme": "light" },
  },
  {
    id: "site-dark",
    title: "doc-kit › thème sombre",
    route: "/#/write/markdown",
    viewport,
    delay: 1200,
    storage: { "doc-kit-doc-theme": "dark" },
  },
];
