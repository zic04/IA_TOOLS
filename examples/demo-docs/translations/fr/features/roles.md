## En bref

Les fiches fonctionnalité d'Acme Orders décrivent deux rôles, **Membre de l'équipe** et **Approbateur** : un membre
de l'équipe devient approbateur par addition de droits. La version de démonstration ci-dessous ne les vérifie pas
(voir la note sous « Qui peut faire quoi ») ; une version de production appliquerait les droits nommés sur chaque
fiche fonctionnalité.

## Les rôles

- **Membre de l'équipe** : se connecte et utilise [Suivre les commandes](#/features/track-orders) : lit la liste, la
  filtre, ouvre une commande.
- **Approbateur** : tout ce que peut faire un membre de l'équipe, plus [Approuver une commande](#/features/approve-order) :
  ouvrir la **Chaîne d'approbation** d'une commande.

## Qui peut faire quoi

::roles{}

> [!NOTE] Non appliqué dans cette démo
> Le tableau ci-dessus est le modèle visé. La version de démonstration vérifie seulement que quelqu'un est
> connecté, pas le rôle qu'il détient : aujourd'hui, toute personne connectée peut ouvrir une **Chaîne
> d'approbation** ([la surface de l'API](#/secure/api-surface) décrit cet écart pour l'équipe de reprise).

## Responsabilités

Acme Orders ne garde aucune trace de qui a approuvé quoi au-delà de la chaîne elle-même : la démo ne distingue pas
la décision d'un approbateur de celle de n'importe qui ouvrant le même lien.

## Comment obtenir un rôle

Sans objet : cette démo n'a pas d'écran d'administration des utilisateurs. N'importe quelle adresse e-mail et
n'importe quel mot de passe connectent au même unique compte de démonstration.
