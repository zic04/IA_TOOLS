# Brief — correction des pages et du glossaire ({{product}})

Tu corriges les erreurs signalées par les rédacteurs dans les pages du site de documentation du produit **{{product}}**, et tu
ajoutes les termes de glossaire proposés. Un autre agent intègre EN MÊME TEMPS les constats dans
`{{contentDir}}/{{findingsPage}}.md` et ses sous-pages : ne touche pas à ces fichiers.

## Entrées

- `{{consolidationFile}}` : dans chaque section de rédacteur, « Erreurs dans les pages existantes » et « Glossaire
  proposé ».
- Le code : `{{appDir}}`{{#if labels}} ; libellés exacts de l'interface : `{{labels}}`{{/if}}.
- `{{guideFile}}`, et `{{glossaryFile}}` (une entrée : `term`, `def`, `pattern` facultatif ; un projet antérieur au
  kit peut utiliser `glossaire.json` avec `terme`, `def`, `motif` : garde les clés que le fichier utilise déjà).

## Pour chaque erreur signalée

1. Relis la phrase dans la page et **revérifie dans le code**. Le rapport n'a pas plus d'autorité que la page : seul le
   code tranche ; pour un fait de production, une capture existante.
2. **Confirmée** : corrige au plus près (la phrase, la ligne du tableau, l'élément de légende), dans le style de la
   page ; cite la preuve si la page cite ses preuves. Ne réécris pas la page.
3. **Non confirmée** : ne change rien ; garde la preuve pour ton rapport.
4. Une légende `:::ecran` garde exactement autant d'éléments que la capture a de zones.
5. Une erreur qui révèle un défaut de l'application ne se corrige pas seulement dans la page : signale-la comme
   candidat constat dans ton rapport.

## Glossaire

- Ajoute chaque terme proposé s'il n'existe pas déjà, même sous une autre forme ; sinon, améliore la définition
  existante si elle est fausse ou imprécise.
- Une définition = une phrase juste, sans jargon non défini ; `pattern` seulement si le terme apparaît sous plusieurs
  formes.
- Corrige les définitions signalées comme fausses (par exemple une définition qui confond « masqué à l'écran » et
  « retiré côté serveur »).

## Règles

- N'écris QUE dans les pages citées par la consolidation (hors `{{findingsPage}}` et ses sous-pages) et dans
  `{{glossaryFile}}`. Ne touche ni à `{{tocFile}}`, au kit, ni à l'application. Aucune commande git.
- Liens internes : ids de `{{tocFile}}` seulement ; une ancre doit exister.
- Rien d'inventé.

## Contrôles (depuis `{{docDir}}`)

- `npx doc-kit build --draft` : aucun nouveau ✖ ni ⚠ ; `npx doc-kit check links` ; `npx doc-kit check tables`.
- `{{glossaryFile}}` reste un JSON valide (le build le lit).

## Rapport final ({{languageName}}, 300 mots au plus)

- Corrections faites : fichier, avant → après (court), preuve.
- Signalements rejetés : fichier, phrase, preuve.
- Termes ajoutés ou corrigés.
- Défauts à transmettre comme candidats constats.
