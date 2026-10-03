# Exemples de configuration

Deux `doc.config.mjs` complets, conformes au §3 du contrat (`ARCHITECTURE.md`). Les deux applications sont fictives :
- **Acme Orders** : une application web de gestion de commandes, construite avec Next.js (App Router), dont les utilisateurs se connectent par un fournisseur d'identité. Sa documentation est capturée **en production, en lecture seule**.
- **Acme Deliveries** : une application de planification de livraisons, avec un front React Router, une API Python et une carte. Sa documentation est capturée sur une **démo locale préparée**, complétée de quelques captures de production en lecture seule.

Les deux exemples sont ceux de sites en français : `language: "fr"`. Les clés de configuration sont toujours en anglais.

Rappels :
- La validation est **stricte** : une clé inconnue est une erreur (code de sortie 2), indiquée avec son chemin, par exemple `capture.storgae`.
- Priorité, de la plus forte à la plus faible : option de la CLI > variable `DOC_KIT_*` > variable `<PREFIXE>_*` > fichier de configuration > valeur par défaut.
- Les valeurs par défaut sont **neutres** : aucun cookie, aucun sélecteur de cadre CSS, aucune couleur de marque et aucune géolocalisation ne sont appliqués si la configuration ne les demande pas. Une clé omise prend sa valeur par défaut.
- Les chemins sont relatifs au dossier du projet de documentation.

## Acme Orders — production en lecture seule, Next.js, connexion manuelle

```js
// doc.config.mjs — documentation d'Acme Orders, dans <app>/docs/manual/
import { defineConfig } from "doc-kit/config";

export default defineConfig({
  kit: "^0.2.0", // versions du kit acceptées ; hors de cette plage, chaque commande s'arrête avec le code 3
  product: { name: "Acme Orders", slug: "acme-orders" },
  language: "fr", // langue du site et des messages de la CLI
  output: "dist/Acme-Orders-Documentation.html",
  paths: { content: "content", images: "images", diagrams: "diagrams" }, // les défauts, montrés pour la clarté

  // Version affichée dans le bandeau du site : lue dans le code de l'application. Le repli sert quand le
  // fichier est introuvable (par exemple, une copie de ce dossier hors du dépôt).
  version: {
    file: "../../package.json",
    pattern: "\"version\"\\s*:\\s*\"([^\"]+)\"",
    fallback: "2.4.0",
  },

  // Lit aussi ACME_URL, ACME_SESSION, ACME_PLANS, ACME_READONLY et ACME_VERSION (la version de repli).
  env: { prefix: "ACME" },

  // L'application capturée est la PRODUCTION. Les captures ne s'y font qu'avec une session, en lecture seule.
  app: { url: "https://orders.acme.example" },

  // « manual » : `doc-kit connect` ouvre l'application, la personne se connecte par le fournisseur d'identité
  // (SSO, MFA), puis appuie sur Entrée dans le terminal. Avant chaque capture, la session est valide si
  // l'application ne redirige pas vers une page dont l'URL correspond à loginPattern. Acme Orders a sa propre
  // route /login et le fournisseur d'identité utilise des URL /oauth2/ et /authorize.
  auth: {
    adapter: "manual",
    loginPattern: "/login|/oauth2/|/authorize|/signin",
  },

  capture: {
    // Tout est capturé sur la production : lecture seule toujours, un bandeau et une confirmation avant chaque
    // campagne, `doc-kit demo` refusé (écrit par `doc-kit init --target production`).
    target: "production",
    // Acme Orders range ses plans de production à part, au cas où une démo s'ajouterait un jour.
    plans: "captures/plans-prod",
    setup: null, // pas de démo : tout est capturé en production
    locale: "fr-FR",
    timezone: "Europe/Paris",
    viewports: { desktop: { width: 1600, height: 1000 }, mobile: { width: 390, height: 844 } },
    webpQuality: 0.82,
    geolocation: null, // l'application n'utilise pas la position
    storage: { theme: "light", density: "comfortable" }, // localStorage posé avant chaque capture
    cookies: [{ name: "NEXT_LOCALE", value: "fr" }], // la langue de l'interface est un cookie (i18n Next.js)
    selectors: { block: "section.card", frame: null }, // utilisé par la cible { block }
    map: null,
    // Routes à ne jamais ouvrir : la fiche d'une commande sans circuit de validation en crée un au rendu
    // (app/(app)/orders/[id]/page.tsx:88-92, ensureApprovalChain) et notifie le valideur. Seules restent
    // ouvrables les trois fiches déjà ouvertes pendant la campagne du 1er octobre 2026, dont le circuit existe.
    forbidden: [
      "^/orders/(?!(ord_7f3a21|ord_91bc04|ord_c2d9e8)(/|$))[^/]+",
    ],
    readOnly: true, // toujours en production ("auto" y revient au même ; false est refusé)
  },

  // Masquage automatique : GUID, et valeurs du .env local de l'application dont le nom évoque une URL,
  // un tenant, un client, un compte, un hôte, une adresse e-mail ou un utilisateur. Plus les noms d'hôtes internes.
  masking: {
    env: ["../../.env.local"],
    exclude: "localhost|127\\.0\\.0\\.1",
    guid: true,
    patterns: ["[a-z0-9-]+\\.internal\\.acme\\.example"],
  },

  // Chaque route app/**/page.tsx doit être citée (« routes » de toc.json ou texte d'une page) : 61 routes.
  coverage: [{ adapter: "next-app-router", app: "../../app" }],

  theme: {
    key: "acme-orders-doc-theme", // clé localStorage du thème clair / sombre du site
    logo: "theme/logo.svg",
    colors: {}, // jetons de couleur du thème clair ; vide : la palette neutre du kit
    dark: {},
    icons: {},
  },

  statuses: {}, // [[statut …]] : pastilles neutres ; Acme Orders affiche ses statuts en simples libellés
  texts: {},
  feedback: { label: "Signaler une erreur dans cette documentation", url: "https://support.acme.example/docs" },
  extra: {},
});
```

