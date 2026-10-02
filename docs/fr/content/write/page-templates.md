## En bref

Un **gabarit de page** fixe les sections `##` d'un type de page, leur ordre et la longueur maximale de la page. Il y
a 13 types. Une page déclare son type dans le sommaire (`"template": "screen"`) ; le build vérifie alors que ses
**sections obligatoires** sont présentes, et `doc-kit audit` mesure à quel point elle est complète.

1. **La source de vérité** est `standard/templates.json` dans le kit : les sections de chaque type en anglais et en
   français, les index des sections obligatoires, `maxWords`, et quelques variantes de titres acceptées.
2. **Les pages prêtes à remplir** sont `templates/pages/en/<type>.md` et `templates/pages/fr/<type>.md`, avec un
   commentaire de consigne dans chaque section.
3. **`doc-kit new <id-de-page> --template <type>`** écrit la page à partir du gabarit, dans la langue du projet, et la
   déclare dans `content/toc.json`.

## Dans cette partie

Chaque type a un exemple complet, écrit pour Acme Orders, dans la section **Exemples** de ce site.

| Type | Pour | Sections obligatoires | `maxWords` | Exemple |
|---|---|---|---|---|
| `screen` | Un écran et ses actions | 5 sur 10 | 2 500 | [screen](#/examples/screen) |
| `editor` | Un éditeur et le mécanisme qu'il pilote | 6 sur 8 | 3 000 | [editor](#/examples/editor) |
| `recipe` | Un objectif atteint en enchaînant plusieurs éditeurs | 5 sur 7 | 3 500 | [recipe](#/examples/recipe) |
| `technical` | Un sujet technique, parent ou autonome | 1 sur 5 | 2 000 | [technical](#/examples/technical) |
| `technical-sub` | Le détail d'un sujet technique | aucune | 2 000 | [technical-sub](#/examples/technical-sub) |
| `journey` | Ce qui se passe de bout en bout | 5 sur 7 | 2 000 | [journey](#/examples/journey) |
| `journey-step` | Une étape d'un parcours, au niveau du code | 5 sur 7 | 2 200 | [journey-step](#/examples/journey-step) |
| `troubleshooting` | Du symptôme à la cause | 5 sur 6 | 2 000 | [troubleshooting](#/examples/troubleshooting) |
| `troubleshooting-area` | Les symptômes d'un domaine | 2 sur 2 | 2 000 | [troubleshooting-area](#/examples/troubleshooting-area) |
| `findings` | Les constats numérotés | 2 sur 6 | 2 000 | [findings](#/examples/findings) |
| `architecture` | Le montage de production | 5 sur 7 | 2 000 | [architecture](#/examples/architecture) |
| `variables` | Les variables d'environnement | 2 sur 4 | 2 200 | [variables](#/examples/variables) |
| `resources` | Les ressources du déploiement | 7 sur 9 | 2 200 | [resources](#/examples/resources) |

Les sections elles-mêmes, type par type, sont listées dans `standard/templates.fr.md`. Les pages de ce site sont
typées elles aussi : les pages de référence sont `technical`, les pages pratiques `recipe`.

## Comment une section est reconnue

Une section obligatoire est trouvée quand un titre `##` de la page **commence par** son libellé, ou par l'une de ses
variantes acceptées. La casse, les accents, la forme de l'apostrophe et les espaces répétées sont ignorés.

| Titre dans la page | Section de `screen` trouvée |
|---|---|
| `## À quoi ça sert` | À quoi ça sert |
| `## À quoi sert cet écran` | À quoi ça sert (variante acceptée) |
| `## Pas à pas : valider une commande` | Pas à pas |
| `## Pièges` | Pièges et limites à connaître (variante acceptée) |
| `## Vue d'ensemble` | aucune : renommez-le, sinon la page n'est pas conforme |

Les libellés des sections suivent la **langue du projet** : un projet en anglais écrit `## What it is for`, et les
libellés français n'y comptent pas.

## Ce qu'en font le build et l'audit

- **Build strict** : une page typée à laquelle manque une section obligatoire est une erreur (« section obligatoire
  absente pour le gabarit « screen » : « Droits requis » ») ; le site n'est pas écrit. Avec `--draft`, c'est un
  avertissement.
- **Type inconnu** : `"template": "screens"` est une erreur qui liste les types connus.
- **Consigne restante** : un commentaire HTML qui commence par `consigne :` (`guidance:` en anglais) est un
  avertissement du build et bloque le niveau 3 de l'audit.
- **Longueur** : les mots sont comptés dans le Markdown, sans le code, les commentaires et le balisage. Au-delà de
  `maxWords` (2 000 pour une page sans type), `doc-kit audit` compte la page comme trop longue : découpez-la en
  sous-pages.
- **Complétude** : la part des sections du gabarit présentes, en moyenne sur les pages typées, est un indicateur du
  niveau 4.
- **Sans captures** (`capture.mode: "none"`) : `doc-kit new` écrit « L'écran » des gabarits `screen` et `editor` sous
  forme de tableau `| Élément | Ce qu'il montre |`, une ligne par élément dans l'ordre de lecture (de haut en bas, puis
  de gauche à droite), le libellé exact en gras. Les gabarits contiennent les deux variantes entre des marqueurs
  `<!-- doc-kit:capture=app -->`, `<!-- doc-kit:capture=none -->` et `<!-- doc-kit:end -->` ; `new` garde celle du
  projet.

## Créer une page : `doc-kit new`

```bash
doc-kit new utiliser/commandes/export --template screen --title "Exporter les commandes"
doc-kit new utiliser/commandes/export/colonnes --template technical-sub --parent utiliser/commandes/export
```

| Option | Effet |
|---|---|
| `--template <type>` | Le type ; obligatoire, sauf si la page est déjà déclarée avec un type |
| `--title "…"` | `title` et `menuTitle` de l'entrée ; par défaut : le dernier segment de l'id, rendu lisible |
| `--parent <id>` | Déclare une sous-page (`"level": 2`) juste après sa parente et les sous-pages de celle-ci |

Sans `--parent`, la page est ajoutée à la fin du groupe dont les pages partagent le plus long préfixe d'id, ou du
dernier groupe de la section que nomme le premier segment de l'id. Le sommaire est modifié **comme du texte** : son
indentation et ses fins de ligne sont conservées, et un ancien fichier à clés françaises reçoit des clés dans son
propre style. Le résumé de l'entrée est un texte provisoire, que `doc-kit audit` signale tant que vous ne l'avez pas
écrit. Un fichier existant n'est jamais écrasé (code de sortie 1).

## Les pages sans type

Toutes les pages n'ont pas besoin d'un type. Omettez `template` pour une sous-page d'un écran ou d'un éditeur, une
sous-page de points d'attention, une page de notions, un catalogue ou une annexe. `doc-kit audit` nomme les pages sans
type qui suivent déjà un type (toutes ses sections obligatoires sont là) et indique, pour les autres, le type le plus
proche et les sections qui leur manquent.

## Pièges et écarts constatés

> [!ATTENTION] Un nombre au début d'un titre
> « Les 28 variables, une par une » ne commence pas par « Les variables » : la section n'est pas trouvée. Mettez les
> nombres dans le texte, pas au début d'un titre.

> [!NOTE] Modifier le standard
> `standard/templates.json` est lu par le build : modifier une section obligatoire change ce que chaque projet doit
> contenir. La modification passe d'abord par `ARCHITECTURE.md`, puis par les deux langues du standard et des
> gabarits.

## Pour aller plus loin

- [Le Markdown étendu](#/write/markdown) : la syntaxe utilisée à l'intérieur des sections.
- [Sommaire, sous-pages et parcours](#/write/table-of-contents) : déclarer les pages et leur type.
- [L'audit et les niveaux de maturité](#/publish/audit) : `typed`, `conformant`, `completeness` et `tooLong`.
- [Le standard de documentation](#/method/standard) : pourquoi ces sections, et les règles de rédaction.
