## En bref

<!-- consigne : l'état global en un paragraphe : la pire note, et si elle s'améliore ou s'aggrave. Générer les faits d'abord : `doc-kit facts --source quality`. -->

Exemple : « Globalement sain ; une fonction porte le plus de complexité et c'est aussi aujourd'hui le plus gros manque de sécurité. »

## Notes

<!-- consigne : les notes A à E de `facts/quality.json` (duplication, complexité, taille, tests), chacune avec sa mesure. -->

| Note | Lettre | Mesure |
|---|---|---|
| Duplication | B | 4 % des lignes de code |
| Complexité | B | 2 % des fonctions au-dessus de 15 |
| Taille | A | 0 % des fichiers au-dessus de 500 lignes |
| Tests | C | 20 % des fichiers ont un test |

## Points chauds

<!-- consigne : les fichiers ou fonctions qui combinent taille, complexité et faible couverture de tests — là où un changement risque le plus de casser quelque chose d'invisible. -->

## Duplication

<!-- consigne : facultatif. Les plus gros blocs dupliqués, et s'ils ont dérivé l'un de l'autre (le signe le plus sûr qu'un utilitaire partagé se fait attendre). -->

## Complexité

<!-- consigne : facultatif. Les fonctions les plus complexes, ce qui les rend difficiles à suivre, et si les tests exercent vraiment leurs branches. -->

## Tests

<!-- consigne : le taux de tests, et l'écart entre « a un test » et « le test vérifie quelque chose » (renvoyer vers `tests-quality` plutôt que la répéter). -->

## Dépendances

<!-- consigne : facultatif. Dépendances directes en retard sur leur dernière version (`--network`) ; renvoyer vers la page `dependencies` plutôt que la répéter. -->

## Recommandations

<!-- consigne : classées par effort (le gain rapide d'abord), chacune renvoyant à un point chaud ci-dessus. -->

1. **Gain rapide** : quoi faire, et pourquoi c'est peu coûteux.
2. **Effort plus lourd** : quoi faire, et ce que cela débloque.
