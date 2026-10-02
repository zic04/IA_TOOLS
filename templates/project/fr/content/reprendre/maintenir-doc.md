## En bref

<!-- consigne : complétez les lignes marquées « à compléter » : où vit ce dossier, d'où viennent les captures (production en lecture seule ou démo), la version documentée et la date de la dernière campagne de captures. -->

<!-- doc-kit:capture=app -->
Ce site est produit par ce dossier avec **doc-kit**. Les pages sont écrites en Markdown, les captures sont prises automatiquement sur l'application, et le kit assemble le tout en **un seul fichier HTML** autonome, lisible hors ligne, avec recherche, thème clair et sombre, visites guidées et impression.
<!-- doc-kit:capture=none -->
Ce site est produit par ce dossier avec **doc-kit**. Les pages sont écrites en Markdown, sans capture (`capture.mode: "none"`) : chaque écran est décrit par un tableau de ses éléments. Le kit assemble le tout en **un seul fichier HTML** autonome, lisible hors ligne, avec recherche, thème clair et sombre, visites guidées et impression.
<!-- doc-kit:end -->

| Besoin | Commande (dans ce dossier) | Application nécessaire ? |
|---|---|---|
| Installer les outils | `npm ci` | Non |
| Régénérer le site | `npm run site` (`doc-kit build`) | Non |
| Travailler en voyant le résultat | `npm run dev` (`doc-kit dev`) | Non |
| Régénérer en tolérant les pages manquantes | `doc-kit build --draft` | Non |
| Vérifier que chaque écran est documenté | `npm run coverage` | Le code de l'application |
| Tous les contrôles | `doc-kit check all` | Le code de l'application |
| Mesurer la qualité et le niveau de maturité | `npm run audit` | Non |
<!-- doc-kit:capture=app -->
| Se connecter à l'application | `doc-kit connect` | **Oui** (une personne se connecte) |
| Refaire des captures | `doc-kit capture "<motif>" --preview` | **Oui** |
<!-- doc-kit:end -->

- **Version documentée** : à compléter.
<!-- doc-kit:capture=app -->
- **Dernière campagne de captures** : à compléter (date, production ou démo).
<!-- doc-kit:end -->

## Comment le site est fabriqué

<!-- consigne : facultatif. Un schéma des trois temps (captures, rédaction, génération et contrôles) si l'équipe en a besoin. -->

<!-- doc-kit:capture=app -->
1. **Les captures** : `captures/plans/*.mjs` décrit chaque écran à capturer ; `doc-kit capture` produit `images/<id>.webp` et `images/zones/<id>.json`.
<!-- doc-kit:capture=none -->
1. **Les écrans** : décrits dans les pages elles-mêmes, un tableau des éléments par écran ; aucune capture n'est prise.
<!-- doc-kit:end -->
2. **La rédaction** : `content/toc.json` déclare chaque page ; `content/<id>.md` la contient, selon le gabarit déclaré.
3. **La génération** : `doc-kit build` assemble pages, captures et schémas dans `dist/`, après ses contrôles.

## L'organisation du dossier

| Chemin | Rôle | Qui le modifie |
|---|---|---|
| `doc.config.mjs` | Configuration du projet : produit, application, captures, masquage, couverture, thème | Gestion centrale |
| `content/toc.json` | Plan du site : sections, groupes, pages (`template`, `level`), parcours guidés, suggestions | Gestion centrale |
| `content/<id>.md` | Une page par entrée du sommaire | Rédacteurs |
| `content/home.md`, `content/glossary.json` | Accueil et glossaire | Gestion centrale |
| `captures/plans/*.mjs` | Plans de captures, un fichier par lot de pages | Rédacteurs |
| `captures/targets.mjs` | Aides pour désigner un élément | Gestion centrale |
| `images/`, `images/zones/` | Captures et positions de leurs zones | Générés |
| `diagrams/*.svg` | Schémas, avec les classes du site | Rédacteurs |
| `theme/logo.svg` | Logo du site | Gestion centrale |
| `dist/` | **Le livrable**, ignoré par git | Généré |
| `.doc-kit/` | Session, aperçus des zones, fichiers de travail ; ignoré par git | Local |

<!-- doc-kit:capture=app -->
## Refaire des captures

<!-- consigne : précisez si les captures se font en production (décision écrite du propriétaire) ou sur une démo, et listez ici les pages dont le rendu écrit côté serveur (capture.forbidden dans doc.config.mjs), ainsi que les fiches déjà ouvertes qui restent permises. -->

