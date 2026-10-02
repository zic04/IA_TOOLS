# Niveaux de maturité

Quatre niveaux, chacun défini par des critères que `doc-kit audit` **mesure**. Un niveau est atteint quand tous ses critères, et tous les critères des niveaux inférieurs, sont remplis.

| Niveau | Nom | En une phrase |
|---|---|---|
| 1 | **Squelette** | Le site se construit, et chaque section a sa première page |
| 2 | **Utilisateur** | Un utilisateur trouve chaque écran, annoté |
| 3 | **Complet** | Tout est écrit, couvert, typé et conforme ; le build strict passe |
| 4 | **Reprise** | Une équipe qui ne connaît pas le projet peut le reprendre : architecture, parcours, diagnostic, constats, preuves |

## Les indicateurs

`doc-kit audit` calcule les indicateurs ci-dessous. Ils apparaissent sous ces noms dans `.doc-kit/audit.json` et avec `--json`.

| Indicateur | Formule |
|---|---|
| `written` | Pages déclarées qui ont leur fichier ÷ pages déclarées |
| `typed` | Pages qui déclarent un `template` ÷ pages déclarées |
| `conformant` | Pages typées qui ont toutes leurs sections obligatoires ÷ pages typées |
| `completeness` | Moyenne, sur les pages typées, de (sections du gabarit présentes ÷ sections du gabarit) |
| `annotated` | Pages `screen` et `editor` qui contiennent au moins un `:::screen` (ou `:::ecran`) ÷ pages `screen` et `editor`. Tant qu'aucune page n'est typée : les pages de toutes les sections autres que Reprendre. `n/a` quand `capture.mode` vaut `"none"` : une documentation déclarée sans captures décrit ses écrans par des tableaux, et n'a rien à annoter |
| `coverage` | Éléments cités ÷ éléments inventoriés par `doc-kit check coverage` ; non mesuré quand aucun adaptateur ne peut inventorier l'application |
| `proofs` | Pages de Reprendre qui contiennent au moins une preuve `fichier:ligne` (un nom de fichier avec son extension, puis `:` et un numéro, entre accents graves : `lib/commandes.ts:42`) ÷ pages de Reprendre |
| `takeover` | Nombre des 7 pages obligatoires de Reprendre qui sont présentes (voir ci-dessous) |
| `tooLong` | Pages au-delà de leur `maxWords` (2 000 sans type) ÷ pages. Les mots sont comptés dans le Markdown, sans les blocs de code, les commentaires, les URL et le balisage |
| `guidance` | Nombre de pages qui contiennent encore une consigne de gabarit (`<!-- consigne :` ou `<!-- guidance:`), ou dont le résumé est encore celui qu'écrit `doc-kit new` |
| `upToDateCaptures` | Fichiers de zones dont la `version` est la version courante de l'application ÷ fichiers de zones qui portent une `version` ; `n/a` quand aucun n'en porte |
| `glossary` | Nombre de termes du glossaire |
| `tours` | Nombre de parcours guidés de l'accueil (`journeys` dans `toc.json`) |
| `blocking` | Erreurs du build strict + éléments non cités (quand `coverage` est mesuré) + secrets trouvés par `doc-kit check secrets` (voir [quality.fr.md](quality.fr.md)) |
| `wideTables` | Tableaux qui débordent à 1 440 px (chaque page est ouverte dans le navigateur) ; non mesuré sans navigateur, ou avec `DOC_KIT_NO_BROWSER=1` |

La section **Reprendre** est la section dont l'id est `take-over` (ou `reprendre`) ; à défaut, la dernière section du sommaire, quand il en compte au moins deux.

**Les 7 pages obligatoires de Reprendre**, comptées par `takeover` parmi les pages écrites de la section Reprendre (une sous-page est une page `"level": 2` qui suit sa parente dans le même groupe) :

| # | Page | Critère mesuré |
|---|---|---|
| 1 | Vue d'ensemble de l'architecture | Une page dont l'id se termine par `/architecture` |
| 2 | Dossier d'architecture technique (DAT) | Une page avec `"template": "architecture"` |
| 3 | Parcours de bout en bout | Une page `journey` suivie d'au moins 3 sous-pages `journey-step` |
| 4 | Exploiter | Une page dont l'id contient `operations`, `deployment`, `exploitation` ou `deploiement` |
| 5 | Diagnostic par symptôme | Une page `troubleshooting` suivie d'au moins 2 sous-pages `troubleshooting-area` |
| 6 | Points d'attention | Une page `findings`, et au moins un constat numéroté (`C1`, `I1`, `M1`, `P1`, `N1` ou `R1`…) dans cette page ou dans ses sous-pages |
| 7 | Maintenir la doc | Une page dont l'id se termine par `/maintaining-docs` ou `/maintenir-doc` |

## Les critères de chaque niveau

| Niveau | Critères |
|---|---|
| **1 Squelette** | `doc.config.mjs` est valide · `doc-kit build --draft` réussit · chaque section a au moins 1 page écrite · `home.md` existe · `glossary` ≥ 1 · `tours` ≥ 1 |
| **2 Utilisateur** | `written` ≥ 90 % hors Reprendre · `annotated` ≥ 80 % (ou `n/a`) · `coverage` ≥ 80 % (ou `n/a`) · aucun lien cassé et aucune légende différente de ses zones, même en mode brouillon |
| **3 Complet** | `blocking` = 0 (build strict, liens, couverture à 100 %, secrets) · `typed` ≥ 80 % · `conformant` = 100 % · `annotated` ≥ 90 % (ou `n/a`) · `guidance` = 0 · `wideTables` = 0 · `glossary` ≥ 20 · `tours` ≥ 3 |
| **4 Reprise** | `takeover` = 7 · `proofs` ≥ 60 % · `completeness` ≥ 70 % · `tooLong` ≤ 5 % · `upToDateCaptures` ≥ 90 % (ou `n/a`) |

