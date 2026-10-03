## En bref

`doc-kit audit` mesure un site de documentation par rapport au standard : une seizaine d'**indicateurs**, le
**niveau de maturité** atteint (de 0 à 4), et, par ordre de priorité, **ce qu'il reste à faire** pour atteindre le
niveau suivant, avec les pages concernées. Avec des espaces déclarés, il donne aussi un niveau **par espace**, et
deux mesures qui n'influencent jamais le niveau : `facts` et `claims`.

1. Il construit le site en mémoire, en mode strict, et lit chaque page, le sommaire et les fichiers de zones.
2. Il écrit `.doc-kit/audit.md` (le rapport, dans la langue du projet) et `.doc-kit/audit.json` (les mêmes données),
   et affiche un résumé.
3. Son code de sortie vaut **0** : il informe, il ne bloque pas. Il ne vaut 2 que lorsque la configuration ne peut
   pas être lue.

## Le schéma

::schema{id="maturity" titre="Les quatre niveaux de maturité. Chaque niveau ajoute des critères à ceux des niveaux inférieurs ; le niveau 0 signifie que le niveau 1 n'est pas atteint."}

## Le résumé

Le résumé du squelette d'un nouveau projet (ses deux espaces déjà déclarés, métier et reprise) : ses 14 pages sont
des brouillons, écrits par `init` avec leurs consignes de gabarit, donc aucune n'est encore écrite.

```text
◆ Acme Orders — niveau 1 · Squelette (14 pages)
  Pages : 0 écrite sur 14 — 14 à écrire (0 sans fichier, 14 encore en consignes)
  ✖ written 0 % · ✔ typed 100 % · – conformant n/a · – completeness n/a · – annotated n/a · – coverage non mesuré · – proofs n/a · ✖ takeover 0 %
  – tooLong n/a · ✖ guidance 1 · – upToDateCaptures n/a · – upToDatePages n/a · ✖ glossary 2 · ✖ tours 1 · ✔ blocking 0 · – wideTables non mesuré

Prochain : niveau 2 · Utilisateur — 1 critère à remplir
  1. Écrivez les 4 pages pas encore écrites hors Reprendre (0 sans fichier, 4 encore en consignes) (utiliser/prise-en-main, fonctionnalites/exemple-fonctionnalite, configurer/editeur-exemple +1)
  + 5 actions pour les niveaux suivants : voir le rapport

→ rapport : .doc-kit/audit.md · données : .doc-kit/audit.json
```

## Les pages pas encore écrites

Une page **écrite** est une page déclarée dont le fichier existe et ne contient plus aucune consigne de gabarit. Une
page déclarée dans `toc.json` sans son fichier, ou dont le fichier contient encore des consignes (un brouillon), n'est
pas encore écrite, et **seul `written` la compte** :

- le build strict signale une seule fois une page sans fichier, `page pas encore écrite : <id>`, et ne contrôle ni
  les sections de son gabarit ni les ancres qui pointent vers elle (un avertissement avec `--draft`) ;
- `conformant`, `completeness`, `annotated`, `proofs`, `tooLong` et `takeover` ne mesurent que les pages écrites : les
  exemples d'un gabarit (un constat `C1` d'exemple, une preuve d'exemple) ne remplissent jamais un critère ;
- `coverage` compte ce que citent les pages écrites. Les `routes` d'une page pas encore écrite ne couvrent rien : le
  rapport donne à part la couverture « avec les pages pas encore écrites », et nomme la page qui prévoit chaque
  élément ;
- `blocking` laisse de côté les erreurs de build des pages pas encore écrites ; le rapport les affiche à côté.

La ligne « Pages : … à écrire » du résumé dit la distance entre le plan et la documentation écrite.

## Les indicateurs

