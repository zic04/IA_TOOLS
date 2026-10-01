> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `resources`, écrit pour Acme Orders, le produit fictif du kit. Ses preuves `fichier:ligne` renvoient à un code fictif.

## En bref

Le déploiement de production d'Acme Orders tient dans un seul groupe de ressources, `rg-acme-orders-prd`, dans une région d'Europe de l'Ouest, observé en lecture seule dans le portail du fournisseur cloud le 30 septembre 2026. Il compte 19 ressources en cinq familles. Toute l'application tourne dans une seule application conteneur ; tout le reste porte ses données, ses secrets ou ses journaux.

| Famille | Nombre | Ressources |
|---|---|---|
| Calcul | 5 | L'environnement de conteneurs, l'application conteneur, 3 tâches planifiées |
| Données | 4 | Un serveur PostgreSQL, 3 comptes de stockage, dont un inutilisé |
| Secrets et identité | 2 | Un coffre de secrets, une identité managée |
| Réseau | 4 | Un réseau virtuel, 3 points d'accès privés |
| Supervision | 4 | Un espace de journaux, la télémétrie, une règle d'alerte, un groupe d'actions |

> [!NOTE] D'où viennent ces ressources
> - **Créées par l'infrastructure as code** du dépôt (`infra/`) : toutes, sauf celle qui suit.
> - **Créée à la main** : `acmeordersprdold`, le compte de stockage de la version 1, qu'aucun code de la version 2.4.0 n'utilise ([P3](#/examples/findings~constats-de-production)).
> - **Fournies par l'équipe plateforme**, hors de ce groupe : les zones DNS privées et le registre d'images.
> - **Créées automatiquement par le fournisseur cloud** : les interfaces réseau des points d'accès privés, non comptées ici.

## Calcul

| Ressource | Type | Rôle | Ce qui s'en sert |
|---|---|---|---|
| `acme-orders-prd-env` | Environnement de conteneurs | Héberge l'application et les tâches ; rattaché au réseau virtuel | `infra/app.tf:5-18` |
| `acme-orders-prd-app` | Application conteneur | Serveur Next.js, 2 réplicas, image `acme-orders:2.4.0` | Les utilisateurs, les partenaires et les tâches (flux #1, #9, #11) |
| `acme-orders-prd-job-invoices` | Tâche planifiée | Appelle `/api/jobs/invoices` à 2 h 00 UTC | `infra/jobs.tf:8-19` |
| `acme-orders-prd-job-overdue` | Tâche planifiée | Appelle `/api/jobs/overdue` à 3 h 00 UTC | `infra/jobs.tf:20-29` |
| `acme-orders-prd-job-archive` | Tâche planifiée | Appelle `/api/jobs/archive` à 4 h 00 UTC | `infra/jobs.tf:30-40` |

Aucune tâche planifiée n'appelle `/api/jobs/reminders` : les relances ne tournent jamais ([C1](#/examples/findings~c1-la-tache-de-relance-ne-tourne-jamais-en-production)).

## Données

| Ressource | Type | Rôle | Ce qui s'en sert |
|---|---|---|---|
| `acme-orders-prd-pg` | PostgreSQL managé | Commandes, validations, factures, utilisateurs, journal d'audit ; accès public désactivé | `DATABASE_URL` (`db/client.ts:9`) |
| `acmeordersprdst` | Compte de stockage | PDF des factures dans le conteneur `invoices` ; redondance locale ; accès public désactivé | `lib/storage/invoices.ts:8`, avec l'identité managée |
| `acmeorderstfstate` | Compte de stockage | État de l'infrastructure as code ; gestion des versions activée | Le pipeline d'infrastructure seulement |
| `acmeordersprdold` | Compte de stockage | Fichiers de la version 1, lus par rien depuis la version 2.0 | Rien ; l'identité managée peut encore y écrire ([P3](#/examples/findings~constats-de-production)) |

## Secrets et identité

| Ressource | Type | Rôle | Ce qui s'en sert |
|---|---|---|---|
| `acme-orders-prd-kv` | Coffre de secrets | Six secrets, par nom : `auth-secret`, `oidc-client-secret`, `database-url`, `smtp-password`, `jobs-secret`, `telemetry-connection` | Les 6 références de l'application conteneur ([variables](#/examples/variables)) |
| `id-acme-orders-prd` | Identité managée | Lit le coffre, tire l'image, écrit dans le stockage des factures | L'application conteneur et les tâches |

Le secret client OIDC expire chez le fournisseur d'identité, et l'équipe identité le renouvelle. Les autres secrets n'ont pas de date d'expiration (à confirmer) ; rien ne les renouvelle.

## Réseau

| Ressource | Type | Rôle | Ce qui s'en sert |
|---|---|---|---|
| `acme-orders-prd-vnet` | Réseau virtuel | Deux sous-réseaux : l'environnement de conteneurs, les points d'accès privés | `infra/network.tf:4-31` |
| `pe-acme-orders-pg` | Point d'accès privé | Adresse privée du serveur PostgreSQL | Flux #5 |
| `pe-acme-orders-st` | Point d'accès privé | Adresse privée du stockage des factures | Flux #6 |
| `pe-acme-orders-kv` | Point d'accès privé | Adresse privée du coffre de secrets | Flux #7 |

En entrée, l'application conteneur a une adresse HTTPS publique ; la présence d'une passerelle devant elle est à confirmer. En sortie, le trafic va vers le fournisseur d'identité, le relais de messagerie et le registre ; son chemin et son adresse sont à confirmer.

## Supervision

| Ressource | Type | Rôle | Ce qui s'en sert |
|---|---|---|---|
| `acme-orders-prd-logs` | Espace de journaux | Journaux de console de l'application et des tâches, conservés 30 jours | La plateforme ; les [requêtes prêtes à l'emploi](#/examples/troubleshooting~requetes-pretes-a-l-emploi) |
| `acme-orders-prd-telemetry` | Télémétrie applicative | Requêtes, dépendances, erreurs | `TELEMETRY_CONNECTION_STRING` (`instrumentation.ts:6`) |
| `alert-jobs-failed` | Règle d'alerte | Se déclenche sur une ligne `[jobs] failed`, vérifiée toutes les 15 minutes | Lit l'espace de journaux |
| `ag-acme-orders-ops` | Groupe d'actions | Envoie un e-mail à l'équipe d'exploitation | Une boîte aux lettres désactivée, à confirmer ([P4](#/examples/findings~constats-de-production)) |

## Sauvegarde

| Donnée | Ce qui la sauvegarde | Ce qui n'est pas protégé |
|---|---|---|
| Base de données | Sauvegardes automatiques, restauration à un instant donné, conservées **7 jours** ([P2](#/examples/findings~constats-de-production)) | Une erreur découverte après 7 jours ; la perte de la région (pas de copie ailleurs, à confirmer) |
| PDF des factures | Suppression réversible, 7 jours ; pas de gestion des versions | Un PDF écrasé. Il peut être reconstruit depuis la base, mais avec le modèle d'aujourd'hui (`lib/invoices/pdf.ts:20`) |
| Secrets | Suppression réversible, 90 jours, protection contre la purge | — |
| État de l'infrastructure | Gestion des versions des blobs | — |
| Journaux | Rien ; rétention de 30 jours | Tout ce qui a plus de 30 jours |

## Comparaison avec la documentation

`docs/DEPLOYMENT.md`, modifié pour la dernière fois pour la version 2.0, diffère de la production sur quatre points :

| La documentation dit | Constaté |
|---|---|
| Sauvegardes conservées 35 jours | 7 jours ([P2](#/examples/findings~constats-de-production)) |
| Un serveur de cache | Aucun dans le groupe |
| Un compte de stockage | Trois, dont un inutilisé ([P3](#/examples/findings~constats-de-production)) |
| Des relances toutes les heures | Aucune tâche de relance ([C1](#/examples/findings~c1-la-tache-de-relance-ne-tourne-jamais-en-production)) |

## Ce que l'application utilise hors de ce groupe

- **Le fournisseur d'identité** : l'inscription d'Acme Orders et ses groupes, gérés par l'équipe identité (voir [Connexion](#/examples/technical-sub)).
- **Le relais de messagerie** : le relais SMTP de l'organisation ; Acme Orders envoie avec un seul compte.
- **Le registre d'images** : le registre partagé de l'équipe plateforme, `registry.example.org/acme-orders`.
- **Les zones DNS privées** : gérées par l'équipe plateforme ; sans elles, les adresses des points d'accès privés ne sont pas résolues.
- **Les systèmes partenaires** : l'entrepôt et l'import bancaire, qui appellent `/api/v1/*` avec une clé d'API.
- **La boîte aux lettres de l'exploitation** : la cible de la règle d'alerte ([P4](#/examples/findings~constats-de-production)).
