## En bref

`doc-kit sync` dit exactement ce que la documentation doit suivre après un changement de l'application, corrige
ce qui est mécanique, et laisse à une personne ou à un agent seulement les pages dont le sujet a vraiment changé.
Il ne fait jamais appel à un LLM : chaque décision vient de hachages, d'imports et de git, calculés et comparés.

1. **Marquez** les pages vérifiées maintenant : leurs dépendances sont enregistrées dans `sync.json`.
2. **Comparez**, plus tard, les dépendances enregistrées avec l'application telle qu'elle est (ou avec un commit
   git).
3. **Agissez** sur le rapport : `--apply` réécrit ce qui a bougé, une personne relit ce que le rapport liste comme
   changé.

## La référence : `sync.json`

```bash
doc-kit sync --mark --all
```

Enregistre, pour chaque page écrite, les hachages de la page elle-même, des fichiers derrière ses `routes`
(directs : la route propre de la page ; partagés : seulement importés, jusqu'à 3 niveaux et 200 fichiers), de
chaque preuve `file:line` qu'elle cite, des entrées de plan de capture derrière ses blocs `:::ecran`, des libellés
de message qu'elle cite mot pour mot, et de ses tableaux `::faits`, de son groupe de sujet (les autres pages qu'un `counterpart` relie) et de ses
`sources` déclarées. `sync.json` vit à la racine du projet par défaut (`paths.sync`) et est **committé avec la
documentation**, comme `facts/*.json`.

Marquer fusionne dans `sync.json`, sans jamais le reconstruire : `--mark <page…>` enregistre ces pages et le
commit sur lequel elles ont été vérifiées, et n'acquitte que ce qu'elles documentent. Une nouvelle route reste
`new` tant qu'aucune page marquée ne la cite ou que `--mark --all` n'acquitte tout l'inventaire ; un libellé
renommé reste signalé tant qu'une page non marquée cite encore son ancienne valeur — de même qu'un libellé dont
l'application a supprimé le fichier de messages (`→ null`). Une page n'acquitte un élément que si elle le nomme en
entier : `/detail` n'est pas dans `/orders/detail`, ni `/ord` dans `/orders`, et `/invoices-export`,
`/invoices.csv` ou `/invoices/2026` ne nomment pas `/invoices` — une route se termine avant un blanc, un guillemet,
un crochet, un accent grave, `?`, `#` ou une ponctuation de phrase (`/invoices.`) ; `/invoices/2026` nomme
`/invoices/[id]`. `--mark --all` retire aussi un libellé qu'aucune page ne cite plus ; une page qui n'est plus écrite
quitte `sync.json` au marquage suivant. Sans aucune page écrite — une table des matières illisible — un marquage
est refusé (code de sortie 1) et `sync.json` reste tel quel : rien de ce qui reste à faire n'est acquitté. Le diff
de chaque page part de son propre commit.

## Lire le rapport

```bash
doc-kit sync
```

Sans `--mark`, `sync` ne fait que rapporter — rien n'est écrit sauf `.doc-kit/sync.md`, `.doc-kit/sync-report.json`
et un `.doc-kit/sync/<page>.diff` par page à relire :

| Catégorie | Ce qui a changé | Quoi faire |
|---|---|---|
| `review` (priorité `direct`) | Un fichier que la route propre de la page touche | Relire, probablement réécrire |
| `review` (priorité `shared`) | Un fichier que la page importe seulement | Relire |
| `review` (priorité `probablyIntact`) | Ce fichier partagé a changé, mais rien que la page nomme | Relire, probablement intact |
| `proofs.moved` | Le texte d'une ligne citée trouvé ailleurs dans le même fichier (ou renommé) | `--apply` corrige |
| `proofs.broken` | Le fichier a été supprimé, ou le texte ne se trouve plus nulle part | Relire |
| `labels` | La valeur d'un message cité a changé, ou sa clé a disparu (un fichier de messages au JSON invalide ne fait qu'avertir : ses libellés ne sont pas comparés) | `--apply --labels` corrige |
| `captures` | Les fichiers de la route ont changé, l'entrée de plan a changé, ou la capture est périmée | Reprendre : `capture --stale --compare` |
| `new` | Une route, une route API, une table… que la référence n'a jamais vue | La documenter |
| `removed` | Un élément qu'une page écrite cite encore, disparu de l'application | Corriger les pages listées |
| `unchanged` | Une page marquée, aucune de ses dépendances n'a bougé | Retamponnée par `--apply` |
| `edited` | Une page marquée dont le Markdown a changé depuis son marquage | La vérifier, puis `--mark` (seulement un avertissement, jamais retamponnée par `--apply`) |
| `unmarked` | Une page écrite jamais marquée | `--mark` une fois vérifiée (seulement un avertissement, ne bloque jamais `--check`) |

Une page peut apparaître dans plusieurs catégories à la fois (`proofs.moved` et `captures`, par exemple), mais au
plus une fois dans `review` ou `unchanged`.

## Corriger automatiquement : `--apply` et `--labels`

```bash
doc-kit sync --apply
doc-kit sync --apply --labels
```

