## En bref

Un **plan de capture** est un petit module JavaScript de `captures/plans/` qui exporte `CAPTURES`, une liste
d'entrées. Chaque entrée dit quelle page de l'application ouvrir, quoi y faire, quelle partie de l'écran garder et
quels éléments numéroter. `doc-kit capture` joue les entrées dans un Chromium sans interface et écrit, pour chacune,
une image et un fichier de zones.

1. **Un fichier par lot de pages** (`utiliser.mjs`, `configurer.mjs`…). Les fichiers sont lus dans l'ordre
   alphabétique ; un id utilisé deux fois, dans un fichier ou dans deux, est une erreur.
2. **L'id nomme l'image** : `images/<id>.webp` et `images/zones/<id>.json`, cités dans le Markdown par
   `:::ecran{capture="<id>"}` ou `::capture{id="<id>"}`. Lettres, chiffres, `.`, `_` et `-`.
3. **Les entrées sont validées** avant toute exécution (`schemas/capture-plan.schema.json`) : chaque entrée invalide
   de chaque fichier est listée, chaque erreur avec son fichier, son id et son chemin, par exemple
   `captures/plans/utiliser.mjs › orders-list (CAPTURES[2]) › zones[1].margn: clé inconnue`, et la commande se termine
   avec le code 2.

## Le schéma

::schema{id="capture-flow" titre="Ce que fait doc-kit capture. En haut : les vérifications faites une seule fois, avant d'ouvrir la moindre page. En bas : les étapes de chaque capture, de gauche à droite, jusqu'aux deux fichiers qu'elle écrit."}

## Une entrée

```js
import { button, field, main, union } from "../targets.mjs";

export const CAPTURES = [
  {
    id: "orders-list",                 // images/orders-list.webp + images/zones/orders-list.json
    title: "Acme Orders › Commandes",  // écrit dans le fichier de zones
    route: "/orders",                  // relative à app.url
    delay: 600,                        // attente minimale après le chargement, en ms (par défaut : jusqu'à stabilité)
    frame: main,                       // ne garder que la zone principale
    zones: [
      union(field("Status"), field("Customer"), field("Date")),   // ① un repère sur trois champs
      button("New order"),                                        // ②
    ],
  },
];
```

## Les champs d'une entrée

