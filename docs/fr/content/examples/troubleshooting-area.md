> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `troubleshooting-area`, écrit pour Acme Orders, le produit fictif du kit. Ses preuves `fichier:ligne` renvoient à un code fictif.

## En bref

Quatre mécanismes expliquent presque tous les problèmes d'accès dans Acme Orders, d'après le code de la version 2.4.0 :

- **Le navigateur masque, le serveur décide** : un bouton absent ne prouve rien, un bouton visible non plus ; le serveur vérifie le droit à chaque action (`lib/permissions.ts:51-60`).
- **Le rôle est lu à la connexion** : un changement de groupe attend la connexion suivante, jusqu'à 8 heures plus tard (`lib/auth/index.ts:64-71`, [I3](#/examples/findings~constats-importants)).
- **Hors périmètre, c'est « introuvable »** : le serveur ne répond jamais « interdit » pour une commande d'une autre région (`lib/services/orderService.ts:61-66`).
- **Pas de groupe associé, pas d'accès** : Acme Orders n'a pas de rôle par défaut (`lib/auth/roles.ts:40-46`).

## Se connecter

### « Access denied: your account has no role in Acme Orders »

- **Causes probables**
  1. Aucun des groupes de la personne n'est associé à un rôle dans [[menu Administration › Roles]] (`lib/auth/roles.ts:40-46`).
  2. Le jeton d'identité ne porte pas de revendication `groups` : l'inscription chez le fournisseur d'identité ne l'envoie pas (`roles.ts:24-30`).
- **Vérifier** : l'entrée d'audit `auth.signin.denied` et sa raison, `no_role` ou `no_groups_claim` ; la requête 4 du [Diagnostic par symptôme](#/examples/troubleshooting~requetes-pretes-a-l-emploi).
- **Corriger** : associez le groupe de la personne à un rôle (cause 1), ou demandez à l'équipe identité d'envoyer les groupes dans le jeton (cause 2) ; la personne se reconnecte ensuite.
- **Comprendre** : [la correspondance entre groupes et rôles](#/examples/technical-sub~la-correspondance-entre-groupes-et-roles).

### « Je me connecte et je retombe sur la page de connexion »

- **Causes probables**
  1. L'adresse dans le navigateur n'est pas celle définie dans `AUTH_URL` : le cookie appartient donc à un autre hôte (`lib/auth/index.ts:18`). Un lien d'e-mail qui ouvre la préproduction fait exactement cela ([P1](#/examples/findings~constats-de-production)).
  2. Le navigateur bloque les cookies du site.
- **Vérifier** : la barre d'adresse avant et après **Sign in** ; les lignes `[auth] callback` du journal du serveur.
- **Corriger** : ouvrez directement `https://orders.example.org` ; faites corriger `APP_URL` (P1).
- **Comprendre** : [le parcours de connexion](#/examples/technical-sub~le-parcours-de-connexion).

## Voir

### « Order not found » pour une commande qui existe

- **Causes probables**
  1. La commande appartient à une autre région que celle de la personne (`lib/services/orderService.ts:61-66`).
  2. Le numéro vient d'un autre environnement : un lien d'e-mail vers la préproduction montre des numéros que la production n'a pas ([P1](#/examples/findings~constats-de-production)).
- **Vérifier** : une ligne `[scope] denied` avec la personne et la commande, [requête 3](#/examples/troubleshooting~requetes-pretes-a-l-emploi) ; la **Region** de la commande et celle du compte.
- **Corriger** : confiez la commande à quelqu'un de sa région, ou faites corriger la **Region** de la personne par un administrateur.
- **Comprendre** : [le filtrage par périmètre](#/examples/technical~le-filtrage-par-perimetre).

### « La liste des commandes est vide »

- **Causes probables**
  1. Le compte n'a pas de **Region** : un nouveau compte ne voit aucune commande tant qu'un administrateur ne lui en attribue pas une (`lib/scope.ts:18`).
  2. Les filtres de la liste masquent toutes les lignes.
- **Vérifier** : **Region** dans [[menu Administration › Users]] ; une ligne `[scope] no region` dans le journal du serveur.
- **Corriger** : renseignez la région, puis rechargez [[menu Orders › All orders]] ; ou videz les trois filtres.
- **Comprendre** : [la liste des commandes](#/examples/screen~comment-ca-marche).

### « Je ne vois pas le bouton New order »

- **Causes probables**
  1. Le rôle n'a pas [[droit orders:write]] ; **Finance** ne l'a pas (`app/(app)/orders/page.tsx:58`).
  2. La session porte encore l'ancien rôle ([I3](#/examples/findings~constats-importants)).
- **Vérifier** : la dernière entrée `auth.signin` de la personne, et le rôle qu'elle lui a donné.
- **Corriger** : associez le bon groupe ; la personne se reconnecte ensuite.
- **Comprendre** : [les droits et les rôles](#/examples/technical~droits-et-roles).

## Agir et changer les droits

### « You are not allowed to perform this action »

- **Causes probables**
  1. Le rôle n'a pas le droit qu'exige l'action (`lib/permissions.ts:51-60`).
  2. Sur **Approve** : la personne n'est pas valideur de l'étape en attente. Dans un circuit séquentiel, la Finance attend le directeur commercial (`lib/services/approvalService.ts:92`).
  3. Le compte a été désactivé (`permissions.ts:44`).
- **Vérifier** : la page **Approval chain** de la commande, pour voir quelle étape est **Waiting** ; **Active** dans l'écran Users.
- **Corriger** : attendez l'étape précédente ; sinon, corrigez le rôle ou réactivez le compte.
- **Comprendre** : [l'étape de validation](#/examples/journey-step~ce-qui-se-passe-pas-a-pas).

### « On m'a ajouté à Finance, et je ne peux toujours pas valider »

- **Causes probables**
  1. La session porte encore l'ancien rôle, jusqu'à 8 heures ([I3](#/examples/findings~constats-importants), `lib/auth/index.ts:64-71`).
  2. Le groupe a été créé chez le fournisseur d'identité, mais pas associé dans [[menu Administration › Roles]].
- **Vérifier** : une entrée `auth.signin` postérieure au changement, et le rôle qu'elle a donné.
- **Corriger** : **Sign out**, puis reconnectez-vous ; associez le groupe si le rôle est toujours faux.
- **Comprendre** : [la session](#/examples/technical-sub~la-session).

### « Quelqu'un qui est parti peut encore valider »

- **Causes probables**
  1. La personne a été retirée du groupe chez le fournisseur d'identité seulement : sa session reste valide jusqu'à 8 heures ([I3](#/examples/findings~constats-importants)).
  2. Une étape confiée à un rôle accepte les titulaires de ce rôle de toutes les régions ([C2](#/examples/findings~c2-les-decisions-de-validation-ignorent-le-perimetre)).
- **Vérifier** : les entrées `approval.decide` de cette personne dans le journal d'audit.
- **Corriger** : désactivez le compte dans [[menu Administration › Users]] ; la désactivation prend effet à sa prochaine action (`lib/permissions.ts:44`).
- **Comprendre** : [la sécurité](#/examples/technical~droits-et-roles).

## Pour aller plus loin

- [Diagnostic par symptôme](#/examples/troubleshooting) : la page parente, les premières vérifications et les requêtes de journaux.
- [Sécurité](#/examples/technical) et [Connexion](#/examples/technical-sub) : les mécanismes derrière ces symptômes.
- [Étape d'un parcours : la validation](#/examples/journey-step) : qui peut décider, à quelle étape.
- [Points d'attention](#/examples/findings) : C2 et I3 en détail.
