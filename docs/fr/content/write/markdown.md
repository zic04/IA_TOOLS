## En bref

Les pages sont écrites en **Markdown au format GitHub** (tableaux, blocs de code délimités, listes sans cases à cocher)
avec quelques extensions, dans `content/<id-de-page>.md`. La page n'a pas de titre `#` : il vient du sommaire.

1. **Des blocs avec un corps** : `:::ecran` (une capture annotée et sa légende) et `:::etapes` (des étapes numérotées).
2. **Des directives d'une ligne** : `::capture`, `::schema` et `::avant-apres`.
3. **Des encadrés** : `> [!ASTUCE]`, `> [!ATTENTION]`, `> [!ERREUR]`, `> [!DROITS]`, `> [!NOTE]`, `> [!RECETTE]`,
   `> [!MECANISME]`.
4. **Des badges en ligne** : `[[droit …]]`, `[[menu …]]`, `[[touche …]]`, `[[statut …]]`, `[[route …]]`, et ceux de
   l'espace Produit, `[[fonctionnalite …]]`, `[[regle …]]`, `[[recit …]]`.
5. **Des liens internes** : `#/id-de-page` et `#/id-de-page~ancre`, vérifiés par le build.
6. **Fonctionnalités, règles et rôles** (§6.8, l'espace Produit) : un bloc avec un corps, `:::regle`, et des tableaux générés, `::fonctionnalites`,
   `::regles`, `::roles` ; et, pour décrire une fonctionnalité en profondeur (§6.8a), `:::recit`, `:::comportement` et `:::scenario`.
7. **Faits et affirmations** (§6.9, le dossier de reprise) : `::faits` (un tableau à partir de `facts/<source>.json`) et les puces
   d'affirmation `[[verifie …]]`, `[[deduit …]]`, `[[inconnu …]]`.

Chaque extension a une graphie française et une graphie anglaise ; les deux sont acceptées dans tout projet, quelle
que soit sa langue.

## Titres, ancres et plan de la page

- Les titres `##` et `###` apparaissent dans **Sur cette page** et reçoivent une ancre : le titre en minuscules, sans
  accents, chaque suite d'autres caractères remplacée par `-`, 60 caractères au plus. « Étape 2 — Installer
  Chromium » donne `etape-2-installer-chromium`. Deux titres identiques : le second reçoit `-2`.
- Un titre `#` est affiché comme un `##` ; `####` et au-delà n'ont pas d'ancre.
- Les gabarits de page reconnaissent leurs sections au **début** des titres `##`
  ([Les gabarits de page](#/write/page-templates)).

## Écran annoté : `:::ecran`

```markdown
:::ecran{capture="orders-list" titre="Commandes · liste"}
1. **Filters** : statut, client et date.
2. **Today** : les commandes du jour, les commandes ouvertes et le total.
3. **New order** : crée une commande.
4. **La liste** : une ligne par commande.
:::
```

`capture` est l'id d'une capture (`images/<id>.webp` et `images/zones/<id>.json`) ; `titre` est affiché au-dessus de
l'image. La liste numérotée est la **légende** : l'élément *n* explique la pastille *n*, la liste doit donc avoir
**exactement** autant d'éléments que la capture a de zones, sinon le build échoue. Un paragraphe placé avant la liste
devient une légende sous l'image. Le bloc reçoit un bouton **Visite guidée**. Le rendu :
[Exemple · Page d'écran : la liste des commandes](#/examples/screen~l-ecran).

## Étapes : `:::etapes`

```markdown
:::etapes
1. Ouvrez [[menu Settings]].
2. Changez le **Theme**.
3. Cliquez sur **Save**.
:::
```

:::etapes
1. Ouvrez [[menu Settings]].
2. Changez le **Theme**.
3. Cliquez sur **Save**.
:::

## Capture, schéma, avant et après

| Directive | Attributs | Ce qu'elle montre |
|---|---|---|
| `::capture{id="…" titre="…"}` | `id`, `titre` (facultatif) | Une capture **sans** zones, avec un bouton **Agrandir** |
| `::schema{id="…" titre="…"}` | `id` (fichier `diagrams/<id>.svg`), `titre` : la légende | Un SVG intégré à la page, qui suit le thème |
| `::avant-apres{…}` | `avant`, `apres`, `libelle-avant`, `libelle-apres`, `titre` | Deux captures de même taille avec un curseur |

Une capture qui a des zones ne peut pas être affichée avec `::capture` : le build demande un bloc `:::ecran` et sa
légende.

```markdown
::capture{id="orders-open" titre="La liste après deux filtres"}
::schema{id="build" titre="Ce que le build lit et ce qu'il écrit."}
::avant-apres{avant="orders-all" apres="orders-open" libelle-avant="Toutes" libelle-apres="Filtrées" titre="Deux filtres"}
```

Le curseur se déplace à la souris, au doigt, ou avec les flèches gauche et droite du clavier :
[Cibles et actions](#/capture/targets-actions~actions) en montre un.

## Encadrés

Un encadré est une citation dont la première ligne commence par `[!TYPE]` ; le reste de cette ligne est le titre.
Sans titre, l'encadré prend le titre par défaut de son type, dans la langue du site.

| Français | Anglais | Titre par défaut | Usage |
|---|---|---|---|
| `[!ASTUCE]` | `[!TIP]` | Astuce | Un raccourci utile, jamais indispensable |
| `[!ATTENTION]` | `[!WARNING]` | Attention | Un piège ; le titre le dit en une ligne |
| `[!ERREUR]` | `[!CAUTION]` | Erreur bloquante | Une erreur et sa cause |
| `[!DROITS]` | `[!PERMISSIONS]` | Droits requis | Qui peut voir, enregistrer, lancer |
| `[!NOTE]` | `[!NOTE]` | À savoir | Où trouver un écran ; écarts constatés ; sources |
| `[!RECETTE]` | `[!RECIPE]` | Recette | Ce qu'il faut avant une recette |
| `[!MECANISME]` | `[!HOW]` | Comment ça marche | Le mécanisme réel, souvent en étapes numérotées |

```markdown
> [!ATTENTION] Un seul circuit actif par type de commande
> Activer un second circuit désactive le premier.
```

> [!ATTENTION] Un seul circuit actif par type de commande
> Activer un second circuit désactive le premier.

> [!MECANISME]
> Sans titre, l'encadré prend le titre par défaut de son type.

Un type inconnu (`[!DANGER]`) est un avertissement du build, et la citation est affichée avec ce mot pour titre.

## Badges

| Français | Anglais | Exemple | Rendu |
|---|---|---|---|
| `[[droit …]]` | `[[perm …]]` | `[[droit orders:approve]]` | [[droit orders:approve]] |
| `[[menu …]]` | `[[menu …]]` | `[[menu Orders › All orders]]` | [[menu Orders › All orders]] |
| `[[touche …]]` | `[[key …]]` | `[[touche Ctrl+Shift+K]]` | [[touche Ctrl+Shift+K]] |
| `[[statut …]]` | `[[status …]]` | `[[statut open]]` | [[statut open]] |
| `[[route …]]` | `[[route …]]` | `[[route /orders/[id]]]` | [[route /orders/[id]]] |

- `[[touche …]]` découpe sur `+` et affiche une touche par élément.
- `[[statut x]]` est coloré quand `statuses` déclare `x` dans `doc.config.mjs` (jeton de couleur ou couleur
  hexadécimale, et son libellé) ; sinon il affiche `x` dans un badge neutre.
- `[[route …]]` accepte des crochets à l'intérieur (`/orders/[id]`). Le contrôle de couverture trouve une route
  n'importe où dans le texte des pages, dans un badge ou non.

## Fonctionnalités, règles et rôles

Ces directives servent l'espace Produit (ARCHITECTURE.md §6.8), qui décrit chaque fonctionnalité pour les personnes
qui l'utilisent, en décident ou la soutiennent : aucun code, aucun `file:line`.

| Français | Anglais | Ce que ça fait |
|---|---|---|
| `:::regle{id="RG-01" titre="…"}` … `:::` | `:::rule{id="BR-01" title="…"}` … `:::` | Définit une règle métier une seule fois : un énoncé, puis un exemple « Étant donné / Quand / Alors ». Rendu comme un `h3` (l'id en minuscules), donc présent dans le plan de la page, l'index de recherche et comme cible de lien. |
| `[[fonctionnalite F-01]]` | `[[feature F-01]]` | Une puce-lien vers la fiche dont le champ `feature` (`content/toc.json`) correspond. |
| `[[regle RG-01]]` | `[[rule BR-01]]` | Une puce-lien vers l'endroit où la règle est définie. |
| `::fonctionnalites{}` | `::features{}` | Un tableau de chaque fiche de fonctionnalité : id, fonctionnalité (liée), résumé, qui (ses droits). |
| `::regles{}` | `::rules{}` | Un tableau de chaque règle : id (lié), règle, définie dans (lié), citée par. |
| `::roles{}` | `::roles{}` (même graphie) | Un tableau des droits de chaque fiche de fonctionnalité, une ligne par fiche, `✔` où un droit la débloque. |
| `::tableau{}` | `::board{}` | Le tableau Produit (carte ou liste des epics, fonctionnalités et récits, avec des filtres) — déjà sur l'accueil de l'espace Produit. |
| `::recits{}` | `::stories{}` | Un tableau de chaque récit utilisateur des fiches de fonctionnalité : id (lié), récit, fonctionnalité (liée), rôle, version (la sienne, sinon celle de sa fonctionnalité), critères d'acceptation, ticket (lié avec `backlog.refs`). |

```markdown
:::regle{id="RG-12" titre="Une commande au-dessus du seuil attend un responsable"}
Une commande dont le total atteint ou dépasse le seuil ne peut pas être expédiée avant qu'un responsable de sa
région ne la valide.

**Exemple.** **Étant donné** une commande de 12 000 €, **quand** l'acheteur la soumet, **alors** elle attend un responsable.
:::
```

Une citation et un tableau généré ne se résolvent qu'une fois que chaque page du build a été rendue, donc une règle
peut être définie sur une page plus loin dans le sommaire que celle qui la cite ; de même pour une fiche de
fonctionnalité. Un id inconnu (`feature.unknown`, `rule.unknown`) fait échouer un build strict ; une règle sans `id`
ni `titre` (`rule.attributes`) ou définie deux fois (`rule.duplicate`) aussi.

Une page déclare son propre identifiant de fonctionnalité avec le champ `feature` de `content/toc.json` (seulement
sur une page de gabarit `feature` ; une fiche par id, `feature.duplicate` sinon). `doc-kit inventory --features
[--write] [--force]` ([Commandes : démarrer et capturer](#/reference/cli/start-capture~doc-kit-inventory)) suggère
des fonctionnalités candidates à partir de ce que voient les adaptateurs de couverture, regroupées par le premier
segment statique de leurs routes, routes API ou clés i18n.

Le champ `technical` d'un terme du glossaire (où il vit dans le code) n'apparaît dans sa bulle que si le projet n'a
pas d'espaces, ou que l'espace courant est « tout » ou un espace dont le type l'affiche, `admin` ou `develop`
([Glossaire](#/write/glossary)) ; les exports des autres espaces (`use`, `product`) le retirent.

[Exemple · Fiche de fonctionnalité](#/examples/feature), [Exemple · Règles métier](#/examples/business-rules) et
[Exemple · Matrice des rôles](#/examples/roles-matrix) montrent chaque élément de cette section dans une vraie page.

## Une fonctionnalité en profondeur : stories, cartes, scénarios

Une fiche de fonctionnalité répond aux questions qu'un product owner et un testeur se posent sur chaque comportement
de la fonctionnalité, en langage métier (ARCHITECTURE.md §6.8a) : ses user stories, une carte par comportement, et
ses critères d'acceptation.

| Français | Anglais | Ce que ça fait |
|---|---|---|
| `:::recit{id="US-01" titre="…" role="…" depuis="1.2" ref="ADO#1234"}` … `:::` | `:::story{id="US-01" title="…" role="…" since="1.2" ref="…"}` … `:::` | Une user story : « En tant que …, je veux … afin de … ». Rendue comme un `h3` « US-01 · titre », avec son rôle, sa version, son ticket et le nombre de ses critères d'acceptation. |
| `:::comportement{type="recherche" titre="…" id="B-01"}` … `:::` | `:::behaviour{kind="search" title="…" id="B-01"}` … `:::` | Une carte de comportement : une ligne `Rubrique : valeur` par rubrique de son type, chacune affichée avec son état. Le titre est un `h3`. |
| `:::scenario{titre="…" recit="US-01" comportement="B-01"}` … `:::` | `:::scenario{title="…" story="US-01" behaviour="B-01"}` … `:::` | Un critère d'acceptation : une étape par ligne, `Soit`, `Quand`, `Alors`, `Et`, `Mais` (`Given`, `When`, `Then`, `And`, `But`), relié à sa story et à sa carte. |
| `[[recit US-01]]` | `[[story US-01]]` | Une puce-lien vers la story. |

```markdown
:::comportement{type="recherche" titre="Retrouver une commande par client" id="B-01"}
Où : le champ **Client**, au-dessus de la liste.
Champs cherchés : le nom du client seulement.
Correspondance : contient, sans tenir compte des majuscules ; les accents comptent : « cafe » ne trouve pas « Café du Port ».
Plusieurs mots : une seule expression, telle que tapée.
Déclenchement : à chaque frappe.
Ordre des résultats : Sans objet — l'ordre envoyé par l'application est gardé.
Aucun résultat : le tableau reste vide, sans message.
Droits : Inconnu — les résultats se limitent-ils à la région du lecteur ?
:::

:::scenario{titre="Les accents comptent" recit="US-02" comportement="B-01"}
Soit la commande du « Café du Port »
Quand je tape « cafe » dans **Client**
Alors aucune commande n'apparaît
:::
```

- **Types** (`standard/behaviours.json`) : `recherche`, `filtre`, `tri`, `pagination`, `liste`, `formulaire`,
  `import`, `export`, `calcul`, `notification`, `circuit`, `traitement-planifie`, `controle-droits` — ou leurs noms
  anglais (`search`, `filter`, `sort`, `list`, `form`, `calculation`, `workflow`, `scheduled-job`,
  `permission-check`…). Chacun liste ses rubriques, obligatoires ou non, avec ce que chacune doit dire. Un projet ajoute
  ses propres types avec `behaviours.file` ([Réglages du projet](#/reference/configuration/project)).
- **Rubriques** : le libellé en français ou en anglais, en début de ligne, en gras ou en élément de liste si vous
  voulez (`- **Champs cherchés** : …`) ; une valeur peut continuer sur les lignes suivantes, jusqu'à la rubrique
  d'après — une ligne en retrait continue toujours la valeur (une sous-liste sous « Colonnes : » y reste). Le texte
  avant la première rubrique présente la carte.
- **Réponses** : `Sans objet — raison` (ou `n/a`, `non applicable`) quand une rubrique ne s'applique pas ;
  `Inconnu — la question` (ou `à confirmer`, `unknown`) quand personne ne sait encore — la question va aussi dans
  « Questions ouvertes ». Le mot est seul ou suivi d'un séparateur (`—`, `-`, `:`, `.`, `;`, `,`) : « Inconnu
  au bataillon, le client n'est pas listé » est une réponse. Une rubrique obligatoire omise est affichée comme manquante et signalée
  (`behaviour.missing`, un avertissement ; une erreur du build strict avec `behaviours.strict`).
- **Contrôles** : une carte sans `type` ou sans `titre` (`behaviour.attributes`), d'un type inconnu
  (`behaviour.kind`), un id défini deux fois (`behaviour.duplicate`, `story.duplicate`), une story sans `id` ou
  sans `titre` (`story.attributes`), un scénario sans titre (`scenario.attributes`) ou qui nomme une story ou une
  carte inexistante (`story.unknown`, `behaviour.unknown`) font échouer un build strict ; un scénario sans `Alors`
  après un `Soit` ou un `Quand` est un avertissement (`scenario.steps`).

Un scénario se rattache par ses attributs, jamais en étant imbriqué dans une story ou une carte : les trois blocs
sont côte à côte dans leurs sections (« User stories », « Comportements », « Critères d'acceptation »).

## Faits et affirmations

Le dossier de reprise (ARCHITECTURE.md §6.9), écrit pour l'espace Développer, réunit ce dont une équipe a besoin
pour reprendre une application : chaque affirmation s'appuie sur une preuve (`file:line`), ou est marquée déduite ou inconnue.

| Français | Anglais | Ce que ça fait |
|---|---|---|
| `::faits{source="…" colonnes="…"}` | `::facts{source="…" columns="…"}` | Un tableau à partir de `facts/<source>.json`, écrit par `doc-kit facts` : une ligne par élément, une colonne par clé listée (en-tête traduit quand il est connu), les listes jointes par des virgules, les booléens `✔` / `—`. Une légende donne la date de génération et le commit de l'application. |
| `::mcd{titre="…" tables="…"}` | `::erd{…}` | Le schéma entité-relation, tiré de `facts/db.json` : une boîte par table, une flèche par référence. `tables` ne garde que certaines tables. |
| `::modules{limit="10"}` | `::modules{…}` (même orthographe) | Le graphe des imports, tiré de `facts/modules.json` : sa taille, chaque cycle d'import, les fichiers dont le plus de code dépend (`limit` lignes) et les fichiers orphelins. |
| `::points-chauds{limit="10"}` | `::hotspots{…}` | Les fichiers qui changent le plus souvent **et** sont les plus complexes (commits × complexité, `facts/history.json` × `facts/quality.json`), avec leur auteur principal, et le bus factor. |
| `::sante{}` | `::health{}` | L'état de l'application en une vue : notes, sécurité, tests, architecture, connaissance, dépendances, outillage (une carte indique « non mesuré » quand ses faits manquent), puis les dix principaux risques trouvés dans les faits. |
| `::c4{titre="…"}` | `::c4{…}` (même orthographe) | La vue des conteneurs de l'application : les utilisateurs, un conteneur par dossier dont le manifeste nomme un framework (Next.js, React, FastAPI, Express…), la base de données, et les systèmes externes trouvés dans les variables d'environnement et les paquets (Stripe, OpenAI, AWS…), chacun avec sa preuve. Tirée de `facts/dependencies.json` (obligatoire), `env.json` et `db.json`. |
| `::c4{vue="deploiement" titre="…" limit="10"}` | `::c4{view="deployment" …}` | La vue de déploiement : une colonne par environnement (production, préproduction…) avec ses points d'entrée, ses charges de travail et tâches et ses ressources cloud, les pipelines qui déploient vers chacun, puis une ligne par élément avec ses réglages (réplicas, image et étiquette, ports, root, TLS, ouvert à tous, planification) et son `fichier:ligne`. Tirée de `facts/infra.json` (obligatoire, `doc-kit facts --source infra`). |
| `[[verifie …]]` | `[[verified …]]` | Une petite puce : l'affirmation a été vérifiée directement dans le code. Le texte après le mot est facultatif : un simple `[[verifie]]`, ou `[[verifie lib/orders.ts:42]]` avec sa preuve. |
| `[[deduit …]]` | `[[deduced …]]` | L'affirmation découle de ce qui a été lu, sans vérification directe ligne par ligne. |
| `[[inconnu …]]` | `[[unknown …]]` | Personne n'a pu le dire, dans le temps disponible pour la reprise. |

```markdown
::faits{source="api" colonnes="method,route,file"}

La route accepte tout utilisateur connecté, de n'importe quelle région ([[verifie lib/orders.ts:42]]) ; si tous les
appelants passent bien par elle d'abord est [[inconnu]].
```

Une source qui n'est pas le nom d'un fichier de faits (`facts.source` : minuscules, chiffres et tirets, jamais un
chemin), une source inconnue (`facts.missing` : lancez d'abord `doc-kit facts`) ou une colonne qu'aucun élément ne
possède (`facts.column`) fait échouer un build strict, tout comme un `::schema` dont l'`id` n'est pas le nom d'un
fichier SVG de `diagrams/` (`diagram.id`, la même règle). [Commandes : écrire et
vérifier](#/reference/cli/write-check~doc-kit-facts) liste les sept sources. Les dix types de pages de reprise
([Les gabarits de page](#/write/page-templates)) sont construits autour de ces deux syntaxes : [Exemple · Surface
d'API](#/examples/api-surface), [Exemple · Dépendances](#/examples/dependencies) et les autres exemples de la
reprise les montrent dans une vraie page.

## Liens

- Vers une page : `[Les plans de capture](#/capture/plans)`. Vers une section :
  `[les cibles](#/capture/targets-actions~cibles)`.
- Le build vérifie chaque lien de chaque page : une page ou une ancre inconnue est une erreur (un avertissement avec
  `--draft`).
- Les liens de la page d'accueil et des introductions de section ne sont pas vérifiés : gardez-les peu nombreux.
- Les liens ordinaires (`https://…`) s'ouvrent comme d'habitude ; le site ne charge rien de lui-même.

## Tableaux, code et le reste

- Les tableaux sont enveloppés pour défiler à l'intérieur de la colonne de lecture ; `doc-kit check tables` signale
  ceux qui défilent à 1 440 px. Un code long dans une cellule reçoit des points de coupure après `/`, `.`, `_`, `?`,
  `=` et `,`.
- Les blocs de code délimités gardent le nom de leur langage (`bash`, `js`, `json`…) comme classe, sans coloration.
- Les commentaires HTML ne sont pas affichés. Les commentaires de consigne laissés par un gabarit (un commentaire HTML
  qui commence par `consigne :`) sont signalés par le build et par `doc-kit audit`.
- Les images en Markdown (`![…](…)`) ne sont pas embarquées : utilisez des captures, pour que le fichier reste
  autonome.

## Pièges et écarts constatés

> [!ATTENTION] Comptez les éléments de la légende
> Une légende de `:::ecran` avec un élément de trop ou de moins fait échouer le build strict : « écran « orders-list » :
> 4 zone(s) capturée(s) mais 3 élément(s) dans la légende ». Modifiez ensemble la légende et les `zones` du plan.

> [!NOTE] Graphie des attributs
> Les attributs suivent la graphie de la directive. En français : `:::ecran{capture="…" titre="…"}`,
> `::avant-apres{avant="…" apres="…" libelle-avant="…" libelle-apres="…" titre="…"}` ; en anglais :
> `:::screen{capture="…" title="…"}`, `::before-after{before="…" after="…" before-label="…" after-label="…" title="…"}`.
> Le mélange est accepté : un attribut anglais l'emporte sur son jumeau français.

## Pour aller plus loin

- [Les gabarits de page](#/write/page-templates) : les sections que chaque type de page doit avoir.
- [Zones, union et légendes](#/capture/zones) : d'où viennent les pastilles d'un bloc `:::ecran`.
- [Les schémas](#/write/diagrams) : dessiner un SVG avec les classes du site.
- [Exemple · Page d'écran : la liste des commandes](#/examples/screen) : chaque élément de syntaxe dans une vraie page.
