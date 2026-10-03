> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `maintainability-review`, écrit pour Acme Orders, le produit fictif du kit. Les tableaux ci-dessous sont générés depuis `facts/quality.json` (`doc-kit facts --source quality`).

## En bref

Globalement sain : duplication et complexité sont toutes deux notées B, bien dans les seuils. Une fonction, `decide` de `approvalService.ts`, porte le plus gros des deux — la même fonction qui est aujourd'hui le plus gros manque de contrôle d'accès (C2 des constats) : la complexité et le risque sont tombés au même endroit, ce qui est l'histoire habituelle.

## Notes

| Note | Lettre | Mesure |
|---|---|---|
| Duplication | B | 4 % des lignes de code |
| Complexité | B | 1,4 % des fonctions au-dessus de 15 |
| Taille | A | 0 % des fichiers au-dessus de 500 lignes |
| Tests | C | 20 % des fichiers ont un test |

## Points chauds

::faits{source="quality" colonnes="file,lines,functions,longest,complexity,duplicated,todo"}

`lib/services/approvalService.ts` combine la plus haute complexité (19) et le plus de lignes dupliquées (24) des trois fichiers montrés : sa fonction `decide` est à la fois la plus longue du fichier ([[verifie lib/services/approvalService.ts:88]]) et celle à qui manque un test pour son contrôle de portée (voir Tests ci-dessous).

## Duplication

`lib/services/approvalService.ts` réimplémente sa propre arithmétique de dates au lieu d'utiliser le paquet `acme-date-utils` du projet, qui fait déjà la même chose (voir [Exemple · Carte du code](#/examples/code-map)) — source probable de l'entrée `acme-date-helpers` dans `package.json` (voir [Exemple · Dépendances](#/examples/dependencies)). Les lignes dupliquées n'ont pas encore dérivé l'une de l'autre ; elles se lisent encore pareil aux deux endroits.

## Complexité

`decide` (`lib/services/approvalService.ts:88-97`) se branche sur le rôle de l'étape, son statut, et trois comparaisons de dates pour les rappels — dix-neuf points de décision dans une seule fonction. La suite de tests d'approbation couvre 9 cas ([[verifie lib/services/approvalService.test.ts:1]]), mais aucun ne couvre le contrôle de portée manquant (C2 des constats) : la haute complexité a rendu le manque facile à manquer, pas seulement facile à introduire.

## Tests

20 % des fichiers source ont un fichier de test correspondant ; voir [Exemple · Tests et qualité](#/examples/tests-quality) pour ce qui est réellement exercé plutôt que simplement présent — le fichier de test de `decide` existe et s'exécute, mais aucun de ses 9 cas ne fournit une étape venant d'une autre région.

## Dépendances

`next` a une version mineure de retard sur la dernière 14.2.x (voir [Exemple · Dépendances](#/examples/dependencies) pour la liste complète) ; aucun changement cassant ne s'applique.

## Recommandations

1. **Gain rapide** : extraire les comparaisons de dates de `decide` dans trois fonctions utilitaires nommées ; cela ne change pas le comportement, mais transforme une fonction à 19 branches en une fonction plus facile à faire correspondre à un cas de test.
2. **Gain rapide** : remplacer l'arithmétique de dates faite à la main par le paquet `acme-date-utils` du projet, supprimant la duplication et la confusion avec `acme-date-helpers`.
3. **Effort plus lourd** : une fois `decide` découpée, ajouter le cas de test de portée régionale manquant en même temps que le correctif `scopeWhere` (C2) — les deux changements vont ensemble, pour que le test de non-régression arrive avec le correctif, pas après lui.
