## En bref

<!-- consigne : l'état global en un paragraphe : un nombre de tests, un pourcentage de couverture quand il est mesuré, et le risque principal (parcours critiques non testés, tests qui n'affirment rien). Générez d'abord les faits : `doc-kit facts --source tests`. -->

Exemple : « Quelques centaines de tests, environ deux tiers de couverture de lignes ; un parcours critique n'a aucun test. »

## Ce qui est testé

<!-- consigne : construit à partir de `::faits{source="tests"}`. -->

::faits{source="tests" colonnes="file,tests"}

## Parcours critiques

<!-- consigne : les parcours qui ne doivent jamais casser (paiement, approbation, connexion), et si chacun est réellement couvert par un test qui échouerait s'il cassait. -->

| Parcours | Testé ? | Preuve |
|---|---|---|
| Parcours d'exemple | Non | [[inconnu]] |

## Tests qui ne testent rien

<!-- consigne : facultatif. Des tests qui passent toujours quel que soit le code (une assertion sur une constante, un appel simulé jamais vérifié) : un motif connu du code généré par IA. -->

- Un test n'appelle jamais le code qu'il nomme ([[verifie chemin/fichier.test.ts:40]]).

## Comment les lancer

<!-- consigne : la commande exacte, et à quoi ressemble une exécution saine. -->

La commande de test lance toute la suite en quelques secondes.
