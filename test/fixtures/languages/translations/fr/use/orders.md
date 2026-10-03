## Ce à quoi ça sert

La **liste des commandes** est la première page affichée après la connexion (marker-business-7q). Elle résume les
commandes du jour et donne accès à toutes les fonctions via le menu [[menu Orders › All orders]]. Une nouvelle
commande reçoit le statut [[status open]].

## L'écran

:::screen{capture="orders-list" title="Orders · list"}
1. **Filtres** : statut, client et date ; ils sont conservés jusqu'à la déconnexion.
2. **Résumé des commandes** : chiffres du jour, recalculés à chaque ouverture de la page.
3. **Nouvelle commande** : crée une commande ; voir [les réglages](#/use/settings~what-it-is-for).
:::

## Derrière l'écran

La liste est servie par l'API des commandes, décrite dans [l'architecture](#/take-over/architecture) et limitée par
[les quotas de l'API](#/use/api-limits~quotas).

## Dans cette partie

- [Détail de la commande](#/use/orders/detail)
