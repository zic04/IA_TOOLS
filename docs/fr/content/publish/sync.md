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
`/invoices/[id]`, et `/invoices/2026/edit` nomme `/invoices/[id]/edit`, jamais `/invoices/[id]` — une route
dynamique se nomme avec son propre nombre de segments. `--mark --all` retire aussi un libellé qu'aucune page ne cite plus ; une page qui n'est plus écrite
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
`[Approve]: approve.md`). Un libellé en gras écrit sur deux lignes (`**Approval\nchain**`) est remplacé lui aussi.
Une nouvelle valeur qui contient l'ancienne (`Approval chain` → `Approval chain history`) n'est remplacée qu'une
fois : relancé, il ne change plus rien. `é` écrit en un caractère ou en `e` suivi d'un accent est le même libellé.

**Chaque réécriture est vérifiée sur la page telle que le site la rend.** La page est rendue par le moteur de rendu
du kit avant et après : la réécriture n'est gardée que si la page d'après est la page d'avant avec le libellé
renommé dans son texte, et rien d'autre — les mêmes liens et leurs cibles, les mêmes ancres, les mêmes blocs de
code et commentaires —, et seulement là où la page rendue montre le libellé en gras, dans un badge, entre
guillemets ou en code en ligne à lui seul. Sinon la page est laissée telle quelle et signalée **à mettre à jour à la main** : un libellé
dans un titre, par exemple, dont l'ancre changerait avec lui. Son libellé reste en attente jusqu'à ce que quelqu'un
le mette à jour. Ainsi `--apply --labels` n'abîme jamais une page et n'efface jamais un signal : là où la lecture du
Markdown qui propose les réécritures diffère du moteur de rendu, la page est seulement envoyée à mettre à jour à la
main. Rien ici ne touche jamais la prose : une page dont le sujet a changé a toujours besoin d'une personne, et une
page que personne n'a marquée n'est jamais marquée par `--apply`, même celle dont il a réécrit un libellé.

Ce que `--apply` réécrit dans une page qu'il laisse à relire n'est pas une retouche à la main : cette page n'est
pas signalée `edited` pour autant — ni pour un saut de ligne final ajouté ou retiré, un BOM ou des fins de ligne
CRLF.

## Une barrière pour l'intégration continue : `--check`

```bash
doc-kit sync --check
```

Code de sortie 1 dès qu'une catégorie autre que `unchanged`, `edited` et `unmarked` n'est pas vide — « la documentation est
en retard sur l'application » —, ou qu'un fichier de messages ne peut pas être lu (JSON invalide) : aucun de ses
libellés n'est alors comparé, ce que l'intégration continue ne verrait pas autrement. `unmarked` ne fait qu'avertir, pour qu'un projet puisse adopter `sync` page par
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

> [!NOTE] Une page cite un libellé là où le site le montre
> Un libellé est cité là où la page, rendue par le moteur de rendu du kit, le montre comme texte : `_Approve_` cite
> `Approve` (une emphase, montrée sans ses soulignés), le titre d'un lien ou le texte d'une image aussi ; un bloc de
> code, un commentaire HTML, un script, une feuille de style ou un champ de texte jamais, ni la cible d'un lien.
> Une référence de caractère est le caractère qu'elle nomme : `**R&eacute;gler**` cite `Régler`, comme
> `**Régler**`.
> `保存をクリック` ne cite pas `保存` : une lettre le suit, comme `Approved` ne cite pas `Approve`. Détachez le
> libellé — `**保存**をクリック` — pour qu'il soit suivi. Chercher un libellé très long est plus lent : jusqu'à la
> longueur de la page fois celle du libellé.

> [!NOTE] Quand `--labels` laisse une page à mettre à jour à la main
> Les endroits à réécrire sont trouvés en lisant le Markdown, au plus près de la lecture du moteur de rendu mais
> pas exactement comme lui : une citation ouverte sur la ligne même d'un élément de liste (`- > …`), un commentaire
> jamais fermé dans une citation ou un élément de liste, ou du HTML brut que cette lecture ne suit pas peuvent être
> lus autrement. La vérification sur la page rendue rattrape chacun de ces cas — telle qu'elle lit la page rendue,
> avec deux limites : un élément de mise en forme laissé ouvert en HTML brut (un `<code>` jamais fermé) est lu fermé
> à la fin de son bloc, là où un navigateur le rouvre ; et un élément qui n'affiche rien (`<script>`, `<style>`,
> `<template>`, `<noscript>`) au milieu d'un mot termine ce mot pour le kit (`**Approve<script>…</script>d**` se lit
> `Approve`, là où un navigateur affiche `Approved`). La page est laissée telle quelle, signalée à mettre à jour à la
> main, son libellé toujours en attente — jamais abîmée.

