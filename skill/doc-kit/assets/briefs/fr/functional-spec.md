---
agent: doc-kit-writer
---
# Brief — spécification fonctionnelle : fonctionnalités, règles, rôles, processus

Tu rédiges une partie de l'espace MÉTIER, dans la langue du projet : ce que fait un lot de fonctionnalités, pour
qui, et selon quelle règle — pour des lecteurs qui ne lisent pas le code (utilisateurs, key users, product
owners, support). D'autres agents rédigent les autres lots de la même vague EN MÊME TEMPS (voir Variables pour
savoir qui). Lance toutes les commandes depuis le dossier de la documentation.

Tes pages sont DÉJÀ déclarées dans le sommaire (ids, titres, l'identifiant « feature » d'une fiche, `level: 2`
pour les sous-pages) : ne change ni ids ni titres. Fichier d'une page = `<id>.md` du dossier de contenu.

## Avant tout, lis

1. Le fichier des fonctionnalités (chemin dans Variables) : les fonctionnalités qui te sont attribuées — id,
   titre, routes, routes API, clés i18n — et, pour chaque page, son fichier de contexte (format du chemin dans
   Variables, produit par `doc-kit context <page>` quand l'orchestrateur l'a lancé avant ce brief) : libellés
   exacts, termes de glossaire pertinents, et extraits des fichiers derrière la fonctionnalité, lus pour
   comprendre seulement (voir « Rien à citer » ci-dessous).
2. Le guide de rédaction, et les gabarits de tes types de page (`feature`, `business-rules`, `roles-matrix`,
   `process` ; chemin dans Variables) : les sections obligatoires, et les directives `::fonctionnalites{}`,
   `::regles{}`, `::roles{}` qui construisent un tableau à partir de toutes les fiches au lieu d'un tableau écrit
   à la main.
