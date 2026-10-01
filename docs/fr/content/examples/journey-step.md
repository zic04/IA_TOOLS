> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `journey-step`, écrit pour Acme Orders, le produit fictif du kit. Ses preuves `fichier:ligne` renvoient à un code fictif.

## En bref

- **Déclencheur** : un clic sur **Submit for approval** sur la fiche de la commande, jamais l'enregistrement d'un brouillon (`app/(app)/orders/[id]/SubmitButton.tsx:21`). Chaque décision d'un valideur fait ensuite avancer l'étape.
- **Acteurs** : le commercial qui soumet, avec [[droit orders:write]] ; puis chaque valideur, avec [[droit orders:approve]].
- **Synchrone** : la résolution du circuit et toutes les écritures s'exécutent dans une seule transaction de la requête de soumission. L'e-mail part après la validation de la transaction (commit), sans nouvelle tentative (`lib/services/approvalService.ts:74-80`).
- **Durée** : la requête prend moins d'une seconde. L'étape dure jusqu'à ce que le dernier valideur décide, et rien ne le relance en production ([C1](#/examples/findings~c1-la-tache-de-relance-ne-tourne-jamais-en-production)).
- **Résultat** : la commande est `APPROVED`, ou revient à `DRAFT` après un refus ; chaque décision est au journal d'audit.

## Ce qui se passe, pas à pas

D'après le code de la version 2.4.0 :

