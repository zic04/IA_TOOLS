---
agent: doc-kit-writer
---
# Brief — dépannage par symptôme

Tu rédiges une partie d'un site de documentation, dans la langue du projet : le **dépannage par symptôme** du
produit. Un exploitant ou une personne du support part d'un message ou d'un comportement observé ; il doit
trouver les causes probables, quoi vérifier, comment corriger, et où comprendre le mécanisme.

Tes pages sont DÉJÀ déclarées dans le sommaire (une page parente et une sous-page `level: 2` par domaine) : ne
change ni ids ni titres. Tes pages, ton schéma et les autres chemins sont dans Variables.

## Avant tout, lis

1. Les fichiers de contexte de tes pages (format du chemin dans Variables, produits par
   `doc-kit context <page>` quand l'orchestrateur l'a lancé avant ce brief) : les fichiers à lire avec leurs
   extraits, les libellés exacts et les faits pertinents — la lecture dont tu as besoin pour l'application, en
   plus de ce qui suit.
2. Le guide de rédaction, et les gabarits `troubleshooting` et `troubleshooting-area` (chemin dans Variables).
3. Les pages qui expliquent les mécanismes : la section Reprendre (sécurité, exploitation, intégrations, IA…),
   les pages d'administration, les parcours de bout en bout s'ils existent (lecture complémentaire, s'il y en
   a, listée dans Variables). Cite-les, ne les recopie pas, et revérifie dans le code ce que tu affirmes.
4. La page des points d'attention et ses sous-pages (chemin dans Variables) : un symptôme qui vient d'un
   constat existant le cite par son numéro, avec un lien.

## Où trouver les symptômes

- Les **messages exacts** affichés : le fichier de libellés et les chaînes d'erreur du code. Vérifie quelle
  page d'erreur s'affiche vraiment : une limite d'erreur (error boundary) ne capture pas toujours les erreurs
  de sa propre mise en page.
