# Brief — diagnostic par symptôme ({{product}}, code {{code}})

Tu rédiges, en {{languageName}}, le **diagnostic par symptôme** du site de documentation du produit **{{product}}**{{#if description}} ({{description}}){{/if}}.
Une personne d'exploitation ou de support part d'un message ou d'un comportement observé ; elle doit trouver les causes
probables, ce qu'il faut vérifier, comment corriger, et où comprendre le mécanisme.

- Dossier de la doc : `{{docDir}}`. Code : `{{appDir}}`{{#if labels}} (libellés exacts : `{{labels}}`){{/if}}, version {{version}}.
- Tes pages sont DÉJÀ déclarées dans `{{tocFile}}` (une page parente et des sous-pages `level: 2` par domaine) : ne
  change ni ids ni titres. Tes pages : {{pages}}
- Ton schéma : `{{diagramsDir}}/{{diagram}}.svg`.

## Lis d'abord

1. `{{guideFile}}`, et les gabarits `troubleshooting` et `troubleshooting-area` :
   `{{kitPath}}/templates/pages/{{language}}/`.
2. Les pages qui expliquent les mécanismes : volet Reprendre (sécurité, exploitation, intégrations, IA…), pages
   d'administration, parcours de bout en bout s'ils existent{{#if reads}} ; en particulier : {{reads}}{{/if}}. Cite-les, ne
   les recopie pas, et revérifie dans le code ce que tu affirmes.
3. `{{contentDir}}/{{findingsPage}}.md` et ses sous-pages : un symptôme qui vient d'un constat existant le cite par son
   numéro, avec un lien.

## Où trouver les symptômes

- Les **messages exacts** affichés : le fichier de libellés et les chaînes d'erreur du code. Vérifie quelle page
  d'erreur s'affiche réellement : une frontière d'erreur ne capte pas toujours les erreurs de son propre gabarit de
  mise en page.
- Le **journal d'audit** : les actions écrites, et les raisons écrites en cas d'échec (`fichier:ligne` de l'écriture).
- Les **journaux du serveur** : les préfixes des lignes écrites par le code (par exemple `[auth]`, `[search]`), avec
  leur fichier.
- Les **écrans d'administration** qui montrent un état : santé d'une tâche planifiée, configuration effective,
  compteurs.
- Les **tâches planifiées** et les **services externes** : ce qui ne se passe pas quand ils sont absents.

## Gabarit

**Page parente** : `## En bref` ; `## Le schéma` (`::schema{id="{{diagram}}" titre="…"}` : par où commencer — quelques
questions préalables, puis les familles de symptômes, chacune avec ses premières vérifications et sa sous-page) ;
`## Avant tout : les vérifications qui expliquent la moitié des symptômes` ; `## Où regarder` (écrans
d'administration, journal d'audit, journaux du serveur, requêtes de journaux) ; `## Dans cette partie` ;
`## Pour aller plus loin`.

**Sous-page par domaine** : `## En bref` (3 à 6 puces : les mécanismes qui expliquent presque tout) ; puis une section
`##` par famille et, pour chaque symptôme, `### « message exact »` (ou une description courte s'il n'y a pas de
message) :
- **Causes probables** : liste numérotée, chacune avec `fichier:ligne` ;
- **Vérifier** : la ligne de journal, l'action d'audit, l'écran, la valeur à regarder ;
- **Corriger** : le geste précis (réglage, variable, droit, appartenance à un groupe), jamais une modification du code ;
- **Comprendre** : liens vers les pages qui expliquent le mécanisme.

Une capture existante peut illustrer un symptôme (`:::ecran` avec autant d'éléments que de zones). Les intitulés exacts
et obligatoires sont ceux des modèles du kit.

## Requêtes de journaux

Si tu écris des requêtes (KQL, CloudWatch Logs Insights, Cloud Logging, Loki…), n'utilise que des noms de tables et de
champs vérifiés dans la documentation existante ou le code d'infrastructure. Une requête que tu n'as pas pu exécuter
est présentée comme telle (« non exécutée »).

## Captures et schéma

Aucune nouvelle capture : réutilise au plus 1 ou 2 captures existantes par page (regarde-les avec Read avant ;
`::capture` est refusé sur une capture qui a des zones). Schéma : `viewBox` de 900 de large, aucune couleur en dur,
classes de schéma `d-*` du site seulement (tableau dans `{{kitPath}}/standard/writing.fr.md`), identifiants de
`<marker>` préfixés par un code propre au schéma, texte de 11 à 14 px.

## Règles

- Rien d'inventé : chaque cause est vérifiée dans le code (`fichier:ligne`) ; messages copiés à l'identique ; ce qui
  est déduit est dit déduit. Les faits de PRODUCTION ne viennent que des pages existantes.
- Liens internes uniquement vers des ids de `{{tocFile}}` ; ancres seulement vers tes pages.{{#if otherWriters}} D'autres
  rédacteurs écrivent EN MÊME TEMPS : {{otherWriters}} ; lie leurs pages par id, sans ancre.{{/if}}
- N'écris QUE tes pages et ton schéma. Ne touche ni à `{{tocFile}}`, `{{glossaryFile}}`, au kit, aux autres pages, ni
  à l'application. Aucune commande git, aucun accès à la production.
- Défauts découverts : candidats dans ton rapport (constat, `fichier:ligne`, gravité proposée) ; s'il s'agit d'un
  constat existant, cite son numéro. Erreurs dans les pages existantes : signale-les, ne les corrige pas.

## Contrôles (depuis `{{docDir}}`)

- `npx doc-kit build --draft` : aucun ✖ ni ⚠ pour tes pages.
- `npx doc-kit check tables` : aucun débordement sur tes pages.
- Relecture du schéma en clair et en sombre (`npx doc-kit view "<id-parent>~le-schema" --theme dark --output …`) et
  d'une sous-page ; Read des images ; corrige ; supprime tes images.

## Rapport final ({{languageName}}, 300 mots au plus)

Pages écrites (mots) et nombre de symptômes par sous-page ; requêtes écrites (exécutées ou non) ; **candidats
constats** (gravité — constat — `fichier:ligne`) ; erreurs dans les pages existantes (fichier, phrase, preuve) ;
termes de glossaire proposés (avec une définition d'une phrase).
