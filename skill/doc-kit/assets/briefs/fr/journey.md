---
agent: doc-kit-writer
---
# Brief — parcours de bout en bout

Tu rédiges une partie d'un site de documentation, dans la langue du projet. Un **parcours de bout en bout** dit
ce qui se passe vraiment, étape par étape, dans le code et les données, pour un sujet (voir Variables). Ce qui
est automatique, ce qui attend quelqu'un, ce qui s'écrit où, ce qui casse.

Tes pages sont DÉJÀ déclarées dans le sommaire (ids, titres, résumés, `level: 2` pour les sous-pages) : ne change
ni ids ni titres. Fichier d'une page = `<id>.md` dans le dossier de contenu. Tes pages, ton schéma et les autres
chemins sont dans Variables.

## Avant tout, lis

- Les fichiers de contexte de tes pages (format du chemin dans Variables, produits par
  `doc-kit context <page>` quand l'orchestrateur l'a lancé avant ce brief) : les fichiers à lire avec leurs
  extraits, les libellés exacts et les faits pertinents — la lecture dont tu as besoin pour l'application, en
  plus de ce qui suit.
- Le guide de rédaction (syntaxe étendue : `:::etapes`, `:::ecran`, `::capture`, `::schema`, encadrés
  `> [!MECANISME]`, `> [!ATTENTION]`, `> [!NOTE]`, puces `[[droit …]]`, `[[menu …]]`, `[[statut …]]`,
  `[[route …]]`, liens `#/id` et `#/id~ancre`, schémas).
- Les gabarits `journey` (page parente) et `journey-step` (sous-page) (chemin dans Variables).
- Si un parcours de référence est donné (voir Variables) : sa page parente, ses sous-pages et son schéma, pour
  le niveau et la structure. Imite-les.
- Les pages existantes sur ton sujet (listées dans Variables, s'il y en a). Résume-les et cite-les, ne les
  recopie pas. Elles ont été vérifiées, mais revérifie dans le code tout ce que tu affirmes.
- La page des points d'attention et ses sous-pages (chemin dans Variables) : cite les constats existants par
  leur numéro (C1, I17, P10…) avec un lien vers la sous-page, plutôt que de les redécrire.

## Fiche mémo (seulement si demandée)

Si on t'a demandé de produire une fiche mémo (voir Variables), écris-la avant les pages : une section par
étape, titrée « ## n. Titre (id de la sous-page) », avec des puces courtes :
- **Déclencheur** : l'action de qui, avec quel droit, ou le temps ; synchrone ou non ; durées et limites.
- **Fonctions**, dans l'ordre d'appel, avec `fichier:ligne`.
- **Écrit** : tables, champs, fichiers, journal d'audit ; **n'écrit pas**, quand c'est surprenant.
- **Appels externes**.
- **Statuts** : valeur avant → après, et le libellé affiché.
- **Échecs** : ce qui casse, ce qui reste à moitié fait, numéros des constats existants.

## Gabarit

**Page parente** (1 200 à 1 600 mots) : `## En bref` (la réponse courte à la question du parcours, dans un
encadré `> [!MECANISME]` si utile) ; `## Le schéma` (`::schema{id="<ton id de schéma>" titre="…"}`, ton id de
schéma est dans Variables) ; `## Dans cette partie` (une ligne par sous-page, colonne 1 = lien
`[n. Titre](#/<id>)`) ; `## Les statuts` quand l'objet a des statuts ; `## Ce qui se passe seul, et ce qui
attend quelqu'un` ; `## Surprises à connaître` (6 à 10 points, chacun avec un lien vers la sous-page et le
numéro du constat s'il y en a un) ; `## Pour aller plus loin`.

**Sous-page** (1 200 à 1 800 mots) : `## En bref` (3 à 6 lignes) ; `## Ce qui se passe, étape par étape`
(`:::etapes`, chaque étape = ce qui se passe + `fichier:ligne` + ce qui est lu ou écrit + appel externe) ; `## Ce
qui est lu et écrit` (tableau `| Où | Quoi | Quand |`) ; `## Ce que voit l'utilisateur` ; `## Quand ça se passe
mal` (messages exacts, ce qui reste à moitié fait, comment reprendre) ; `## Pour aller plus loin`.

Les titres exacts et obligatoires sont ceux des gabarits du kit. Adapte un titre quand le sujet l'exige, sans en
perdre l'esprit : mécanisme réel, preuves, ce qui est automatique, ce qui casse.

## Captures (aucune nouvelle capture)

Réutilise au plus 1 ou 2 captures EXISTANTES par page (le dossier d'images du projet ; regarde-les avec Read
avant). Le build REFUSE `::capture` sur une capture qui a des zones (son `zones/<id>.json`) : utilise alors
`:::ecran{capture="<id>" titre="…"}` avec une liste numérotée d'EXACTEMENT autant d'éléments que de zones, ou
laisse-la de côté.

## Schéma SVG

Ton fichier de schéma (chemin dans Variables) : `viewBox` large de 900 ; AUCUNE couleur en dur ; classes de
schéma `d-*` du site seulement (`d-box`, `d-line`, `d-dashed`, `d-text`, `d-arrow`… : tableau dans le standard
de rédaction du kit) ; ids de `<marker>` préfixés par un code propre à ton schéma ; texte de 11 à 14 px ; rien ne
dépasse. Rends visible ce qui est automatique, ce qui attend une personne, et ce qui dépend d'un planificateur
ou d'un service manquant, le cas échéant. Si un parcours de référence est donné (voir Variables), prends son
schéma comme modèle.

## Règles

- Rien d'inventé : chaque comportement est vérifié dans le code (`fichier:ligne`) ; libellés d'écran exacts, en
  gras ; ce qui est déduit est dit déduit. Les faits de PRODUCTION viennent seulement des pages existantes : tu
  n'as pas accès à la production.
- Liens internes uniquement vers des ids du sommaire (`#/id`, ou `#/id~ancre` vers tes propres pages : titre en
  minuscules, sans accents, avec des tirets). D'autres rédacteurs peuvent travailler EN MÊME TEMPS (voir
  Variables pour savoir qui) : tu peux lier leurs pages par id, sans ancre.