| Indicateur | Ce qu'il mesure |
|---|---|
| `written` | Les pages déclarées qui sont écrites : fichier présent, plus aucune consigne de gabarit |
| `typed` | Les pages qui déclarent un `template` |
| `conformant` | Les pages typées écrites qui ont toutes leurs sections obligatoires |
| `completeness` | La part des sections du gabarit présentes, en moyenne sur les pages typées écrites |
| `annotated` | Les pages `screen` et `editor` écrites qui ont un `:::ecran` (tant qu'aucune page n'est typée : les pages écrites hors Reprendre) ; `n/a` avec `capture.mode: "none"` |
| `coverage` | Éléments cités par les pages écrites ÷ éléments inventoriés par les adaptateurs de couverture |
| `proofs` | Les pages de Reprendre écrites qui ont au moins une preuve `fichier:ligne` (`lib/orders.ts:42`, entre accents graves) |
| `takeover` | Les 7 pages obligatoires de Reprendre qui sont écrites |
| `tooLong` | Les pages écrites au-delà de leur `maxWords` (2 000 sans type) |
| `guidance` | Le texte de gabarit resté hors des pages : résumé provisoire de `doc-kit new` d'une page écrite, consigne dans l'accueil ou une introduction de section |
| `upToDateCaptures` | Les fichiers de zones dont la `version` est la version documentée courante |
| `upToDatePages` | Les pages marquées (`sync.json`, [Suivre l'évolution de l'application](#/publish/sync)) dont la `version` est la version courante, parmi les pages écrites ; `n/a` sans `sync.json` |
| `glossary` · `tours` | Termes du glossaire · parcours de la page d'accueil |
| `blocking` | Erreurs du build strict hors pages pas encore écrites + éléments qu'aucune page ne cite + secrets trouvés |
| `wideTables` | Les tableaux qui défilent à 1 440 px (chaque page est ouverte dans Chromium) |

## Les niveaux et leurs critères

| Niveau | Critères |
|---|---|
| **1 Squelette** | La configuration est valide · `doc-kit build --draft` réussit · chaque section a une page avec son fichier (un brouillon compte) · `home.md` existe · `glossary` ≥ 1 · `tours` ≥ 1 |
| **2 Utilisateur** | `written` ≥ 90 % hors Reprendre · `annotated` ≥ 80 % (ou n/a) · `coverage` ≥ 80 % (ou non mesuré) · aucun lien cassé et aucune légende différente de ses zones, même en mode brouillon |
| **3 Complet** | `written` = 100 % · `blocking` = 0 · `typed` ≥ 80 % · `conformant` = 100 % · `annotated` ≥ 90 % · `guidance` = 0 · `wideTables` = 0 · `glossary` ≥ 20 · `tours` ≥ 3 |
| **4 Reprise** | `takeover` = 7 · `proofs` ≥ 60 % · `completeness` ≥ 70 % · `tooLong` ≤ 5 % · `upToDateCaptures` ≥ 90 % (ou n/a) · `upToDatePages` ≥ 90 % (ou n/a) |

La section **Reprendre** est celle dont l'id est `reprendre` (ou `take-over`) ; sinon, la dernière section du plan
quand il y en a au moins deux. Ses 7 pages obligatoires sont : une vue d'ensemble de l'architecture (id qui se termine
par `/architecture`), un dossier d'architecture technique (type `architecture`), un parcours de bout en bout d'au
moins 3 étapes, une page d'exploitation (id qui contient `operations`, `deployment`, `exploitation` ou
`deploiement`), une page de diagnostic avec au moins 2 domaines, une page de points d'attention avec au moins un
constat numéroté (`C1`, `I1`…), et une page sur la maintenance de la doc (id qui se termine par `/maintenir-doc` ou
`/maintaining-docs`).

## Le niveau par espace

Avec `spaces` déclaré ([Deux espaces, une seule source](#/spaces/overview)), le rapport montre aussi une ligne par
espace :

```text
## Niveau par espace

| Espace | Pages | Niveau | Manque pour le niveau suivant |
|---|---|---|---|
| Pour le métier (`business`) | 4 | 1 Squelette | `written2` |
| Pour l'équipe de reprise (`takeover`) | 10 | 2 Utilisateur | `written3`, `guidance3`, `glossary3`, `tours3` |
```

- `written`, `typed`, `conformant`, `completeness`, `annotated`, `proofs` et `tooLong` sont mesurés seulement sur
  les pages de cet espace ; les indicateurs communs au projet (configuration, build, accueil, glossaire, parcours,
  couverture, blocages, tableaux trop larges, versions des captures et des pages) sont ceux déjà affichés au
  niveau global.
- Un critère qui ne concerne pas un espace compte comme rempli, affiché `n/a` : `written2` (pages hors Reprendre)
  dans l'espace Reprise ; `takeover4` et `proofs4` (les 7 pages obligatoires de Reprendre, les preuves sur ces
  pages) en dehors.
- **Le niveau global reste global** : toutes les pages, quel que soit leur espace. Un projet peut être au niveau 2
  dans l'ensemble alors que son espace métier atteint déjà le niveau 3 — utile pour savoir quel public est
  vraiment servi en premier. `audit.json` porte `spaces : [{ id, title, pages, level, indicators, criteria }]` ;
  sans espaces déclarés, rien ne change dans le rapport.

## Faits et affirmations (informatif)

Avec un espace reprise, deux mesures de plus sont affichées, **jamais** un critère de niveau — aucun site
antérieur à elles ne permet d'en observer un seuil :

```text
## Faits et affirmations

- 7 fichiers de faits, 1 périmé (plus ancien que le commit courant de l'application)
- 34 vérifiées, 9 déduites, 2 inconnues (taux vérifié : 79 %)
```

- `facts` : combien de fichiers `facts/<source>.json` existent
  ([Reprendre une application vibe-codée](#/spaces/takeover)), et combien sont **périmés** — leur commit
  enregistré diffère du `HEAD` courant de l'application. Corrigé par `doc-kit facts --source <nom>`.
- `claims` : combien de puces `[[verifie]]`, `[[deduit]]` et `[[inconnu]]` apparaissent dans les pages de reprise
  écrites, et le taux vérifiées ÷ (vérifiées + déduites). Un taux bas se corrige en lisant le code, jamais en
  changeant une puce.

`audit.md` n'affiche cette section que s'il y a quelque chose à signaler ; `audit.json` porte toujours `facts` et
`claims`.

## Comment l'audit décide

- **Non mesuré** (aucun adaptateur de couverture ne peut inventorier l'application ; pas de navigateur pour les
  tableaux, ou `DOC_KIT_NO_BROWSER=1`) : le critère est ignoré, jamais en échec, et le rapport dit comment le mesurer.
- **n/a** (rien à mesurer, comme `conformant` tant qu'aucune page n'est typée, ou `upToDatePages` avant le premier
  `doc-kit sync --mark --all`) : le critère est rempli.
- **Les actions** sont listées niveau par niveau, à partir du suivant ; dans un niveau, les plus rapides d'abord
  (renommer un titre, déclarer un type, retirer une consigne), les plus longues en dernier (écrire des pages, ajouter
  des preuves).
- **Les pages sans type** : le rapport nomme celles qui suivent déjà un gabarit, d'après leurs titres, et donne pour
  les autres le type le plus proche avec les sections qui leur manquent.

Ce site est audité lui aussi : `doc-kit audit` dans `docs/fr` donne son niveau.

## Dans un pipeline

`doc-kit audit --json` affiche le résultat complet : `level`, `indicators`, `criteria`, `actions`. Gardez
`.doc-kit/audit.md` comme artefact de la tâche, et faites échouer la tâche vous-même selon le niveau que vous exigez :

```bash
doc-kit audit --json > audit.json
node -e "process.exit(require('./audit.json').level >= 3 ? 0 : 1)"
```

## Pièges et écarts constatés

> [!NOTE] Pourquoi un site complet peut obtenir un niveau bas
> Un site écrit avant l'existence des types de page ne déclare aucun `template` : `typed` vaut 0 % et le site reste au
> niveau 2, même quand son contenu est complet. Déclarer les types, et renommer les quelques titres qui ne
> correspondent pas, révèle en général son vrai niveau sans rien réécrire.

> [!NOTE] Un navigateur pour les tableaux
> `wideTables` ouvre chaque page (environ 0,15 s par page). Sans Chromium, il est « non mesuré » ; avec
> `DOC_KIT_NO_BROWSER=1`, il est ignoré volontairement.

## Pour aller plus loin

- `standard/maturity.fr.md` dans le kit : les formules, les seuils et un exemple détaillé.
- [Les contrôles](#/publish/checks) : les contrôles bloquants derrière `blocking`.
- [Les gabarits de page](#/write/page-templates) : `typed`, `conformant` et `completeness`.
- [Deux espaces, une seule source](#/spaces/overview) : le tableau niveau par espace, en contexte.
- [Suivre l'évolution de l'application](#/publish/sync) : `upToDatePages`, marqué par `doc-kit sync --mark`.
- [Reprendre une application vibe-codée](#/spaces/takeover) : `facts` et `claims`, mesurés.
