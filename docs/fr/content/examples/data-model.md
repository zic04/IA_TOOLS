> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `data-model`, écrit pour Acme Orders, le produit fictif du kit. Ses preuves `fichier:ligne` renvoient à un code fictif. Le tableau ci-dessous est généré à partir de `facts/db.json`, écrit par `doc-kit facts --source db`.

## En bref

4 tables ; `customers` porte des données personnelles. La sécurité au niveau ligne n'est active que sur `orders` — `customers` et `approval_steps` reposent sur le seul code applicatif (voir les Manques de la page Surface d'API).

## Le schéma

::schema{id="data-model" titre="Commandes, clients et étapes de validation, et leurs relations."}

## Tables

::faits{source="db" colonnes="table,columns,rls,policies"}

`approval_steps.decided_by` est un identifiant d'utilisateur, pas un nom en texte libre : résolu en nom affiché seulement à l'affichage de la page.

## Données personnelles

| Table | Colonne | Ce que c'est | Base légale |
|---|---|---|---|
| `customers` | `email` | E-mail de contact, utilisé pour les factures | Contrat |
| `customers` | `name` | Nom affiché | Contrat |

## Conservation

- Les commandes et leurs étapes de validation sont conservées indéfiniment ; aucune tâche de suppression n'a été trouvée ([[inconnu]]). Les clients qui ferment leur compte gardent leurs commandes passées, pour des raisons comptables — confirmer que c'est documenté quelque part qu'un client peut lire.

## Sous-traitants

| Sous-traitant | Données reçues | Référence contractuelle |
|---|---|---|
| Fournisseur de paiement | Montant de la commande, un jeton de carte (jamais le numéro) | — |
| Fournisseur d'e-mail transactionnel | E-mail du client, référence de la commande | — |

## Migrations

Les migrations s'exécutent avec `npx prisma migrate deploy` dans le cadre du pipeline de déploiement ([[verifie prisma/schema.prisma:1]]) ; la politique de sécurité au niveau ligne sur `orders` a été ajoutée à la main ensuite, en migration SQL simple ([[verifie infra/migrations/0012_orders_rls.sql:1]]), hors de l'historique de migration de Prisma.