Les seuils viennent des sites les plus aboutis construits avec cette méthode : on peut les atteindre sans exploit, et un site qui en manque un a une lacune qu'un lecteur remarquera.

## Comment l'audit décide

- **Niveau 0** : le niveau 1 n'est pas atteint (le sommaire ne peut pas être lu, ou un critère du niveau 1 échoue).
- **Non mesuré** (aucun adaptateur de couverture ne peut inventorier l'application, pas de navigateur pour la largeur des tableaux) : le critère est ignoré, jamais en échec, et le rapport dit comment le mesurer.
- **n/a** (rien à mesurer, par exemple `conformant` tant qu'aucune page n'est typée) : le critère est rempli. Avec `capture.mode: "none"`, `annotated` vaut `n/a` : une documentation sans captures atteint donc le niveau 2 avec des pages écrites et couvertes.
- `doc-kit audit` construit le site en mémoire en mode strict, puis écrit `.doc-kit/audit.md` (le rapport, dans la langue du projet) et `.doc-kit/audit.json`, et affiche un résumé. Son code de sortie vaut 0 : il informe, il ne bloque pas (code 2 quand la configuration ne peut pas être lue).
- **Les actions** sont listées niveau par niveau, à partir du suivant ; dans un niveau, les plus rapides d'abord (renommer un titre, déclarer un type, retirer une consigne), les plus longues ensuite (écrire des pages, ajouter des preuves). Chaque action nomme les pages concernées.
- **Pages non typées.** L'audit nomme les pages qui suivent déjà un gabarit, d'après leurs titres : toutes les sections obligatoires du type sont là. Il préfère les types habituels de la section (`screen` dans Utiliser et Administrer, `editor` et `recipe` dans Configurer), et ne propose jamais de type pour une sous-page d'une page `screen`, `editor` ou des points d'attention, qui restent non typées (voir [templates.fr.md](templates.fr.md#pages-sans-type)). Pour les autres pages, il donne le type le plus proche et les sections obligatoires qui manquent encore.

## Exemple détaillé : Acme Orders

La documentation d'Acme Orders, version 2.4.0, compte 92 pages. `doc-kit audit` affiche :

| Indicateur | Valeur | Seuil atteint ? |
|---|---|---|
| `written` | 92 / 92 (100 %) | Oui |
| `typed` | 81 / 92 (88 %) | Oui (niveau 3 : ≥ 80 %) |
| `conformant` | 79 / 81 (97,5 %) | **Non** (niveau 3 : 100 %) |
| `completeness` | 74 % | Oui (niveau 4 : ≥ 70 %) |
| `annotated` | 43 / 46 (93 %) | Oui (niveau 3 : ≥ 90 %) |
| `coverage` | 61 / 61 routes | Oui |
| `proofs` | 19 / 34 (56 %) | **Non** (niveau 4 : ≥ 60 %) |
| `takeover` | 6 / 7 | **Non** (niveau 4 : 7) |
| `tooLong` | 3 / 92 (3 %) | Oui (niveau 4 : ≤ 5 %) |
| `guidance` | 0 | Oui |
| `upToDateCaptures` | 118 / 124 (95 %) | Oui |
| `glossary` · `tours` | 34 · 4 | Oui |
| `blocking` · `wideTables` | 0 · 0 | Oui |

**Niveau atteint : 2 Utilisateur.** Les niveaux 1 et 2 sont remplis ; le niveau 3 échoue sur un critère, `conformant`.

Ce qui manque, dans l'ordre où l'audit le liste :

| Pour atteindre | Ce qui manque | Action |
|---|---|---|
| Niveau 3 | Deux pages `screen` commencent par « ## Présentation » au lieu de « À quoi ça sert » (`utiliser/factures/liste`, `utiliser/clients/fiche`) | Renommer les deux titres, et corriger les ancres qui pointaient vers eux. `conformant` passe à 81 / 81 |
| Niveau 4 | `takeover` = 6 : la page de diagnostic n'a qu'un seul domaine (`reprendre/diagnostic/acces`) | Écrire un second domaine, par exemple `reprendre/diagnostic/validation` |
| Niveau 4 | `proofs` = 56 % : 15 pages de Reprendre n'ont aucune preuve `fichier:ligne` | Ajouter des preuves à au moins 2 d'entre elles : 21 / 34 = 62 % |

Les deux titres prennent dix minutes et font passer le site au niveau 3. Le niveau 4 demande un vrai travail : un domaine de diagnostic de plus, écrit à partir du code, et des preuves sur les pages qui affirment encore sans en donner.

> [!NOTE] Pourquoi le niveau mesuré peut être plus bas que le fond
> Un site écrit avant l'existence des types de page ne déclare aucun `template` : `typed` vaut 0 %, et il reste au niveau 2 même si son contenu est complet. Déclarer les types, et renommer les quelques titres qui ne correspondent pas à leur gabarit, suffit en général à révéler son vrai niveau sans réécrire de contenu. `doc-kit audit` liste les pages à typer et leur type.
