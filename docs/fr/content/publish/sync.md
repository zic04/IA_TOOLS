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
de message qu'elle cite mot pour mot, et de ses tableaux `::faits`, de son `counterpart` et de ses `sources`
déclarées. `sync.json` vit à la racine du projet par défaut (`paths.sync`) et est **committé avec la
documentation**, comme `facts/*.json`.

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
| `labels` | La valeur d'un message cité a changé, ou sa clé a disparu | `--apply --labels` corrige |
| `captures` | Les fichiers de la route ont changé, l'entrée de plan a changé, ou la capture est périmée | Reprendre : `capture --stale --compare` |
| `new` | Une route, une route API, une table… que la référence n'a jamais vue | La documenter |
| `removed` | Un élément qu'une page écrite cite encore, disparu de l'application | Corriger les pages listées |
| `unchanged` | Une page marquée, aucune de ses dépendances n'a bougé | Retamponnée par `--apply` |
| `unmarked` | Une page écrite jamais marquée | `--mark` une fois vérifiée (seulement un avertissement, ne bloque jamais `--check`) |

Une page peut apparaître dans plusieurs catégories à la fois (`proofs.moved` et `captures`, par exemple), mais au
plus une fois dans `review` ou `unchanged`.

## Corriger automatiquement : `--apply` et `--labels`

```bash
doc-kit sync --apply
doc-kit sync --apply --labels
```

`--apply` réécrit le `fichier:ligne` d'une preuve déplacée partout où elle est citée, et retamponne chaque page
que l'exécution laisse inchangée. `--labels` va plus loin : il remplace l'ancienne valeur d'un message par la
nouvelle, mais **seulement** dans `**gras**`, les blocs de code, les badges `[[menu …]]` et les guillemets —
jamais dans la prose ordinaire, où une phrase humaine dépend de l'ancienne formulation. Rien ici ne touche jamais
la prose : une page dont le sujet a changé a toujours besoin d'une personne.

## Une barrière pour l'intégration continue : `--check`

```bash
doc-kit sync --check
```

Code de sortie 1 dès qu'une catégorie autre que `unchanged` et `unmarked` n'est pas vide — « la documentation est
en retard sur l'application ». `unmarked` ne fait qu'avertir, pour qu'un projet puisse adopter `sync` page par
page plutôt que de tout marquer d'un coup.

## Comparer avec un commit plutôt qu'avec la référence

```bash
doc-kit sync --since v2.3.0
```

Lit les fichiers, preuves et libellés de l'application **à ce commit** plutôt que depuis `sync.json`, par un git en
lecture seule. `new` et `removed` sont toujours vides de cette façon : les adaptateurs de couverture ne sont pas
relancés à un ancien commit, seul le contenu des fichiers l'est.

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

> [!NOTE] git n'est jamais qu'en lecture
> `--since`, et le commit affiché par un fichier de faits périmé, viennent de `git show` et `git diff` dans
> l'application — jamais une écriture. Sans git, le rapport s'exécute encore ; il perd seulement ce que git aurait
> ajouté.

## Pour aller plus loin

- [Commandes : rédiger et vérifier](#/reference/cli/write-check~doc-kit-sync) : chaque option, en détail.
- [Reprendre une application vibe-codée](#/spaces/takeover) : les pages que `sync` garde honnêtes.
- [Coût et vitesse](#/skill/cost-and-speed) : `doc-kit context --update` lit ce rapport pour briefer un agent.
