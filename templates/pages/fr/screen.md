## À quoi ça sert

<!-- consigne : le besoin métier en 2 à 4 phrases, avec le nom exact de l'écran en gras, puis l'encadré « Où se trouve cet écran ». Exemple : « **Commandes** est le point d'entrée de l'activité commerciale : la liste de toutes les commandes que vous avez le droit de voir. » -->

> [!NOTE] Où se trouve cet écran
> [[menu Pôle › Écran]] ([[route /chemin]]).

## Comment ça marche

<!-- consigne : le mécanisme réel, lu dans le code : qui calcule (serveur ou navigateur), dans quel ordre, avec quelles limites, et ce que l'utilisateur voit changer. Exemple : « La liste est calculée par le serveur à chaque changement de filtre, 15 lignes par page. » -->

> [!MECANISME] Ce que fait le serveur pour afficher l'écran
> 1. Première étape réelle, dans l'ordre du code.
> 2. Deuxième étape.
> 3. Troisième étape.

## L'écran

<!-- consigne : une capture interactive par panneau (sous-titres ### s'il y en a plusieurs). La liste a EXACTEMENT autant d'éléments que la capture a de zones (3 à 12), dans l'ordre de lecture. Chaque élément : le libellé exact en gras, puis son rôle, ses valeurs, son défaut et son effet, en 1 à 3 phrases. -->

:::ecran{capture="id-de-la-capture" titre="Pôle › Écran"}
1. **Libellé exact**. Rôle, valeurs, défaut, effet.
2. **Libellé exact**. Rôle, valeurs, défaut, effet.
3. **Libellé exact**. Rôle, valeurs, défaut, effet.
:::

## Chaque action

<!-- consigne : facultatif. Une sous-section ### par action qui demande plus que les 3 phrases d'une légende : fenêtre, confirmation, contrôle du serveur, trace au journal. Exemple : « ### Transférer les commandes d'une personne qui part ». Supprimez la section si la légende suffit. -->

## Référence de chaque réglage

<!-- consigne : une ligne par réglage visible ; valeurs et défauts lus dans le code (schémas de validation, composants). Un tableau par groupe de réglages si l'écran en a plusieurs. -->

| Réglage | Contrôle | Valeurs · défaut | Effet |
|---|---|---|---|
| **Libellé** | Liste | Valeurs possibles · défaut | Ce qui change |

## Pas à pas : nom de la tâche

<!-- consigne : la tâche la plus fréquente, en 4 à 7 étapes qui commencent par un verbe à l'impératif. Exemple : « Ouvrez [[menu Commandes › Toutes les commandes]] et cliquez **Filtres**. » -->

:::etapes
1. Ouvrez [[menu Pôle › Écran]].
2. Deuxième geste.
3. Troisième geste.
:::

## Cas d'usage courants

<!-- consigne : facultatif, à la place ou en plus du pas à pas : 3 à 5 situations réelles, une ligne chacune, « Situation : gestes ». Exemple : « **Gérer un départ** : cliquez l'icône **Transférer**, choisissez le **Repreneur**, puis **Transférer**. » -->

:::etapes
1. **Situation** : les gestes, dans l'ordre.
:::

## Pièges et limites à connaître

<!-- consigne : un encadré ATTENTION par piège réel, titré par le piège en une ligne ; puis l'encadré NOTE des écarts constatés, avec la version et une preuve fichier:ligne par écart. On décrit l'écart ; on ne corrige jamais l'application depuis la documentation. -->

> [!ATTENTION] Le piège, en une ligne
> Ce qui se passe, pourquoi, et comment l'éviter.

> [!NOTE] Écarts constatés (vX.Y.Z)
> - Écart entre l'écran, la documentation et le code (`chemin/fichier.ts:42`).

## En production

<!-- consigne : facultatif. L'état réellement paramétré en production, daté et sourcé (écran consulté en lecture seule). Exemple : « Le 1er octobre 2026, 38 comptes, dont 14 jamais connectés. » Supprimez la section si la production n'a pas été observée. -->

## Droits requis

<!-- consigne : toujours la dernière section. Distinguez voir, enregistrer et les actions spéciales, avec les codes de permission et les rôles livrés avec le produit. -->

> [!DROITS] Qui peut faire quoi sur cet écran
> - **Voir** l'écran : [[droit module:read]].
> - **Enregistrer** : [[droit module:write]].
> - **Actions spéciales** : la permission et ce qu'elle ouvre.
