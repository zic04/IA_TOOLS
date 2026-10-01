// Écrans d'Acme Orders, l'application de démonstration fictive du kit (examples/demo-app), utilisés par les exemples
// de pages et par la section Capturer. Le nombre de zones de chaque entrée est le nombre d'éléments de la légende de
// son bloc :::ecran. L'application est en anglais : les cibles visent ses libellés anglais.
//   doc-kit demo                     remet les données de démonstration à zéro (capture.setup)
//   doc-kit capture --preview        en lecture seule : le signal de présence de la page des réglages est bloqué
import { button, card, field, link, main, union } from "../targets.mjs";

export const CAPTURES = [
  {
    // examples/screen, capture/zones
    id: "orders-list",
    title: "Acme Orders › Commandes",
    route: "/orders",
    delay: 600,
    frame: main,
    zones: [
      { ...union(field("Status"), field("Customer"), field("Date")), caption: "Filtres" }, // ① un repère, trois champs
      { ...card("Today"), caption: "Aujourd'hui" }, // ② le panneau encadré qui contient « Today »
      { ...button("New order"), caption: "Nouvelle commande" }, // ③
      { css: "main table", caption: "Commandes" }, // ④
    ],
  },
  {
    // capture/targets-actions : toute la fenêtre avant les actions (côté « avant » d'un curseur avant / après ; les
    // deux images d'un curseur ont la même taille, donc les deux prennent toute la fenêtre)
    id: "orders-all",
    title: "Acme Orders › Commandes",
    route: "/orders",
    viewport: { width: 1360, height: 720 },
    delay: 600,
  },
  {
    // examples/screen, capture/targets-actions : le même écran après deux actions
    id: "orders-open",
    title: "Acme Orders › Commandes ouvertes d'un client",
    route: "/orders",
    viewport: { width: 1360, height: 720 },
    delay: 600,
    actions: [
      { select: { label: "Status" }, value: "Open" },
      { type: { label: "Customer" }, value: "north" },
    ],
  },
  {
    // examples/editor, capture/masking : le GUID de l'espace de travail est masqué automatiquement (masking.guid)
    id: "settings-profile",
    title: "Acme Orders › Réglages",
    route: "/settings",
    delay: 600,
    frame: main,
    zones: [
      { ...card("Profile"), caption: "Profil" }, // ①
      { ...card("Workspace"), caption: "Espace de travail" }, // ②
      { ...button("Save", true), caption: "Enregistrer", side: "right" }, // ③
    ],
  },
  {
    // examples/journey-step, capture/safety : le lien « Approval chain » mène à une route interdite
    id: "order-detail",
    title: "Acme Orders › Commande n° 1041",
    route: "/orders/1041",
    delay: 600,
    frame: main,
    zones: [
      { css: "main h1", caption: "Numéro de commande" }, // ①
      { ...card("Details"), caption: "Détails" }, // ②
      { ...link("Approval chain"), caption: "Circuit de validation" }, // ③
    ],
  },
  {
    // start/first-five-minutes : la page de connexion de la démo (n'importe quels e-mail et mot de passe)
    id: "sign-in",
    title: "Acme Orders › Connexion",
    route: "/login",
    delay: 400,
    frame: { css: "form" },
    zones: [
      { ...field("E-mail"), caption: "E-mail" }, // ①
      { ...field("Password"), caption: "Mot de passe" }, // ②
      { ...button("Sign in"), caption: "Connexion" }, // ③
    ],
  },
];