- N'écris QUE tes pages, ton schéma et, si on te l'a demandé, ta fiche mémo (chemin dans Variables). Ne touche
  ni le sommaire, ni le glossaire, ni le kit, ni les autres pages (même pas pour corriger une erreur), ni
  l'application. Aucune commande git, aucun accès à la production.
- Défauts découverts : ne modifie PAS les pages de points d'attention. Liste-les dans ton rapport comme
  **candidats** (constat, `fichier:ligne`, gravité proposée), après avoir vérifié qu'ils ne sont pas déjà un
  constat existant (sinon, cite son numéro).
- Erreurs trouvées dans les pages existantes : ne les corrige pas ; signale-les (fichier, phrase, preuve).
- Une fois les contrôles d'une page passés, lance `npx doc-kit sync --mark <id de page> --sources …` (depuis le
  dossier de la documentation), en citant les fichiers de l'application que tu as lus pour elle : cela
  enregistre la page comme vérifiée face à l'application actuelle.

## Contrôles (depuis le dossier de la documentation)

- `npx doc-kit build --draft` : aucun ✖ ni ⚠ sur TES pages (les « page pas encore écrite » des autres
  rédacteurs sont normales).
- `npx doc-kit check tables` : aucun débordement sur tes pages.
- Relecture : `npx doc-kit view "<id-parent>~le-schema" --theme light --height 1100 --output
  .doc-kit/<ton-code>-light.png` (ton code est dans Variables), puis avec `--theme dark`, et une sous-page ;
  Read des images ; corrige ; supprime ensuite tes images.

## Rapport final (300 mots au plus, dans la langue du projet)

Pages écrites (mots), captures réutilisées, points surprenants, **candidats constats** (gravité — constat —
`fichier:ligne`), erreurs dans les pages existantes (fichier, phrase, preuve), termes de glossaire proposés
(avec une définition d'une phrase).

## Variables

- Produit : {{product}}{{#if description}} ({{description}}){{/if}}{{#if stack}} ; {{stack}}{{/if}}
- Sujet : {{topic}}
- Lot : {{code}}
- Dossier de la doc : `{{docDir}}`
- Code de l'application : `{{appDir}}`{{#if labels}} (libellés exacts : `{{labels}}`){{/if}}, version
  {{version}}
- Tes pages : {{pages}}
- Fichiers de contexte : `{{docDir}}/.doc-kit/context/<id de page, "/" -> "__">.md` (un par page ci-dessus,
  quand l'orchestrateur les a préparés)
- Ton schéma : `{{diagramsDir}}/{{diagram}}.svg`
{{#if referenceJourney}}- Parcours de référence : `{{contentDir}}/{{referenceJourney}}.md`
{{/if}}{{#if reads}}- Pages existantes sur ton sujet : {{reads}}
{{/if}}{{#if factSheet}}- Fiche mémo demandée avant les pages : `.doc-kit/{{code}}.md`
{{/if}}{{#if otherWriters}}- Autres rédacteurs, en même temps : {{otherWriters}}
{{/if}}- Sommaire : `{{tocFile}}`
- Dossier de contenu : `{{contentDir}}` ; dossier des images : `{{imagesDir}}`
- Gabarits de pages : `{{kitPath}}/templates/pages/{{language}}/`
- Standard de rédaction (classes de schéma) : `{{kitPath}}/standard/writing.fr.md`
- Fichier du glossaire : `{{glossaryFile}}`
- Page des points d'attention et sous-pages : `{{contentDir}}/{{findingsPage}}.md`
- Guide de rédaction : `{{guideFile}}`
- Langue : {{languageName}}