Une campagne de captures :

```bash
doc-kit connect --url https://orders.acme.example   # la personne se connecte (SSO + MFA), puis appuie sur Entrée
doc-kit capture "prod-cf-*" --preview                # lecture seule, petits lots
doc-kit connect --forget                             # supprime la session
```

## Acme Deliveries — démo locale, React Router + API Python, une carte

```js
// doc.config.mjs — documentation d'Acme Deliveries, dans <app>/docs/manual/
import { defineConfig } from "doc-kit/config";

export default defineConfig({
  kit: "^0.2.0",
  product: { name: "Acme Deliveries", slug: "acme-deliveries" },
  language: "fr",
  output: "dist/Acme-Deliveries-Documentation.html",

  version: {
    file: "../../frontend/src/lib/version.ts",
    pattern: "APP_VERSION\\s*=\\s*\"([^\"]+)\"",
    fallback: "0.9.3",
  },

  // Lit aussi DELIVERIES_URL, DELIVERIES_SESSION, DELIVERIES_PLANS, DELIVERIES_READONLY et DELIVERIES_VERSION.
  // Captures de production : DELIVERIES_URL=https://deliveries.acme.example DELIVERIES_PLANS=captures/plans-prod, avec une session.
  env: { prefix: "DELIVERIES" },

  // Par défaut, l'application lancée en LOCAL (serveur de développement du front) avec les données de démo. `dir`
  // est la racine de l'application, écrite par `doc-kit init` : le front est dans frontend/ et l'API Python dans
  // api/, et les rédacteurs (comme les briefs du skill) lisent les deux depuis là.
  app: { url: "http://localhost:5173", dir: "../.." },

  // « api-me » : la session est valide quand le point « me » de l'API répond avec l'utilisateur connecté (le
  // serveur de développement du front relaie /api vers l'API Python). Les options de l'adaptateur se placent à
  // côté de « adapter » : `url` (défaut « /api/me »), `proof` (champ qui prouve la connexion, défaut « id »),
  // `who` (champ affiché par connect, défaut « name »).
  auth: { adapter: "api-me", url: "/api/v1/me", proof: "id", who: "name" },

  capture: {
    target: "local", // l'application qui tourne sur ce poste
    plans: "captures/plans",
    // Remplit la base de développement ; idempotent, donc relançable avant chaque campagne.
    // Deux dépôts, 40 livraisons dans chaque statut, des livreurs et des clients fictifs. Lancé par `doc-kit demo`.
    setup: "captures/setup-demo.mjs",
    locale: null, // déduite de language : fr-FR
    timezone: "Europe/Paris",
    viewports: { desktop: { width: 1600, height: 1000 }, mobile: { width: 390, height: 844 } },
    webpQuality: 0.82,
    // La position du livreur dans le contexte mobile, au milieu des livraisons de démo.
    geolocation: { latitude: 51.5072, longitude: -0.1276 },
    // Le dépôt mémorisé par l'application, la langue de l'interface, et l'avis « Nouveautés » marqué comme vu
    // pour la version courante (« {version} » est remplacé par la version de l'application).
    storage: { theme: "light", lang: "fr", depot: "north", "whats-new-seen": "{version}" },
    cookies: [], // la langue de l'interface est dans le localStorage (« lang »), pas dans un cookie
    selectors: { block: "div.panel", frame: null },
    // Cadrage déterministe d'une capture de carte : la vue { lon, lat, zoom } du plan est écrite dans ces
    // paramètres d'URL de l'application (x et y en mètres Web Mercator, EPSG:3857).
    map: { x: "mx", y: "my", z: "mz" },
    forbidden: [],
    readOnly: "auto",
  },

  masking: {
    env: ["../../.env"],
    exclude: "localhost|127\\.0\\.0\\.1|^db$|\\.local$",
    guid: true,
    patterns: [],
  },

  // 74 éléments : 22 routes de App.tsx, 12 couches de carte, 25 widgets de tableau de bord, 15 outils de barre.
  // Le titre français de chaque couche, widget et outil (lu dans fr.json) doit apparaître dans la documentation.
  // Une entrée i18n-registry par registre : `source` contient les ids, `block` (facultatif) délimite la partie
  // de la source à lire, `pattern` extrait les ids (par défaut : chaque chaîne entre guillemets), `key` trouve
  // chaque libellé dans `messages`. Toutes les options : en-tête de adapters/coverage/i18n-registry.mjs.
  coverage: [
    { adapter: "react-router", file: "../../frontend/src/App.tsx" },
    {
      adapter: "i18n-registry",
      family: "Couches de la carte",
      source: "../../frontend/src/lib/layers.ts",
      block: "LAYER_IDS\\s*=\\s*\\[([^\\]]+)\\]",
      messages: "../../frontend/src/i18n/locales/fr.json",
      key: "map.layer.{id}.title",
      aliases: { base_map: "base" }, // base_map n'a pas de libellé propre : il prend celui de « base »
      exclude: ["debug"],
    },
    {
      adapter: "i18n-registry",
      family: "Widgets des tableaux de bord",
      source: "../../frontend/src/features/dashboard/registry.ts",
      pattern: "^\\s*[a-z0-9_]+: \\{ id: \"(?<id>[a-z0-9_]+)\"",
      messages: "../../frontend/src/i18n/locales/fr.json",
      key: "dashboard.widget.{id}.title",
    },
    {
      adapter: "i18n-registry",
      family: "Outils de la barre",
      source: "../../frontend/src/features/map/toolbar.ts",
      block: "TOOL_IDS\\s*=\\s*\\[([^\\]]+)\\]",
      messages: "../../frontend/src/i18n/locales/fr.json",
      key: "map.tool.{id}",
    },
  ],

  theme: { key: "acme-deliveries-doc-theme", logo: "theme/logo.svg", colors: {}, dark: {}, icons: {} },

  // [[statut 2]] : la pastille colorée d'un statut de livraison, comme l'application l'affiche sur la carte.
  statuses: {
    "0": ["st-0", "0 · livrée"],
    "1": ["st-1", "1 · en cours de livraison"],
    "2": ["st-2", "2 · en retard"],
    "3": ["st-3", "3 · tentative échouée"],
    "4": ["st-4", "4 · retournée au dépôt"],
  },

  texts: { "home.primaryAction": "Découvrir les éditeurs" },
  feedback: null,

  // Libre : transmis aux scripts du projet (setup-demo.mjs, plans de captures).
  extra: {
    api: "http://localhost:8000/api/v1",
    demo: { depot: "north", day: "2026-09-30" },
  },
});
```

