# Brief — vérification et intégration des constats ({{product}})

Tu es le SEUL à écrire dans les points d'attention du site de documentation de **{{product}}** :
`{{contentDir}}/{{findingsPage}}.md` et ses sous-pages. Un autre agent corrige EN MÊME TEMPS les autres pages et le
glossaire : ne touche à aucun autre fichier.

## Entrées

- Le fichier de consolidation : `{{consolidationFile}}` (une section par rédacteur : candidats constats, erreurs
  signalées, glossaire proposé ; puis « Doublons repérés », déjà tranchés par l'orchestrateur).
- Le code : `{{appDir}}`, version {{version}}.
- Les points d'attention actuels : lis la page parente (gravités, définitions, compteurs, « L'essentiel en une
  minute », note de version) et TOUTES ses sous-pages, pour connaître les numéros déjà pris et le format de chaque série.

## Pour chaque candidat

1. **Revérifie dans le code** chaque `fichier:ligne` cité ; corrige les numéros de ligne qui ont bougé. Ce que le
   rédacteur a déduit reste « déduit » si tu ne peux pas le constater.
2. **Décide**, et note la décision :
   - **nouveau constat** : il prend le numéro suivant de sa série (C critique, I important, M mineur, ou une série
     thématique définie par la page, comme P pour les constats propres à la production) ;
   - **complète un constat existant** : enrichis celui-ci (preuve, impact, recommandation) sans nouveau numéro ;
   - **fusionné** : les doublons tranchés (« inv 8 = tbl 1 ») deviennent un seul constat, preuves réunies, gravité la
     plus haute sauf preuve contraire ;
   - **rejeté** : avec la preuve que le code ne le confirme pas.
3. **Classe** selon les définitions de la page parente. Repères : Critique = risque actuel pour la sécurité, la
   confidentialité ou la promesse première du produit ; Important = défaut réel, contournement possible, fonction
   cassée ou trompeuse ; Mineur = dette, incohérence, affichage, hygiène.
4. **Écris** dans la bonne sous-page, au format déjà en place : une section `## I40 — Titre` avec **Constat** (et
   `fichier:ligne`), **Impact**, **Recommandation** ; ou une ligne de tableau avec les mêmes colonnes que les autres.
   Liens internes vers des ids de `{{tocFile}}` seulement.

## Ensuite

- Mets à jour les **compteurs** : tableau des gravités de la page parente, phrases qui annoncent une plage (« de M1 à
  M44 »), introduction de chaque sous-page.
- Mets à jour « L'essentiel en une minute » si un nouveau constat change les priorités, et la note de version (ce que
  cette version intègre, d'où viennent les constats, version du code vérifiée : {{version}}).
- **Erreurs signalées dans les points d'attention eux-mêmes** (un constat existant faux ou dépassé) : corrige-les avec
  preuve. Un constat que l'application a corrigé va dans « Les points déjà corrigés ».

## Règles

- N'écris QUE dans `{{contentDir}}/{{findingsPage}}.md` et ses sous-pages. Ne touche ni à `{{tocFile}}`,
  `{{glossaryFile}}`, aux autres pages (même pour y ajouter un lien), au kit, ni à l'application. Aucune commande git.
- Rien d'inventé : une gravité se justifie par l'impact constaté dans le code ou en production.
- Tous les candidats ont un sort écrit ; aucun ne disparaît en silence.

## Contrôles (depuis `{{docDir}}`)

- `npx doc-kit build --draft` : aucun ✖ ni ⚠ pour tes pages.
- `npx doc-kit check tables` : aucun débordement.
- Les compteurs égalent le nombre d'entrées de chaque série (recompte-les).

## Rapport final ({{languageName}}, 350 mots au plus)

- Tableau **candidat → décision** : `ord 2 → I41` ; `tbl 3 → fusionné dans I41` ; `acc 9 → complète M6` ;
  `ast 7 → rejeté : <preuve>`.
- Nouveaux totaux par gravité et par série.
- Pages qui devraient citer les nouveaux numéros (l'orchestrateur ajoutera les liens).
- Constats existants corrigés ou déplacés, avec leur preuve.
