## Comment lire cette page

Une règle est définie une seule fois, ici, car chacune des règles ci-dessous sert à plusieurs pages. Partout
ailleurs, elle est seulement citée, avec `[[rule BR-02]]`, jamais redéfinie. Une règle qui ne concernerait qu'une
seule fonctionnalité serait définie sur la fiche de cette fonctionnalité.

## Les règles

:::rule{id="BR-01" title="Une commande est Ouverte, Expédiée ou Annulée"}
Une commande porte exactement un des trois statuts, affiché sous forme de pastille colorée : **Ouverte**,
**Expédiée** ou **Annulée**. Il n'existe pas de quatrième statut dans cette version d'Acme Orders.

**Exemple.** **Étant donné** la liste des commandes, **quand** vous filtrez par statut, **alors** les trois choix
proposés sont **Ouverte**, **Expédiée** et **Annulée**, et rien d'autre.
:::

:::rule{id="BR-02" title="Ouvrir la chaîne d'approbation d'une commande la crée"}
La chaîne d'approbation d'une commande n'existe pas tant que personne ne l'a ouverte pour la première fois. Ouvrir
le lien **Chaîne d'approbation**, quelle que soit la personne connectée, crée la chaîne et prévient les
approbateurs, même pour un simple coup d'œil.

**Exemple.** **Étant donné** une commande dont la page d'approbation n'a jamais été ouverte, **quand** quelqu'un
suit le lien **Chaîne d'approbation**, **alors** la chaîne est créée et les approbateurs sont prévenus, que ce
soit voulu ou non.
:::

:::rule{id="BR-03" title="Les chiffres du jour suivent les filtres en cours"}
Les trois chiffres au-dessus du tableau des commandes (**commandes**, **ouvertes**, **total**) sont calculés sur
les commandes actuellement affichées, une fois les filtres de statut, de client et de date appliqués, et non sur
toutes les commandes qu'Acme Orders contient.

**Exemple.** **Étant donné** six commandes dans la liste, **quand** vous filtrez le statut sur **Ouverte**,
**alors** le chiffre **total** additionne seulement les commandes ouvertes affichées, pas les six.
:::

## Les règles par fonctionnalité

::rules{}

## Règles retirées

Aucune pour l'instant : Acme Orders n'a retiré aucune règle de gestion depuis la rédaction de cette page.
