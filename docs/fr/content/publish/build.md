## En bref

`doc-kit build` transforme le projet en un seul fichier HTML, `dist/<Produit>-Documentation.html`. Il est **strict**
par défaut : toute incohérence est une erreur, et **rien n'est écrit** tant qu'il reste une erreur.

1. **Build strict** (`doc-kit build`) : le passage obligé avant toute livraison. Code de sortie 0 quand le site est
   écrit, 1 quand il reste une erreur.
2. **Build brouillon** (`doc-kit build --draft`) : les mêmes erreurs deviennent des avertissements ; une page déclarée
   sans son fichier est remplacée par une note « Page en cours de rédaction », et une capture absente par un cadre
   « Capture à produire ».
3. **Pendant la rédaction** (`doc-kit dev`) : un build brouillon en mémoire, servi sur `http://127.0.0.1:4400/` et
   reconstruit à chaque enregistrement, avec les erreurs affichées à la fois dans le terminal et par-dessus la page.
4. **Pour regarder une page** sans navigateur sous la main (`doc-kit view`) : une capture d'une page du site
   construit, en thème clair ou sombre, ou à une étape d'une visite guidée.

## Le schéma

::schema{id="build" titre="Le build lit les sources du projet et le gabarit de site du kit, les vérifie, et écrit un seul fichier. Une seule erreur, et rien n'est écrit."}

## Ce qui bloque le build strict

| Erreur | Exemple de message |
|---|---|
| Une page déclarée sans son fichier (une erreur par page : ses sections et les ancres qui pointent vers elle sont contrôlées dès qu'elle existe) | `page pas encore écrite : utiliser/commandes (content/utiliser/commandes.md)` |
| Une capture citée mais introuvable, ou son image absente | `[utiliser/commandes] capture introuvable : « orders-list »` |
| Une légende qui ne correspond pas à ses zones | `[utiliser/commandes] écran « orders-list » : 4 zone(s) capturée(s) mais 3 élément(s) dans la légende` |
| Une capture avec zones montrée par `::capture` | `[utiliser/commandes] « orders-list » a des zones : utiliser :::ecran avec une légende` |
| Un schéma introuvable | `[maintenir/architecture] schéma introuvable : diagrams/flow.svg` |
| Un lien ou une ancre cassés | `[utiliser/commandes] lien cassé : #/utiliser/commande` |
| Une étape de parcours qui n'est pas une page | `parcours « Découvrir » : page inconnue utiliser/commande` |
| Une section obligatoire absente | `[utiliser/commandes] section obligatoire absente pour le gabarit « screen » : « Droits requis »` |
| Un sommaire, un glossaire ou un fichier de zones invalide | le fichier et le chemin de l'erreur |

Le sommaire doit être valide même pour un brouillon : sans plan lisible, rien ne peut être construit.
Les avertissements (un type d'encadré inconnu, une consigne restée dans une page, une clé de texte inconnue, une
icône de section inconnue) ne bloquent jamais.

## Options

| Option | Effet |
|---|---|
| `--draft` | Les erreurs deviennent des avertissements ; les pages et captures absentes sont remplacées par des notes |
| `--date YYYY-MM-DD` | La date écrite dans le site, au lieu d'aujourd'hui : deux builds des mêmes sources sont alors identiques |
| `--output <fichier>` | Un autre fichier de sortie, relatif au dossier courant ; par défaut : `output` de la configuration |
| `--json` | Le résultat en JSON : `ok`, `output`, `stats`, `errors`, `warnings` |

Un build réussi affiche sa taille et ses chiffres :

```text
✔ dist/Acme-Orders-Documentation.html — 4.2 Mo · 92 pages · 124 captures · 611 éléments annotés · 9 schémas
```

Le site affiche la **version documentée**, lue dans `version.file` avec `version.pattern` (premier groupe), ou
`version.fallback` quand le fichier est introuvable. La date est écrite dans la langue du site.

## Rédiger avec `doc-kit dev`

```bash
doc-kit dev            # premier port libre à partir de 4400, et ouvre votre navigateur
doc-kit dev --port 0   # n'importe quel port libre
```

Le serveur surveille `content/`, `images/`, `diagrams/`, `theme/` et `doc.config.mjs`. Après chaque modification, il
reconstruit en mode brouillon, et la page se recharge d'elle-même ; une erreur de build est affichée dans le terminal
et par-dessus la page, qui garde le dernier build réussi. Rien n'est écrit sur le disque. [[touche Ctrl+C]]
l'arrête. Avec `DOC_KIT_NO_OPEN=1`, le navigateur n'est pas ouvert (une machine distante, un script).

## Captures du site construit : `doc-kit view`

```bash
doc-kit view utiliser/commandes                          # .doc-kit/page.png, thème clair, 1440 × 900
doc-kit view "utiliser/commandes~l-ecran" --theme dark --height 1100
doc-kit view utiliser/commandes --tour 3 --output visite-commandes.png
doc-kit view utiliser/commandes --full                   # la page entière, en une image
```

| Option | Effet |
|---|---|
| `--theme light\|dark` | Le thème de la capture |
| `--height <px>` | Hauteur de la fenêtre (largeur 1 440) ; 900 par défaut |
| `--full` | La page entière en une image, depuis son haut : une page d'éditeur se relit en une vue au lieu de plusieurs vues `~ancre` |
| `--tour N` | Ouvre la première visite guidée de la page et va à l'étape N |
| `--output <fichier>` | Où écrire le PNG ; `.doc-kit/page.png` par défaut |

`view` utilise le site construit quand il existe, sinon un build brouillon dans un fichier temporaire. Une erreur
JavaScript de la page est affichée et donne le code de sortie 1. Dans Git Bash, ne commencez pas l'id de page par
`/` : le shell le transformerait en chemin Windows.

`doc-kit open [page]` ouvre le site construit dans votre navigateur par défaut, sur une page quand vous en donnez une.

## Pièges et écarts constatés

> [!ATTENTION] Un fichier lourd
> Chaque image est embarquée. `doc-kit check images` signale les images de plus de 200 Ko, et `doc-kit optimize` les
> recompresse : seulement au-delà du seuil (`--threshold`, en Ko, 200 par défaut), à la qualité `--quality` (`0.68`
> par défaut), et ne garde la nouvelle image que si elle fait gagner au moins 20 %. Les captures d'interface restent
> en général sous le seuil et gardent leur netteté.

> [!NOTE] Des builds reproductibles
> Avec `--date`, le build est déterministe : les mêmes sources et le même kit donnent le même fichier. C'est sur quoi
> repose le contrôle d'équivalence d'une migration ([Migrer un projet ancien](#/migrate/legacy-project)).

## Pour aller plus loin

- [Les contrôles](#/publish/checks) : ce que le build ne vérifie pas.
- [L'audit et les niveaux de maturité](#/publish/audit) : à quel point le site est complet.
- [Commandes : rédiger et vérifier](#/reference/cli/write-check) : chaque option de `dev`, `build`, `view`, `open` et
  `optimize`.
