# Niveaux de maturité

Quatre niveaux, chacun défini par des critères que `doc-kit audit` **mesure**. Un niveau est atteint quand tous ses critères, et tous les critères des niveaux inférieurs, sont remplis.

Avec des espaces déclarés (`content/toc.json`, ARCHITECTURE.md §6.1a), le niveau est aussi mesuré **par
espace** : voir « Le niveau par espace » plus bas. Sans espaces, rien ne change dans ce fichier.

| Niveau | Nom | En une phrase |
|---|---|---|
| 1 | **Squelette** | Le site se construit, et chaque section a sa première page |
| 2 | **Utilisateur** | Un utilisateur trouve chaque écran, annoté |
| 3 | **Complet** | Tout est écrit, couvert, typé et conforme ; le build strict passe |
| 4 | **Reprise** | Une équipe qui ne connaît pas le projet peut le reprendre : architecture, parcours, diagnostic, constats, preuves |

## Les indicateurs

`doc-kit audit` calcule les indicateurs ci-dessous. Ils apparaissent sous ces noms dans `.doc-kit/audit.json` et avec `--json`.

**Une page écrite** est une page déclarée dont le fichier existe et ne contient plus aucune consigne de gabarit (`<!-- consigne :` ou `<!-- guidance:`). Une page déclarée est dans un seul de ces états :

| État | Ce que cela veut dire | Compté par |
|---|---|---|
| Sans fichier | Déclarée dans `toc.json`, pas encore de fichier | `written` seulement |
| Brouillon | Son fichier contient encore des consignes de gabarit (squelette d'`init` ou de `doc-kit new`) | `written` seulement |
| Écrite | Fichier présent, plus aucune consigne | tous les indicateurs de pages |

**Qui compte quoi.** `written` porte les pages pas encore écrites : les autres indicateurs de pages ne mesurent que les pages écrites, et une page pas encore écrite n'est jamais comptée deux fois. Ses sections, les exemples de son gabarit (un constat `C1` d'exemple, une preuve d'exemple, un `:::ecran` d'exemple) et ses erreurs de build attendent qu'elle soit écrite. Le résumé de l'audit dit combien de pages restent à écrire : « Pages : 1 écrite sur 81 — 80 à écrire (72 sans fichier, 8 encore en consignes) ».

| Indicateur | Formule |
|---|---|
| `written` | Pages écrites ÷ pages déclarées. Le rapport ajoute les pages sans fichier et les brouillons |
| `typed` | Pages qui déclarent un `template` ÷ pages déclarées (une déclaration du sommaire : écrite ou non) |
| `conformant` | Pages typées écrites qui ont toutes leurs sections obligatoires ÷ pages typées écrites |
| `completeness` | Moyenne, sur les pages typées écrites, de (sections du gabarit présentes ÷ sections du gabarit) |
| `annotated` | Pages `screen` et `editor` écrites qui contiennent au moins un `:::screen` (ou `:::ecran`) ÷ pages `screen` et `editor` écrites. Tant qu'aucune page n'est typée : les pages écrites autres que les pages de la reprise (plus bas). `n/a` quand `capture.mode` vaut `"none"` : une documentation déclarée sans captures décrit ses écrans par des tableaux, et n'a rien à annoter |
| `coverage` | Éléments cités par les pages écrites ÷ éléments inventoriés par `doc-kit check coverage` ; non mesuré quand aucun adaptateur ne peut inventorier l'application. L'entrée d'une page pas encore écrite (ses `routes`) ne couvre rien : le rapport donne à part la couverture du plan, « avec les pages pas encore écrites » |
| `proofs` | Pages de la reprise (plus bas) écrites qui contiennent au moins une preuve `fichier:ligne` (un nom de fichier avec son extension, puis `:` et un numéro, entre accents graves : `lib/commandes.ts:42`), hors commentaires ÷ pages de la reprise écrites |
| `takeover` | Nombre des 7 pages obligatoires de la reprise qui sont écrites (voir ci-dessous) |
| `tooLong` | Pages écrites au-delà de leur `maxWords` (2 000 sans type) ÷ pages écrites. Les mots sont comptés dans le Markdown, sans les blocs de code, les commentaires, les URL et le balisage |
| `guidance` | Texte de gabarit resté hors du corps des pages : pages écrites dont le résumé est encore celui qu'écrit `doc-kit new`, plus l'accueil et les introductions de section (`<section>/index.md`) qui contiennent encore une consigne |
| `upToDateCaptures` | Fichiers de zones dont la `version` est la version courante de l'application ÷ fichiers de zones qui portent une `version` ; `n/a` quand aucun n'en porte |
| `upToDatePages` | Pages marquées (`sync.json`, ARCHITECTURE.md §6.10) dont la `version` est la version courante de l'application ÷ pages écrites ; `n/a` sans `sync.json` |
| `glossary` | Nombre de termes du glossaire |
| `tours` | Nombre de parcours guidés de l'accueil (`journeys` dans `toc.json`) |
| `blocking` | Erreurs du build strict hors pages pas encore écrites + éléments cités par aucune page, pas même par l'entrée d'une page pas encore écrite (quand `coverage` est mesuré) + secrets trouvés par `doc-kit check secrets` (voir [quality.fr.md](quality.fr.md)). Les erreurs des pages pas encore écrites (`page.missing`, les erreurs d'un brouillon) sont affichées à côté, comptées par `written` |
| `wideTables` | Tableaux qui débordent à 1 440 px (chaque page est ouverte dans le navigateur) ; non mesuré sans navigateur, ou avec `DOC_KIT_NO_BROWSER=1` |

**Les pages de la reprise** sont celles sur lesquelles le dossier de reprise est jugé : `proofs` les mesure,
`written` au niveau 2 (`written2`) les laisse de côté, et les affirmations (plus bas) y sont comptées.

- **Sans espaces**, ce sont les pages de la section **Reprendre** : la section dont l'id est `take-over` (ou
  `reprendre`) ; à défaut, la dernière section du sommaire, quand il en compte au moins deux.
