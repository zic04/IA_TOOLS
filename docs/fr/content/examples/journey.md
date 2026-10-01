> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `journey`, écrit pour Acme Orders, le produit fictif du kit. Ses preuves `fichier:ligne` renvoient à un code fictif.

## En bref

Ce parcours suit une commande d'Acme Orders de sa création à son archivage, en six étapes, d'après le code de la version 2.4.0 et la production observée le 30 septembre 2026. Quatre étapes attendent une personne : le commercial, les valideurs, l'entrepôt, le client. Trois tâches planifiées font le reste la nuit, et une quatrième, la relance, n'a jamais été planifiée.

> [!MECANISME] Que se passe-t-il quand un commercial soumet une commande ?
> Moins qu'on ne le croit. Dans la même requête, le serveur résout le circuit de validation, l'écrit, et envoie un e-mail aux valideurs de la première étape (`lib/services/orderService.ts:139-142`). Ensuite, rien ne bouge tant qu'un valideur n'a pas ouvert sa boîte des validations. Aucune relance ne suit jamais en production ([C1](#/examples/findings~c1-la-tache-de-relance-ne-tourne-jamais-en-production)).

## Le schéma

::schema{id="ex-journey-order" titre="Les six étapes d'une commande, de gauche à droite. Trait plein : enchaîné par le code ; pointillé : attend une personne ; en orange, ce qui dépend d'une tâche planifiée ; en rouge, une tâche planifiée qui ne tourne jamais."}

## Dans cette partie

Dans ces exemples, seule l'étape 3 a sa propre page ; sur un vrai site, chaque ligne renvoie à la page de son étape.

| Étape | Déclencheur | Automatique ou humain | Ce qui change |
|---|---|---|---|
| 1. Création | **Save** sur une nouvelle commande | Humain | Commande `DRAFT` ; `order.create` |
| 2. Soumission | **Submit for approval** | Humain, puis automatique | `PENDING_APPROVAL` ; circuit écrit ; e-mail |
| [3. Validation](#/examples/journey-step) | **Approve** ou **Reject** | Humain | Étapes décidées ; `APPROVED`, ou retour à `DRAFT` |
| 4. Facturation | Expédition par l'entrepôt, puis la tâche de facturation | Automatique, tâche planifiée | `SHIPPED` ; facture `ISSUED`, avec son PDF |
| 5. Paiement | Import bancaire, ou **Mark as paid** | Automatique ou humain | Facture `PAID`, ou `OVERDUE` après 30 jours |
| 6. Archivage | La tâche d'archivage | Tâche planifiée | `archived_at` ; la commande sort des listes |

## Les états

| Étape | Commande | Circuit de validation | Facture |
|---|---|---|---|
| 1. Création | `DRAFT` (**Open**) | — | — |
| 2. Soumission | `PENDING_APPROVAL` (**Open**) | Créé ; première étape `WAITING` (**Waiting**) | — |
| 3. Validation | `APPROVED` (**Open**), ou `DRAFT` après un refus | Étapes `APPROVED` ou `REJECTED` | — |
| 4. Facturation | `SHIPPED` (**Shipped**) | — | `ISSUED` (**Issued**) |
| 5. Paiement | `SHIPPED` (**Shipped**) | — | `PAID` (**Paid**), ou `OVERDUE` (**Overdue**) |
| 6. Archivage | Inchangée, `archived_at` renseigné | — | Inchangée |

Une commande peut aussi être annulée à toute étape avant l'expédition : `CANCELLED` (**Cancelled**).

## Ce qui se fait tout seul, et ce qui attend quelqu'un

### Tout seul

- À la soumission, dans la même requête : le circuit est résolu et écrit, et les valideurs de la première étape reçoivent un e-mail (`lib/services/approvalService.ts:63-80`).
- Après chaque validation : l'étape suivante s'ouvre, et ses valideurs reçoivent un e-mail (`approvalService.ts:102-110`).
- À 2 h UTC, en tâche planifiée : la tâche de facturation facture les commandes expédiées la veille (`jobs/invoiceJob.ts:20-35`).
- À 3 h UTC, en tâche planifiée : la tâche des retards passe à `OVERDUE` les factures encore impayées 30 jours après leur émission (`jobs/overdueJob.ts:15`).
- À 4 h UTC, en tâche planifiée : la tâche d'archivage archive les commandes payées depuis plus de 90 jours (`jobs/archiveJob.ts:12`).
- Jamais : les relances aux valideurs. La tâche existe dans le code, mais aucune tâche planifiée ne l'appelle ([C1](#/examples/findings~c1-la-tache-de-relance-ne-tourne-jamais-en-production)).

### Attend une personne

- **Le commercial** : **Save**, puis **Submit for approval**.
- **Chaque valideur** : **Approve** ou **Reject** dans [[menu Orders › Approvals]] ; personne ne le relance.
- **L'entrepôt** : l'expédition, envoyée par son système via `/api/v1/shipments`.
- **Le client, puis la Finance** : le paiement, importé de la banque ou saisi avec **Mark as paid**.

## Les surprises à connaître

1. **La liste affiche Open pour trois états différents.** Un brouillon, une commande en attente de validation et une commande validée affichent tous [[statut open]] ; voir [la liste des commandes](#/examples/screen~comment-ca-marche).
2. **La soumission n'envoie d'e-mail qu'aux premiers valideurs.** Dans un circuit séquentiel, la Finance n'entend parler de la commande qu'après la décision du directeur commercial ; voir [l'étape de validation](#/examples/journey-step).
3. **Aucune relance ne part jamais en production.** Une commande peut attendre des semaines sans que personne soit prévenu ([C1](#/examples/findings~c1-la-tache-de-relance-ne-tourne-jamais-en-production)).
4. **Ouvrir le circuit de validation peut le créer.** Sur une commande qui n'en a pas, la page écrit le circuit avec les règles du jour de la visite ([I1](#/examples/findings~constats-importants)).
5. **Une commande soumise de nouveau garde son ancien circuit.** Après un refus, un nouveau seuil ne s'applique pas à elle ([I4](#/examples/findings~constats-importants)).
6. **Une étape confiée à un rôle accepte des valideurs de n'importe quelle région.** La décision ne vérifie pas le périmètre ([C2](#/examples/findings~c2-les-decisions-de-validation-ignorent-le-perimetre)).
7. **Une facture en échec n'est jamais retentée.** La commande reste expédiée, sans facture, et aucune alerte n'atteint personne ([I5](#/examples/findings~constats-importants), [P4](#/examples/findings~constats-de-production)).
8. **Les liens des e-mails ouvrent la préproduction.** En production, `APP_URL` pointe vers le mauvais environnement ([P1](#/examples/findings~constats-de-production)).

## Pour aller plus loin

- [Étape d'un parcours : la validation](#/examples/journey-step) : l'étape 3 au niveau du code, avec ses onze lignes d'exécution.
- [La liste des commandes](#/examples/screen) : où apparaît la commande, avec ses statuts regroupés.
- [Dossier d'architecture technique (DAT)](#/examples/architecture) : où s'exécutent les tâches planifiées, la base de données et le relais de messagerie.
- [Diagnostic par symptôme](#/examples/troubleshooting) : quand une commande reste bloquée à l'une de ces étapes.
- [Points d'attention](#/examples/findings) : chaque constat cité sur cette page.
