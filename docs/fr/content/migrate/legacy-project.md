## L'objectif

Amenez sous le kit un projet de documentation écrit **avant doc-kit**, avec des clés et des noms de dossiers
français (`contenu/sommaire.json`, `titre`, `groupes`…), et **prouvez** que le site qu'il produit n'a pas changé. Le
contenu n'est jamais réécrit à la main : le kit lit l'ancien format tel quel, puis `doc-kit migrate` réécrit les
fichiers JSON.

> [!RECETTE] Ce qu'il vous faut
> - Le kit installé ([Installer doc-kit](#/start/install)), et une copie de l'ancien projet (travaillez sur une copie
>   jusqu'à ce que la comparaison passe).
> - Le build propre à l'ancien projet, s'il fonctionne encore : il donne la référence à laquelle comparer.
> - Une demi-heure pour un site d'une centaine de pages.

## Qui fait quoi

| Étape | Résultat |
|---|---|
| 1. Déclarer le projet | Un `doc.config.mjs` avec les anciens noms de dossiers |
| 2. Construire tel quel | Le kit lit les anciens fichiers ; un avertissement les liste |
| 3. Garder une référence | Un build de l'état actuel, à date fixe |
| 4. Migrer | Les fichiers JSON réécrits au format courant |
| 5. Comparer | Le contrôle d'équivalence des deux builds |
| 6. Typer les pages | Les suggestions de l'audit appliquées, pour mesurer le niveau réel |

## Étape 1 — Déclarer le projet

Ajoutez `doc.config.mjs` à la racine du dossier de documentation. Gardez les anciens noms de dossiers avec `paths` :

```js
import { defineConfig } from "doc-kit/config";

export default defineConfig({
  kit: "^0.1.0",
  product: { name: "Acme Orders" },
  language: "fr",
  paths: { content: "contenu", images: "images", diagrams: "schemas" },
  version: { file: "../../package.json" },
});
```

Faites ensuite dépendre le projet du kit (`"doc-kit": "file:<chemin vers le kit>"` dans son `package.json`), lancez
`npm install`, puis `doc-kit doctor`. Les fichiers de l'ancien moteur (`generer.mjs` et ses dossiers) ne servent plus.

## Étape 2 — Construire tel quel

```bash
doc-kit build --draft
```

Le kit normalise les anciens fichiers **au moment où il les lit**, et avertit :
`fichiers à clés françaises (ancien format) lus (contenu/sommaire.json, contenu/glossaire.json, images/zones/*.json (1), contenu/accueil.md)`.
Le Markdown accepte les deux graphies (`:::ecran`, `[!ASTUCE]`) : il n'est jamais réécrit. Les plans de capture sont
eux aussi normalisés à la lecture.

## Étape 3 — Garder un build de référence

```bash
doc-kit build --date 2026-10-01 --output ../reference.html
```

`--date` fixe la date écrite dans le site, pour que deux builds du même contenu soient identiques. Quand l'ancien
moteur fonctionne encore, son propre build, fait avec une horloge figée, est une référence encore meilleure :
`test/tools/equivalence.mjs prepare`, dans le kit, prépare les copies et les deux builds.

## Étape 4 — Migrer les fichiers JSON

```bash
doc-kit migrate
```

```text
✔ contenu/sommaire.json → contenu/toc.json
✔ contenu/glossaire.json → contenu/glossary.json
✔ contenu/accueil.md → contenu/home.md
✔ images/zones/liste-commandes.json → images/zones/liste-commandes.json
4 fichiers réécrits.
```

Rien n'est écrit quand le sommaire normalisé n'est pas valide (code de sortie 1). Relancée, la commande répond
`rien à migrer`.

## Étape 5 — Comparer les deux builds

```bash
doc-kit build --date 2026-10-01 --output ../candidate.html
node <dossier du kit>/test/tools/equivalence.mjs compare --reference ../reference.html --candidate ../candidate.html --levels bytes,1,2,3
```

| Niveau | Compare |
|---|---|
| `bytes` | Le HTML lui-même, sans tenir compte de la balise du générateur ni des textes embarqués par le kit |
| `1` | Les données du site : pages, menu, index de recherche, glossaire, parcours |
| `2` | Les images : mêmes ids, même SHA-256 |
| `3` | Le texte visible de la page d'accueil, de chaque section et de chaque page |
| `4` | Des captures d'un échantillon de pages, en clair et en sombre, à 0,1 % de pixels d'écart au plus |

La commande affiche un rapport JSON et se termine avec le code 0 quand chaque niveau demandé passe.

## Étape 6 — Typer les pages

Un site écrit avant les types de page ne déclare aucun `template` : `doc-kit audit` le maintient au niveau 2, aussi
complet soit-il. L'audit liste les pages qui suivent déjà un type, avec le type à déclarer, et, pour les autres, le
type le plus proche avec les titres qui leur manquent. Ajoutez `"template"` (ou `"gabarit"` dans un ancien sommaire :
`doc-kit new` et l'audit gardent le style du fichier) et renommez les quelques titres, puis relancez l'audit.

## Les anciennes clés

| Ancien | Courant |
|---|---|
| `contenu/sommaire.json`, `contenu/accueil.md`, `glossaire.json` | `content/toc.json`, `content/home.md`, `glossary.json` |
| `titre`, `titre_menu`, `resume`, `niveau`, `groupes`, `droits`, `gabarit`, `fichier` | `title`, `menuTitle`, `summary`, `level`, `groups`, `permissions`, `template`, `file` |
| `accroche`, `sous_titre`, `points`, `icone`, `vedette`, `parcours` + `etapes` | `tagline`, `subtitle`, `highlights`, `icon`, `featured`, `journeys` + `steps` |
| Glossaire `terme`, `motif` | `term`, `pattern` |
| Fichiers de zones `fichier`, `titre`, `largeur`, `hauteur`, `l`, `libelle`, `cote` (`coin`, `droit`, `bas`, `droit-bas`) | `file`, `title`, `width`, `height`, `w`, `label`, `side` (`corner`, `right`, `bottom`, `bottom-right`) |
| Plans `titre`, `contexte` (`bureau`), `vue`, `stockage`, `delai`, `cadre`, `masques`, `stabiliser` | `title`, `context` (`desktop`), `view`, `storage`, `delay`, `frame`, `masks`, `settle` |
| Actions `clic`, `survol`, `saisir`, `choisir`, `touche`, `defiler`, `attendre`, `molette` (`crans`, `sens`), `valeur` | `click`, `hover`, `type`, `select`, `press`, `scroll`, `wait`, `wheel` (`steps`, `direction`), `value` |
| Cibles `nom`, `texte`, `champ`, `bloc`, `dans`, `parent`, `encadre`, `dernier`, `filtre`, `cote`, `marge`, `margeV`, `libelle` (toute cible : zone, cadre, masque) | `name`, `text`, `field`, `block`, `within`, `up`, `framed`, `last`, `has`, `side`, `margin`, `marginY`, `caption` |

Quand les deux graphies sont présentes, la clé courante (anglaise) l'emporte.

## Comment savoir que ça marche

- **Doctor** : `doc-kit doctor` affiche ✔ pour la configuration et trouve `contenu/toc.json`.
- **Build** : `doc-kit build` (strict) passe, sans l'avertissement d'ancien format.
- **Équivalence** : la comparaison renvoie `"ok": true` pour chaque niveau demandé.
- **Audit** : `doc-kit audit` donne le niveau, et ses suggestions de typage sont appliquées.

## Erreurs fréquentes et remèdes

| Symptôme | Cause probable | Remède |
|---|---|---|
| « sommaire introuvable : content/toc.json » | `paths.content` non déclaré | `paths: { content: "contenu" }` |
| « schéma introuvable : diagrams/flow.svg » | `paths.diagrams` non déclaré | `paths: { diagrams: "schemas" }` |
| « clé inconnue » sur une entrée de page | Une ancienne clé que le kit ne connaît pas | Renommez-la à la main, puis relancez le build |
| Écarts `level1` sur `meta` | Un nom de produit ou une version différents | Même `product.name` et même version dans les deux builds |

## Pièges et limites à connaître

> [!ATTENTION] Travaillez sur une copie
> `doc-kit migrate` réécrit les fichiers sur place. Gardez l'ancien projet intact jusqu'à ce que la comparaison passe,
> et commitez la migration comme une modification à part entière.

## Droits requis

> [!DROITS] Ce dont la migration a besoin
> - Le droit d'écrire dans la copie du projet de documentation.
> - Aucun accès à l'application : la migration ne touche ni aux captures ni à l'application.
