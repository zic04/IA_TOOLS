> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `recipe`, écrit pour Acme Orders, le produit fictif du kit. Ses preuves `fichier:ligne` renvoient à un code fictif.

## L'objectif

Les commandes de 10 000 ou plus, hors taxes, sont validées par le directeur commercial du commercial, puis par la Finance. En dessous de 10 000, le directeur commercial valide seul, comme aujourd'hui. La recette enchaîne quatre acteurs : l'administrateur d'identité crée le groupe Finance hors d'Acme Orders, un administrateur d'Acme Orders le fait correspondre au rôle **Finance** et ajoute une étape au circuit de validation, les valideurs se reconnectent, et une commande de test prouve tout l'enchaînement.

> [!RECETTE] Ce qu'il vous faut
> - Un compte administrateur d'Acme Orders, avec [[droit users:manage]] et [[droit approvals:configure]].
> - Une personne qui peut créer des groupes et modifier l'inscription d'Acme Orders chez le fournisseur d'identité.
> - La liste des valideurs de la Finance, et le seuil convenu avec la Finance : 10 000 ici.
> - Un compte de commercial de test avec [[droit orders:write]], dans une région qui a un directeur commercial.

## Qui fait quoi

::schema{id="ex-recipe-actors" titre="Les quatre acteurs dans l'ordre des étapes. À gauche du pointillé, hors de l'application ; à droite, dans Acme Orders. Chaque acteur passe la main au suivant."}

## Étape 1 — Créer le groupe Finance chez le fournisseur d'identité

Dans la console du fournisseur d'identité, créez un groupe de sécurité nommé `acme-orders-finance`. Notez son **identifiant**, que le fournisseur affiche sur la page du groupe : l'étape 4 en a besoin. Acme Orders compare des identifiants, pas des noms : renommer le groupe plus tard ne casse donc rien (`lib/auth/roles.ts:40-46`).

**Quand c'est réussi** : le groupe existe, avec son identifiant, et n'a encore aucun membre.

## Étape 2 — Ajouter les valideurs au groupe

Ajoutez les valideurs de la Finance comme membres de `acme-orders-finance`. N'ajoutez que les personnes qui doivent valider : le rôle **Finance** voit aussi les commandes de toutes les régions.

**Quand c'est réussi** : la page du groupe liste les valideurs.

## Étape 3 — Envoyer les groupes dans le jeton

Dans l'inscription d'Acme Orders chez le fournisseur, faites porter au jeton d'identité (ID token) les groupes de la personne, dans une revendication (claim) nommée `groups`, limitée aux groupes affectés à l'application. Affectez `acme-orders-finance` à l'application. Acme Orders lit la revendication nommée par `AUTH_GROUPS_CLAIM`, `groups` par défaut (`lib/auth/roles.ts:12`).

**Quand c'est réussi** : dans l'aperçu du jeton du fournisseur, la revendication `groups` contient l'identifiant de l'étape 1 pour un membre.

## Étape 4 — Faire correspondre le groupe au rôle Finance

