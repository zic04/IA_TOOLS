> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `variables`, écrit pour Acme Orders, le produit fictif du kit. Ses preuves `fichier:ligne` renvoient à un code fictif.

## En bref

Les variables d'Acme Orders sont déclarées sur l'application conteneur `acme-orders-prd-app`, dans ses réglages d'environnement. Cette page donne leurs noms, leurs sources et leurs valeurs attendues ; elle ne recopie jamais une valeur.

- **22** variables sont déclarées, dont **6** références au coffre de secrets `acme-orders-prd-kv`.
- **19** sont lues par le code de la version 2.4.0. `NODE_ENV` et `PORT` servent au framework et à la plateforme ; `LOG_LEVEL` n'est lue par rien ([R2](#/examples/findings~reglages-sans-effet)).
- Une valeur est fausse : `APP_URL` pointe vers la préproduction ([P1](#/examples/findings~constats-de-production)). Une variable n'a aucun effet : `REMINDER_DELAY_HOURS` est lue par une tâche qui ne tourne jamais ([C1](#/examples/findings~c1-la-tache-de-relance-ne-tourne-jamais-en-production)).
- Deux variables lues par le code manquent : `SESSION_MAX_AGE`, si bien que les sessions durent 8 heures ([I3](#/examples/findings~constats-importants)), et `STORAGE_CONTAINER`, dont la valeur par défaut est la bonne.

> [!NOTE] Les sources de cette page
> - **Portail du fournisseur cloud** : noms et sources des variables de `acme-orders-prd-app`, constatés en lecture seule le 30 septembre 2026. Les valeurs n'ont pas été recopiées.
> - **Code** : chaque lecture citée avec son fichier et sa ligne, version 2.4.0.
> - **Infrastructure as code** : `infra/app.tf:40-96`, les valeurs prévues, qui ne sont pas des valeurs constatées.

## Les variables, une par une

### Authentification (6)

| Variable | Source | Lue par le code | Rôle et valeur attendue | Remarque |
|---|---|---|---|---|
| `AUTH_URL` | Service | `lib/auth/index.ts:18` | Adresse publique : `https://orders.example.org` | Doit correspondre à l'adresse de retour inscrite chez le fournisseur |
| `AUTH_SECRET` | Coffre | `lib/auth/index.ts:21` | Chiffre le cookie de session ; 32 octets ou plus | La renouveler déconnecte tout le monde |
| `AUTH_OIDC_ISSUER` | Service | `lib/auth/index.ts:27` | Adresse du locataire (tenant) chez le fournisseur | — |
| `AUTH_OIDC_CLIENT_ID` | Service | `lib/auth/index.ts:28` | Identifiant de l'inscription, un GUID | Non recopié ici |
| `AUTH_OIDC_CLIENT_SECRET` | Coffre | `lib/auth/index.ts:29` | Secret de l'inscription | Expire chez le fournisseur : date à confirmer |
| `AUTH_GROUPS_CLAIM` | Service | `lib/auth/roles.ts:12` | Revendication qui porte les groupes ; `groups` par défaut | Réglée sur sa valeur par défaut |

### Base de données (2)

| Variable | Source | Lue par le code | Rôle et valeur attendue | Remarque |
|---|---|---|---|---|
| `DATABASE_URL` | Coffre | `db/client.ts:9` | Chaîne de connexion PostgreSQL, avec `sslmode=require` | Contient le mot de passe : ne la collez jamais dans un ticket |
| `DATABASE_POOL_MAX` | Service | `db/client.ts:14` | Connexions par réplica ; 10 par défaut | Réglée à 20 : 2 réplicas utilisent 40 des 50 connexions du serveur |

### Stockage (1)

| Variable | Source | Lue par le code | Rôle et valeur attendue | Remarque |
|---|---|---|---|---|
| `STORAGE_ACCOUNT_URL` | Service | `lib/storage/invoices.ts:8` | Adresse de `acmeordersprdst` | Accès par l'identité managée, sans clé |

### Messagerie (5)

| Variable | Source | Lue par le code | Rôle et valeur attendue | Remarque |
|---|---|---|---|---|
| `SMTP_HOST` | Service | `lib/mail/send.ts:14` | Le relais de messagerie de l'organisation | — |
| `SMTP_PORT` | Service | `lib/mail/send.ts:15` | `587` ; 587 par défaut | STARTTLS exigé (`send.ts:18`) |
| `SMTP_USER` | Service | `lib/mail/send.ts:16` | Compte d'Acme Orders sur le relais | — |
| `SMTP_PASSWORD` | Coffre | `lib/mail/send.ts:17` | Mot de passe de ce compte | — |
| `MAIL_FROM` | Service | `lib/mail/send.ts:22` | Expéditeur : `orders@example.org` | Les réponses y arrivent : boîte aux lettres à confirmer |

### Tâches et liens (4)

| Variable | Source | Lue par le code | Rôle et valeur attendue | Remarque |
|---|---|---|---|---|
| `JOBS_SECRET` | Coffre | `app/api/jobs/[job]/route.ts:11` | Partagée avec les 3 tâches planifiées | Renouveler les deux côtés ensemble |
| `REMINDER_DELAY_HOURS` | Service | `jobs/reminderJob.ts:12` | Heures avant une relance ; 24 par défaut | Sans effet : la tâche ne tourne jamais ([C1](#/examples/findings~c1-la-tache-de-relance-ne-tourne-jamais-en-production)) |
| `APP_URL` | Service | `lib/mail/links.ts:6` | Base des liens des e-mails : `https://orders.example.org` | Pointe vers la préproduction ([P1](#/examples/findings~constats-de-production)) |
| `PUBLIC_API_URL` | Service | `app/(app)/settings/page.tsx:27` | Affichée comme **Integration** dans **Settings** | `https://orders.example.org/api/v1` |

### Plateforme et supervision (4)

| Variable | Source | Lue par le code | Rôle et valeur attendue | Remarque |
|---|---|---|---|---|
| `NODE_ENV` | Service | Le framework | `production` | — |
| `PORT` | Service | La plateforme | `3000`, le port du conteneur | Doit correspondre à l'entrée (ingress) |
| `LOG_LEVEL` | Service | Rien | — | Sans effet ([R2](#/examples/findings~reglages-sans-effet)) |
| `TELEMETRY_CONNECTION_STRING` | Coffre | `instrumentation.ts:6` | Destination des traces | Si elle manque : pas de télémétrie, et aucune erreur |

## Absentes ou sans effet

| Variable | Constat | Conséquence |
|---|---|---|
| `SESSION_MAX_AGE` | Absente ; lue en `lib/auth/index.ts:71` | 28 800 secondes par défaut : les sessions durent 8 heures, et un groupe retiré continue de donner ses droits aussi longtemps ([I3](#/examples/findings~constats-importants)) |
| `STORAGE_CONTAINER` | Absente ; lue en `lib/storage/invoices.ts:9` | `invoices` par défaut, le vrai nom du conteneur : sans effet aujourd'hui |
| `LOG_LEVEL` | Déclarée, lue par rien | Augmenter le niveau pendant un incident ne change rien ([R2](#/examples/findings~reglages-sans-effet)) |
| `REMINDER_DELAY_HOURS` | Déclarée, lue par une tâche qui ne tourne jamais | Aucune relance, quelle que soit la valeur ([C1](#/examples/findings~c1-la-tache-de-relance-ne-tourne-jamais-en-production)) |
| `APP_URL` | Déclarée avec une valeur fausse | Les liens de tous les e-mails ouvrent la préproduction ([P1](#/examples/findings~constats-de-production)) |

## À vérifier

:::etapes
1. **`APP_URL`** : sa valeur doit être `https://orders.example.org` ([P1](#/examples/findings~constats-de-production)).
2. **Références au coffre** : chacune des 6 doit apparaître comme résolue. Notez la date de la dernière version de chaque secret, surtout `AUTH_OIDC_CLIENT_SECRET`, dont l'expiration est fixée chez le fournisseur.
3. **`DATABASE_POOL_MAX` × réplicas** : le produit doit rester sous la limite de connexions du serveur PostgreSQL, 50 aujourd'hui.
4. **Variables absentes** : décidez de `SESSION_MAX_AGE` avec le responsable de la sécurité ([I3](#/examples/findings~constats-importants)).
5. **Infrastructure as code** : comparez la liste avec `infra/app.tf:40-96` ; une variable ajoutée seulement dans le portail est perdue au déploiement suivant.
:::