Campagnes de captures :

```bash
doc-kit demo                                     # prépare la démo (idempotent), application lancée en local
doc-kit capture "carte-couche-*" --preview       # captures de démo

# Configuration de production, en lecture seule, plans séparés (préfixe prod-)
doc-kit connect --url https://deliveries.acme.example
DELIVERIES_URL=https://deliveries.acme.example DELIVERIES_PLANS=captures/plans-prod doc-kit capture "prod-*" --preview
doc-kit connect --forget
```

Sous Windows PowerShell, posez d'abord les variables : `$env:DELIVERIES_URL = "https://deliveries.acme.example"`.

## Ce qui distingue les deux

| Clé | Acme Orders | Acme Deliveries | Pourquoi |
|---|---|---|---|
| `app.url` | Production | Local | L'un capture la production ; l'autre une démo préparée |
| `auth.adapter` | `manual` + `loginPattern` | `api-me` | Une redirection vers une page de connexion, contre une API qui dit qui est connecté |
| `capture.plans` | `captures/plans-prod` | `captures/plans` | Acme Orders n'a que des plans de production |
| `capture.setup` | `null` | `captures/setup-demo.mjs` | Une démo idempotente |
| `capture.cookies` | `NEXT_LOCALE=fr` | — | Langue de l'interface : un cookie, contre le `localStorage` (`lang`) |
| `capture.geolocation` | `null` | Une position | Seul Acme Deliveries a un contexte mobile qui utilise la position |
| `capture.map` | `null` | `mx`, `my`, `mz` | Seul Acme Deliveries a une carte |
| `capture.forbidden` | Fiches commande | — | Une écriture du serveur au rendu (`ensureApprovalChain`) |
| `coverage` | Routes `app/**/page.tsx` | Routes + registres i18n | Ce qui doit être documenté dépend du produit |
| `statuses` | — | 5 statuts colorés | Statuts codés en couleur dans l'application |

