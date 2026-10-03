---
agent: doc-kit-writer
---
# Brief — revue de maintenabilité

Tu rédiges la page `maintainability-review` de l'espace DE REPRISE, dans la langue du projet : les notes de A à E
(duplication, complexité, taille, tests), les points chauds qui les combinent, et des recommandations classées
par effort — construites à partir des faits `quality`, confirmées dans le code avant d'énoncer quoi que ce soit
comme un fait.

Ta page est DÉJÀ déclarée dans le sommaire (voir Variables) : ne change ni son id ni son titre.

## Tes sources, dans cet ordre

1. **Les faits** (dossier dans Variables, écrits par `doc-kit facts --source quality` ; l'orchestrateur les a
   produits avant ce brief — s'ils manquent, ou sont plus anciens que le commit actuel de l'application, dis-le
   dans ton rapport plutôt que d'inventer des chiffres) : le `summary` de `quality.json` (les quatre notes,
   l'outillage trouvé) et ses `items` (par fichier : `lines`, `functions`, `longest`, `complexity`, `duplicated`,
   `todo`).
2. `tests.json` et `dependencies.json`, pour les sections Tests et Dépendances — ne répète pas les pages
   `tests-quality` ou `dependencies` quand elles existent déjà pour ce projet : renvoie vers elles.
3. **Le code de l'application**, en lecture seule, pour chaque fichier que `quality.json` nomme comme point
   chaud : ouvre-le, lis la fonction qu'il signale, et dis en langage clair ce qui la rend difficile à suivre —
   un chiffre seul (« complexité 19 ») ne convainc personne.

## La page

- `## En bref` : l'état global en un paragraphe — la pire note, et si un point chaud est aussi un risque connu
  ailleurs (un constat de sécurité, un parcours critique faiblement testé).
- `## Notes` : un tableau, les quatre lettres (A à E) avec leur mesure, depuis le `summary` de `quality.json`.
- `## Points chauds` : `::faits{source="quality" colonnes="file,lines,functions,longest,complexity,duplicated,todo"}`,
  puis, pour les deux ou trois fichiers qui combinent les pires chiffres, ce que tu as trouvé en lisant la
  fonction elle-même — pas seulement la mesure.
- `## Duplication` (facultatif) : les plus gros blocs dupliqués, confirmés en lisant les deux occurrences ; s'ils
  ont déjà dérivé l'un de l'autre.
- `## Complexité` (facultatif) : les fonctions les plus complexes, ce qui les rend difficiles à suivre, et si les
  tests exercent vraiment leurs branches (lis le fichier de test, ne le suppose pas d'après un simple décompte).
- `## Tests` : le taux de tests, et l'écart entre « a un test » et « le test vérifie quelque chose » — renvoie
  vers `tests-quality` plutôt que de la répéter.
- `## Dépendances` (facultatif) : dépendances directes en retard sur leur dernière version ; renvoie vers
  `dependencies`.
- `## Recommandations` : classées par effort, le gain rapide d'abord, chacune renvoyant à un point chaud
  ci-dessus.

## Règles

- Rien d'inventé : chaque point chaud et chaque recommandation remonte à une ligne de `quality.json`, confirmée
  en lisant le fichier qu'elle nomme.
- N'écris QUE ta page (chemin dans Variables). Aucune correction de l'application, aucune autre page, aucune
  commande git.
- Un point chaud qui est aussi une préoccupation de sécurité (une fonction complexe qui est aussi un manque de
  contrôle d'accès) est un **candidat constat** dans ton rapport, cité plutôt que dupliqué s'il est déjà numéroté.

## Contrôles (depuis le dossier de la documentation)

- `npx doc-kit build --draft` : aucun ✖ ni ⚠ pour ta page.
- Une fois les contrôles passés, lance `npx doc-kit sync --mark <id de page> --sources …`, en citant les fichiers
  de faits et les fichiers de l'application que tu as lus.

## Rapport final (300 mots au plus, dans la langue du projet)

1. La page écrite (nombre de mots) ; les quatre notes.
2. Les points chauds confirmés dans le code, et tout ce que `quality.json` signalait sans que le code le
   confirme vraiment.
3. **Candidats constats** : un point chaud qui est aussi une préoccupation de sécurité ou de fiabilité, avec sa
   preuve.
4. Termes de glossaire proposés.

## Variables

- Produit : {{product}}
- Dossier de la doc : `{{docDir}}`
- Code de l'application : `{{appDir}}`, version {{version}}
- Dossier des faits : `{{factsDir}}`
- Ta page : {{pages}}
- Gabarit de page : `{{kitPath}}/templates/pages/{{language}}/maintainability-review.md`
- Sommaire : `{{tocFile}}`
- Fichier du glossaire : `{{glossaryFile}}`
- Page des points d'attention et sous-pages : `{{contentDir}}/{{findingsPage}}.md`
- Langue : {{languageName}}
