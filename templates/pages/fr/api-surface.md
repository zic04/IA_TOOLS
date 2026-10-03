## En bref

<!-- consigne : combien de routes, lesquelles sont publiques, et l'état global de l'isolation des locataires (vérifiée partout, partiellement, pas vérifiée). Générez d'abord les faits : `doc-kit facts --source api`. -->

Une ou deux phrases, avec les chiffres clés.

## Les routes

<!-- consigne : construit à partir de `::faits{source="api"}`, puis complété à la main : Authentification, Rôle et Isolation des locataires sont des jugements qu'aucun analyseur ne peut porter ; Preuve est un fichier:ligne qui appuie chaque jugement. Ajustez « colonnes » à ce que le fichier de faits contient réellement. -->

::faits{source="api" colonnes="method,route,file"}

<!-- doc-kit:prefill source="api" -->
| Méthode | Route | Authentification | Rôle | Isolation des locataires | Preuve |
|---|---|---|---|---|---|
| GET | `/chemin` | Cookie de session | Tout utilisateur connecté | Filtrée par locataire | [[verifie chemin/fichier.ts:12]] |

## Règles d'accès à la base de données

<!-- consigne : facultatif. Les politiques de sécurité au niveau ligne qui appuient l'isolation ci-dessus (facts/db.json, source « db »), ou leur absence. -->

::faits{source="db" colonnes="table,rls,policies"}

## Routes publiques

<!-- consigne : facultatif. Chaque route atteignable sans authentification, et pourquoi : sonde de santé, webhook, page publique. -->

| Route | Pourquoi elle est publique | Preuve |
|---|---|---|
| `/health` | Sonde de l'équilibreur de charge | [[verifie chemin/fichier.ts:3]] |

## Manques

<!-- consigne : une route sans contrôle d'authentification visible, sans filtre de locataire sur une requête multi-locataire, ou un contrôle de rôle qui ne correspond pas aux données de la route. Chaque manque est un constat numéroté, cité ici et détaillé sur la page des constats. -->

- C1 — une route accepte l'id de tout utilisateur connecté sans vérifier la propriété du locataire ([[verifie chemin/fichier.ts:42]]).
