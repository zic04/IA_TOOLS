---
agent: doc-kit-reviewer
---
# Brief — vérification et intégration des constats

Tu es le SEUL à écrire dans les points d'attention du site de documentation : sa page parente et ses sous-pages
(voir Variables pour le chemin). Un autre agent corrige les autres pages et le glossaire EN MÊME TEMPS : ne
touche aucun autre fichier.

## Entrées

- Le fichier de consolidation (chemin dans Variables) : une section par rédacteur (candidats constats, erreurs
  signalées, glossaire proposé), puis « Doublons trouvés », déjà réglés par l'orchestrateur.
- Le code (chemin et version dans Variables).
- Les constats actuels : lis la page parente (gravités, définitions, compteurs, « L'essentiel en une minute »,
  note de version) et TOUTES ses sous-pages, pour connaître les numéros déjà pris et le format de chaque série.

## Pour chaque candidat

1. **Revérifie dans le code** chaque `fichier:ligne` cité ; corrige les numéros de ligne qui ont bougé. Ce que
   le rédacteur a déduit reste « déduit » si tu ne peux pas l'observer.
2. **Décide**, et note la décision :
   - **nouveau constat** : il prend le numéro suivant de sa série (C critique, I important, M mineur, ou une
     série thématique que la page définit, comme P pour les constats propres à la production) ;
   - **complète un constat existant** : enrichis celui-ci (preuve, impact, recommandation) sans nouveau
     numéro ;
   - **fusionné** : les doublons réglés (« inv 8 = tbl 1 ») deviennent un seul constat, preuves combinées,
     gravité la plus haute sauf preuve contraire ;
   - **rejeté** : avec la preuve que le code ne le confirme pas.
3. **Classe** à l'aide des définitions de la page parente. Repères : Critique = un risque actuel pour la
   sécurité, la confidentialité ou la promesse centrale du produit ; Important = un vrai défaut, un
   contournement possible, une fonctionnalité cassée ou trompeuse ; Mineur = dette, incohérence, affichage,
   hygiène.
4. **Rédige** dans la bonne sous-page, dans le format déjà en place : une section `## I40 — Titre` avec
   **Constat** (et `fichier:ligne`), **Impact**, **Recommandation**, puis une ligne **Propriétaire** ·
   **Décision** (corriger, accepter, transférer, éviter) · **Statut** (ouvert, en cours, fait, accepté) ·
   **Échéance** — le registre des risques que la page des points d'attention est devenue ; ou une ligne de
   tableau avec les mêmes colonnes que les autres, « Suivi » combinant Propriétaire · Décision · Statut ·
   Échéance en une seule colonne quand quatre ne tiendraient pas. Un candidat avec une Décision suggérée (d'un
   rapport `code-health` ou `access-ownership`) la garde sauf si le code montre autre chose ; Propriétaire
   commence à « — » si personne n'en a proposé. Liens internes vers des ids du sommaire seulement.

## Ensuite

- Mets à jour les **compteurs** : le tableau des gravités de la page parente, les phrases qui annoncent une
  plage (« M1 à M44 »), l'introduction de chaque sous-page.
- Mets à jour « L'essentiel en une minute » si un nouveau constat change les priorités, et la note de version
  (ce que cette version intègre, d'où viennent les constats, version du code vérifiée : voir Variables).
- **Erreurs signalées dans les constats eux-mêmes** (un constat existant faux ou périmé) : corrige-les avec
  preuve. Un constat que l'application a corrigé passe dans « Constats déjà corrigés ».

## Règles

- N'écris QUE dans la page des points d'attention et ses sous-pages (chemin dans Variables). Ne touche ni le
  sommaire, ni le glossaire, ni les autres pages (même pas pour ajouter un lien), ni le kit, ni l'application.
  Aucune commande git.
- Rien d'inventé : une gravité se justifie par l'impact observé dans le code ou en production.
- Chaque candidat a une issue écrite ; aucun ne disparaît en silence.

## Contrôles (depuis le dossier de la documentation)

- `npx doc-kit build --draft` : aucun ✖ ni ⚠ pour tes pages.
- `npx doc-kit check tables` : aucun débordement.
- Les compteurs égalent le nombre d'entrées de chaque série (recompte-les).

## Rapport final (350 mots au plus, dans la langue du projet)

- Un tableau candidat-décision : `ord 2 → I41` ; `tbl 3 → fusionné dans I41` ; `acc 9 → complète M6` ;
  `ast 7 → rejeté : <preuve>`.
- Nouveaux totaux par gravité et par série.
- Pages qui devraient citer les nouveaux numéros (l'orchestrateur ajoutera les liens).
- Constats existants corrigés ou déplacés, avec leur preuve.

## Variables

- Produit : {{product}}
- Dossier de la doc : `{{docDir}}`
- Code de l'application : `{{appDir}}`, version {{version}}
- Page des points d'attention et sous-pages : `{{contentDir}}/{{findingsPage}}.md`
- Fichier de consolidation : `{{consolidationFile}}`
- Sommaire : `{{tocFile}}`
- Fichier du glossaire : `{{glossaryFile}}`
- Langue : {{languageName}}