| Champ | Type · défaut | Rôle |
|---|---|---|
| `id` | texte, obligatoire | Nom de l'image et du fichier de zones |
| `title` | texte | Légende écrite dans le fichier de zones |
| `route` | texte qui commence par `/`, obligatoire | Chemin ouvert dans l'application, paramètres permis : `/orders?status=open` |
| `context` | une clé de `capture.viewports` · `desktop` | `mobile` est un écran tactile de 390 × 844 |
| `viewport` | `{ width, height }` | Taille pour cette capture seulement : `{ height: 2200 }` pour un panneau haut, `{ height: 150 }` pour un bandeau |
| `view` | `{ lon, lat, zoom }` ou `{ x, y, z }` | Cadre une carte par les paramètres d'URL nommés dans `capture.map` |
| `storage` | objet | Clés de `localStorage` posées avant l'ouverture de la page, en plus de `capture.storage` |
| `delay` | ms · 0 | Attente minimale après le chargement. Le kit attend déjà que la page soit stable : réseau calme, polices chargées, DOM immobile pendant 150 ms, animations finies. À n'indiquer que pour ce qu'il ne voit pas, comme une carte dessinée dans un canvas (3 000) |
| `actions` | liste | Étapes jouées avant la capture ([Cibles et actions](#/capture/targets-actions)) |
| `settle` | ms · 0 | Attente minimale après les actions (la page est attendue jusqu'à être de nouveau stable) |
| `frame` | une cible | L'élément dont la boîte devient l'image ; par défaut : toute la fenêtre |
| `zones` | liste de cibles ou `{ union }` | Les éléments numérotés, dans l'ordre des pastilles ([Zones](#/capture/zones)) |
| `masks` | liste de cibles | Éléments dont le texte est remplacé par des points ([Masquage](#/capture/masking)) |

- Les valeurs de `storage` peuvent contenir `{version}`, remplacé par la version documentée ; les valeurs qui ne sont
  pas des chaînes sont écrites en JSON.
- `view` avec `{ lon, lat, zoom }` est converti en mètres Web Mercator (EPSG:3857) ; `{ x, y, z }` est transmis tel
  quel. Exemple : `capture.map: { x: "mx", y: "my", z: "mz" }` et `view: { lon: 2.35, lat: 48.85, zoom: 12 }`
  ajoutent `?mx=…&my=…&mz=12` à la route.
- Un cadre garde 34 px de marge à gauche et à droite (la place des pastilles) et 10 px en haut et en bas ; changez-les
  avec les options de cible `margin` et `marginY`. L'image ne dépasse jamais la fenêtre.

## Lancer les plans

| Commande | Ce qu'elle capture |
|---|---|
| `doc-kit capture` | Chaque entrée de chaque plan |
| `doc-kit capture "utiliser-commandes-*"` | Les ids qui correspondent aux motifs (`*` n'importe quels caractères, `?` un caractère) |
| `doc-kit capture --preview` | Écrit aussi `.doc-kit/<id>.zones.png`, les zones dessinées en rouge, pour les vérifier |
| `doc-kit capture --plans captures/plans-prod` | Un autre dossier de plans, relatif au projet |
| `doc-kit capture --no-session` | Sans la session enregistrée (pages publiques) |

La variable `<PREFIXE>_PLANS` (ou `DOC_KIT_PLANS`) choisit elle aussi un autre dossier, et `--plans` l'emporte sur
elle : c'est ainsi qu'un même projet sépare ses plans de démo et ses plans de production.

Chaque capture affiche une ligne (`✔ orders-list (4 zones, 25 Ko, 1.7 s)`) ; une capture qui échoue dit pourquoi, et
la campagne continue avec la suivante. Les dernières lignes donnent le total, le dossier des aperçus et le nombre de
requêtes d'écriture bloquées.

## Le fichier de zones

```json
{
  "file": "orders-list.webp", "title": "Acme Orders › Commandes", "route": "/orders",
  "width": 1280, "height": 583, "version": "2.4.0", "captured": "2026-10-01",
  "zones": [{ "n": 1, "x": 3.18, "y": 7.98, "w": 22.4, "h": 61.2, "side": "corner", "label": "Filtres" }]
}
```

`x`, `y`, `w` et `h` sont des pourcentages de l'image : les pastilles restent en place à toutes les tailles.
`version` est la version documentée au moment de la capture : `doc-kit check images` et `doc-kit audit` signalent
les captures d'une version plus ancienne.

## Pièges et écarts constatés

> [!ATTENTION] Un plan est du code
> Les plans sont des modules JavaScript, importés par le kit : ils peuvent importer des aides (`../targets.mjs`) et
> calculer leurs entrées. Le kit ne les réécrit jamais, pas même `doc-kit migrate`. Les anciennes clés françaises
> (`titre`, `contexte`, `cadre`, `clic`, `champ`…) sont normalisées à la lecture.

> [!NOTE] « un module est introuvable »
> `import … from "doc-kit/targets"` demande les dépendances du projet : lancez `npm install` dans le projet de
> documentation.

## Pour aller plus loin

- [Cibles et actions](#/capture/targets-actions) : désigner un élément, et jouer des clics avant la capture.
- [Zones, union et légendes](#/capture/zones) : les pastilles et leur légende.
- [Démo ou production](#/capture/safety) : ce qu'un plan peut cliquer, et les routes à ne jamais ouvrir.
- [Clés de capture et de masquage](#/reference/configuration/capture) : les clés `capture.*` de la configuration.
