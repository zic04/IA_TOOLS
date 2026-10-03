> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `process`, écrit pour Acme Orders : le même circuit de validation que [la fiche de fonctionnalité](#/examples/feature), vu comme un processus de bout en bout.

## En bref

Le processus de validation des commandes démarre au moment où un commercial soumet une commande au-dessus du seuil, et se termine quand un responsable commercial décide. La plupart des commandes le traversent en moins d'une journée ; les autres attendent une relance ou une relance du commercial.

## Qui intervient

- **Commercial** : soumet la commande, et la resoumet si elle est rejetée.
- **Responsable commercial** : le seul rôle qui décide.
- **Tâche de relance** : un traitement planifié, pas une personne ; il relance un responsable après deux jours ouvrés.

## Les étapes

:::etapes
1. Un **commercial** soumet une commande au-dessus du seuil.
2. La commande attend, visible dans la file de validation du responsable de sa région ([[fonctionnalite F-01]]).
3. Un **responsable commercial** l'approuve ou la rejette.
4. En cas d'approbation, la commande peut être expédiée ; en cas de rejet, elle revient au commercial avec un motif.
:::

## Les états

| État | Ce qu'il signifie |
|---|---|
| **En attente de validation** | Soumise, en attente d'une décision ; ne peut pas encore être expédiée |
| **Validée** | Un responsable a décidé oui ; peut être expédiée |
| **Rejetée** | Un responsable a décidé non ; revient au commercial, un motif joint |

## Ce qui se fait tout seul, et ce qui attend quelqu'un

### Tout seul

- La commande passe **En attente de validation** dès qu'elle est soumise, sans action nécessaire.
- La relance se déclenche automatiquement deux jours ouvrés après l'entrée en **En attente de validation**, si elle attend encore.

### Attend quelqu'un

- La décision de validation elle-même attend toujours un responsable commercial ; rien ne décide à sa place.
- Resoumettre une commande rejetée attend le commercial.

## Délais et relances

Il n'y a pas d'échéance ferme : une commande peut attendre indéfiniment. Une seule relance est envoyée aux responsables de la région après deux jours ouvrés ; au-delà, seule une relance directe fait avancer les choses.

## Quand ça se passe mal

Si tous les responsables d'une région sont absents, la file se remplit tout de même, mais rien n'escalade automatiquement vers une autre région. Finance peut faire fonction de responsable de remplacement sur demande, mais c'est un arrangement manuel, pas une fonctionnalité de l'application.

## Fonctionnalités concernées

- [[fonctionnalite F-01]]