`--apply` réécrit le `fichier:ligne` d'une preuve déplacée partout où elle est citée, et retamponne chaque page
que l'exécution laisse inchangée — sans effacer ce qui reste à faire : une capture à reprendre, un nouvel élément,
un libellé. `--labels` va plus loin : il remplace l'ancienne valeur d'un message par la nouvelle, en mot entier
(`No` n'est jamais remplacé dans `Note`), mais **seulement** dans `**gras**`, du code en ligne qui est le libellé
lui-même, les badges `[[menu …]]` et les guillemets — jamais dans la prose ordinaire, où une phrase humaine dépend
de l'ancienne formulation, ni dans un autre code en ligne (même en gras ou entre guillemets :
`` **`getByRole('link', { name: 'Approve' })`** `` reste tel quel), les attributs d'une directive, la cible d'un
lien, une adresse nue (`https://…`), ou un libellé entre crochets qui nomme une définition de lien (`[Approve]` avec
`[Approve]: approve.md`). Une nouvelle valeur qui contient l'ancienne
(`Approval chain` → `Approval chain history`) n'est remplacée qu'une fois : relancé, il ne change plus rien. Un bloc de code (délimité ou indenté), un
commentaire HTML et une balise étalée sur plusieurs lignes ne sont pas du texte : un libellé qui s'y trouve n'est ni
remplacé ni lu comme cité — lus comme le moteur de rendu du site les lit : du code en ligne comme `` `<!--` ``
n'ouvre aucun commentaire, et un bloc délimité se ferme avec la citation ou l'élément de liste qui le contient. Il
n'y a pas d'en-tête YAML : une page qui commence par `---` commence par un filet. `é` écrit en un caractère ou en
`e` suivi d'un accent est le même libellé. Rien ici ne touche jamais la prose : une page dont le sujet a changé a
toujours besoin d'une personne, et une page que personne n'a marquée n'est jamais marquée par `--apply`, même
celle dont il a réécrit un libellé.

Ce que `--apply` réécrit dans une page qu'il laisse à relire n'est pas une retouche à la main : cette page n'est
pas signalée `edited` pour autant — ni pour un saut de ligne final ajouté ou retiré, un BOM ou des fins de ligne
CRLF.

## Une barrière pour l'intégration continue : `--check`

```bash
doc-kit sync --check
```

Code de sortie 1 dès qu'une catégorie autre que `unchanged`, `edited` et `unmarked` n'est pas vide — « la documentation est
en retard sur l'application ». `unmarked` ne fait qu'avertir, pour qu'un projet puisse adopter `sync` page par
page plutôt que de tout marquer d'un coup.

## Comparer avec un commit plutôt qu'avec la référence

```bash
doc-kit sync --since v2.3.0
```

Lit les fichiers derrière chaque page **à ce commit** plutôt que depuis `sync.json`, par un git en lecture seule :
seuls `review` et `unchanged` sont rapportés de cette façon. Preuves, libellés, captures et retouches se comparent
avec `sync.json`, et les adaptateurs de couverture ne sont pas relancés à un ancien commit : `proofs`, `labels`,
`captures`, `edited`, `new` et `removed` sont donc toujours vides. `--since` compare et n'enregistre jamais : avec
`--mark` ou `--apply`, c'est une erreur d'usage (code de sortie 2).

## Ne rafraîchir que ce qui a changé : `capture --compare` et `--stale`

```bash
doc-kit capture --stale          # les captures nommées dans le dernier rapport sync
doc-kit capture "use-orders-*" --compare
```

Chaque capture sélectionnée est reprise puis comparée pixel par pixel à l'image sur disque. Sous le seuil
(`capture.compareThreshold`, 0,5 % de pixels différents par défaut), l'image est **gardée telle quelle** — aucun
changement binaire pour git — et seul son fichier de zones est réécrit ; au-dessus, la nouvelle image remplace
l'ancienne, et `.doc-kit/compare/<id>.png` montre les deux côte à côte avec leurs zones dessinées. `--stale`
sélectionne les captures que le dernier rapport de `sync` a nommées comme changées ; il implique `--compare`.

## La ligne du pied de page

Une fois une page marquée, le site affiche, à côté des dates de capture, « Vérifiée sur la version {version} le
{date} » — la version et la date enregistrées par le dernier `--mark` qui l'a touchée, visibles à la prochaine
construction.

## Pièges et écarts constatés

> [!ATTENTION] Sans `app.dir`, `sync` ne peut pas s'exécuter
> Dépendances, preuves et libellés sont tous lus dans le code de l'application : configurez d'abord `app.dir`
> ([Clés du projet, de la version et de la connexion](#/reference/configuration/project)).

> [!NOTE] Un libellé collé au texte, dans une écriture sans espaces, n'est pas vu
> `保存をクリック` ne cite pas `保存` : une lettre le suit, comme `Approved` ne cite pas `Approve`. Détachez le
> libellé — `**保存**をクリック` — pour qu'il soit suivi. Chercher un libellé très long est plus lent : jusqu'à la
> longueur de la page fois celle du libellé.

> [!NOTE] Deux libellés de même valeur, une capture sur plusieurs pages
> Deux clés de message de même valeur ne se distinguent pas : une page qui la cite est listée — et réécrite par
> `--labels` — quand l'une ou l'autre change. Une capture montrée par plusieurs pages est enregistrée une fois :
> marquer l'une d'elles l'acquitte pour toutes.

> [!NOTE] git n'est jamais qu'en lecture
> `--since`, et le commit affiché par un fichier de faits périmé, viennent de `git show` et `git diff` dans
> l'application — jamais une écriture. Sans git, le rapport s'exécute encore ; il perd seulement ce que git aurait
> ajouté.

## Pour aller plus loin

- [Commandes : rédiger et vérifier](#/reference/cli/write-check~doc-kit-sync) : chaque option, en détail.
- [Reprendre une application vibe-codée](#/spaces/takeover) : les pages que `sync` garde honnêtes.
- [Coût et vitesse](#/skill/cost-and-speed) : `doc-kit context --update` lit ce rapport pour briefer un agent.
