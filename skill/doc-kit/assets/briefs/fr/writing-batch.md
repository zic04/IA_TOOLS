# Brief — lot {{code}} : rédaction et captures ({{product}})

Tu rédiges une partie du site de documentation du produit **{{product}}**{{#if description}} ({{description}}){{/if}}, en
{{languageName}}. D'autres agents rédigent les autres lots EN MÊME TEMPS{{#if otherWriters}} ({{otherWriters}}){{/if}}.

- Dossier de la doc : `{{docDir}}` ; lance toutes les commandes depuis ce dossier.
- Code de l'application : `{{appDir}}`{{#if stack}} ({{stack}}){{/if}}{{#if labels}} ; libellés exacts de l'interface : `{{labels}}`{{/if}}.
- Application : {{appUrl}} (version {{version}}).
- Tes pages : {{pages}}
- Ton préfixe de captures : `{{prefix}}` (ids `{{prefix}}-<nom>`, en kebab-case). Ton plan de captures :
  `{{plansDir}}/{{code}}.mjs`.

## Avant tout, lis

1. `{{guideFile}}` : conventions OBLIGATOIRES (gabarits ; syntaxe étendue `:::ecran`, `::capture`, `::schema`,
   `::avant-apres`, `:::etapes` ; encadrés `[!ASTUCE]`, `[!ATTENTION]`, `[!ERREUR]`, `[!DROITS]`, `[!NOTE]`,
   `[!RECETTE]`, `[!MECANISME]` ; puces `[[droit …]]`, `[[menu …]]`, `[[touche …]]`, `[[statut …]]`, `[[route …]]` ;
   liens `#/id` ; les formes anglaises `:::screen`, `[!TIP]`… sont acceptées aussi). Une légende `:::ecran` a
   exactement autant d'éléments que la capture a de zones.
2. La page de RÉFÉRENCE de style et de niveau : `{{contentDir}}/{{referencePage}}.md` et son plan de captures.
   Imite ce niveau : à quoi ça sert, comment ça marche (mécanisme RÉEL lu dans le code), écrans annotés, référence de
   chaque réglage, pas à pas, pièges, droits.
3. Le gabarit de chacune de tes pages (champ `template` de la page dans `{{tocFile}}`) :
   `{{kitPath}}/templates/pages/{{language}}/<type>.md`. Le build contrôle ses sections obligatoires.
4. `{{tocFile}}` (tes pages y sont déclarées : ids, titres, résumés, routes, droits ; ne change ni ids ni titres —
   dans un projet antérieur au kit, ce fichier peut être `contenu/sommaire.json` à clés françaises, que le kit
   normalise à la lecture), `{{targetsFile}}`, et la syntaxe d'une entrée de plan de captures (en tête de
   `{{kitPath}}/engine/capture/plans.mjs`).
5. L'inventaire : `.doc-kit/inventory-{{slug}}.md` (navigation, routes, éditeurs, rôles et permissions, état de la
   doc existante). Les documents qu'il dit périmés ne se recopient pas : toujours vérifier dans le code.
{{#if reads}}6. À lire aussi : {{reads}}
{{/if}}
## Captures

{{#if captureMode=production}}**PRODUCTION, EN LECTURE SEULE.** Une session, créée par une personne habilitée, est enregistrée dans `.doc-kit/`
(ignoré par git) : ne la copie, ne l'affiche et ne la cite jamais. Le propriétaire de l'application a demandé par
écrit les captures sur la production, sans aucune modification{{#if dataPolicy}} ; données : {{dataPolicy}}{{/if}}.

- Commande, par petits lots de 3 à 8 captures : `npx doc-kit capture "{{prefix}}-<motif>*" --preview`.
- Le moteur BLOQUE dans le navigateur toute requête qui n'est pas GET, HEAD ou OPTIONS (la dernière ligne compte les
  requêtes d'écriture bloquées). Ce n'est pas une raison pour cliquer des boutons d'écriture : UNIQUEMENT de la
  navigation (pages, onglets, menus, ouverture d'une fenêtre ou d'un assistant puis Échap, survol). Jamais :
  Enregistrer, Créer, Approuver, Supprimer, Signer, Envoyer, Importer, Synchroniser, Réindexer, Se déconnecter, ni
  saisie dans un champ qui enregistre tout seul.
- Écritures CÔTÉ SERVEUR au rendu : le blocage du navigateur ne les empêche pas. Avant d'ouvrir une page de détail, lis
  son code de rendu (composant de page, loader, contrôleur) : si une fonction `create…`, `ensure…`, `upsert…`,
  `update…`, `insert…`, `save…` ou `sync…` y est appelée au rendu, ne l'ouvre pas et décris-la d'après le code. Les
  routes de `capture.forbidden` (`doc.config.mjs`) ne s'ouvrent jamais.
- Une page qui a besoin d'un POST pour charger ses données (action serveur, RPC) s'affiche incomplète : décris-le,
  n'essaie pas de contourner.
- Pour lire l'API (ids d'objets à capturer…) : uniquement un contexte Playwright qui charge la session ET annule tout
  sauf GET (`ctx.route("**/*", r => ["GET","HEAD","OPTIONS"].includes(r.request().method()) ? r.continue() : r.abort())`).
  Pas de curl. Si le système de permissions refuse une lecture, ne la tente pas autrement : relève la valeur à l'écran
  et dis-le dans ton rapport.
- JAMAIS de secret (clé, mot de passe, jeton, URL interne) dans une image. Le moteur masque les GUID et les valeurs du
  `.env` local, pas les valeurs propres à la production : vérifie chaque image et ajoute des `masks` au besoin.
- Si la session expire (redirection vers la page de connexion, 401), ARRÊTE-TOI et dis-le dans ton rapport.
- La production est partagée : pas de boucles inutiles, pas de rafales de rechargements.
{{#if productionNotes}}
⚠ CONSIGNE COMPLÉMENTAIRE : {{productionNotes}}
{{/if}}{{/if}}{{#if captureMode=demo}}**DÉMO PRÉPARÉE** (données fictives), sur {{appUrl}}. L'orchestrateur a lancé `doc-kit demo` : ne le relance pas.

- Commande : `npx doc-kit capture "{{prefix}}-<motif>*" --preview`.
- Aucune modification de valeur pendant une capture : un éditeur qui enregistre tout seul écrirait en base. Seuls sont
  permis les clics de navigation, l'ouverture d'un bloc ou d'une fenêtre, et les boutons de test en lecture seule.
- S'il manque une donnée à la démo, ne la crée pas à la main : demande-la dans ton rapport (elle sera ajoutée au
  script de préparation, `capture.setup`).
{{/if}}{{#if captureMode=none}}{{#if screenshots=none}}**AUCUNE CAPTURE DU TOUT** (`capture.mode: "none"` dans `doc.config.mjs`) : ne lance jamais `doc-kit capture` ni
`doc-kit connect`, n'écris jamais de `:::ecran`. Dans « L'écran », un tableau par panneau ou par fenêtre,
`| Élément | Ce qu'il montre |`, une ligne par élément dans l'ordre de lecture (de haut en bas, puis de gauche à
droite) : le libellé exact en gras, puis son rôle, ses valeurs, son défaut et son effet, en 1 à 3 phrases, lus dans le
code (composants, fichiers de traduction).
{{/if}}{{#if screenshots!=none}}**AUCUNE NOUVELLE CAPTURE.** Réutilise au plus 1 ou 2 captures EXISTANTES par page (`{{imagesDir}}/*.webp` ; regarde-les
avec Read avant). Une capture qui a des zones (`{{imagesDir}}/zones/<id>.json`) s'insère avec
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

- N'écris QUE tes fichiers `{{contentDir}}/<id>.md`, ton plan `{{plansDir}}/{{code}}.mjs` et, si utile,
  `{{diagramsDir}}/{{prefix}}-*.svg` (classes de schéma `d-*` du site seulement, tableau dans
  `{{kitPath}}/standard/writing.fr.md` ; à vérifier en clair ET en sombre). Ne modifie ni l'application, ni
  `{{tocFile}}`, `{{glossaryFile}}`, `doc.config.mjs`, `{{targetsFile}}`, le kit, ni les fichiers des autres lots.
  N'utilise pas `doc-kit new`, `connect` ni `demo`. Aucune commande git.
- Rien d'inventé : chaque libellé (en gras, exact), comportement, défaut, borne, droit et limite est vérifié dans le
  code ; cite `fichier:ligne` pour le mécanisme. Ce qui est déduit est dit déduit. Écarts entre code, écran et doc
  existante : encadré `> [!NOTE] Écarts constatés` (décrits, jamais corrigés).
- Liens internes : uniquement vers des ids de `{{tocFile}}` (`#/id`) ; ancres (`#/id~ancre`) seulement vers TES pages.
- Une page qui dépasse le `maxWords` de son gabarit (2 000 à 3 500 mots) : propose son découpage en sous-pages dans
  ton rapport (ne touche pas au sommaire).
- Défauts de l'application découverts : ne touche pas aux points d'attention ; liste-les comme candidats dans ton
  rapport, après avoir vérifié qu'ils ne sont pas déjà un constat existant (`{{contentDir}}/{{findingsPage}}.md` ;
  sinon, cite son numéro).
- Niveau : TRÈS détaillé et pédagogique. Chaque élément d'écran, chaque action, chaque réglage : libellé, rôle,
  valeurs, défaut, effet, droits ; et le mécanisme réel.

## Contrôles (depuis `{{docDir}}`)

- `npx doc-kit build --draft` : aucun ✖ ni ⚠ pour tes pages (les « page pas encore écrite » des autres lots sont normales).
- `npx doc-kit check tables` : aucun débordement sur tes pages.
- Relecture visuelle d'au moins 2 pages : `npx doc-kit view <id-page> --output .doc-kit/{{code}}-<nom>.png`, puis
  avec `--tour 2` et avec `--theme dark` ; Read des images ; corrige ; supprime ensuite tes images de relecture.

## Rapport final ({{languageName}}, 350 mots au plus)

Dans cet ordre, pour qu'il se colle tel quel dans le fichier de consolidation :
1. Pages écrites (nombre de mots) ; captures et zones produites ; requêtes d'écriture bloquées observées.
2. **Candidats constats** : liste numérotée ; gravité proposée (Critique, Important, Mineur) — constat —
   `fichier:ligne` ; numéro du constat existant s'il y en a un ; « déduit » si non observé.
3. **Erreurs dans les pages existantes** : fichier, phrase, preuve.
4. **Glossaire proposé** : terme — définition d'une phrase.
5. Ce qui n'a pas pu être capturé ou vérifié, et pourquoi ; découpages en sous-pages proposés.
