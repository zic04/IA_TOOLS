> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `business-rules`, écrit pour Acme Orders. Une règle propre à une seule fonctionnalité se définit sur la fiche de cette fonctionnalité ; cette page tient les règles partagées entre fonctionnalités, ou sans propriétaire unique.

## Comment lire cette page

Une règle se définit une seule fois : ici, quand elle concerne plusieurs fonctionnalités, ou dans la section « Règles métier » de l'unique fiche de fonctionnalité à laquelle elle appartient ([[regle RG-01]] sur [la fiche de validation des commandes](#/examples/feature) en est un exemple). Partout ailleurs, une règle n'est que citée, avec `[[regle RG-12]]`, jamais redéfinie.

## Les règles

:::regle{id="RG-12" titre="Une commande au-dessus du seuil attend un responsable"}
Une commande dont le total atteint ou dépasse le seuil de validation en cours ne peut pas être expédiée avant qu'un responsable commercial de sa région ne la valide.

**Exemple.** **Étant donné** une commande de 12 000 € et un seuil de 10 000 €, **quand** l'acheteur la soumet, **alors** elle attend la validation d'un responsable.
:::

:::regle{id="RG-05" titre="Une commande expédiée ne peut pas être annulée"}
Dès qu'une commande atteint le statut **Expédiée**, personne ne peut plus l'annuler depuis l'application ; un retour suit un processus séparé, hors Commandes.

**Exemple.** **Étant donné** une commande au statut **Expédiée**, **quand** un commercial l'ouvre, **alors** l'action **Annuler** n'est pas proposée.
:::

## Les règles par fonctionnalité

::regles{}

## Règles retirées

Aucune pour l'instant : Acme Orders n'a retiré aucune règle métier depuis l'écriture de cette page.
