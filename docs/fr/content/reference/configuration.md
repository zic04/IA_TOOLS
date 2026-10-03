## En bref

`doc.config.mjs`, à la racine d'un projet de documentation, est un module JavaScript dont l'export par défaut est la
configuration. Seule `product.name` est obligatoire ; toutes les autres clés ont une valeur par défaut neutre.

```js
import { defineConfig } from "doc-kit/config";   // fonction identité : l'autocomplétion dans votre éditeur

export default defineConfig({
  kit: "^0.2.0",
  product: { name: "Acme Orders" },
  language: "fr",
  app: { url: "http://localhost:3000" },
});
```

1. **Validation stricte.** Une clé inconnue, un mauvais type ou une valeur hors bornes est une erreur, signalée avec
   son chemin, et la commande s'arrête avec le code 2. Une clé proche est suggérée :
   `✖ doc.config.mjs › capture.storgae: clé inconnue → vouliez-vous dire « storage » ?`
2. **Des valeurs par défaut neutres.** Aucun cookie, aucun sélecteur de framework CSS, aucune couleur de marque et
   aucune géolocalisation si vous ne les demandez pas.
3. **Les chemins sont relatifs au dossier du projet** (le dossier de `doc.config.mjs`).
4. **Priorités**, de la plus forte à la plus faible : option de la ligne de commande, variable `DOC_KIT_*`, variable
   `<PREFIXE>_*`, ce fichier, valeur par défaut.

## Dans cette partie

| Sous-page | Clés |
|---|---|
| [Clés du projet, de la version et de la connexion](#/reference/configuration/project) | `kit`, `product`, `language`, `languages`, `output`, `paths`, `version`, `env`, `app`, `auth`, `extra` |
| [Clés de capture et de masquage](#/reference/configuration/capture) | `capture` et `masking` |
| [Clés de couverture, de thème et de textes](#/reference/configuration/site) | `coverage`, `theme`, `spaces`, `statuses`, `texts`, `feedback` |

La définition formelle est `schemas/config.schema.json` dans le kit ; cette référence est confrontée à elle par le
contrôle de couverture de ce site.

## Les valeurs par défaut déduites

Certaines valeurs par défaut sont calculées à partir d'autres clés :

| Clé | Défaut | Pour Acme Orders |
|---|---|---|
| `product.slug` | Le nom en minuscules, sans accents, avec `-` entre les mots | `acme-orders` |
| `output` | `dist/<nom>-Documentation.html`, espaces et caractères réservés changés en `-` | `dist/Acme-Orders-Documentation.html` |
| `theme.key` | `<slug>-doc-theme` | `acme-orders-doc-theme` |
| `env.prefix` | Le slug en majuscules, `_` à la place de `-` | `ACME_ORDERS` |
| `capture.locale` | La locale de `language` | `fr-FR` (`en-US` pour `en`) |

## Les variables d'environnement

Quatre clés peuvent être fixées par des variables d'environnement, `DOC_KIT_<NOM>` d'abord, puis `<PREFIXE>_<NOM>` :

| Variable | Clé | Exemple |
|---|---|---|
| `URL` | `app.url` | `ACME_ORDERS_URL=https://orders.example.org` |
| `PLANS` | `capture.plans` | `ACME_ORDERS_PLANS=captures/plans-prod` |
| `READONLY` | `capture.readOnly` | `ACME_ORDERS_READONLY=1` |
| `VERSION` | `version.fallback` | `ACME_ORDERS_VERSION=2.4.0` |

`SESSION` désigne le fichier de session, et quelques autres changent le comportement du kit : voir
[Les variables d'environnement](#/reference/environment).

## Un exemple complet

```js
import { defineConfig } from "doc-kit/config";

export default defineConfig({
  kit: "^0.2.0",
  product: { name: "Acme Orders", slug: "acme-orders" },
  language: "fr",
  version: { file: "../../package.json" },
  env: { prefix: "ACME" },
  app: { url: "http://localhost:3000" },
  auth: { adapter: "nextauth" },
  capture: {
    setup: "captures/setup-demo.mjs",
    cookies: [{ name: "NEXT_LOCALE", value: "fr" }],
    selectors: { block: "section.card", frame: null },
    forbidden: ["^/orders/[^/]+/approval$"],
  },
  masking: { env: ["../../.env"] },
  coverage: [{ adapter: "next-app-router", app: "../../app" }],
  theme: { logo: "theme/logo.svg", colors: { brand: "#6d28d9", "brand-strong": "#5b21b6" } },
  statuses: { open: ["st-1", "Open"], paid: ["st-0", "Paid"] },
  texts: { "home.primaryAction": "Découvrir les éditeurs" },
  feedback: { label: "Signaler un problème", url: "mailto:docs@example.org" },
});
```

D'autres exemples commentés, pour deux applications fictives, se trouvent dans `standard/config.fr.md` du kit.

## Pièges et écarts constatés

> [!ATTENTION] La plage de versions du kit
> `kit` accepte `*`, `1`, `1.2`, `^1.2.3`, `~1.2.3`, `>=1.2.3` (ainsi que `>`, `<=`, `<`, `=`), plusieurs conditions
> séparées par des espaces, et des alternatives avec `||`. Quand le kit installé est hors de la plage, **toutes** les
> commandes s'arrêtent avec le code de sortie 3, sauf `doc-kit upgrade` et `doc-kit doctor`, qui sont là pour
> régler le problème.

> [!NOTE] Le fichier est du code
> La configuration est importée par Node : elle peut calculer des valeurs, lire un fichier ou une variable
> d'environnement. Elle s'exécute à chaque commande ; gardez-la rapide et sans effet de bord.

## Pour aller plus loin

- [Les variables d'environnement](#/reference/environment) : chaque variable lue par le kit.
- [La ligne de commande](#/reference/cli) : les options qui l'emportent sur la configuration.
- [Les adaptateurs](#/reference/adapters) : les options des entrées `auth` et `coverage`.
