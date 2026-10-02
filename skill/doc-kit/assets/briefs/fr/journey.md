# Brief — parcours de bout en bout : {{topic}} ({{product}}, code {{code}})

Tu rédiges, en {{languageName}}, une partie du site de documentation du produit **{{product}}**{{#if description}} ({{description}}){{/if}}{{#if stack}} ; {{stack}}{{/if}}.
Un **parcours de bout en bout** raconte ce qui se passe réellement, étape par étape, dans le code et les données, pour
le sujet suivant : **{{topic}}**. Ce qui est automatique, ce qui attend quelqu'un, ce qui est écrit où, ce qui casse.

- Dossier de la doc : `{{docDir}}`. Code : `{{appDir}}`{{#if labels}} (libellés exacts : `{{labels}}`){{/if}}, version {{version}}.
- Tes pages sont DÉJÀ déclarées dans `{{tocFile}}` (ids, titres, résumés, `level: 2` pour les sous-pages) : ne change
  ni ids ni titres. Fichier d'une page = `{{contentDir}}/<id>.md`. Tes pages : {{pages}}
- Ton schéma : `{{diagramsDir}}/{{diagram}}.svg`.

## Lis d'abord

- `{{guideFile}}` (syntaxe étendue : `:::etapes`, `:::ecran`, `::capture`, `::schema`, encadrés `> [!MECANISME]`,
  `> [!ATTENTION]`, `> [!NOTE]`, puces `[[droit …]]`, `[[menu …]]`, `[[statut …]]`, `[[route …]]`, liens `#/id` et
  `#/id~ancre`, schémas).
- Les gabarits `journey` (page parente) et `journey-step` (sous-page) : `{{kitPath}}/templates/pages/{{language}}/`.
{{#if referenceJourney}}- **La référence de structure et de niveau** : `{{contentDir}}/{{referenceJourney}}.md` (page parente), ses sous-pages
  et son schéma. Imite-les.
{{/if}}- Les pages existantes de ton sujet{{#if reads}} : {{reads}}{{/if}}. Résume-les et cite-les, ne les recopie pas. Elles ont
  été vérifiées, mais revérifie dans le code tout ce que tu affirmes.
- `{{contentDir}}/{{findingsPage}}.md` et ses sous-pages : cite les constats existants par leur numéro (C1, I17,
  P10…) avec un lien vers la sous-page, plutôt que de les redécrire.
{{#if factSheet}}
## Fiche de synthèse d'abord

Avant les pages, écris `.doc-kit/{{code}}.md` : une section par étape, titrée « ## n. Titre (id de la sous-page) »,
avec des puces courtes :
- **Déclencheur** : action de qui, avec quel droit, ou le temps ; synchrone ou non ; durées et limites.
- **Fonctions**, dans l'ordre d'appel, avec `fichier:ligne`.
- **Écrit** : tables, champs, fichiers, journal d'audit ; **n'écrit pas**, si c'est surprenant.
- **Appels externes**.
- **Statuts** : valeur avant → après, et le libellé affiché.
- **Défaillances** : ce qui casse, ce qui reste à moitié fait, numéros des constats existants.
{{/if}}
## Gabarit

**Page parente** (1 200 à 1 600 mots) : `## En bref` (la réponse courte à la question du parcours, dans un encadré
`> [!MECANISME]` si utile) ; `## Le schéma` (`::schema{id="{{diagram}}" titre="…"}`) ; `## Dans cette partie` (tableau
d'une ligne par sous-page, colonne 1 = lien `[n. Titre](#/<id>)`) ; `## Les états` si l'objet a des statuts ;
`## Ce qui se fait tout seul, et ce qui attend quelqu'un` ; `## Les surprises à connaître` (6 à 10 points, chacun avec
un lien vers la sous-page et le numéro de constat s'il existe) ; `## Pour aller plus loin`.

**Sous-page** (1 200 à 1 800 mots) : `## En bref` (3 à 6 lignes) ; `## Ce qui se passe, pas à pas` (`:::etapes`,
chaque étape = ce qui se passe + `fichier:ligne` + ce qui est lu ou écrit + appel externe) ; `## Ce qui est lu et
écrit` (tableau `| Où | Quoi | Quand |`) ; `## Ce que voit l'utilisateur` ; `## Quand ça se passe mal` (messages exacts,
ce qui reste à moitié fait, comment reprendre) ; `## Pour aller plus loin`.

Les intitulés exacts et obligatoires sont ceux des modèles du kit. Adapte un titre si le sujet l'exige, sans perdre
l'esprit : mécanisme réel, preuves, ce qui est automatique, ce qui casse.

## Captures (aucune nouvelle capture)

Réutilise au plus 1 ou 2 captures EXISTANTES par page (`{{imagesDir}}/*.webp` ; regarde-les avec Read avant). Le build
REFUSE `::capture` sur une capture qui a des zones (`{{imagesDir}}/zones/<id>.json`) : dans ce cas, utilise
`:::ecran{capture="<id>" titre="…"}` avec une liste numérotée d'EXACTEMENT autant d'éléments que de zones, ou n'en
mets pas.

## Schéma SVG

`{{diagramsDir}}/{{diagram}}.svg` : `viewBox` de 900 de large ; AUCUNE couleur en dur ; classes de schéma `d-*` du site
seulement (`d-box`, `d-line`, `d-dashed`, `d-text`, `d-arrow`… : tableau dans `{{kitPath}}/standard/writing.fr.md`) ;
identifiants de `<marker>` préfixés par un code propre à ton schéma ; texte de 11 à 14 px ; rien ne déborde.
Distingue visuellement ce qui est automatique, ce qui attend une personne, et ce qui dépend d'un planificateur ou d'un
service absent, quand c'est pertinent.{{#if referenceJourney}} Inspire-toi du schéma de la
page de référence.{{/if}}

## Règles

- Rien d'inventé : chaque comportement est vérifié dans le code (`fichier:ligne`) ; libellés d'écran exacts, en gras ;
  ce qui est déduit est dit déduit. Les faits de PRODUCTION ne viennent que des pages existantes : tu n'as aucun accès
  à la production.
- Liens internes uniquement vers des ids de `{{tocFile}}` (`#/id`, ou `#/id~ancre` vers tes pages : titre en
  minuscules, sans accents, tirets).{{#if otherWriters}} D'autres rédacteurs écrivent EN MÊME TEMPS : {{otherWriters}}. Tu peux
  lier leurs pages par id, sans ancre.{{/if}}
- N'écris QUE tes pages, ton schéma{{#if factSheet}} et ta fiche `.doc-kit/{{code}}.md`{{/if}}. Ne touche ni à
  `{{tocFile}}`, `{{glossaryFile}}`, au kit, ni aux autres pages (même pour corriger une erreur), ni à l'application.
  Aucune commande git, aucun accès à la production.
- Défauts découverts : ne modifie PAS les points d'attention. Liste-les dans ton rapport comme **candidats** (constat,
  `fichier:ligne`, gravité proposée), après avoir vérifié qu'ils ne sont pas déjà un constat existant (sinon, cite son
  numéro).
- Erreurs trouvées dans les pages existantes : ne les corrige pas ; signale-les (fichier, phrase, preuve).

## Contrôles (depuis `{{docDir}}`)

- `npx doc-kit build --draft` : aucun ✖ ni ⚠ concernant TES pages (les « page absente » des autres rédacteurs sont
  normales).
- `npx doc-kit check tables` : aucun débordement sur tes pages.
- Relecture : `npx doc-kit view "<id-parent>~le-schema" --theme light --height 1100 --output .doc-kit/{{code}}-clair.png`,
  la même avec `--theme dark`, et une sous-page ; Read des images ; corrige ; puis supprime tes images.

## Rapport final ({{languageName}}, 300 mots au plus)

Pages écrites (mots), captures réutilisées, points surprenants, **candidats constats** (gravité — constat —
`fichier:ligne`), erreurs dans les pages existantes (fichier, phrase, preuve), termes de glossaire proposés (avec une
définition d'une phrase).