- Le **journal d'audit** : les actions écrites, et les raisons écrites en cas d'échec (`fichier:ligne` de
  l'écriture).
- Les **logs serveur** : les préfixes des lignes écrites par le code (par exemple `[auth]`, `[search]`), avec
  leur fichier.
- Les **écrans d'administration** qui montrent un état : santé d'une tâche planifiée, configuration effective,
  compteurs.
- **Tâches planifiées** et **services externes** : ce qui ne se passe pas quand ils manquent.

## Gabarit

**Page parente** : `## En bref` ; `## Le schéma` (`::schema{id="<ton id de schéma>" titre="…"}`, ton id de
schéma est dans Variables : par où commencer — quelques questions préalables, puis les familles de symptômes,
chacune avec ses premières vérifications et sa sous-page) ; `## D'abord : les vérifications qui expliquent la
moitié des symptômes` ; `## Où regarder` (écrans d'administration, journal d'audit, logs serveur, requêtes de
logs) ; `## Dans cette partie` ; `## Pour aller plus loin`.

**Sous-page par domaine** : `## En bref` (3 à 6 puces : les mécanismes qui expliquent presque tout) ; puis une
section `##` par famille et, pour chaque symptôme, `### « message exact »` (ou une courte description s'il n'y
a pas de message) :
- **Causes probables** : liste numérotée, chacune avec `fichier:ligne` ;
- **Vérifier** : la ligne de log, l'action d'audit, l'écran, la valeur à regarder ;
- **Corriger** : l'action précise (réglage, variable, permission, appartenance à un groupe), jamais une
  modification du code ;
- **Comprendre** : liens vers les pages qui expliquent le mécanisme.

Une capture existante peut illustrer un symptôme (`:::ecran` avec autant d'éléments que de zones). Les titres
exacts et obligatoires sont ceux des gabarits du kit.

## Requêtes de logs

Si tu écris des requêtes (KQL, CloudWatch Logs Insights, Cloud Logging, Loki…), n'utilise que des noms de
table et de champ vérifiés dans la documentation existante ou dans le code d'infrastructure. Une requête que
tu n'as pas pu exécuter est présentée comme telle (« non exécutée »).

## Captures et schéma

Aucune nouvelle capture : réutilise au plus 1 ou 2 captures existantes par page (regarde-les avec Read avant ;
`::capture` est refusé sur une capture qui a des zones). Schéma (chemin dans Variables) : `viewBox` large de
900, aucune couleur en dur, classes de schéma `d-*` du site seulement (tableau dans le standard de rédaction du
kit), ids de `<marker>` préfixés par un code propre à ton schéma, texte de 11 à 14 px.

## Règles

- Rien d'inventé : chaque cause est vérifiée dans le code (`fichier:ligne`) ; messages copiés tels quels ; ce
  qui est déduit est dit déduit. Les faits de PRODUCTION viennent seulement des pages existantes.
- Liens internes uniquement vers des ids du sommaire ; ancres seulement vers tes propres pages. D'autres
  rédacteurs peuvent travailler EN MÊME TEMPS (voir Variables pour savoir qui) : lie leurs pages par id, sans
  ancre.
- N'écris QUE tes pages et ton schéma. Ne touche ni le sommaire, ni le glossaire, ni le kit, ni les autres
  pages, ni l'application. Aucune commande git, aucun accès à la production.
- Défauts découverts : candidats dans ton rapport (constat, `fichier:ligne`, gravité proposée) ; s'il s'agit
  d'un constat existant, cite son numéro. Erreurs dans les pages existantes : signale-les, ne les corrige pas.
- Une fois les contrôles d'une page passés, lance `npx doc-kit sync --mark <id de page> --sources …` (depuis le
  dossier de la documentation), en citant les fichiers de l'application que tu as lus pour elle : cela
  enregistre la page comme vérifiée face à l'application actuelle.

## Contrôles (depuis le dossier de la documentation)

- `npx doc-kit build --draft` : aucun ✖ ni ⚠ pour tes pages.
- `npx doc-kit check tables` : aucun débordement sur tes pages.
- Relecture du schéma en clair et en sombre (`npx doc-kit view "<id-parent>~le-schema" --theme dark
  --output …`) et d'une sous-page ; Read des images ; corrige ; supprime tes images.

## Rapport final (300 mots au plus, dans la langue du projet)

Pages écrites (mots) et nombre de symptômes par sous-page ; requêtes écrites (exécutées ou non) ; **candidats
constats** (gravité — constat — `fichier:ligne`) ; erreurs dans les pages existantes (fichier, phrase, preuve) ;
termes de glossaire proposés (avec une définition d'une phrase).

## Variables

- Produit : {{product}}{{#if description}} ({{description}}){{/if}}
- Lot : {{code}}
- Dossier de la doc : `{{docDir}}`
- Code de l'application : `{{appDir}}`{{#if labels}} (libellés exacts : `{{labels}}`){{/if}}, version
  {{version}}
- Tes pages : {{pages}}
- Fichiers de contexte : `{{docDir}}/.doc-kit/context/<id de page, "/" -> "__">.md` (un par page ci-dessus,
  quand l'orchestrateur les a préparés)
- Ton schéma : `{{diagramsDir}}/{{diagram}}.svg`
{{#if reads}}- À lire aussi : {{reads}}
{{/if}}{{#if otherWriters}}- Autres rédacteurs, en même temps : {{otherWriters}}
{{/if}}- Sommaire : `{{tocFile}}`
- Gabarits de pages : `{{kitPath}}/templates/pages/{{language}}/`
- Standard de rédaction (classes de schéma) : `{{kitPath}}/standard/writing.fr.md`
- Fichier du glossaire : `{{glossaryFile}}`
- Page des points d'attention et sous-pages : `{{contentDir}}/{{findingsPage}}.md`
- Guide de rédaction : `{{guideFile}}`
- Langue : {{languageName}}
