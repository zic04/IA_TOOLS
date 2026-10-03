<!-- consigne : page d'exemple. Renommez-la et déplacez-la avec son pendant métier (fonctionnalites/exemple-fonctionnalite.md). Une sous-page technique n'a pas d'« En bref » : la page parente (reprendre/architecture) le porte. Enchaînez un ## par mécanisme, dans l'ordre où le code les exécute, chacun avec sa preuve fichier:ligne. -->

## Ce qui la déclenche

<!-- consigne : le déclencheur côté serveur de [[fonctionnalite F-01]] — une route, une action serveur, une tâche planifiée — avec sa preuve. -->

| Déclencheur | Où | Preuve |
|---|---|---|
| Déclencheur d'exemple | `chemin/fichier.ts` | `chemin/fichier.ts:12` |

## Ce qui est lu et écrit

<!-- consigne : les tables ou enregistrements lus et écrits, dans l'ordre où le code les touche. -->

:::etapes
1. Premier geste réel (`chemin/fichier.ts:41`).
2. Deuxième geste, avec sa preuve.
:::

## Statut des affirmations

<!-- consigne : facultatif. Une affirmation non lue directement dans le code est marquée [[deduit]] ; une que personne n'a encore pu vérifier est marquée [[inconnu]] (ARCHITECTURE.md §6.9). Supprimez cette section une fois que chaque affirmation ci-dessus porte sa propre preuve en ligne. -->

Le comportement de reprise après échec est [[deduit]] de l'absence de file d'attente de rejets ; s'il est
testé est [[inconnu]].

## Pour aller plus loin

<!-- consigne : la fiche de fonctionnalité métier (son pendant, affiché automatiquement en haut de cette page), la page parente d'architecture, et toute sous-page sœur. -->

- [Architecture d'ensemble](#/reprendre/architecture) : la page parente.
