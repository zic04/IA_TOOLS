## En bref

<!-- consigne : combien de tables, lesquelles portent des données personnelles, et si la sécurité au niveau ligne est active. -->

Exemple : « Une douzaine de tables ; quelques-unes portent des données personnelles ; la sécurité au niveau ligne est active sur toutes. »

## Le schéma

<!-- consigne : facultatif. Un schéma entité-association (SVG) des tables principales. -->

::schema{id="data-model" titre="Tables principales et leurs relations."}

## Tables

<!-- consigne : construit à partir de `::faits{source="db"}` ; ajoutez ce qu'une colonne signifie quand son nom n'est pas clair. -->

::faits{source="db" colonnes="table,columns,rls,policies"}

<!-- doc-kit:prefill source="db" -->
| Table | Colonnes | Ce qu'elle contient | Preuve |
|---|---|---|---|
| `nom_de_table` | `id, nom, cree_le` | Une ligne par commande client | [[verifie chemin/schema.prisma:12]] |

## Données personnelles

<!-- consigne : chaque table et colonne portant des données personnelles, sa base légale, et si elle entre dans le champ d'un règlement sur la vie privée. -->

| Table | Colonne | Ce que c'est | Base légale |
|---|---|---|---|
| Table d'exemple | `email` | E-mail de contact | Contrat |

## Conservation

<!-- consigne : facultatif. Combien de temps chaque type de donnée personnelle est conservé, et si quelque chose la supprime réellement. -->

- Les données d'exemple sont conservées indéfiniment ; aucune tâche de suppression n'a été trouvée ([[inconnu]]).

## Sous-traitants

<!-- consigne : facultatif. Les tiers qui reçoivent des données personnelles (fournisseur de paiement, envoi d'e-mails, analytique). -->

| Sous-traitant | Données reçues | Référence contractuelle |
|---|---|---|
| Sous-traitant d'exemple | Jeton, montant | — |

## Migrations

<!-- consigne : facultatif. Comment les changements de schéma sont appliqués (un outil de migration, à la main), et l'état de l'historique des migrations. -->

Les migrations s'exécutent automatiquement au déploiement ([[verifie chemin/fichier:1]]).