> [!ATTENTION] La production ne s'écrit jamais
> Dès qu'une session est utilisée, le kit bloque toute requête qui n'est pas une lecture. Il reste interdit de cliquer un bouton d'écriture (Enregistrer, Créer, Valider, Supprimer, Signer, Envoyer, Importer, Synchroniser, Réindexer, Se déconnecter). Une écriture faite **par le serveur pendant le rendu** d'une page n'est pas bloquée : lisez le code d'une page de détail avant de l'ouvrir.

:::etapes
1. **Se connecter** : `doc-kit connect` ouvre une fenêtre ; la personne se connecte elle-même. La session est enregistrée dans `.doc-kit/`, ignoré par git.
2. **Déclarer les captures** dans `captures/plans/<lot>.mjs` : identifiant préfixé par le lot, route, cadre, zones dans l'ordre de lecture (3 à 12).
3. **Capturer** par petits lots : `doc-kit capture "<motif>" --preview`.
4. **Contrôler** chaque aperçu des zones (`<id>.zones.png` dans `.doc-kit/`) et relire chaque image : aucun secret, aucune donnée non autorisée.
5. **Lire la dernière ligne** : « Lecture seule : N requête(s) d'écriture bloquée(s) ».
6. **Supprimer la session** : `doc-kit connect --forget`. Si elle expire en cours de route, arrêtez-vous et reconnectez-vous.
:::
<!-- doc-kit:capture=none -->
## Captures

<!-- consigne : dites qui a décidé que cette documentation ne prend aucune capture, et pourquoi (pas d'accès à l'application, données sensibles…). -->

Cette documentation ne prend aucune capture (`capture.mode: "none"` dans `doc.config.mjs`) : chaque écran est décrit par un tableau de ses éléments, dans l'ordre de lecture, avec leurs libellés exacts. Pour ajouter des captures plus tard, mettez `capture.mode: "app"`, connectez-vous avec `doc-kit connect`, déclarez les captures dans `captures/plans/` et lancez `doc-kit capture --preview`, en suivant les règles de capture du standard du kit.
<!-- doc-kit:end -->

## Écrire ou modifier une page

:::etapes
1. Déclarer la page dans `content/toc.json`, avec son `template`.
2. La créer depuis le modèle : `doc-kit new <id-de-page> --template <type>`.
3. Remplir chaque section en suivant sa consigne, puis retirer la consigne. Vérifier chaque libellé dans les fichiers de traduction de l'application et chaque comportement dans le code ; signaler les écarts dans un encadré « Écarts constatés ».
4. Lancer `doc-kit build --draft` : aucune ligne ✖ ou ⚠ ne doit concerner la page.
5. Relire la page en thème clair et sombre : `doc-kit view <id-de-page> --theme dark`.
:::

Les règles complètes sont dans `WRITING-GUIDE.md` et dans le standard du kit (`node_modules/doc-kit/standard/`).

## Les contrôles

| Contrôle | Commande | Bloquant |
|---|---|---|
| Pages, captures, schémas, liens, ancres, légendes, sections obligatoires | `doc-kit build` | Oui |
| Couverture de l'application | `doc-kit check coverage` | Oui |
| Secrets | `doc-kit check secrets` | Oui |
| Tableaux trop larges, images lourdes | `doc-kit check tables`, `doc-kit check images` | Non |
| Pages trop longues, consignes restées, niveau de maturité | `doc-kit audit` | Non |

## Transférer le dossier

`doc-kit export <cible>` produit une copie autonome du projet, sans `node_modules/` ni `.doc-kit/`. Dans la copie : `npm ci`, puis `npm run site` (Node.js 20 ou plus). Le site se régénère sans l'application ; seuls la couverture et les captures en ont besoin.

## Pièges et écarts constatés

<!-- consigne : les limites connues de l'outillage pour ce projet (pages chargées par une requête d'écriture, donc incomplètes en lecture seule ; valeurs de production que le masquage ne connaît pas) et les avertissements de doc-kit audit laissés volontairement, avec leur justification. -->

> [!NOTE] Ce que l'outillage ne sait pas faire
> - Bloquer une écriture faite par le serveur pendant le rendu d'une page.
> - Afficher entièrement une page qui charge ses données par une requête d'écriture.
> - Masquer une valeur propre à la production qui ne figure pas dans le `.env` local : seule la relecture de chaque image le garantit.

## Pour aller plus loin

- [L'architecture d'ensemble](#/reprendre/architecture) : ce que documente ce site.
- [Les points d'attention](#/reprendre/points-attention) : où vont les constats relevés en écrivant.
