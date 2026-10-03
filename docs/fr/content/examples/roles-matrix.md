> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `roles-matrix`, écrit pour Acme Orders.

## En bref

Acme Orders livre quatre rôles : **Commercial**, **Responsable commercial**, **Finance** et **Administrateur**. Un utilisateur détient exactement un rôle ; aucun droit complémentaire ne s'accorde en dehors de lui.

## Les rôles

- **Commercial** : crée et modifie les commandes de sa propre région ; ne peut pas valider une commande au-dessus du seuil.
- **Responsable commercial** : tout ce qu'un commercial peut faire, plus l'approbation ou le rejet des commandes de sa propre région ([la fonctionnalité de validation](#/examples/feature)).
- **Finance** : lit les commandes de toutes les régions et fixe le seuil de validation ; ne crée ni ne modifie de commande.
- **Administrateur** : tous les droits ci-dessous, sur toutes les régions ; le seul rôle qui peut réattribuer le rôle d'un autre utilisateur.

## Qui peut faire quoi

::roles{}

## Responsabilités

Le responsable commercial qui valide une commande en répond : la revue mensuelle de Finance retrace chaque validation jusqu'au responsable qui l'a prise. Un commercial n'apparaît jamais comme validateur, même pour ses propres commandes.

## Comment obtenir un rôle

Les rôles s'attribuent sur l'écran d'administration **Utilisateurs** par un **Administrateur** ; il n'y a pas de demande en libre-service. Un nouveau responsable commercial est mis en place par Finance, qui confirme aussi la région qu'il couvrira.
