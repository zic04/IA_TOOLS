## En bref

`doc-kit audit` mesure un site de documentation par rapport au standard : une quinzaine d'**indicateurs**, le
**niveau de maturité** atteint (de 0 à 4), et, par ordre de priorité, **ce qu'il reste à faire** pour atteindre le
niveau suivant, avec les pages concernées.

1. Il construit le site en mémoire, en mode strict, et lit chaque page, le sommaire et les fichiers de zones.
2. Il écrit `.doc-kit/audit.md` (le rapport, dans la langue du projet) et `.doc-kit/audit.json` (les mêmes données),
   et affiche un résumé.
3. Son code de sortie vaut **0** : il informe, il ne bloque pas. Il ne vaut 2 que lorsque la configuration ne peut
   pas être lue.

## Le schéma

::schema{id="maturity" titre="Les quatre niveaux de maturité. Chaque niveau ajoute des critères à ceux des niveaux inférieurs ; le niveau 0 signifie que le niveau 1 n'est pas atteint."}

## Le résumé

Le résumé du squelette d'un nouveau projet (lignes raccourcies ici) :

```text
◆ Acme Orders — niveau 2 · Utilisateur (9 pages)
  ✔ written 100 % · ✔ typed 100 % · ✔ conformant 100 % · ✔ completeness 95,6 %
  ✔ annotated 100 % · – coverage non mesuré · ✔ proofs 66,7 % · ✖ takeover 57,1 %
  ✔ tooLong 0 % · ✖ guidance 9 · ✔ upToDateCaptures 100 % · ✖ glossary 2
  ✖ tours 1 · ✖ blocking 8 · ✔ wideTables 0

Prochain : niveau 3 · Complet — 4 critères à remplir
  1. Rédigez, puis supprimez, les consignes de gabarit restées dans 9 pages (…)
  2. Corrigez les 8 erreurs du build strict (doc-kit build) (…)
  3. Ajoutez des parcours guidés (journeys dans content/toc.json) : 1 aujourd'hui, 3 attendus (2 de plus)
  4. Ajoutez des termes au glossaire : 2 aujourd'hui, 20 attendus (18 de plus)

→ rapport : .doc-kit/audit.md · données : .doc-kit/audit.json
```

## Les indicateurs

| Indicateur | Ce qu'il mesure |
|---|---|
| `written` | Les pages déclarées qui ont leur fichier |
| `typed` | Les pages qui déclarent un `template` |
| `conformant` | Les pages typées qui ont toutes leurs sections obligatoires |
| `completeness` | La part des sections du gabarit présentes, en moyenne sur les pages typées |
| `annotated` | Les pages `screen` et `editor` qui ont un `:::ecran` (tant qu'aucune page n'est typée : les pages hors Reprendre) |
| `coverage` | Éléments cités ÷ éléments inventoriés par les adaptateurs de couverture |
| `proofs` | Les pages de Reprendre qui ont au moins une preuve `fichier:ligne` (`lib/orders.ts:42`, entre accents graves) |
| `takeover` | Les 7 pages obligatoires de Reprendre qui sont présentes |
| `tooLong` | Les pages au-delà de leur `maxWords` (2 000 sans type) |
| `guidance` | Les pages qui contiennent encore une consigne de gabarit, ou le résumé provisoire de `doc-kit new` |
| `upToDateCaptures` | Les fichiers de zones dont la `version` est la version documentée courante |
| `glossary` · `tours` | Termes du glossaire · parcours de la page d'accueil |
| `blocking` | Erreurs du build strict + éléments non couverts + secrets trouvés |
| `wideTables` | Les tableaux qui défilent à 1 440 px (chaque page est ouverte dans Chromium) |

## Les niveaux et leurs critères

| Niveau | Critères |
|---|---|
| **1 Squelette** | La configuration est valide · `doc-kit build --draft` réussit · chaque section a une page écrite · `home.md` existe · `glossary` ≥ 1 · `tours` ≥ 1 |
| **2 Utilisateur** | `written` ≥ 90 % hors Reprendre · `annotated` ≥ 80 % · `coverage` ≥ 80 % (ou non mesuré) · aucun lien cassé et aucune légende différente de ses zones, même en mode brouillon |
| **3 Complet** | `blocking` = 0 · `typed` ≥ 80 % · `conformant` = 100 % · `annotated` ≥ 90 % · `guidance` = 0 · `wideTables` = 0 · `glossary` ≥ 20 · `tours` ≥ 3 |
| **4 Reprise** | `takeover` = 7 · `proofs` ≥ 60 % · `completeness` ≥ 70 % · `tooLong` ≤ 5 % · `upToDateCaptures` ≥ 90 % (ou n/a) |

La section **Reprendre** est celle dont l'id est `reprendre` (ou `take-over`) ; sinon, la dernière section du plan
quand il y en a au moins deux. Ses 7 pages obligatoires sont : une vue d'ensemble de l'architecture (id qui se termine
par `/architecture`), un dossier d'architecture technique (type `architecture`), un parcours de bout en bout d'au
moins 3 étapes, une page d'exploitation (id qui contient `operations`, `deployment`, `exploitation` ou
`deploiement`), une page de diagnostic avec au moins 2 domaines, une page de points d'attention avec au moins un
constat numéroté (`C1`, `I1`…), et une page sur la maintenance de la doc (id qui se termine par `/maintenir-doc` ou
`/maintaining-docs`).

## Comment l'audit décide

- **Non mesuré** (aucun adaptateur de couverture ne peut inventorier l'application ; pas de navigateur pour les
  tableaux, ou `DOC_KIT_NO_BROWSER=1`) : le critère est ignoré, jamais en échec, et le rapport dit comment le mesurer.
- **n/a** (rien à mesurer, comme `conformant` tant qu'aucune page n'est typée) : le critère est rempli.
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
