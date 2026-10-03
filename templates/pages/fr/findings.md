## Comment lire cette page

<!-- consigne : le périmètre (écarts, risques et dettes constatés à la reprise), la version du code revérifiée et la date, les sources des constats de production ; puis le tableau des gravités avec le nombre de constats ; puis la règle de numérotation. Les numéros ne changent jamais : un nouveau constat prend le numéro libre suivant de sa famille. -->

| Gravité | Définition | Nombre |
|---|---|---|
| **Critique** | Risque actuel pour la sécurité des données, la confidentialité ou la promesse première du produit ; à traiter avant toute autre évolution | 0 |
| **Important** | Défaut réel, contournement possible, fonction cassée ou trompeuse ; à planifier rapidement | 0 |
| **Mineur** | Dette, incohérence, affichage ou hygiène ; à traiter au fil de l'eau | 0 |

Les constats sont numérotés **C** (critiques), **I** (importants) et **M** (mineurs). Deux familles s'y ajoutent, avec leur gravité dans une colonne : **P**, propres à la production (la configuration réelle diffère de ce que prévoit le code), et **R**, réglages et écrans sans effet. (Un site en anglais utilise **N** pour cette dernière famille.)

## L'essentiel en une minute

<!-- consigne : 4 à 6 actions prioritaires, chacune avec les numéros des constats qu'elle traite. Exemple : « **Planifier la relance des factures** : en production, elle n'a jamais tourné (C1). » -->

:::etapes
1. **Action prioritaire** : pourquoi, et les constats concernés (C1).
2. **Action suivante** : idem.
:::

## Dans cette partie

<!-- consigne : facultatif. Dès que la liste dépasse environ 2 000 mots, une sous-page par famille : production (P), critiques (C), importants (I, éventuellement en deux pages), mineurs (M), sans effet (R). Une ligne par sous-page ; colonne 1 = lien. Cette page est un registre de risques : chaque constat porte aussi Propriétaire (qui décide), Décision (corriger, accepter, transférer, éviter), Statut (ouvert, en cours, fait, accepté) et Échéance. Format d'un constat critique : « ## C1 — titre », puis Constat, Impact, Recommandation, puis une ligne « Propriétaire · Décision · Statut · Échéance ». Format des autres : tableau N° · Point · Où · Constat et impact · Recommandation · Suivi, « Suivi » regroupant Propriétaire · Décision · Statut · Échéance en une seule colonne (quatre colonnes séparées dépassent souvent la largeur de lecture une fois Où et Recommandation ajoutés ; regroupez-les, ou passez plus tôt en sous-pages). -->

| Sous-page | Ce que vous y trouverez |
|---|---|
| Constats critiques | Les constats C, chacun détaillé : constat, impact, recommandation. |

## Les points déjà corrigés

<!-- consigne : facultatif. Les constats des audits précédents vérifiés comme corrigés dans le code actuel, avec la preuve. -->

| Constat d'origine | Preuve |
|---|---|
| Le constat et l'audit dont il vient | `chemin/fichier.ts:111` |

## Ce qui n'a pas pu être vérifié

<!-- consigne : facultatif. Ce que la rédaction n'a pas pu observer (accès refusé, production non consultée, fonction impossible à déclencher sans écrire) : c'est la liste des questions à poser à l'équipe. -->

- Ce qui reste à confirmer, et auprès de qui.

## La documentation existante à ne plus suivre

<!-- consigne : facultatif. Chaque document périmé du dépôt : son état réel et la page qui le remplace. -->

| Document | État | Remplacé par |
|---|---|---|
| `docs/FICHIER.md` | Ce qui y est faux | La page de ce site qui le remplace |
