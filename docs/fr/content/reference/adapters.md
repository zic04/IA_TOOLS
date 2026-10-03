## En bref

Les adaptateurs sont les deux points d'extension du kit. Chacun est un petit module qui exporte un objet ; la
configuration le nomme et donne ses options à côté.

1. **Les adaptateurs de couverture** (`coverage`) listent ce que contient l'application (routes, entrées de
   registre, fichiers). Le kit cherche chaque élément dans la documentation et signale ce qui n'est pas cité.
2. **Les adaptateurs d'authentification** (`auth`) reconnaissent une session ouverte, pour `connect` et avant chaque
   capture.
3. **Intégrés ou locaux.** Le kit en fournit quatre de chaque sorte ; un projet ajoute les siens avec
   `adapter: "local:adapters/x.mjs"`, un chemin relatif au projet de documentation.
4. **Les options sont validées** comme la configuration : une option inconnue ou manquante est une erreur signalée
   avec son chemin (`coverage[0].ap`, `auth.loginPatern`), code de sortie 2.

## Les adaptateurs de couverture

| Adaptateur | Inventorie | Options (défaut) |
|---|---|---|
| `next-app-router` | Les routes d'un dossier App Router de Next.js (`page.tsx`, `.ts`, `.jsx`, `.js`, `.mdx`) ; avec `api: true`, aussi ses gestionnaires de route (`route.ts`/`.js`), comme une seconde famille | `app` (`"app"`), `family` (`"Routes"`), `exclude` (`["^/$"]`), `api` (`false`), `apiFamily` (`"API"`) |
| `react-router` | Le `path` des routes déclarées dans des fichiers source | `file` (`"src/App.tsx"`, ou une liste), `pattern`, `prefix` (`"/"`), `family`, `exclude` (`["^/$"]`) |
| `i18n-registry` | Les ids d'un registre dans un fichier source, couverts par leur libellé dans un fichier i18n | `source`, `messages` (obligatoires), `key` (`"{id}"`), `block`, `pattern`, `flags` (`"m"`), `aliases`, `fallback`, `exclude`, `family` (`"Registry"`) |
| `glob` | Les fichiers d'un dossier, cités sous une forme que vous choisissez | `pattern` (obligatoire), `base` (`"."`), `match` (`"{name}"`), `family` (`"Files"`), `exclude` |
| `openapi` | Les opérations d'un document OpenAPI 3 ou Swagger 2, en JSON | `file` (obligatoire), `family` (`"API"`), `prefix` (`""`), `exclude` |
| `features` | Les candidates fonctionnalités métier de `features.json` ([Espace métier](#/write/markdown~espace-metier)) | `file` (`"features.json"`), `family` (`"Features"`) |
| `fastapi` | Les gestionnaires de route d'une application FastAPI (`APIRouter(prefix)` et `include_router(prefix)` composés) | `app` (`"."`), `family` (`"API"`), `exclude` |
| `facts` | Un élément par fait d'une source `doc-kit facts` : `env`, `api`, `db`, les `dependencies` directes, ou `agents` | `source` (obligatoire), `family` (selon la source), `dir` (`"facts"`), `exclude` |

- **Next.js** : les groupes de routes `(marketing)` et les slots `@modal` n'ajoutent aucun segment ; les routes
  d'interception et les dossiers `_private` sont ignorés ; `[id]`, `[...slug]` et `[[...slug]]` sont conservés.
- **Les routes** sont couvertes telles qu'elles sont écrites, avec `:id`, `{id}` ou `[id]`, ou par leur préfixe
  statique (`/orders/` pour `/orders/[id]`).
- **`exclude`** contient des expressions régulières, ou des ids exacts.
- **`glob`** : `match` est un modèle où `{path}` est le chemin relatif à `base` sans extension, `{name}` le nom du
  fichier sans extension, `{dir}` son dossier et `{file}` le nom du fichier.
- **`openapi`** : l'id d'un élément est `METHODE /chemin` (p. ex. `GET /orders/{id}`), son libellé le `summary` ou
  l'`operationId` de l'opération. Le kit n'embarque aucun analyseur YAML : un fichier `.yaml` ou `.yml` répond « non
  disponible » (`yaml`), sans échouer ; servez plutôt le document en JSON (FastAPI : `/openapi.json`).
- **`features`** : un élément par entrée de `features.json` (`[{ id, title, routes?, api?, keys? }]`, `doc-kit
  inventory --features --write`), couvert quand son id est cité — en pratique sur le champ `feature` de sa fiche.
- **`facts`** : lit `facts/<source>.json`, écrit par `doc-kit facts` (ARCHITECTURE.md §6.9) ; un fichier manquant
  répond « indisponible » (`noFacts`), sans échouer. `dependencies` ne compte jamais que les paquets directs.

```js
coverage: [
  { adapter: "next-app-router", app: "../../app", exclude: ["^/$", "^/api/"] },
  { adapter: "i18n-registry", family: "Widgets", source: "../../src/widgets/registry.ts",
    pattern: "id: \"(?<id>[a-z0-9_]+)\"", messages: "../../src/i18n/fr.json", key: "dashboard.widget.{id}.title" },
  { adapter: "glob", family: "Spécifications", base: "../../specs", pattern: "**/*.md", match: "{name}" },
],
```

Un adaptateur dont la source est introuvable répond « indisponible » : son contrôle est **ignoré**, pas en échec, et
le rapport dit pourquoi (`introuvable : ../../app`).

## Les adaptateurs d'authentification

| Adaptateur | Connecté quand | `connect` | Options (défaut) |
|---|---|---|---|
| `manual` | La page n'est pas une page de connexion | Vous appuyez sur Entrée | — |
| `none` | Toujours : aucune session n'est utilisée | Rien à faire | — |
| `nextauth` | Le point d'accès de session renvoie un `user` | Détecte tout seul | `endpoint` (`"/api/auth/session"`) |
| `api-me` | Le point d'accès « moi » renvoie un JSON qui contient `proof` | Détecte tout seul | `url` (`"/api/me"`), `proof` (`"id"`, un chemin à points est accepté), `who` (`"name"`) |

Tout adaptateur d'authentification accepte aussi `start` (`"/"`), `loginPattern`
(`"login|signin|sign-in|oauth|authorize"`) et `browser` (`"chromium"` ou `"chrome"`).

## Écrire un adaptateur

### Un adaptateur de couverture

```js
// adapters/screens.mjs, déclaré comme { adapter: "local:adapters/screens.mjs", folder: "../../src/screens" }
export default {
  name: "screens",
  options: {
    folder: { type: "string", minLength: 1, required: true },
    family: { type: "string", default: "Screens" },
  },
  async inventory({ root, options, tools }) {
    if (!tools.exists(options.folder)) return { available: false, reason: "notFound", vars: { path: options.folder } };
    const items = tools.glob("*.tsx", options.folder).map((f) => ({ id: f, match: [f.replace(/\.tsx$/, "")] }));
    return { available: true, families: [{ name: options.family, items }] };
  },
};
```

| Partie | Contrat |
|---|---|
| `options` | Chaque option est un petit schéma : `type`, `default`, `enum`, `pattern`, `minLength`, `items`… et `required: true` |
| `inventory()` | Reçoit `root` (le projet de documentation), les `options` validées et `tools` ; renvoie `{ available: true, families }` ou `{ available: false, reason, vars }` |
| Un élément | `{ id, label?, match: [textes] }` : couvert quand l'un de ses textes apparaît dans la documentation, sans tenir compte de la casse ni des espaces |
| `tools` | `resolve`, `exists`, `read`, `json`, `walk`, `glob`, `i18nKey` ; chaque chemin est relatif au projet de documentation |
| `reason` | `notFound`, `blockNotFound` et `error` sont traduits ; tout autre texte est affiché tel quel |

Ce site en utilise un : `docs/shared/kit-reference.mjs`, dans le dépôt du kit, liste chaque clé du schéma de
configuration, chaque option de la ligne de commande et chaque adaptateur intégré, et le contrôle de couverture
échoue quand l'un d'eux n'est pas cité dans ces pages. `doc-kit inventory` affiche ses trois familles.

### Un adaptateur d'authentification

```js
// adapters/sso.mjs, déclaré comme auth: { adapter: "local:adapters/sso.mjs", profile: "/api/profile" }
export default {
  name: "sso",
  options: { profile: { type: "string", default: "/api/profile" } },
  browser: "chromium",          // ou "chrome"
  detects: true,                // connect interroge session() au lieu d'attendre Entrée
  async session(page, options, { appUrl, isSignInUrl }) {
    if (isSignInUrl(page.url(), appUrl, options.loginPattern)) return null;
    const me = await page.evaluate(async (u) => (await fetch(u)).ok, options.profile);
    return me ? { who: null, details: null, expires: null } : null;
  },
};
```

`session()` renvoie `null` quand la page n'est pas connectée, sinon `{ who, details, expires }` : `connect` les
affiche. Un adaptateur avec `none: true` désactive complètement la session.

## Pièges et écarts constatés

> [!ATTENTION] Les chemins sont relatifs au projet de documentation
> `app: "../../app"` est résolu depuis le dossier de `doc.config.mjs`, pas depuis l'application. `doc-kit doctor`
> vérifie chaque option de chemin des entrées de couverture.

> [!NOTE] Deux options de même nom
> Les options d'un adaptateur lui sont propres : `family` de `glob` et `family` de `react-router` n'entrent jamais en
> conflit.

## Pour aller plus loin

- [Les contrôles](#/publish/checks~couverture) : ce qu'affiche le contrôle de couverture.
- [Connexion et sessions](#/capture/sessions) : la règle de connexion sur laquelle reposent les adaptateurs.
- [Clés de couverture, de thème et de textes](#/reference/configuration/site) : la clé `coverage`.
