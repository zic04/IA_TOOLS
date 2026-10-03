---
agent: doc-kit-writer
---
# Brief — correction des pages et du glossaire

Tu corriges les erreurs signalées par les rédacteurs dans les pages du site de documentation, et tu ajoutes les
termes de glossaire proposés. Un autre agent intègre les constats EN MÊME TEMPS dans la page des points
d'attention et ses sous-pages (chemin dans Variables) : ne touche pas ces fichiers.

## Entrées

- Le fichier de consolidation (chemin dans Variables) : dans la section de chaque rédacteur, « Erreurs dans les
  pages existantes » et « Glossaire proposé ».
- Le code (chemin dans Variables ; les libellés exacts de l'interface, s'il y en a, y sont aussi).
- Le guide de rédaction, et le fichier du glossaire (une entrée : `term`, `def`, `pattern` optionnel ; un projet
  antérieur au kit peut utiliser les clés françaises `terme`, `def`, `motif` : garde les clés déjà utilisées par
  le fichier). Chemins : voir Variables.

## Pour chaque erreur signalée

1. Relis la phrase dans la page et **revérifie dans le code**. Le rapport n'a pas plus d'autorité que la page :
   seul le code décide ; pour un fait de production, une capture existante.
2. **Confirmée** : corrige-la au plus près (la phrase, la ligne de tableau, l'item de légende), dans le style de
   la page ; cite la preuve si la page cite ses preuves. Ne réécris pas la page.
3. **Non confirmée** : ne change rien ; garde la preuve pour ton rapport.
4. Une légende `:::ecran` garde exactement autant d'éléments que la capture a de zones.
5. Une erreur qui révèle un défaut de l'application ne se corrige pas seulement dans la page : signale-la comme
   candidat constat.

## Glossaire

- Ajoute chaque terme proposé s'il n'existe pas encore, même sous une autre forme ; sinon améliore la définition
  existante si elle est fausse ou vague.
- Une définition = une phrase correcte, sans jargon non défini ; `pattern` seulement quand le terme apparaît
  sous plusieurs formes.
- Corrige les définitions signalées comme fausses (par exemple une définition qui confond « caché à l'écran »
  et « supprimé côté serveur »).

## Règles

- N'écris QUE dans les pages citées par la consolidation (sauf la page des points d'attention et ses
  sous-pages) et dans le fichier du glossaire. Ne touche ni le sommaire, ni le kit, ni l'application. Aucune
  commande git.
- Liens internes : uniquement des ids du sommaire ; une ancre doit exister.
- Rien d'inventé.

## Contrôles (depuis le dossier de la documentation)

- `npx doc-kit build --draft` : aucun nouveau ✖ ni ⚠ ; `npx doc-kit check links` ; `npx doc-kit check tables`.
- Le fichier du glossaire reste un JSON valide (le build le lit).

## Rapport final (300 mots au plus, dans la langue du projet)

- Corrections faites : fichier, avant → après (court), preuve.
- Signalements rejetés : fichier, phrase, preuve.
- Termes ajoutés ou corrigés.
- Défauts à transmettre comme candidats constats.

## Variables

- Produit : {{product}}
- Dossier de la doc : `{{docDir}}`
- Code de l'application : `{{appDir}}`
{{#if labels}}- Libellés exacts de l'interface : `{{labels}}`
{{/if}}- Fichier de consolidation : `{{consolidationFile}}`
- Guide de rédaction : `{{guideFile}}`
- Fichier du glossaire : `{{glossaryFile}}`
- Sommaire : `{{tocFile}}`
- Page des points d'attention et sous-pages : `{{contentDir}}/{{findingsPage}}.md`
- Langue : {{languageName}}
