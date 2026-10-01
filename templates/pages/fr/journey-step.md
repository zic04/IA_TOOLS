## En bref

<!-- consigne : 3 à 6 lignes à puces : déclencheur, acteur et droit requis, synchrone ou non, durée, résultat ; chaque point avec sa preuve. Exemple : « **Déclencheur** : un clic sur **Soumettre à validation**, jamais l'enregistrement d'un brouillon. » -->

- **Déclencheur** : le geste ou l'événement (`chemin/fichier.ts:31`).
- **Acteur** : qui, avec quel droit ([[droit module:write]]).
- **Synchrone** : ce qui s'exécute dans la même requête, ce qui part en fond.
- **Résultat** : ce qui est écrit, et où.

## Ce qui se passe, pas à pas

<!-- consigne : une étape par ligne, dans l'ordre réel du code : ce qui se passe, la preuve fichier:ligne, ce qui est lu ou écrit, l'appel externe éventuel. Un titre court en gras au début de chaque étape. -->

:::etapes
1. **Le déclencheur.** Ce qui part du navigateur (`chemin/composant.tsx:44`).
2. **Les gardes.** Droits et périmètre vérifiés par le serveur (`chemin/service.ts:473`).
3. **Le traitement.** Ce qui est calculé, appelé, écrit.
:::

## Ce qui est lu et écrit

<!-- consigne : facultatif. Une ligne par écriture ou lecture notable : base, stockage, index, journal d'audit, coûts, traces. -->

| Où | Quoi | Quand |
|---|---|---|
| `Table` | Champs écrits | À quel moment de la requête |

## Les états

<!-- consigne : facultatif. Les valeurs de statut que cette étape écrit, avec le libellé affiché et ce que l'utilisateur doit faire. -->

| Statut | Libellé affiché | Que faire |
|---|---|---|
| `VALEUR` | **Libellé** | Le geste suivant |

## Ce que voit l'utilisateur

<!-- consigne : l'écran au moment de l'étape : une capture existante avec sa légende (autant d'éléments que de zones), ou une description si aucune capture n'existe. Dites aussi ce que l'écran ne montre pas (indicateur d'attente absent, statut qui ne se rafraîchit pas). -->

## Quand ça se passe mal

<!-- consigne : les messages exacts, leur origine et la reprise ; puis ce qui reste écrit à moitié. -->

| Message | Origine | Reprise |
|---|---|---|
| « Message exact » | Cause vérifiée dans le code | Geste de reprise |

> [!ATTENTION] Ce qui reste écrit à moitié
> - L'état laissé par un échec, et comment le reprendre.

## Pour aller plus loin

<!-- consigne : la page technique du sujet, l'écran concerné, l'étape suivante du parcours. -->

- Titre de la page liée : ce qu'on y trouve.