:::etapes
1. **Le clic.** `SubmitButton` appelle l'action serveur `submitOrder(orderId)` (`app/(app)/orders/[id]/actions.ts:14`).
2. **Les gardes.** Le serveur vérifie [[droit orders:write]], charge la commande à travers `scopeWhere`, et exige un `DRAFT` qui a au moins une ligne (`lib/services/orderService.ts:121-133`).
3. **Le circuit.** `resolveChain(order)` prend le circuit actif du type de commande. S'il n'y en a pas, il applique la règle intégrée : une seule étape, le directeur commercial du commercial (`lib/approvals/chain.ts:88-97`).
4. **Les étapes.** `buildSteps` compare chaque **Minimum amount** au montant hors taxes, marque `SKIPPED` les étapes que la commande n'atteint pas, et résout chaque valideur en personnes (`chain.ts:118-131`).
5. **L'écriture.** Dans une seule transaction : la commande passe à `PENDING_APPROVAL`, le circuit est écrit avec une copie de ses règles, et la première étape retenue passe à `WAITING` (`lib/services/approvalService.ts:63-71`).
6. **L'audit.** `order.submit` et `approval.chain.create` sont écrits dans la même transaction (`lib/audit.ts:22`).
7. **L'e-mail.** Après le commit, chaque valideur de la première étape reçoit « Order #{id} awaits your approval », avec un lien construit à partir de `APP_URL` (`lib/mail/links.ts:6`, [P1](#/examples/findings~constats-de-production)). Un échec écrit `[mail] send failed` et n'est pas retenté.
8. **La décision.** Dans [[menu Orders › Approvals]], un valideur clique **Approve** ou **Reject** ; un refus exige un commentaire. `decide(stepId, decision)` vérifie [[droit orders:approve]] et que la personne peut valider l'étape en attente, mais pas le périmètre de la commande (`approvalService.ts:88-97`, [C2](#/examples/findings~c2-les-decisions-de-validation-ignorent-le-perimetre)).
9. **L'étape suivante.** Sur **Approve**, l'étape retenue suivante passe à `WAITING` et ses valideurs reçoivent un e-mail, comme à l'étape 7 (`approvalService.ts:102-110`).
10. **La fin.** Quand la dernière étape est validée, la commande passe à `APPROVED`. Sur **Reject**, l'étape passe à `REJECTED` et la commande revient à `DRAFT`, en gardant son circuit ([I4](#/examples/findings~constats-importants), `approvalService.ts:141-150`). Les deux écrivent `approval.decide`.
11. **La relance qui ne vient jamais.** `jobs/reminderJob.ts:38-44` enverrait un e-mail aux valideurs d'une étape en attente depuis plus de 24 heures, mais aucune tâche planifiée ne l'appelle en production ([C1](#/examples/findings~c1-la-tache-de-relance-ne-tourne-jamais-en-production)).
:::

### Les quatre cas de circuit de validation

| Cas | Quand | Étapes retenues | Premiers destinataires de l'e-mail |
|---|---|---|---|
| Aucun | Pas de circuit actif pour le type de commande | Une : le directeur commercial du commercial | Ce directeur |
| Unique | Un circuit à une étape | Cette étape | Ses valideurs |
| Séquentiel | Un circuit à plusieurs étapes | Toutes, une seule `WAITING` à la fois | Les valideurs de la première étape |
| Par montant | Des étapes avec un **Minimum amount** | Celles qu'atteint le montant hors taxes ; les autres `SKIPPED` | Les valideurs de la première étape retenue |

## Ce qui est lu et écrit

| Où | Quoi | Quand |
|---|---|---|
| `orders` | `status`, `submitted_at` | Étape 5 ; puis étape 10 |
| `approval_chains` | Le circuit et la copie de ses règles, `rules_json` | Étape 5 |
| `approval_steps` | Une ligne par étape : `status`, valideurs, décision, commentaire | Étape 5 ; puis étapes 8 à 10 |
| `audit_log` | `order.submit`, `approval.chain.create`, `approval.decide` | Étapes 6, 8 et 10 |
| Relais de messagerie | Un e-mail par valideur de l'étape qui s'ouvre | Étapes 7 et 9, après le commit |
| Journal du serveur | Lignes `[approval]` et `[mail]` | À chaque étape |

## Les états

| Statut | Libellé affiché | Que faire |
|---|---|---|
| `PENDING_APPROVAL` | **Open** | Attendre ; suivre l'avancement dans **Approval chain** |
| `APPROVED` | **Open** | Rien ici : l'entrepôt peut expédier |
| `DRAFT`, après un refus | **Open** | Lire le commentaire dans **Approval chain**, corriger la commande, la soumettre de nouveau |
| Étape `WAITING` | **Waiting** | Les valideurs de cette étape décident |
| Étape `APPROVED`, `REJECTED` | **Approved**, **Rejected** | Rien |
| Étape `SKIPPED` | **Skipped** | Rien : le montant est inférieur au seuil de l'étape |

## Ce que voit l'utilisateur

:::ecran{capture="order-detail" titre="Orders › Order #1041"}
1. **Order #1041**. Le numéro de la commande, qui est aussi son adresse ([[route /orders/1041]]). Le titre n'affiche ni statut ni étape.
2. **Details**. **Customer**, **Status**, **Date**, **Lines** (le nombre de lignes) et **Amount**, hors taxes : le montant que comparent les seuils du circuit. **Status** affiche [[statut open]] aussi bien pour un brouillon que pour une commande en attente de validation ou une commande validée.
3. **Approval chain**. Ouvre [[route /orders/[id]/approval]] : les étapes, leurs valideurs et leurs décisions. Comme le dit la note à côté du lien, l'ouvrir crée le circuit sur le serveur quand la commande n'en a pas ([I1](#/examples/findings~constats-importants)).
:::

Ce que la fiche ne montre pas :
- quelle étape est en attente, et de qui : ouvrez **Approval chain** ;
- si l'e-mail aux valideurs est parti : seul le journal du serveur le sait ;
- une décision prise entre-temps : rien ne se rafraîchit avant que vous rechargiez la page.

Les boutons **Approve** et **Reject** sont dans la boîte des validations, [[menu Orders › Approvals]] ([[route /approvals]]), qui n'a pas de capture dans ces exemples.

## Quand ça se passe mal

| Message | Origine | Reprise |
|---|---|---|
| « This order has no lines » | Étape 2, `orderService.ts:129` | Ajoutez une ligne, puis soumettez de nouveau |
| « Only a draft can be submitted » | Étape 2 : un double clic, ou une commande déjà soumise (`orderService.ts:125`) | Rechargez la fiche |
| « No approver found for step {n} » | Étape 4 : aucun compte actif derrière un rôle ou une personne (`chain.ts:131`) | Corrigez le circuit ou le compte, puis soumettez de nouveau |
| « You are not allowed to perform this action » | Étape 8 : permission manquante, ou pas valideur de l'étape en attente (`approvalService.ts:92`) | Vérifiez le rôle ; reconnectez-vous ([I3](#/examples/findings~constats-importants)) |
| « This step has already been decided » | Étape 8 : deux valideurs de la même étape en même temps (`approvalService.ts:99`) | Rechargez ; la première décision l'emporte |
| « A comment is required to reject » | Étape 8, `lib/validation/approval.ts:8` | Écrivez le motif |
| « Order not found » | Étape 2 ou 8 : la commande est hors de votre périmètre (`orderService.ts:61-66`) | Demandez à un valideur de sa région |

> [!ATTENTION] Ce qui reste écrit à moitié
> - **L'e-mail a échoué** : la commande est `PENDING_APPROVAL` et l'étape `WAITING`, mais personne ne le sait. Il n'y a pas de bouton **Resend** ; le valideur doit ouvrir [[menu Orders › Approvals]] de lui-même.
> - **Le circuit a été créé par une visite** : une commande sans circuit, ouverte sur **Approval chain**, en reçoit un avec les règles du jour, et ses valideurs reçoivent un e-mail ([I1](#/examples/findings~constats-importants)).

## Pour aller plus loin

- [Parcours de bout en bout : une commande](#/examples/journey) : les six étapes ; la suivante, **4. Facturation**, n'a pas de page dans ces exemples.
- [Sécurité](#/examples/technical~le-filtrage-par-perimetre) : le périmètre, et pourquoi la décision y échappe.
- [La liste des commandes](#/examples/screen) : où la commande affiche **Open** pendant toute l'étape.
- [Valider les grosses commandes en deux temps](#/examples/recipe) : la recette qui ajoute une étape par montant.
- [Diagnostic : les accès](#/examples/troubleshooting-area~agir-et-changer-les-droits) : « You are not allowed to perform this action ».