- **Avec des espaces déclarés**, leur type décide (`standard/spaces.json`) : ce sont les pages dont l'espace
  effectif est d'un type qui attend des preuves `fichier:ligne` — l'espace Développer, ou un espace propre au
  projet déclaré avec `"kind": "develop"`. Les pages de l'espace Administrer ne sont pas des pages de la
  reprise, pas même celles de sa partie Exploiter.

**Les 7 pages obligatoires de la reprise**, comptées par `takeover` parmi les pages écrites, jamais un brouillon ni une page sans fichier, que le rapport nomme comme la page à écrire (une sous-page est une page `"level": 2` qui suit sa parente dans le même groupe). Sans espaces, elles sont cherchées dans la section Reprendre. Avec des espaces, le `takeover` du projet cherche chacune dans les pages de tous les espaces dont le type porte des pages de la reprise (Administrer, Développer) ; chacune appartient à l'espace dont le type la porte (dernière colonne) — deux à l'espace Administrer, les cinq autres à l'espace Développer —, dont le niveau propre la compte parmi ses pages, et une page manquante est suggérée dans la partie habituelle de cet espace ([structure.fr.md](structure.fr.md) : Exploiter, Comprendre, Risques, Maintenir), à défaut dans sa section qui contient déjà une page de ce type, à défaut dans sa première section. La section propre du dossier (`takeoverSection` dans `audit.json`) est la première section de l'espace Développer, à défaut celle du premier espace qui porte des pages de la reprise ; une page obligatoire qu'aucun espace déclaré ne porte (le DAT d'un projet qui déclare `["use", "develop"]`) y est suggérée. Quand aucun espace déclaré n'en porte (`["use", "product"]`, par exemple), le rapport demande d'abord une section dans un espace de type `develop` ou `admin` (`takeover.noSection`).

| # | Page | Critère mesuré | Avec des espaces, cherchée dans |
|---|---|---|---|
| 1 | Vue d'ensemble de l'architecture | Une page dont l'id se termine par `/architecture` | Développer |
| 2 | Dossier d'architecture technique (DAT) | Une page avec `"template": "architecture"` | Administrer |
| 3 | Parcours de bout en bout | Une page `journey` suivie d'au moins 3 sous-pages `journey-step` | Développer |
| 4 | Exploiter | Une page dont l'id contient `operations`, `deployment`, `exploitation` ou `deploiement` | Administrer |
| 5 | Diagnostic par symptôme | Une page `troubleshooting` suivie d'au moins 2 sous-pages `troubleshooting-area` | Développer |
| 6 | Points d'attention | Une page `findings`, et au moins un constat numéroté (`C1`, `I1`, `M1`, `P1`, `N1` ou `R1`…) dans cette page ou dans ses sous-pages | Développer |
| 7 | Maintenir la doc | Une page dont l'id se termine par `/maintaining-docs` ou `/maintenir-doc` | Développer |

Trois indicateurs mesurent la profondeur des fiches de fonctionnalité (voir « La profondeur des fiches de
fonctionnalité ») :

