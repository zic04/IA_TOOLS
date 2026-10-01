> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `technical`, écrit pour Acme Orders, le produit fictif du kit. Ses preuves `fichier:ligne` renvoient à un code fictif.

## En bref

La sécurité d'Acme Orders repose sur cinq mécanismes, tous côté serveur, d'après le code de la version 2.4.0 :

1. **La connexion par le fournisseur d'identité** : Acme Orders ne stocke aucun mot de passe ; le fournisseur prouve qui vous êtes et envoie vos groupes (`lib/auth/index.ts`).
2. **Le middleware** : chaque page et chaque route d'API exige une session, sauf les chemins de connexion et les deux API de machine à machine (`middleware.ts`).
3. **Les droits** : chaque rôle détient des codes de permission, vérifiés par chaque action serveur et chaque gestionnaire de route (`lib/permissions.ts`).
4. **Le filtrage par périmètre** : chaque requête sur les commandes, les clients et les factures est limitée à la région de l'utilisateur (`lib/scope.ts`).
5. **Le journal d'audit** : chaque écriture laisse une entrée, avec son auteur et les noms des champs modifiés (`lib/audit.ts`).

Ce qui ne protège rien : masquer un bouton dans le navigateur. Et un écart compte plus que les autres : les décisions de validation vérifient la permission, mais pas le périmètre ([C2](#/examples/findings~c2-les-decisions-de-validation-ignorent-le-perimetre)).

## Dans cette partie

Cette page donne la vue d'ensemble. Le détail de la connexion est une sous-page, accessible aussi depuis le menu ; les autres mécanismes sont assez courts pour rester sur cette page.

| Sous-page | Ce que vous y trouverez |
|---|---|
| [Connexion](#/examples/technical-sub) | Le parcours de connexion, les réglages du fournisseur d'identité, la correspondance entre groupes et rôles, et la session. |

## Le schéma

::schema{id="ex-security" titre="Une requête à travers les cinq mécanismes, numérotés comme dans En bref. De gauche à droite : le navigateur, puis le serveur vérifie la session, la permission et le périmètre avant de lire la base de données ; chaque écriture arrive aussi dans le journal d'audit."}

Le navigateur ne fait qu'afficher. Tout ce qui suit, à partir du middleware, s'exécute sur le serveur, dans cet ordre, à chaque requête. Une requête refusée à une étape n'atteint jamais la suivante.

## Le middleware

`middleware.ts:12-40` s'exécute avant chaque page et chaque route d'API. Sans cookie de session valide, une page redirige vers [[route /login]] avec l'adresse demandée dans `next`, et une route d'API répond 401.

| Chemin | Protégé par | Détail |
|---|---|---|
| `/login`, `/api/auth/*` | Rien | La page de connexion et le retour du fournisseur |
| `/api/v1/*` | La clé d'API d'un partenaire | Vérifiée par le gestionnaire de route avec les empreintes de `partner_keys` (`lib/partners/keys.ts:18`) |
| `/api/jobs/*` | Un en-tête portant un secret partagé | `JOBS_SECRET`, envoyé par le planificateur (`app/api/jobs/[job]/route.ts:11`) |
| Tout le reste | La session | Cookie `acme_session`, 8 heures (voir [la session](#/examples/technical-sub~la-session)) |

Le middleware vérifie seulement qu'une session existe. Il ne lit aucune permission : c'est le rôle du mécanisme suivant.

## Droits et rôles

`requirePermission(user, code)` (`lib/permissions.ts:51-60`) est la première ligne de chaque action serveur et de chaque gestionnaire de route qui lit ou écrit des données métier. Une permission manquante renvoie « You are not allowed to perform this action », avec un code 403.

| Rôle | Permissions | Périmètre |
|---|---|---|
| **Sales rep** | `orders:read`, `orders:write`, `settings:write` | Sa région |
| **Sales manager** | Les mêmes, plus `orders:approve` | Sa région |
| **Finance** | `orders:read`, `orders:approve`, `invoices:read`, `invoices:write`, `settings:write` | Toutes les régions |
| **Administrator** | Toutes les permissions, dont `approvals:configure`, `users:manage`, `audit:read` | Toutes les régions |

Les rôles sont définis dans le code (`lib/permissions.ts:22-40`). L'écran d'administration leur fait correspondre des groupes du fournisseur d'identité, mais ne peut pas créer de rôle. Désactiver un compte dans [[menu Administration › Users]] prend effet à l'action suivante, parce que `requirePermission` vérifie aussi `users.active` (`permissions.ts:44`).

## Le filtrage par périmètre

`scopeWhere(user)` (`lib/scope.ts:12-30`) ajoute la région de l'utilisateur à chaque requête sur les commandes, les clients et les factures ; **Finance** et **Administrator** n'ont aucun filtre. Un nouveau compte n'a pas de région, et ne voit aucune commande tant qu'un administrateur ne lui en a pas attribué une (`scope.ts:18`).

Une commande hors de votre périmètre reçoit la réponse « Order not found », un 404, jamais un 403 : le serveur ne confirme pas qu'elle existe (`lib/services/orderService.ts:61-66`). Chaque refus écrit une ligne `[scope] denied` dans le journal du serveur (`scope.ts:41`).

> [!ATTENTION] La décision de validation échappe au périmètre
> Pour une étape confiée à un rôle, `decide` accepte n'importe quel détenteur de ce rôle, de n'importe quelle région, et n'appelle jamais `scopeWhere` (`lib/services/approvalService.ts:88-97`). Un directeur commercial peut décider d'une commande d'une autre région en appelant l'action serveur avec l'identifiant de l'étape ([C2](#/examples/findings~c2-les-decisions-de-validation-ignorent-le-perimetre)).

## Le journal d'audit

`recordAudit` (`lib/audit.ts:14-35`) écrit une ligne de `audit_log` par écriture, dans la même transaction : le code de l'action, l'identifiant de l'auteur et son nom à ce moment-là, l'objet, et les noms des champs modifiés, jamais leurs valeurs. Il se lit dans [[menu Administration › Audit log]] avec [[droit audit:read]]. Rien ne le purge.

| Code | Écrit quand |
|---|---|
| `auth.signin`, `auth.signin.denied` | Une connexion réussit, avec le rôle obtenu, ou est refusée, avec son motif |
| `order.create`, `order.submit` | Une commande est enregistrée pour la première fois, ou soumise |
| `approval.chain.create`, `approval.decide` | Un circuit est créé ; un valideur valide ou refuse |
| `role.mapping.update` | Un groupe est associé à un rôle, ou dissocié |
| `profile.update` | Quelqu'un enregistre ses réglages (**Settings**) |

## Les en-têtes HTTP

`next.config.mjs:30-52` définit une politique de sécurité du contenu qui interdit les scripts en ligne, sauf le script du thème, autorisé par son empreinte. Il définit aussi `X-Frame-Options: DENY` et un `Strict-Transport-Security` d'un an. Le cookie de session est `HttpOnly`, `Secure` et `SameSite=Lax` (`lib/auth/index.ts:80`).

## Pièges et écarts constatés

> [!ATTENTION] Un changement de groupe attend la connexion suivante
> Le rôle est calculé à la connexion et gardé dans la session pendant 8 heures. Une personne retirée d'un groupe garde ses droits jusque-là, sauf si son compte est désactivé dans Acme Orders ([I3](#/examples/findings~constats-importants)).

> [!NOTE] Écarts constatés (v2.4.0)
> - Les décisions de validation ignorent le périmètre ([C2](#/examples/findings~c2-les-decisions-de-validation-ignorent-le-perimetre), `approvalService.ts:88-97`).
> - Ouvrir le circuit de validation d'une commande écrit sur le serveur, sur une requête GET ([I1](#/examples/findings~constats-importants), `app/(app)/orders/[id]/approval/page.tsx:22-31`).
> - `docs/SECURITY.md` dit qu'une session dure une heure. La valeur par défaut du code est de 8 heures, et la production ne définit pas `SESSION_MAX_AGE` (`lib/auth/index.ts:71`).

## Pour aller plus loin

- [Connexion](#/examples/technical-sub) : le parcours, le fournisseur, les groupes et les rôles, la session.
- [Diagnostic : les accès](#/examples/troubleshooting-area) : les symptômes que produisent ces mécanismes, avec les mots des utilisateurs.
- [Points d'attention](#/examples/findings) : C2, I1 et I3 en détail.
- [Dossier d'architecture technique (DAT)](#/examples/architecture) : où se trouvent le fournisseur d'identité et le coffre de secrets.