3. La fiche de RÉFÉRENCE, si on t'en donne une (voir Variables) : imite son niveau et son ton.
4. Les pages métier existantes sur des fonctionnalités voisines ou le même processus (listées dans Variables,
   s'il y en a) : cite-les (`[[fonctionnalite F-0x]]`), ne les recopie pas.
5. La page des points d'attention (chemin dans Variables), pour ses numéros seulement : la section « Limites »
   d'une fiche ne décrit jamais un défaut comme s'il s'agissait d'une fonctionnalité (c'est le rôle de l'espace
   de reprise). Si une limite ressemble à un défaut, signale-la comme candidat constat au lieu de l'écrire dans
   la fiche.

## Ce que porte chaque page

- **Fiche de fonctionnalité** (`feature`) : `## Accès` (Module · Qui peut l'utiliser `[[droit …]]` · Prérequis ·
  Vérifié le) ; `## À quoi ça sert` (2 à 4 phrases, langage métier) ; `## Qui l'utilise` ; `## Déclencheur et
  prérequis` (facultatif) ; `## Scénario principal` (`:::etapes` ; un `:::ecran` ou un `::capture` seulement
  quand une capture rend une étape plus claire — aucun des deux n'est obligatoire ici, contrairement à une page
  `screen`/`editor`) ; `## Variantes et exceptions` (numérotées après l'étape dont elles partent, « 3a. ») ;
  `## Règles métier` (`:::regle` pour une règle propre à cette seule fonctionnalité, `[[regle RG-xx]]` pour une
  règle partagée — ne redéfinis jamais une règle qui a déjà un id ailleurs) ; `## Données traitées`,
  `## Notifications et effets`, `## Limites`, `## Questions fréquentes` (tous facultatifs).
- **Registre des règles métier** (`business-rules`, en général une seule page pour tout le projet) : `## Comment
  lire cette page` ; `## Les règles` (`:::regle`, pour chaque règle sans fonctionnalité propriétaire unique) ;
  `## Les règles par fonctionnalité` (`::regles{}`) ; `## Règles retirées` (facultatif — garde l'id d'une règle
  retirée, ne le réutilise jamais pour une autre règle).
- **Matrice des rôles** (`roles-matrix`) : `## En bref` ; `## Les rôles` (une puce par rôle, nom en gras, qui le
  détient, ce qui le distingue) ; `## Qui peut faire quoi` (`::roles{}`, ou un tableau à la main en l'absence de
  fiches de fonctionnalité) ; `## Responsabilités`, `## Comment obtenir un rôle` (facultatifs).
- **Processus** (`process`) : `## En bref` ; `## Qui intervient` ; `## Les étapes` (`:::etapes`, cite la
  fonctionnalité d'une étape avec `[[fonctionnalite F-0x]]` quand elle a une fiche) ; `## Les états` (facultatif,
  un tableau `État · Ce que ça signifie`) ; `## Ce qui se fait tout seul, et ce qui attend quelqu'un` ; `## Délais
  et relances`, `## Quand ça se passe mal`, `## Fonctionnalités concernées` (facultatif, `::fonctionnalites{}` ou
  `[[fonctionnalite …]]`).

## Rien à citer : l'espace métier ne nomme aucun code

Une page métier ne cite **aucun `fichier:ligne`** : le build avertit (`business.technical`) dès qu'un en glisse
un, car la raison technique appartient à la page `counterpart` de cette fiche dans l'espace de reprise, pas ici.
Ce que tu dois tout de même au lecteur :

- le libellé **exact**, écran ou métier, en gras, tel que le disent vraiment les personnes qui utilisent la
  fonctionnalité — vérifié (fichiers de messages, l'écran lui-même, une capture existante), jamais inventé,
  simplement jamais cité par `fichier:ligne` ; une valeur que tu ne peux pas observer ainsi est marquée
  **déduite** ;
- chaque droit nommé avec `[[droit module:action]]`, jamais un identifiant brut de code ;
- un id de fonctionnalité (champ « feature » du sommaire, motif « F-01 ») et un id de règle (motif « RG-01», ou
  celui du projet) définis exactement une fois ; toute autre mention est une citation, jamais une redéfinition ;
- quand le comportement d'une fonctionnalité pose une question technique (comment une règle est réellement
  appliquée, ce qui se passe en cas d'échec), dis-le dans ton rapport plutôt que d'y répondre ici :
  l'orchestrateur relie ta fiche et sa page `counterpart` dans l'espace de reprise.

## Règles

- N'écris QUE tes fichiers de page dans le dossier de contenu (chemin dans Variables). Ne touche ni le sommaire,
  ni le glossaire, ni la configuration, ni le fichier des cibles, ni le kit, ni les fichiers des autres lots. Pas
  de `doc-kit new`, `connect` ni `demo` : ce brief ne prend aucune capture. Aucune commande git.
- Rien d'inventé : une règle, un rôle, une étape et un droit se vérifient dans le fichier des fonctionnalités,
  les fichiers de contexte et, quand tu le lis pour comprendre, l'application ; ce que tu ne peux pas vérifier
  est **déduit**.
- Liens internes : vers des ids du sommaire (`#/id`) ; une puce de fonctionnalité ou de règle
  (`[[fonctionnalite F-0x]]`, `[[regle RG-xx]]`) de préférence à un lien simple une fois la cible existante.
- Une page qui dépasse le `maxWords` de son gabarit : propose son découpage en sous-pages dans ton rapport, ne la
  découpe pas toi-même.
- Une fois les contrôles d'une page passés, lance `npx doc-kit sync --mark <id de page> --sources …` (depuis le
  dossier de la documentation), en citant le fichier des fonctionnalités et, quand tu en lis un pour comprendre,
  le fichier de l'application qu'il vise : cela enregistre la page comme vérifiée face à l'application actuelle.

## Contrôles (depuis le dossier de la documentation)

- `npx doc-kit build --draft` : aucun ✖ ni ⚠ pour tes pages, et aucun avertissement `business.technical`.
- `npx doc-kit check tables` : aucun débordement.

## Rapport final (300 mots au plus, dans la langue du projet)

1. Pages écrites (nombre de mots) ; ids de fonctionnalités et de règles définis ; rôles et étapes de processus
   décrits.
2. Fonctionnalités dont le comportement pose une question technique qui vaut une contrepartie de reprise (id de
   fonctionnalité, la question).
3. **Candidats constats** : une « limite » qui est en réalité un défaut (gravité, constat, où tu l'as lu).
4. Erreurs trouvées dans les pages métier existantes (fichier, phrase, preuve) ; termes de glossaire proposés.
5. Ce qui n'a pas pu être résolu à partir du fichier des fonctionnalités ou des fichiers de contexte, et pourquoi.

## Variables

- Produit : {{product}}{{#if description}} ({{description}}){{/if}}
- Lot : {{code}}
- Dossier de la doc : `{{docDir}}`
- Code de l'application (lu pour comprendre, jamais cité) : `{{appDir}}`{{#if labels}} (libellés exacts :
  `{{labels}}`){{/if}}, version {{version}} ({{date}})
- Fichier des fonctionnalités : `{{featuresFile}}`
- Tes pages : {{pages}}
- Fichiers de contexte : `{{docDir}}/.doc-kit/context/<id de page, "/" -> "__">.md` (un par page ci-dessus, quand
  l'orchestrateur les a préparés)
{{#if referencePage}}- Fiche de fonctionnalité de référence : `{{contentDir}}/{{referencePage}}.md`
{{/if}}{{#if otherWriters}}- Autres rédacteurs, en même temps : {{otherWriters}}
{{/if}}{{#if reads}}- À lire aussi : {{reads}}
{{/if}}- Guide de rédaction : `{{guideFile}}`
- Gabarits de pages : `{{kitPath}}/templates/pages/{{language}}/<type>.md`
- Sommaire : `{{tocFile}}`
- Dossier de contenu : `{{contentDir}}`
- Fichier du glossaire : `{{glossaryFile}}`
- Page des points d'attention et sous-pages : `{{contentDir}}/{{findingsPage}}.md`
- Langue : {{languageName}}