| Indicateur | Formule |
|---|---|
| `featureSheets` | Fiches de fonctionnalité écrites (une page avec `feature` dans `toc.json`) qui ont au moins un récit utilisateur (`:::recit`) ÷ fiches de fonctionnalité écrites |
| `scenarios` | Récits utilisateur des fiches écrites qui ont des critères d'acceptation — un `:::scenario` qui les nomme (`recit="US-01"`) ÷ ces récits |
| `behaviourDepth` | Rubriques des cartes de comportement des fiches écrites qui ont une réponse — une valeur, ou un `sans objet — pourquoi` explicite — ÷ leurs rubriques (`inconnu — question`, ou une rubrique omise, n'est pas une réponse) ; `n/a` sans carte |

## Les critères de chaque niveau

| Niveau | Critères |
|---|---|
| **1 Squelette** | `doc.config.mjs` est valide · `doc-kit build --draft` réussit · chaque section a au moins 1 page avec son fichier (un brouillon compte : c'est le squelette) · `home.md` existe · `glossary` ≥ 1 · `tours` ≥ 1 |
| **2 Utilisateur** | `written` ≥ 90 % hors pages de la reprise · `annotated` ≥ 80 % (ou `n/a`) · `coverage` ≥ 80 % (ou `n/a`) · aucun lien cassé et aucune légende différente de ses zones, même en mode brouillon |
| **3 Complet** | `written` = 100 % · `blocking` = 0 (build strict, liens, couverture à 100 %, secrets) · `typed` ≥ 80 % · `conformant` = 100 % · `annotated` ≥ 90 % (ou `n/a`) · `guidance` = 0 · `wideTables` = 0 · `glossary` ≥ 20 · `tours` ≥ 3 · `featureSheets` = 100 % (ou `n/a`) |
| **4 Reprise** | `takeover` = 7 · `proofs` ≥ 60 % · `completeness` ≥ 70 % · `tooLong` ≤ 5 % · `upToDateCaptures` ≥ 90 % (ou `n/a`) · `upToDatePages` ≥ 90 % (ou `n/a`) · `scenarios` ≥ 80 % (ou `n/a`) · `behaviourDepth` ≥ 90 % (ou `n/a`) |

Les seuils viennent des sites les plus aboutis construits avec cette méthode : on peut les atteindre sans exploit, et un site qui en manque un a une lacune qu'un lecteur remarquera.

## Comment l'audit décide

- **Niveau 0** : le niveau 1 n'est pas atteint (le sommaire ne peut pas être lu, ou un critère du niveau 1 échoue).
- **Non mesuré** (aucun adaptateur de couverture ne peut inventorier l'application, pas de navigateur pour la largeur des tableaux) : le critère est ignoré, jamais en échec, et le rapport dit comment le mesurer.
- **n/a** (rien à mesurer, par exemple `conformant` tant qu'aucune page n'est typée) : le critère est rempli. Avec `capture.mode: "none"`, `annotated` vaut `n/a` : une documentation sans captures atteint donc le niveau 2 avec des pages écrites et couvertes. `upToDatePages` vaut `n/a` de la même façon : un projet sans `sync.json` encore (ARCHITECTURE.md §6.10) remplit le critère sans avoir jamais lancé `doc-kit sync`. Le premier `doc-kit sync --mark --all` en fait un vrai ratio mesuré — et à partir de là, une page que `doc-kit sync` signale comme changée le fait baisser jusqu'à ce qu'elle soit relue et marquée à nouveau.
- `doc-kit audit` construit le site en mémoire en mode strict, puis écrit `.doc-kit/audit.md` (le rapport, dans la langue du projet) et `.doc-kit/audit.json`, et affiche un résumé. Son code de sortie vaut 0 : il informe, il ne bloque pas (code 2 quand la configuration ne peut pas être lue).
- **Les actions** sont listées niveau par niveau, à partir du suivant ; dans un niveau, les plus rapides d'abord (renommer un titre, déclarer un type, retirer une consigne), les plus longues ensuite (écrire des pages, ajouter des preuves). Chaque action nomme les pages concernées.
- **Pages non typées.** L'audit nomme les pages qui suivent déjà un gabarit, d'après leurs titres : toutes les sections obligatoires du type sont là. Il préfère les types habituels de la partie (`screen` dans Utiliser et Administrer, `editor` et `recipe` dans Configurer), à défaut ceux du type de son espace (`feature`, `business-rules`… dans Produit ; `architecture`, `runbook`… dans Administrer ; `technical`, `journey`, `findings`… dans Développer, et dans la section Reprendre sans espaces), et ne propose jamais de type pour une sous-page d'une page `screen`, `editor` ou des points d'attention, qui restent non typées (voir [templates.fr.md](templates.fr.md#pages-sans-type)). Pour les autres pages, il donne le type le plus proche et les sections obligatoires qui manquent encore.

## Le niveau par espace

Avec des espaces déclarés (`content/toc.json`, ARCHITECTURE.md §6.1a), `doc-kit audit` affiche aussi un
niveau **par espace** : les mêmes critères, les indicateurs de page (`written`, `typed`, `conformant`,
`completeness`, `annotated`, `proofs`, `tooLong`) mesurés uniquement sur les pages de cet espace, et les
indicateurs transverses au projet (configuration, build, accueil, glossaire, parcours, couverture, problèmes
bloquants, tableaux trop larges, versions des captures et des pages) partagés avec le niveau global.
`audit.md` montre un tableau « Niveau par espace » sous le niveau global ; `audit.json` porte
`spaces: [{ id, title, pages, level, indicators, criteria }]`.

**`takeover4` par espace.** Un espace ne compte que les pages obligatoires de la reprise qui lui appartiennent,
trouvées parmi ses propres pages, et son seuil est leur nombre : 2 dans l'espace Administrer (le DAT,
Exploiter), 5 dans l'espace Développer. Le seuil du projet reste les 7. Une page obligatoire appartient au premier
espace déclaré dont le type la porte : un espace propre au projet compte comme son type, mais un second espace du
même type n'en porte aucune (`takeover4` y est `n/a`) ; sans espace Administrer, ses deux pages appartiennent à
l'espace Développer (seuil 7).

**Un critère qui ne concerne pas un espace** est rempli et affiché `n/a`, comme le dit son type :

| Critère | `n/a` dans | Pourquoi |
|---|---|---|
| `written2` (pages écrites hors pages de la reprise) | Développer | Ses pages sont les pages de la reprise |
| `proofs4` (preuves sur les pages de la reprise) | Utiliser, Produit, Administrer | Seul le type Développer attend des preuves `fichier:ligne` |
| `takeover4` (les pages obligatoires de la reprise) | Utiliser, Produit | Leurs types ne portent aucune page obligatoire de la reprise |
| `featureSheets3`, `scenarios4`, `behaviourDepth4` (la profondeur des fiches de fonctionnalité) | Utiliser, Administrer, Développer | Seul le type Produit la mesure (`depth`) |

Rien d'autre n'est ignoré — un espace Utiliser dont les écrans n'ont aucune capture échoue quand même sur
`annotated`, et `conformant`, `completeness`… sont mesurés sur les propres pages de chaque espace.

Le **niveau global reste ce qu'il a toujours été** : toutes les pages, sans distinction d'espace. Un projet
peut être au niveau 2 globalement alors que son espace Produit seul est déjà au niveau 3 — utile pour savoir
quel public est réellement servi en premier. Sans espaces déclarés, cette section ne produit rien : le
rapport est exactement ce qu'il était avant les espaces.

## La profondeur des fiches de fonctionnalité

`featureSheets`, `scenarios` et `behaviourDepth` lisent le backlog que le build strict tire des fiches de
fonctionnalité (ARCHITECTURE.md §6.8b) — la mesure de la jauge du tableau Produit. Comme tout indicateur de page, ils
ne comptent que les fiches écrites : une fiche pas encore écrite relève de `written`.

- **n/a** sans fiche de fonctionnalité écrite, et quand des espaces sont déclarés sans qu'aucun soit d'un type qui
  mesure la profondeur (`standard/spaces.json` `depth` : le type Produit). Sans espaces, une documentation qui a
  des fiches de fonctionnalité est mesurée.
- **Par espace**, ils sont mesurés dans un espace de type Produit, sur ses propres fiches, et `n/a` dans les autres.
  Le niveau du projet compte toutes les fiches écrites, quel que soit leur espace : une fiche placée dans un espace
  Utiliser y est `n/a`, jamais exclue du projet.
- Les actions nomment les fiches sans récit, les récits sans critères d'acceptation (et sur quelle page), et les
  fiches dont les cartes ont encore des rubriques sans réponse.
- Le rapport montre **Profondeur des fiches de fonctionnalité** : le backlog en une ligne (epics, fonctionnalités,
  récits utilisateur et combien ont des critères d'acceptation, versions), puis chaque fonctionnalité — sa fiche et
  son état, sa profondeur de 0 à 100 %, et les cinq critères de cette profondeur (la fiche écrite et conforme, au
  moins un récit, les critères des récits, au moins une règle, les rubriques renseignées). Informatif : seuls les
  trois indicateurs ci-dessus sont des critères ; `audit.json` le porte en `depth: { backlog, features }`.

## Faits et affirmations (informatif)

`doc-kit audit` affiche aussi deux mesures du dossier de reprise (ARCHITECTURE.md §6.9), **jamais** un critère et
sans jamais affecter le niveau, parce qu'aucun site n'existe avant elles pour qu'un seuil y soit observé :

| Mesure | Ce qu'elle compte |
|---|---|
| `facts` | Combien de fichiers `facts/<source>.json` existent, et combien sont **périmés** — leur `commit` enregistré diffère du `HEAD` courant de l'application |
| `claims` | Combien de puces `[[verified]]`, `[[deduced]]` et `[[unknown]]` (§6.9, [writing.fr.md](writing.fr.md#14-statut-des-affirmations-vérifiée-déduite-inconnue)) apparaissent dans les pages de la reprise écrites (avec des espaces, celles de l'espace Développer), et le ratio vérifiées ÷ (vérifiées + déduites) |

Elles répondent à deux questions différentes du niveau : « les preuves sur lesquelles repose ce dossier
sont-elles encore fraîches » (`facts`) et « quelle part de ce qui est affirmé est réellement vérifiée, plutôt
que supposée » (`claims`). Un fichier de faits périmé se corrige avec `doc-kit facts --source <nom>` ; un
ratio de vérification bas se corrige en lisant le code, pas en changeant une puce. `audit.md` montre les deux
sous « Faits et affirmations » quand l'un des deux a quelque chose à signaler ; `audit.json` porte toujours
`facts` et `claims`.

## Exemple détaillé : Acme Orders

La documentation d'Acme Orders, version 2.4.0, compte 92 pages dans ses quatre espaces. `doc-kit audit` affiche :

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
| `upToDatePages` | n/a — pas encore de `sync.json` | Oui (n/a) |
| `glossary` · `tours` | 34 · 4 | Oui |
| `blocking` · `wideTables` | 0 · 0 | Oui |

**Niveau atteint : 2 Utilisateur.** Les niveaux 1 et 2 sont remplis ; le niveau 3 échoue sur un critère, `conformant`.

Ce qui manque, dans l'ordre où l'audit le liste :

| Pour atteindre | Ce qui manque | Action |
|---|---|---|
| Niveau 3 | Deux pages `screen` commencent par « ## Présentation » au lieu de « À quoi ça sert » (`utiliser/factures/liste`, `utiliser/clients/fiche`) | Renommer les deux titres, et corriger les ancres qui pointaient vers eux. `conformant` passe à 81 / 81 |
| Niveau 4 | `takeover` = 6 : la page de diagnostic n'a qu'un seul domaine (`risques/diagnostic/acces`) | Écrire un second domaine, par exemple `risques/diagnostic/validation` |
| Niveau 4 | `proofs` = 56 % : 15 pages de l'espace Développer n'ont aucune preuve `fichier:ligne` | Ajouter des preuves à au moins 2 d'entre elles : 21 / 34 = 62 % |

Les deux titres prennent dix minutes et font passer le site au niveau 3. Le niveau 4 demande un vrai travail : un domaine de diagnostic de plus, écrit à partir du code, et des preuves sur les pages qui affirment encore sans en donner.

Le tableau « Niveau par espace » montre quel public est déjà servi :

| Espace | Pages | Niveau | Ce qui lui manque encore |
|---|---|---|---|
| Utiliser | 30 | 2 | `conformant` : les deux pages `screen` ci-dessus |
| Produit | 14 | 4 | Rien : `proofs4` et `takeover4` sont `n/a` |
| Administrer | 14 | 4 | Rien : ses 2 pages obligatoires de la reprise sont écrites ; `proofs4` est `n/a` |
| Développer | 34 | 3 | `takeover` 4 / 5 (le domaine de diagnostic), `proofs` 56 % |

Les exports Produit et Administrer peuvent déjà être remis à leurs lecteurs ; l'espace Utiliser attend les deux
titres, et l'espace Développer le même travail de niveau 4 que tout le projet.

> [!NOTE] Pourquoi le niveau mesuré peut être plus bas que le fond
> Un site écrit avant l'existence des types de page ne déclare aucun `template` : `typed` vaut 0 %, et il reste au niveau 2 même si son contenu est complet. Déclarer les types, et renommer les quelques titres qui ne correspondent pas à leur gabarit, suffit en général à révéler son vrai niveau sans réécrire de contenu. `doc-kit audit` liste les pages à typer et leur type.
