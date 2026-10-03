---
agent: doc-kit-writer
---
# Brief — lot de rédaction : rédaction et captures

Tu rédiges une partie d'un site de documentation, dans la langue du projet, en plusieurs pages. D'autres agents
rédigent les autres lots de la même vague EN MÊME TEMPS (voir Variables pour qui). Chaque lecture et chaque
commande coûtent : respecte le budget d'étapes ci-dessous plutôt que d'explorer. Lance toutes les commandes
depuis le dossier de la documentation. Tes ids de capture suivent `<préfixe>-<nom>`, en kebab-case (ton préfixe :
voir Variables).

## Méthode

### Par page, au plus 3 lectures en plus du dossier de contexte

1. Lis le fichier de contexte de la page (déjà préparé par l'orchestrateur avec `doc-kit context`, chemin dans
   Variables), puis le fichier de la page dans le dossier de contenu : c'est son gabarit, avec ses sections et
   ses consignes.{{#if reads}} En plus du dossier de contexte, l'orchestrateur te donne : {{reads}} (hors budget
   des 3 lectures ci-dessous).{{/if}}
2. S'il manque une information indispensable (un extrait coupé, un composant dont dépend un libellé) : AU PLUS 3
   lectures supplémentaires, sur des plages de lignes utiles — le guide de rédaction (`{{guideFile}}`) ou la page
   de référence (`{{contentDir}}/{{referencePage}}.md`) comptent dans ce budget si tu dois y recourir pour un
   point de niveau ou de syntaxe que les règles ci-dessous ne couvrent pas.
3. {{#if captureMode!=none}}Capture(s) de cette page : voir « Captures » ci-dessous (plan, aperçu, zones), pour
   connaître leurs ids avant de citer `:::ecran{capture="…"}`.{{/if}}
4. Écris la page en UNE fois avec l'outil Write, en remplaçant tout le gabarit. Aucune consigne `<!-- guidance`
   ni `<!-- doc-kit:prefill` ne doit rester.

### Par lot, une fois toutes tes pages écrites

5. UNE fois `npx doc-kit build --draft` et `npx doc-kit check tables`, puis UNE seule modification corrigeant les
   avertissements qui concernent tes pages (jamais « une page métier cite une preuve technique » : laisse-la,
   signale-la).
6. {{#if captureMode!=none}}Relecture visuelle : au moins une page de ton lot, au plus une image par page —
   `npx doc-kit view <id-page> --output .doc-kit/<ton-code>-<nom>.png` ; Read l'image ; corrige si besoin ;
   supprime-la ensuite.{{/if}}
7. Pour chaque page dont les contrôles passent : `npx doc-kit sync --mark <id de page> --sources …`, en citant
   les fichiers de l'application que tu as lus pour elle (les directs d'abord). Cela l'enregistre comme vérifiée
   face à l'application actuelle.

Un agent qui déborderait de ce budget s'arrête et le signale dans son rapport, plutôt que de continuer à
explorer.

## Règles d'écriture (le standard, condensé)

- **Exactitude** : les libellés de l'interface sont écrits exactement comme dans le code, en gras. Tout
  comportement affirmé porte sa preuve `fichier:ligne`, sur une ligne que tu as vue (dossier de contexte ou
  lecture). Ce qui est déduit sans être vu est dit déduit. Rien n'est inventé : vérifie toujours dans le code,
  jamais dans la doc existante (l'inventaire de l'orchestrateur l'a signalée périmée en amont).
- **Sections** : celles du gabarit, dans son ordre ; les sections exigées sont toutes présentes. Une section
  optionnelle sans matière peut être omise.
- **L'écran** : {{#if captureMode=none}}pas de capture (projet sans capture). Un tableau par panneau ou fenêtre
  (`###` pour chacun), `| Élément | Ce qu'il montre |`, dans l'ordre de lecture (de haut en bas, puis de gauche à
  droite) : chaque ligne donne le libellé exact en gras, puis son rôle, ses valeurs, son défaut et son effet, en
  1 à 3 phrases, lus dans le code (composants, fichiers de traduction).{{/if}}{{#if captureMode!=none}}une
  capture annotée par panneau (`:::ecran{capture="id" titre="…"}`), avec une légende d'EXACTEMENT autant
  d'éléments que de zones, dans l'ordre de lecture.{{/if}}
- **Syntaxe** : encadrés `> [!ASTUCE]`, `> [!ATTENTION]`, `> [!ERREUR]`, `> [!DROITS]`, `> [!NOTE]`,
  `> [!RECETTE]`, `> [!MECANISME]` (titre sur la même ligne ; les formes anglaises `[!TIP]`, `[!WARNING]`,
  `[!CAUTION]`, `[!PERMISSIONS]`, `[!RECIPE]`, `[!HOW]` sont acceptées aussi) ; puces `[[droit …]]`,
  `[[menu A › B]]`, `[[touche …]]`, `[[statut …]]`, `[[route …]]` ; étapes numérotées `:::etapes` … `:::` ; liens
  internes `#/identifiant-de-page`, uniquement vers des ids du sommaire (ancre `#/id~ancre` seulement vers TES
  pages).
- **Style** : phrases courtes, ton professionnel, pas de remplissage ; le mécanisme réel, lu dans le code ;
  jusqu'au `maxWords` du gabarit de ce type de page (sans minimum — une page courte et exacte vaut mieux qu'une
  page remplie) — au-delà, propose un découpage en sous-pages dans ton rapport, ne découpe pas toi-même.
- Écarts entre code, écran et doc existante : encadré `> [!NOTE] Écarts constatés` (décrits, jamais corrigés).

## Captures

{{#if captureMode=production}}**PRODUCTION, EN LECTURE SEULE.** Une session, créée par une personne habilitée, est enregistrée dans `.doc-kit/`
(ignoré par git) : ne la copie, ne l'affiche et ne la cite jamais. Le propriétaire de l'application a demandé par
écrit les captures sur la production, sans aucune modification (voir Variables pour une éventuelle politique de
données).

- Commande, par petits lots de 3 à 8 captures : `npx doc-kit capture "<préfixe>-<motif>*" --preview`.
- Le moteur BLOQUE dans le navigateur toute requête qui n'est pas GET, HEAD ou OPTIONS (la dernière ligne compte
  les requêtes d'écriture bloquées). Ce n'est pas une raison pour cliquer des boutons d'écriture : UNIQUEMENT de
  la navigation (pages, onglets, menus, ouverture d'une fenêtre ou d'un assistant puis Échap, survol). Jamais :
  Enregistrer, Créer, Approuver, Supprimer, Signer, Envoyer, Importer, Synchroniser, Réindexer, Se déconnecter,
  ni saisie dans un champ qui enregistre tout seul.
- Écritures CÔTÉ SERVEUR au rendu : le blocage du navigateur ne les empêche pas. Avant d'ouvrir une page de
  détail, lis son code de rendu (composant de page, loader, contrôleur) : si une fonction `create…`, `ensure…`,
  `upsert…`, `update…`, `insert…`, `save…` ou `sync…` y est appelée au rendu, ne l'ouvre pas et décris-la
  d'après le code. Les routes de la liste interdite du projet (`capture.forbidden`) ne s'ouvrent jamais.
- Une page qui a besoin d'un POST pour charger ses données (action serveur, RPC) s'affiche incomplète : décris-
  le, n'essaie pas de contourner.
- Pour lire l'API (ids d'objets à capturer…) : uniquement un contexte Playwright qui charge la session ET
  annule tout sauf GET (`ctx.route("**/*", r => ["GET","HEAD","OPTIONS"].includes(r.request().method()) ?
  r.continue() : r.abort())`). Pas de curl. Si le système de permissions refuse une lecture, ne la tente pas
  autrement : relève la valeur à l'écran et dis-le dans ton rapport.
- JAMAIS de secret (clé, mot de passe, jeton, URL interne) dans une image. Le moteur masque les GUID et les
  valeurs du `.env` local, pas les valeurs propres à la production : vérifie chaque image et ajoute des `masks`
  au besoin.
- Si la session expire (redirection vers la page de connexion, 401), ARRÊTE-TOI et dis-le dans ton rapport.
- La production est partagée : pas de boucles inutiles, pas de rafales de rechargements.
{{#if productionNotes}}
⚠ CONSIGNE COMPLÉMENTAIRE : voir Variables.
{{/if}}{{/if}}{{#if captureMode=demo}}**DÉMO PRÉPARÉE** (données fictives). L'orchestrateur a lancé `doc-kit demo` : ne le relance pas.

- Commande : `npx doc-kit capture "<préfixe>-<motif>*" --preview`.
- Aucune modification de valeur pendant une capture : un éditeur qui enregistre tout seul écrirait en base.
  Seuls sont permis les clics de navigation, l'ouverture d'un bloc ou d'une fenêtre, et les boutons de test en
  lecture seule.
- S'il manque une donnée à la démo, ne la crée pas à la main : demande-la dans ton rapport (elle sera ajoutée au
  script de préparation, `capture.setup`).
{{/if}}{{#if captureMode=none}}{{#if screenshots=none}}**AUCUNE CAPTURE DU TOUT** (`capture.mode: "none"` dans `doc.config.mjs`) : ne lance jamais `doc-kit capture` ni
`doc-kit connect`, n'écris jamais de `:::ecran`. Dans « L'écran », un tableau par panneau ou par fenêtre,
`| Élément | Ce qu'il montre |`, une ligne par élément dans l'ordre de lecture (de haut en bas, puis de gauche à
droite) : le libellé exact en gras, puis son rôle, ses valeurs, son défaut et son effet, en 1 à 3 phrases, lus dans le
code (composants, fichiers de traduction).
{{/if}}{{#if screenshots!=none}}**AUCUNE NOUVELLE CAPTURE.** Réutilise au plus 1 ou 2 captures EXISTANTES par page (le dossier d'images du projet ;
regarde-les avec Read avant). Une capture qui a des zones (son `zones/<id>.json`) s'insère avec
`:::ecran{capture="<id>" titre="…"}` et une liste d'EXACTEMENT autant d'éléments que de zones ; `::capture` est refusé
sur elle.
{{/if}}{{/if}}{{#if captureMode!=none}}
- REGARDE chaque aperçu de zones (`<id>.zones.png`, écrit sous `.doc-kit/` par `--preview`, avec l'outil Read) et
  corrige les cibles jusqu'à ce que chaque zone encadre exactement le bon élément : 3 à 12 zones par écran, dans
  l'ordre de lecture ; `up` ou `within` pour encadrer une rangée entière ; `viewport: { height: 2200 }` et `frame` pour
  les panneaux longs ; l'aide de cible `main` pour la zone sans menu.
- Libellés des cibles : copie le caractère exact du fichier de libellés (apostrophe droite ou typographique), ou
  utilise une expression régulière.
{{/if}}

## Règles

- N'écris QUE tes fichiers de page dans le dossier de contenu, ton plan de captures et, si utile, tes fichiers
  de schéma (classes de schéma `d-*` du site seulement, tableau dans le standard de rédaction du kit ; à
  vérifier en clair ET en sombre). Chemins : voir Variables. Ne modifie ni l'application, ni le sommaire, ni le
  glossaire, ni la configuration, ni le fichier des cibles, ni le kit, ni les fichiers des autres lots. N'utilise
  pas `doc-kit new`, `connect` ni `demo`. Aucune commande git.
- Défauts de l'application découverts : ne touche pas aux points d'attention ; liste-les comme candidats dans
  ton rapport, après avoir vérifié qu'ils ne sont pas déjà un constat existant (la page des points d'attention
  est dans Variables ; sinon, cite son numéro).

## Rapport final (300 à 350 mots au plus, dans la langue du projet)

Dans cet ordre, pour qu'il se colle tel quel dans le fichier de consolidation :
1. Pages écrites (nombre de mots) ; captures et zones produites ; requêtes d'écriture bloquées observées.
2. **Candidats constats** : liste numérotée ; gravité proposée (Critique, Important, Mineur) — constat —
   `fichier:ligne` ; numéro du constat existant s'il y en a un ; « déduit » si non observé.
3. **Erreurs dans les pages existantes** : fichier, phrase, preuve.
4. **Glossaire proposé** : terme — définition d'une phrase.
5. Ce qui n'a pas pu être capturé ou vérifié, et pourquoi ; découpages en sous-pages proposés ; lectures faites
   en plus du dossier de contexte.

## Variables

- Produit : {{product}}{{#if description}} ({{description}}){{/if}}
- Lot : {{code}}
- Dossier de la doc : `{{docDir}}`
- Code de l'application : `{{appDir}}`{{#if stack}} ({{stack}}){{/if}}{{#if labels}} ; libellés exacts de
  l'interface : `{{labels}}`{{/if}}
- Application : {{appUrl}} (version {{version}})
- Tes pages : {{pages}}
- Ton préfixe de captures : `{{prefix}}`
- Ton plan de captures : `{{plansDir}}/{{code}}.mjs`
- Mode de capture : {{captureMode}}
{{#if productionNotes}}- Consigne complémentaire pour cette vague : {{productionNotes}}
{{/if}}{{#if dataPolicy}}- Politique de données : {{dataPolicy}}
{{/if}}{{#if otherWriters}}- Autres rédacteurs, en même temps : {{otherWriters}}
{{/if}}- Guide de rédaction (lecture de secours, dans ton budget de 3) : `{{guideFile}}`
- Page de référence (lecture de secours, dans ton budget de 3) : `{{contentDir}}/{{referencePage}}.md`
- Gabarits de pages : `{{kitPath}}/templates/pages/{{language}}/<type>.md`
- Sommaire : `{{tocFile}}`
- Fichier des cibles : `{{targetsFile}}`
- Syntaxe des plans de captures : `{{kitPath}}/engine/capture/plans.mjs`
- Fichiers de contexte : `{{docDir}}/.doc-kit/context/<id de page, "/" -> "__">.md` (un par page ci-dessus, quand
  l'orchestrateur les a préparés)
{{#if reads}}- À lire aussi (hors budget des 3 lectures) : {{reads}}
{{/if}}- Dossier de contenu : `{{contentDir}}` ; dossier des schémas : `{{diagramsDir}}` ; dossier des images :
  `{{imagesDir}}`
- Page des points d'attention : `{{contentDir}}/{{findingsPage}}.md`
- Fichier du glossaire : `{{glossaryFile}}`
- Langue : {{languageName}}