## Espaces, faits, suivi et économie des agents

Exemples fictifs des clés ajoutées par le standard à deux espaces (ARCHITECTURE.md §6.1a, §6.9, §6.10, §6.11).
Aucune n'a de défaut qui change le comportement existant : un projet qui ne les règle pas continue de se
construire exactement comme avant.

```js
// content/toc.json déclare les espaces ; doc.config.mjs ne configure que leur export et l'outillage facts/sync.
export default defineConfig({
  // … product, language, app, capture, coverage, theme comme plus haut …

  // Un export par espace déclaré, en plus du site complet (défaut : spaces.export vaut déjà true, cette ligne
  // n'est là que pour montrer la clé). {space} dans le chemin est remplacé par l'id de chaque espace.
  spaces: {
    export: true,
    output: "dist/Acme-Orders-Documentation-{space}.html",
  },

  // facts/<source>.json (doc-kit facts) et sync.json (doc-kit sync) vivent à la racine du projet par défaut ;
  // un projet plus ancien ou plus volumineux peut vouloir les ranger ailleurs.
  paths: { content: "content", images: "images", diagrams: "diagrams", facts: "facts", sync: "." },

  // sync --apply --labels ne suit que les fichiers de messages désignés ici (défaut : l'option "messages"
  // propre aux adaptateurs de couverture next-app-router et i18n-registry, quand ils en ont une).
  sync: { labels: ["../../messages/en.json", "../../messages/fr.json"] },

  capture: {
    // … comme plus haut …
    // capture --compare garde une image telle quelle (seules ses zones sont réécrites) en dessous de ce ratio
    // de pixels changés ; au-delà, l'image est remplacée. Défaut 0,005 (0,5 %) ; montré ici pour la clarté.
    compareThreshold: 0.005,
  },

  // Prix par million de jetons, lus par `sync --estimate` et par `brief.mjs --estimate` du skill
  // (ARCHITECTURE.md §6.11). Pas de défaut : les prix changent, et diffèrent selon le contrat. Les chiffres
  // ci-dessous sont purement illustratifs — lisez-les dans votre propre contrat ou la page de prix actuelle
  // du fournisseur, jamais dans ce fichier.
  llm: {
    currency: "EUR",
    prices: {
      haiku: { input: 1, output: 5, cacheRead: 0.1 },
      sonnet: { input: 3, output: 15, cacheRead: 0.3 },
      opus: { input: 15, output: 75, cacheRead: 1.5 },
    },
  },
});
```

| Clé | Rôle | Défaut |
|---|---|---|
| `spaces.export` | Écrire un export par espace déclaré, en plus du site complet | `true` |
| `spaces.output` | Chemin de chaque export, doit contenir `{space}` | la sortie du site complet, `-{space}` inséré avant son extension |
| `paths.facts` | Dossier de `facts/<source>.json`, commité avec le projet | `"facts"` |
| `paths.sync` | Dossier de `sync.json`, commité avec le projet | la racine du projet (`"."`) |
| `sync.labels` | Fichiers de messages que `sync --apply --labels` peut toucher | les `messages` propres aux adaptateurs de couverture |
| `capture.compareThreshold` | `capture --compare` : ratio de pixels changés au-delà duquel l'image est remplacée (0 à 1) | `0.005` |
| `llm.currency`, `llm.prices` | Prix par modèle (par million de jetons), pour les estimations de coût des agents | aucun — pas d'estimation sans lui |

## Sans captures

Quand la documentation doit s'écrire sans aucun accès à l'application, déclarez-le : `doc-kit init --capture none` l'écrit pour vous.

```js
  capture: { mode: "none" }, // aucune capture : chaque écran est décrit par un tableau de ses éléments
```

`capture` et `connect` expliquent alors le mode et s'arrêtent (code de sortie 2), `doctor` et le mode guidé ne demandent plus de session, `doc-kit new` écrit « L'écran » sous forme de tableau `| Élément | Ce qu'il montre |`, et `doc-kit audit` compte `annotated` comme `n/a` ([maturity.fr.md](maturity.fr.md)).

## Les projets plus anciens

Un projet écrit avant doc-kit, avec des noms de dossiers en français, continue de fonctionner : déclarez ses dossiers dans `paths`, par exemple `paths: { content: "contenu", diagrams: "schemas" }`. Ses fichiers JSON à clés françaises sont lus tels quels ; `doc-kit migrate` les réécrit au format actuel.
