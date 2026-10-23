## À quoi ça sert

**Suivre les commandes** est la première chose que voit un membre de l'équipe après sa connexion : la liste complète des commandes, restreinte par statut, client ou date, avec au-dessus les chiffres de ce qui est affiché et un accès au détail de chaque commande.

## Qui l'utilise

| Rôle | Ce qu'il en fait |
|---|---|
| **Membre de l'équipe** | Trouve une commande, suit celles qui sont ouvertes, et ouvre une commande pour vérifier son statut. |

## User stories

:::story{id="US-01" title="Filtrer par statut" role="Membre de l'équipe" since="1.0"}
En tant que **membre de l'équipe**, je veux filtrer les commandes par statut afin de traiter d'abord les commandes ouvertes.
:::

:::story{id="US-02" title="Retrouver les commandes d'un client" role="Membre de l'équipe" since="1.0"}
En tant que **membre de l'équipe**, je veux saisir une partie du nom d'un client afin de retrouver ses commandes sans faire défiler la liste.
:::

:::story{id="US-03" title="Lire les chiffres de ce que je vois" role="Membre de l'équipe" since="1.2"}
En tant que **membre de l'équipe**, je veux que les chiffres au-dessus de la liste suivent mes filtres afin de connaître le volume de ce que je regarde.
:::

## Parcours principal

:::steps
1. Un **membre de l'équipe** ouvre [la liste des commandes](#/use/orders) : toutes les commandes sont affichées, dans l'ordre où l'application les envoie.
2. Il saisit une partie du nom d'un client dans **Customer**, ou choisit un **Status** ou une **Date**, seuls ou ensemble.
3. La liste et les trois chiffres au-dessus (**orders**, **open**, **total**) suivent à chaque changement, sans bouton à actionner ([[rule BR-03]]).
4. Il ouvre une commande depuis la liste pour en voir [le détail](#/use/orders/detail).
:::

## Comportements

:::behaviour{kind="search" title="Trouver une commande par client" id="B-01"}
Où : le champ **Customer**, « Search a customer… », dans le panneau **Filters** à côté de la liste.
Champs cherchés : le nom du client **uniquement** : ni le numéro de commande, ni le montant, ni le statut.
Correspondance : le nom doit **contenir** le texte saisi, quelle que soit la casse ; **les accents comptent** : « cafe » ne trouve pas « Blue Harbor Café ».
Plusieurs mots : le texte est cherché tel quel, comme une seule expression : « harbor café » trouve « Blue Harbor Café », « café harbor » ne trouve rien.
Déclenchement : à chaque frappe, dès le premier caractère ; les espaces aux deux extrémités sont ignorés.
Filtres associés : avec **Status** et **Date** : une commande doit remplir toutes les conditions à la fois.
Ordre des résultats : sans objet — l'ordre d'envoi de l'application est conservé ; aucune colonne ne trie la liste.
Pagination : sans objet — toutes les commandes reçues sont affichées, sans limite.
Aucun résultat : le tableau reste vide, sans message ; les trois chiffres affichent 0.
Erreurs : inconnu — que voit un membre de l'équipe quand les commandes ne peuvent pas être chargées ? Rien de particulier n'est affiché.
Droits : toute personne connectée, qui voit la liste ([[perm orders:read]]) ; la recherche ne restreint rien de plus.
:::

:::behaviour{kind="filter" title="Filtrer par statut et par date" id="B-02"}
Critères : **Status** : All, Open, Shipped ou Cancelled, comparé tel quel ; **Date** : un jour, jamais une période.
Combinaison : les critères s'additionnent (toutes les conditions à la fois), entre eux et avec la recherche par client.
Par défaut : **All** et aucune date : toutes les commandes sont affichées.
Déclenchement : dès qu'une valeur change.
Remise à zéro : choisir **All** et effacer la date ; il n'y a pas de bouton pour cela.
Conservation : non : les filtres sont perdus quand on quitte la page.
Effet : les trois chiffres au-dessus de la liste suivent les filtres ([[rule BR-03]]).
Aucun résultat : le tableau reste vide, sans message.
:::

## Règles de gestion

[[rule BR-01]] limite un statut à trois valeurs ; [[rule BR-03]] régit les chiffres au-dessus du tableau.

## Messages

Sans objet — la liste n'affiche aucun message propre : un résultat vide laisse le tableau vide et les chiffres à 0.

## Droits par action

| Action | Droit | Condition |
|---|---|---|
| Voir la liste, rechercher et filtrer | [[perm orders:read]] | Connecté ; une personne non connectée est renvoyée vers la page de connexion |
| Ouvrir une commande | [[perm orders:read]] | — |

## Critères d'acceptation

:::scenario{title="Une partie du nom d'un client" story="US-02" behaviour="B-01"}
Soit les commandes de « Northwind Bistro » (#1041 et #1045)
Quand je saisis « north » dans **Customer**
Alors il ne reste que les commandes #1041 et #1045
:::

:::scenario{title="Les accents comptent" story="US-02" behaviour="B-01"}
Soit la commande de « Blue Harbor Café » (#1042)
Quand je saisis « cafe » dans **Customer**
Alors aucune commande n'est affichée
Et les trois chiffres affichent 0
:::

:::scenario{title="Statut et date ensemble" story="US-01" behaviour="B-02"}
Soit trois commandes ouvertes, dont deux du 15 janvier 2026
Quand je choisis le **Status** « Open » et la date du 15 janvier 2026
Alors il reste deux lignes : #1041 et #1042
:::

:::scenario{title="Les chiffres suivent le filtre" story="US-03" behaviour="B-02"}
Soit le **Status** « Shipped »
Alors **orders** affiche 2 et **total** affiche 3 600,00 $
:::

## Limites

- Les filtres ne sont conservés nulle part une fois la page quittée : en revenant à la liste, on repart de **All**.

## Questions ouvertes

- **Que voit un membre de l'équipe quand les commandes ne peuvent pas être chargées ?** Le product owner.
