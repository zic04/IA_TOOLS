## À quoi ça sert

La **liste des commandes** est la première page affichée après la connexion. Elle résume les commandes du jour et
donne accès à toutes les fonctions par le menu [[menu Orders › All orders]] ([[route /orders]]). Une nouvelle
commande reçoit le statut [[status open]] ; une commande annulée, [[status cancelled]].

> [!TIP]
> La recherche s'ouvre aussi au clavier : [[key Ctrl+K]].

## Comment ça marche

La liste est chargée depuis l'API à l'ouverture de la page. Le **Résumé des commandes** suit toujours les trois
filtres placés au-dessus, et non toutes les commandes de la liste ([[rule BR-03]]) : resserrez les filtres, et les
chiffres du jour se resserrent avec eux.

## L'écran

:::screen{capture="orders-list" title="Commandes · liste"}
1. **Filtres** : statut, client et date ; ils sont conservés jusqu'à la déconnexion.
2. **Résumé des commandes** : les chiffres du jour, recalculés à chaque ouverture de la page.
3. **Nouvelle commande** : crée une commande ; voir [les réglages](#/use/settings~reference-de-chaque-reglage).
:::

## Exemple

### Exemple

### Exemple

| Réglage | Valeur | Effet |
|---|---|---|
| Adresse de l'API | `https://orders.example.org/api/v1/orders?status=open` | Origine des données |
| Thème | Clair · Sombre | Couleurs de l'interface |

## Dans cette partie

- [Le détail d'une commande](#/use/orders/detail)

## Pièges et limites à connaître

> [!WARNING] Commandes en attente de livraison
> Une commande en attente de livraison reste dans la liste tant que chaque ligne n'a pas été expédiée.

## Droits requis

> [!PERMISSIONS]
> Voir la liste : [[perm orders:read]].
