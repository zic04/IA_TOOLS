## doc-kit dev

```text
doc-kit dev [--port <n>]
```

Construit le site en mode brouillon, le sert sur `http://127.0.0.1:<port>/`, ouvre votre navigateur, et reconstruit
quand `content/`, `images/`, `diagrams/`, `theme/` ou `doc.config.mjs` changent ; la page se recharge toute seule.
Les erreurs de build s'affichent dans le terminal et par-dessus la page. [[touche Ctrl+C]] l'arrête.

| Option | Défaut | Effet |
|---|---|---|
| `--port <n>` | premier port libre à partir de 4400 | `0` : n'importe quel port libre ; un port occupé arrête la commande avec le code de sortie 3 |

`DOC_KIT_NO_OPEN=1` laisse le navigateur fermé. `--json` affiche `url`, `port`, `root` et les chemins surveillés.

## doc-kit new

```text
doc-kit new <id-page> --template <type> [--title "…"] [--parent <id-page>]
```

Crée `content/<id-page>.md` à partir du gabarit du type, dans la langue du projet, et déclare la page dans le
sommaire. N'écrase jamais un fichier (code de sortie 1).

| Option | Effet |
|---|---|
| `--template <type>` | L'un des 13 types ; obligatoire, sauf si la page est déjà déclarée avec un type |
| `--title "…"` | Titre et titre de menu ; défaut : le dernier segment de l'id, rendu lisible |
| `--parent <id-page>` | En fait une sous-page (`"level": 2`), placée juste après le parent et ses sous-pages |

Les ids de page sont des segments en minuscules séparés par `/`, le premier étant l'id de la section :
`utiliser/commandes/export`. [Les gabarits de page](#/write/page-templates~creer-une-page-doc-kit-new) donnent les
règles de placement.

## doc-kit build

```text
doc-kit build [--draft] [--date AAAA-MM-JJ] [--output <fichier>]
```

| Option | Effet |
|---|---|
| `--draft` | Les erreurs deviennent des avertissements ; les pages et captures manquantes sont remplacées par des notes |
| `--date AAAA-MM-JJ` | La date affichée dans le site (un build reproductible) ; une date impossible est refusée (code de sortie 2) |
| `--output <fichier>` | Un autre fichier de sortie, relatif au dossier courant |

Code de sortie 0 quand le site est écrit, 1 quand il reste une erreur (rien n'est écrit). Voir
[Construire le site](#/publish/build).

## doc-kit view

```text
doc-kit view <page[~ancre]> [--theme light|dark] [--height <px>] [--tour N] [--output <fichier>]
```

Fait une capture d'une page du site construit (ou d'un build brouillon quand il n'y en a pas) dans un Chromium sans
fenêtre, de 1 440 px de large.

| Option | Défaut | Effet |
|---|---|---|
| `--theme` | `light` | `light` ou `dark` |
| `--height` | 900 | Hauteur de la fenêtre, au moins 200 |
| `--tour N` | | Ouvre la première visite guidée de la page, à l'étape N |
| `--output` | `.doc-kit/page.png` | Le fichier PNG |

Code de sortie 1 quand la page a levé une erreur JavaScript (affichée après le nom du fichier).

## doc-kit open

```text
doc-kit open [page]
```

Ouvre le site construit dans le navigateur par défaut, sur une page quand vous en donnez une
(`doc-kit open utiliser/commandes`). Code de sortie 1 quand le site n'est pas construit. Avec `DOC_KIT_NO_OPEN=1`,
la commande affiche seulement l'adresse.

## doc-kit check

```text
doc-kit check [coverage|links|tables|images|secrets|all] [--width <px>] [--threshold <Ko>]
```

| Option | Défaut | Effet |
|---|---|---|
| `--width <px>` | 1440 | Largeur de la fenêtre pour `tables`, au moins 320 |
| `--threshold <Ko>` | 200 | Taille au-delà de laquelle `images` signale une image comme lourde |

Sans nom, tous les contrôles sont lancés (`all`), et la couverture est ignorée quand aucun adaptateur n'est
configuré. Code de sortie 1 quand un contrôle échoue. Voir [Les contrôles](#/publish/checks).

## doc-kit audit

```text
doc-kit audit [--json]
```

Écrit `.doc-kit/audit.md` et `.doc-kit/audit.json`, affiche un résumé (ou, avec `--json`, le résultat complet). Code
de sortie 0 quel que soit le niveau. Voir [L'audit et les niveaux de maturité](#/publish/audit).

## doc-kit optimize

```text
doc-kit optimize [--threshold <Ko>] [--quality <0..1>]
```

| Option | Défaut | Effet |
|---|---|---|
| `--threshold <Ko>` | 200 | Seules les images au-delà de cette taille sont réencodées |
| `--quality <0..1>` | `0.68` | Qualité WebP du nouvel encodage |

La nouvelle image n'est gardée que si elle est au moins 20 % plus légère. L'encodage passe par Chromium, sans
dépendance native.

## Pour aller plus loin

- [La ligne de commande](#/reference/cli) : options globales et codes de sortie.
- [Commandes : démarrer et capturer](#/reference/cli/start-capture).
- [Commandes : livrer et maintenir](#/reference/cli/deliver).
