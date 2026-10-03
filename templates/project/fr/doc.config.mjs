// Configuration du site de documentation du produit {{name}}, construit avec doc-kit.
// Référence : §3 du fichier ARCHITECTURE.md du kit ; exemples commentés : standard/config.fr.md dans le kit.
// La validation est stricte : une clé inconnue est une erreur (code de sortie 2), signalée avec son chemin.
// Priorité, de la plus forte à la plus faible : option de la CLI > variable DOC_KIT_* > variable <PRÉFIXE>_*
// > ce fichier > valeur par défaut. Les chemins sont relatifs à ce dossier.
import { defineConfig } from "doc-kit/config";

export default defineConfig({
  // Versions du kit acceptées (plage semver). Hors de la plage, toute commande s'arrête avec le code 3.
  kit: "^1.0.0",

  // Renommer le produit : changez name ici, puis le titre, l'accroche et les titres de section de content/toc.json.
  product: { name: "{{name}}", slug: "{{slug}}" },
  language: "{{language}}", // "en" | "fr" : langue du site et des messages de la CLI
{{languagesLine}}  // output: "dist/{{slug}}-documentation.html", // par défaut : dist/<nom du produit>-Documentation.html

  // Dossiers du projet. Un projet ancien déclare les siens ici, par exemple { content: "contenu", diagrams: "schemas" }.
  paths: { content: "content", images: "images", diagrams: "diagrams" },

  // Version affichée dans le bandeau du site, lue dans le code de l'application. La valeur de repli sert quand le
  // fichier est introuvable (par exemple, une copie de ce dossier hors du dépôt).
  version: {
    file: {{versionFile}},
    pattern: {{versionPattern}},
    fallback: "0.0.0",
  },

  // Avec un préfixe, les commandes lisent aussi <PRÉFIXE>_URL, <PRÉFIXE>_SESSION, <PRÉFIXE>_PLANS et
  // <PRÉFIXE>_READONLY. Exemple : { prefix: "ACME" } lit ACME_URL…
  env: {},

  // L'application : son adresse (captures) et son dossier racine, le code que lisent les rédacteurs (dir).
  // En production, les captures ne tournent qu'en lecture seule (voir capture.target).
  app: { url: "{{appUrl}}", dir: "{{appRoot}}" },

  // Comment une session est reconnue après `doc-kit connect` :
  //   manual  (par défaut) la personne se connecte, puis appuie sur Entrée ; la session est valide tant que
  //           l'application ne renvoie pas vers une page de connexion, reconnue par l'option loginPattern
  //           (par défaut "login|signin|sign-in|oauth|authorize")
  //   none    l'application ne demande pas de connexion
  //   nextauth  GET /api/auth/session
  //   api-me    le point d'accès « moi » de l'API
  //   local:adapters/x.mjs  un adaptateur propre à ce projet
  // Les options de l'adaptateur se placent à côté de "adapter", par exemple
  // { adapter: "manual", loginPattern: "/login|/oauth2/" }.
  auth: { adapter: "{{auth}}" },

  capture: {
    // "app" : les écrans sont capturés sur l'application en marche ; "none" : aucune capture, chaque écran est
    // décrit par un tableau de ses éléments (capture et connect refusent de tourner, l'audit ne compte pas les
    // écrans annotés).
    mode: "{{captureMode}}",
    // Où sont prises les captures : "local" (l'application sur ce poste), "demo" (une copie de démonstration,
    // préparée par `setup`) ou "production" (l'application réelle : toujours en lecture seule, un bandeau et une
    // confirmation avant chaque campagne, `doc-kit demo` refusé).
    target: "{{captureTarget}}",
    plans: "captures/plans", // un fichier .mjs par lot de pages, chacun exporte CAPTURES
    setup: null, // script idempotent qui prépare les données de démo (`doc-kit demo`), par exemple "captures/setup-demo.mjs"
    locale: null, // par défaut : déduite de language (en-US, fr-FR)
    timezone: "UTC",
    viewports: { desktop: { width: 1600, height: 1000 }, mobile: { width: 390, height: 844 } },
    webpQuality: 0.82,
    geolocation: null, // { latitude, longitude } pour le contexte mobile, si l'application utilise la position
    // Clés du localStorage posées avant chaque capture (thème, langue, préférences). "{version}" est remplacé
    // par la version de l'application. Exemple : { theme: "light" }.
    storage: {},
    // Cookies posés avant chaque capture. Exemple, langue de l'interface d'une application Next.js :
    // [{ name: "NEXT_LOCALE", value: "{{language}}" }].
    cookies: [],
    // Sélecteurs CSS de la cible { block } et de l'option "framed". Exemple : { block: "section.card" }.
    selectors: { block: null, frame: null },
    map: null, // { x, y, z } : paramètres d'URL qui cadrent une carte (champ `view` des plans)
    // Routes à ne JAMAIS ouvrir (expressions régulières JavaScript sur le chemin) : les pages dont l'affichage
    // écrit sur le serveur. Lisez le code de chaque page de détail avant de la capturer. Voir standard/captures.fr.md.
    forbidden: [],
    // Bloque toute requête autre que GET/HEAD/OPTIONS : "auto" dès qu'une session est utilisée ; toujours avec
    // target "production", où false est refusé.
    readOnly: {{readOnly}},
  },

  // Masquage automatique dans les images : GUID, valeurs des fichiers .env locaux de l'application, motifs.
  // Il ne connaît pas les valeurs de production : relisez chaque image.
  masking: {
    env: {{maskingEnv}},
    exclude: "localhost|127\\.0\\.0\\.1",
    guid: true,
    patterns: [],
  },

  // Contrôle de couverture : chaque élément inventorié par ces adaptateurs (routes, registres…) doit être cité
  // dans la documentation. Vide : pas de contrôle.
  coverage: {{coverage}},

  theme: {
    key: "{{slug}}-doc-theme", // clé localStorage du thème clair / sombre du site
    logo: "theme/logo.svg",
    colors: {}, // couleurs du thème clair ; vide : la palette neutre du kit
    dark: {}, // couleurs du thème sombre
    icons: {}, // icônes ajoutées ou remplacées, par nom
  },

  // Pastilles [[statut …]] colorées : { "0": ["st-0", "0 · payée"] }. Vide : pastilles neutres.
  statuses: {},

  // Textes du site remplacés (toute clé i18n), par exemple { "home.primaryAction": "Explorer les éditeurs" }.
  texts: {},

  // Lien « Signaler un problème » : { label, url }, ou null.
  feedback: null,

  // Libre : transmis aux scripts du projet (préparation de la démo, plans de capture) et aux briefs du skill
  // (extra.briefs).
  extra: {},
});