> [!NOTE] Quelques formes que Marked rend lentement
> Le kit lit une page en temps linéaire, mais Marked non, sur quelques formes répétées sur des dizaines de milliers
> de caractères : des marques d'emphase jamais fermées (`*a *a *a …`), `x <!-- a --!> ` encore et encore, des
> lignes qui alternent avec des lignes de citation (les trois lentes dans Marked seul), ou un paragraphe coupé par
> beaucoup de lignes `::` sans ligne vide (lent dans Marked à chaque coupure que fait le kit). Une telle page prend
> des secondes — des minutes pour les plus longues — à être rendue, pour `sync` comme pour `build`.

> [!NOTE] Deux libellés de même valeur, une capture sur plusieurs pages
> Deux clés de message de même valeur ne se distinguent pas : une page qui la cite est listée — et réécrite par
> `--labels` — quand l'une ou l'autre change. Une capture montrée par plusieurs pages est enregistrée une fois :
> marquer l'une d'elles l'acquitte pour toutes.

> [!NOTE] git n'est jamais qu'en lecture
> `--since`, et le commit affiché par un fichier de faits périmé, viennent de `git show` et `git diff` dans
> l'application — jamais une écriture. Sans git, le rapport s'exécute encore ; il perd seulement ce que git aurait
> ajouté.

> [!NOTE] Un fichier hors de l'application n'est jamais lu
> Une preuve (`fichier:ligne`) ou une dépendance d'une page dont le fichier est hors de `app.dir` — par `../`, ou par
> un lien ou une jonction, que ce fichier existe ou non — n'est jamais lue, hachée ni enregistrée : l'avertissement
> `sync.proofOutside` (preuve non enregistrée) ou `sync.dependencyOutside` (dépendance non suivie) le dit, au
> marquage comme dans chaque rapport. Deux limites : un lien physique (hard link) est un autre nom du même fichier,
> donc un lien physique dans l'application vers un fichier extérieur est lu comme un fichier de l'application ; et
> un chemin est vérifié, puis lu, donc un fichier ou un dossier remplacé par un lien entre les deux, par un processus
> qui modifie l'application pendant que `sync` s'exécute, n'est pas vu.

> [!NOTE] Liens, chemins longs et globs
> Un lien cassé est jugé par sa cible telle qu'elle est écrite, 32 liens au plus : au-delà (une boucle), il est hors
> de l'application. Une cible avec un `..` après un nom (`j/../x`) l'est aussi : le système prend ce `..` là où mène
> `j`, ce que le texte ne peut pas dire. Un chemin de plus de 32 767 caractères, tel qu'il est écrit ou une fois
> joint, est absent, sauf s'il sort de l'application tel qu'il est écrit (`../`) : il est alors hors de
> l'application, quelle que soit sa longueur. Une preuve allongée de `./` au-delà de cette longueur ne nomme donc
> aucun fichier, et le dit par `sync.proofUnresolved`. Un glob de `sources` n'entre jamais dans un lien ou une
> jonction, ni par l'un d'eux avant son premier `*` (`linked/**`) : il n'y liste rien. De même pour les fichiers de
> messages : celui de `sync.labels`, ou les `messages` d'un adaptateur `i18n-registry`, derrière un lien ou une
> jonction de l'application n'est jamais lu — un glob ne le liste pas, un fichier nommé en entier n'y est pas (ses
> clés disparues) : ses libellés ne sont ni comparés ni enregistrés. Un dossier de routes qui est une jonction n'est
> pas trouvé par son adaptateur de couverture. Le fichier des fonctionnalités et le fichier de version
> (`version.file`) derrière l'un d'eux n'y sont pas non plus : aucune fonctionnalité, la version de repli. Une
> configuration qui pointe dans l'application par un lien à elle, vers un dossier sous la racine de l'application,
> n'est pas reconnue comme telle : faites-la pointer vers `app.dir` lui-même. Sous Windows, écrivez `app.dir` et les
> chemins de la configuration vers l'application de la même façon : un partage ou un lecteur réseau
> (`\\localhost\C$\app`) à la place du chemin d'un lecteur (`C:\app`), ou l'inverse, n'est pas reconnu comme
> l'application. Pour une preuve ou une dépendance, sur un montage Linux insensible à la casse (ext4 avec casefold,
> DrvFs de WSL), un fichier de l'application écrit dans une autre casse peut être jugé hors de l'application : le
> pire cas est un faux « hors de l'application », jamais un fichier lu hors de l'application.

## Pour aller plus loin

- [Commandes : rédiger et vérifier](#/reference/cli/write-check~doc-kit-sync) : chaque option, en détail.
- [Reprendre une application vibe-codée](#/spaces/takeover) : les pages que `sync` garde honnêtes.
- [Coût et vitesse](#/skill/cost-and-speed) : `doc-kit context --update` lit ce rapport pour briefer un agent.