Dans Acme Orders, ouvrez [[menu Administration › Roles]] ([[route /admin/roles]]), cliquez le rôle **Finance**, puis **Add group** sous **Identity provider groups**. Collez l'identifiant de l'étape 1 et cliquez **Save**. Le détail des rôles est sur la page [Connexion](#/examples/technical-sub~la-correspondance-entre-groupes-et-roles).

**Quand c'est réussi** : le rôle **Finance** liste l'identifiant, et le journal d'audit contient une entrée `role.mapping.update`.

## Étape 5 — Ajouter l'étape Finance au circuit de validation

Ouvrez [[menu Administration › Approval chains]] ([[route /admin/approval-chains]]) et cliquez le circuit actif du type de commande **Standard**. Sous l'étape **Manager of the sales rep**, cliquez **Add step**, puis réglez **Approver** sur **Role**, choisissez **Finance**, et tapez `10000` dans **Minimum amount**. Laissez **Mode** sur **Sequential** et cliquez **Save**.

**Quand c'est réussi** : le circuit montre deux étapes, la seconde avec « From 10,000 ». Le changement s'applique aux commandes soumises à partir de maintenant.

## Étape 6 — Tester la règle

Sur le même circuit, cliquez **Test the rule**, tapez un montant, puis cliquez **Run**. Le test n'écrit rien : il exécute la résolution du circuit sur une commande fictive (`lib/approvals/chain.ts:142-160`).

**Quand c'est réussi** : 9 999 donne une étape ; 10 000 et 12 000 donnent deux étapes, le directeur commercial d'abord, puis **Finance**.

## Étape 7 — Faire reconnecter les valideurs

Demandez à chaque valideur de la Finance de cliquer **Sign out**, puis de se reconnecter. Le rôle est lu à la connexion et gardé dans la session jusqu'à 8 heures ([I3](#/examples/findings~constats-importants)).

**Quand c'est réussi** : [[menu Administration › Audit log]] montre une entrée `auth.signin` pour chaque valideur, avec le rôle `finance`.

## Étape 8 — Vérifier avec une commande de test

Avec le compte de commercial de test, créez une commande de 12 000 hors taxes, cliquez **Save**, puis **Submit for approval**. Validez-la comme directeur commercial, puis comme valideur de la Finance, dans [[menu Orders › Approvals]].

**Quand c'est réussi** : la commande passe à `APPROVED` après la seconde décision. [L'étape de validation](#/examples/journey-step) décrit ce qui s'exécute à chaque clic.

## Comment savoir que ça marche

- **Roles** : dans [[menu Administration › Roles]], **Finance** liste l'identifiant de `acme-orders-finance`.
- **Test the rule** : 9 999 donne une étape ; 10 000 en donne deux, **Finance** en second.
- **Journal d'audit** : un `auth.signin` par valideur avec le rôle `finance`, après l'étape 7.
- **Approval chain** de la commande de test : deux étapes, **Manager of the sales rep** puis **Finance**, la seconde **Waiting** après la première décision.
- **Boîte des validations** d'un valideur de la Finance : la commande de test n'y apparaît qu'une fois que le directeur commercial l'a validée.
- **La commande** : `APPROVED` après la décision de la Finance, et de retour à `DRAFT` si la Finance clique **Reject**.

## Erreurs fréquentes et remèdes

| Symptôme | Cause probable | Remède |
|---|---|---|
| « Access denied: your account has no role in Acme Orders » | Le jeton ne porte pas de revendication `groups` (`roles.ts:24-30`) | Reprenez l'étape 3 |
| « No approver found for step 2 » à la soumission | Aucun compte actif n'a encore le rôle **Finance** (`chain.ts:131`) | Reprenez l'étape 7, puis soumettez de nouveau |
| La commande de test montre une seule étape | Le montant est inférieur à 10 000 hors taxes, ou le type de commande n'est pas **Standard** | Prenez 12 000 hors taxes sur une commande **Standard** |
| « You are not allowed to perform this action » sur **Approve** | La session porte encore l'ancien rôle ([I3](#/examples/findings~constats-importants)) | Déconnectez-vous, puis reconnectez-vous |
| Le valideur de la Finance ne reçoit aucun e-mail | L'e-mail ne part qu'à l'ouverture de l'étape Finance, après la décision du directeur commercial | Validez la première étape, puis regardez [[menu Orders › Approvals]] |

## Pièges et limites à connaître

> [!ATTENTION] Les commandes déjà en attente gardent leur ancien circuit
> Le circuit est copié sur la commande à la soumission (`lib/services/approvalService.ts:63-71`). Une commande de 50 000 soumise avant l'étape 5 est validée sans la Finance. Listez les commandes en attente de validation avant de modifier le circuit.

> [!ATTENTION] Le nouveau rôle attend la connexion suivante
> Les étapes 2 et 4 ne changent rien pour un valideur déjà connecté, pendant 8 heures au plus. L'étape 7 n'est pas facultative ([I3](#/examples/findings~constats-importants)).

> [!ATTENTION] Le seuil compare le montant hors taxes
> **Minimum amount** est comparé au montant hors taxes des lignes, seuil inclus (`lib/approvals/chain.ts:124`). Une commande de 9 500 hors taxes, soit 11 400 toutes taxes comprises, passe sans la Finance.

> [!NOTE] Écarts constatés (v2.4.0)
> - Une commande refusée par la Finance, puis soumise de nouveau, garde le circuit de sa première soumission ([I4](#/examples/findings~constats-importants), `approvalService.ts:141-150`).
> - Rien ne relance un valideur de la Finance qui n'agit pas : la tâche de relance ne tourne jamais en production ([C1](#/examples/findings~c1-la-tache-de-relance-ne-tourne-jamais-en-production)).
> - **Test the rule** ignore le type de commande du circuit testé et simule toujours une commande **Standard** (`chain.ts:146`).

## Droits requis

> [!DROITS] Qui peut faire quoi dans cette recette
> - **Hors de l'application** (étapes 1 à 3) : l'administrateur d'identité, qui peut créer des groupes, gérer leurs membres et modifier l'inscription d'Acme Orders.
> - **Faire correspondre le groupe** (étape 4) : [[droit users:manage]], détenu par le rôle **Administrator**.
> - **Modifier et tester le circuit** (étapes 5 et 6) : [[droit approvals:configure]], détenu par le rôle **Administrator**.
> - **Vérifier** (étape 8) : le commercial de test a besoin de [[droit orders:write]] ; le directeur commercial et les valideurs de la Finance, de [[droit orders:approve]] ; lire le journal d'audit demande [[droit audit:read]].
