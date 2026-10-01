> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `technical-sub`, écrit pour Acme Orders, le produit fictif du kit. Ses preuves `fichier:ligne` renvoient à un code fictif.

::schema{id="ex-sign-in" titre="Le parcours de connexion en huit messages, numérotés comme les étapes ci-dessous. Lisez de haut en bas ; chaque flèche va de l'émetteur au destinataire ; dans la couleur de la marque, ce que le serveur d'Acme Orders fait de lui-même."}

## Le parcours de connexion

D'après le code de la version 2.4.0, une connexion se fait en huit étapes, les mêmes que sur le schéma :

:::etapes
1. **Pas de session.** Le middleware ne trouve pas de cookie `acme_session` et redirige vers [[route /login]], en gardant l'adresse demandée dans `next` (`middleware.ts:24-29`).
2. **Vers le fournisseur.** **Sign in** lance un parcours OpenID Connect avec PKCE, un `state` et un `nonce` (`lib/auth/index.ts:33-41`). En production, Acme Orders n'a pas de formulaire de mot de passe ; le formulaire e-mail et mot de passe n'existe qu'en mode démo (`lib/auth/index.ts:45`).
3. **Chez le fournisseur.** La personne se connecte selon les règles propres au fournisseur, comme l'authentification multifacteur. Acme Orders n'en voit rien.
4. **Retour avec un code.** Le fournisseur redirige vers [[route /api/auth/callback/oidc]] avec un code à usage unique.
5. **Le retour.** Le navigateur appelle l'adresse de retour ; le serveur vérifie le `state` (`lib/auth/index.ts:50`).
6. **Le jeton.** Le serveur échange le code contre un jeton d'identité (ID token), avec `AUTH_OIDC_CLIENT_SECRET`, puis vérifie sa signature, son émetteur, son audience et son `nonce` (`lib/auth/index.ts:52-60`).
7. **L'utilisateur et le rôle.** La ligne de `users` est créée à la première connexion, puis mise à jour : l'e-mail à partir de la revendication (claim) `email`, le nom à partir de `name`, sauf si la personne l'a changé dans **Settings** (`lib/auth/index.ts:84-92`). Les groupes sont convertis en un rôle (voir [la correspondance entre groupes et rôles](#/examples/technical-sub~la-correspondance-entre-groupes-et-roles)).
8. **La session.** Le serveur pose le cookie `acme_session` et redirige vers `next`, ou vers [[route /orders]]. Il écrit `auth.signin`, avec le rôle obtenu (`lib/auth/index.ts:96-104`).
:::

## Le fournisseur d'identité

| Réglage | Effet |
|---|---|
| `AUTH_OIDC_ISSUER` | Adresse du tenant du fournisseur ; son document de découverte est lu au démarrage (`lib/auth/index.ts:27`) |
| `AUTH_OIDC_CLIENT_ID` | Identifiant d'Acme Orders chez le fournisseur (`:28`) |
| `AUTH_OIDC_CLIENT_SECRET` | Référence au coffre de secrets ; utilisée seulement par le serveur, à l'étape 6 (`:29`) |
| `AUTH_URL` | Adresse publique d'Acme Orders ; elle sert à construire l'adresse de retour, qui doit être inscrite à l'identique chez le fournisseur (`:18`) |
| Étendues `openid profile email` | Fixées dans le code (`:36`) ; les groupes viennent de la configuration du jeton dans l'inscription de l'application, pas d'une étendue |

L'inscription chez le fournisseur appartient à l'équipe chargée des identités (voir [qui gère quoi](#/examples/architecture~qui-gere-quoi)). Son secret expire chez le fournisseur ; Acme Orders n'affiche aucun avertissement avant l'expiration.

## La correspondance entre groupes et rôles

Le jeton d'identité porte les identifiants des groupes de la personne, dans la revendication nommée par `AUTH_GROUPS_CLAIM`, `groups` par défaut (`lib/auth/roles.ts:12`). `mapRole` (`roles.ts:40-58`) les compare à la table `role_group_mappings`, que les administrateurs modifient dans [[menu Administration › Roles]].

| Valeur | Effet |
|---|---|
| Aucun groupe associé | Connexion refusée : « Access denied: your account has no role in Acme Orders » ; `auth.signin.denied`, motif `no_role` |
| Un groupe associé | Son rôle |
| Plusieurs groupes associés | Le rôle le plus élevé l'emporte : **Administrator**, puis **Finance**, **Sales manager**, **Sales rep** ; les permissions ne s'additionnent pas (`roles.ts:52-58`) |
| Pas de revendication `groups` dans le jeton | Refusée aussi, motif `no_groups_claim` ; le journal du serveur écrit `[auth] no groups claim` (`roles.ts:24-30`) |

La région, qui fixe le périmètre, ne vient pas du fournisseur : un administrateur la définit dans [[menu Administration › Users]].

## La session

| Valeur | Effet |
|---|---|
| Cookie `acme_session` | Chiffré avec `AUTH_SECRET` ; `HttpOnly`, `Secure`, `SameSite=Lax` (`lib/auth/index.ts:76-82`) |
| Durée de vie | `SESSION_MAX_AGE` secondes, **28 800 par défaut** (8 heures) ; non prolongée par l'activité (`:71`) |
| Contenu | Identifiant de l'utilisateur, rôle et région, figés à la connexion |
| **Sign out** | Supprime seulement le cookie ; la session chez le fournisseur demeure, si bien que la connexion suivante peut ne pas demander de mot de passe |

> [!ATTENTION] Un changement de groupe attend la connexion suivante
> Le rôle est dans le cookie. Ajouter quelqu'un à un groupe, ou l'en retirer, ne change rien pendant 8 heures au plus, jusqu'à sa prochaine connexion ([I3](#/examples/findings~constats-importants)). Pour couper l'accès aussitôt, désactivez le compte dans [[menu Administration › Users]].

## Pour aller plus loin

- [Sécurité](#/examples/technical) : la page parente et les quatre autres mécanismes.
- [Valider les grosses commandes en deux temps](#/examples/recipe) : une recette qui fait correspondre un nouveau groupe à un rôle.
- [Diagnostic : les accès](#/examples/troubleshooting-area) : « Access denied », les boucles de connexion, les droits qui ne changent pas.
- [Variables d'environnement](#/examples/variables) : les variables d'authentification déclarées en production.
