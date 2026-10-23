## À quoi ça sert

**Approuver une commande** donne à chaque commande une piste d'approbation : le lien **Approval chain** sur la page d'une commande. La première fois que quelqu'un l'ouvre, Acme Orders crée la chaîne et prévient les approbateurs ; l'ouvrir de nouveau ne fait que l'afficher.

## Qui l'utilise

| Rôle | Ce qu'il en fait |
|---|---|
| **Membre de l'équipe** | Ouvre une commande et suit son lien **Approval chain**. |

## User stories

:::story{id="US-04" title="Lancer l'approbation d'une commande" role="Membre de l'équipe" since="1.0"}
En tant que **membre de l'équipe**, je veux ouvrir la chaîne d'approbation d'une commande afin que ses approbateurs soient prévenus qu'elle les attend.
:::

## Parcours principal

:::steps
1. Un **membre de l'équipe** ouvre [le détail d'une commande](#/use/orders/detail).
2. Il suit le lien **Approval chain**.
3. Acme Orders crée la chaîne de cette commande et prévient les approbateurs ([[rule BR-02]]).
4. Le membre de l'équipe voit la chaîne ; une visite ultérieure affiche la même chaîne, inchangée.
:::

## Comportements

:::behaviour{kind="notification" title="Prévenir les approbateurs" id="B-03"}
Événement déclencheur : la première ouverture du lien **Approval chain** d'une commande ([[rule BR-02]]).
Destinataires : les approbateurs de la commande.
Canal : inconnu — l'application n'indique pas comment les approbateurs sont prévenus.
Contenu : inconnu — que dit la notification, et renvoie-t-elle vers la commande ?
Délai : immédiat, à la création de la chaîne ; rouvrir le lien n'envoie rien.
:::

## Règles de gestion

[[rule BR-02]] est l'unique règle que cette fonctionnalité existe pour appliquer.

## Messages

| Message | Quand il apparaît | Que faire |
|---|---|---|
| « The approval chain of this order was created … » | Sur la page **Approval chain** | Rien : les approbateurs ont été prévenus |

## Droits par action

| Action | Droit | Condition |
|---|---|---|
| Ouvrir la commande | [[perm orders:read]] | Connecté |
| Ouvrir son **Approval chain** | [[perm orders:approve]] | — |

## Critères d'acceptation

:::scenario{title="La première ouverture crée la chaîne" story="US-04" behaviour="B-03"}
Soit la commande #1041, sans chaîne d'approbation pour l'instant
Quand un membre de l'équipe suit son lien **Approval chain**
Alors la chaîne est créée
Et les approbateurs sont prévenus
:::

:::scenario{title="Une seconde ouverture ne change rien" story="US-04" behaviour="B-03"}
Soit la commande #1041, dont la chaîne existe déjà
Quand un membre de l'équipe suit de nouveau le lien
Alors la même chaîne est affichée, et personne n'est prévenu une seconde fois
:::

## Limites

- Ouvrir le lien suffit : un simple coup d'œil, l'aperçu d'un lien partagé ou un outil automatisé qui le suit crée aussi la chaîne et prévient les approbateurs, que ce soit voulu ou non ([la surface de l'API](#/secure/api-surface~les-routes) le décrit plus précisément pour l'équipe de reprise).

## Questions ouvertes

- **Comment les approbateurs sont-ils prévenus, et que dit la notification ?** Le product owner.
