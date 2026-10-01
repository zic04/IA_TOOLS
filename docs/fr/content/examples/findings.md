> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `findings`, écrit pour Acme Orders, le produit fictif du kit. Ses preuves `fichier:ligne` renvoient à un code fictif.

## Comment lire cette page

Cette page est la liste de travail de celui qui reprend Acme Orders : les écarts, risques et dettes trouvés à la reprise, chacun revérifié dans le code de la version 2.4.0 le 30 septembre 2026. Les constats de production viennent du portail du fournisseur cloud, consulté en lecture seule le même jour, et d'un export en lecture seule du journal d'audit de production.

| Gravité | Définition | Nombre |
|---|---|---|
| **Critique** | Risque actuel pour la sécurité des données, la confidentialité ou la promesse première du produit ; à traiter avant toute autre évolution | 2 |
| **Important** | Défaut réel, contournement possible, fonction cassée ou trompeuse ; à planifier rapidement | 5 |
| **Mineur** | Dette, incohérence, affichage ou hygiène ; à traiter au fil de l'eau | 3 |

Les constats sont numérotés **C** (critiques), **I** (importants) et **M** (mineurs). Deux familles s'y ajoutent, avec leur gravité dans une colonne : **P**, propres à la production (la configuration réelle diffère de ce que prévoit le code), 4 constats, et **R**, réglages et écrans sans effet, 2 constats. Un numéro ne change jamais : un nouveau constat prend le numéro libre suivant de sa famille.

## L'essentiel en une minute

:::etapes
1. **Déclarer le déclencheur des relances** : les valideurs n'ont jamais reçu de relance en production (C1).
2. **Vérifier le périmètre dans les décisions de validation** : un valideur peut décider d'une commande d'une autre région (C2).
3. **Corriger `APP_URL` et l'alerte** : les liens des e-mails ouvrent la préproduction, et les tâches en échec n'alertent personne (P1, P4).
4. **Rendre les factures et les données récupérables** : retenter les factures en échec et rétablir une rétention des sauvegardes de 35 jours (I5, P2).
5. **Ne plus écrire sur un GET** : créer le circuit de validation à la soumission seulement (I1).
:::

## Dans cette partie

Avec environ 1 400 mots, les constats tiennent sur une page. Au-delà d'environ 2 000 mots, placez chaque famille dans sa propre sous-page, et remplacez les liens de ce tableau par des liens vers ces sous-pages.

| Famille | Ce que vous y trouverez |
|---|---|
| [Constats critiques](#/examples/findings~constats-critiques) | C1 et C2, chacun en détail : constat, impact, recommandation. |
| [Constats importants](#/examples/findings~constats-importants) | I1 à I5, une ligne chacun. |
| [Constats mineurs](#/examples/findings~constats-mineurs) | M1 à M3. |
| [Constats de production](#/examples/findings~constats-de-production) | P1 à P4, avec leur gravité. |
| [Réglages sans effet](#/examples/findings~reglages-sans-effet) | R1 et R2, avec leur gravité. |

## Constats critiques

### C1 — La tâche de relance ne tourne jamais en production

**Constat** : la tâche de relance existe (`jobs/reminderJob.ts:38-44`) et le point d'entrée des tâches la connaît (`app/api/jobs/[job]/route.ts:12-16`). Mais l'infrastructure as code ne déclare que trois tâches planifiées : factures, retards de paiement et archivage (`infra/jobs.tf:8-40`). Rien n'appelle jamais `/api/jobs/reminders`, et le journal d'audit de production ne contient aucune entrée `reminder.sent` depuis la mise en service.

**Impact** : les valideurs reçoivent un seul e-mail, à l'ouverture de leur étape. Un e-mail manqué ou perdu laisse la commande en attente sans que personne soit prévenu. Le circuit de validation est la promesse première du produit.

**Recommandation** : déclarez une quatrième tâche planifiée, toutes les heures, dans `infra/jobs.tf` ; vérifiez les premières entrées `reminder.sent` ; ajoutez la tâche à la règle d'alerte (P4).

### C2 — Les décisions de validation ignorent le périmètre

**Constat** : pour une étape confiée à un rôle, `decide` (`lib/services/approvalService.ts:88-97`) accepte tout titulaire du rôle, de n'importe quelle région. Elle vérifie [[droit orders:approve]] mais n'appelle jamais `scopeWhere`, contrairement à toutes les autres lectures. Les identifiants d'étape sont des entiers séquentiels.

**Impact** : un directeur commercial peut valider ou rejeter une commande d'une autre région, sans la voir, en appelant l'action serveur avec un identifiant d'étape deviné. La décision est enregistrée comme légitime dans le journal d'audit.

**Recommandation** : chargez l'étape avec `scopeWhere`, comme le fait toute autre lecture, et ajoutez un test par rôle.

## Constats importants

| N° | Point | Où | Constat et impact | Recommandation |
|---|---|---|---|---|
| **I1** | Ouvrir le circuit de validation écrit | `app/(app)/orders/[id]/approval/page.tsx:22-31` | Une requête GET crée le circuit d'une commande qui n'en a pas, avec les règles du jour, et envoie un e-mail à ses valideurs. Un aperçu de lien ou un outil de capture peut le faire. | Créer le circuit à la soumission seulement ; mettre la page en lecture seule |
| **I2** | **Today** ne parle pas d'aujourd'hui | `app/(app)/orders/TodayPanel.tsx:14-22` | Le panneau additionne les lignes affichées, quelle que soit leur date, commandes annulées comprises. Les directeurs commerciaux le lisent comme les chiffres du jour. | Le renommer, ou calculer les chiffres du jour sur le serveur |
| **I3** | Un changement de rôle attend la connexion suivante | `lib/auth/index.ts:64-71` | Le rôle est figé dans la session pendant 8 heures. Une personne retirée d'un groupe garde ses droits jusque-là. | Relire le rôle à chaque requête, ou raccourcir la session |
| **I4** | Une commande soumise à nouveau garde son ancien circuit | `lib/services/approvalService.ts:141-150` | Après un rejet, la commande réutilise son circuit et sa copie des règles. Un seuil ajouté entre-temps ne s'applique pas. | Construire un nouveau circuit à chaque soumission |
| **I5** | Une facture en échec n'est jamais retentée | `jobs/invoiceJob.ts:52-60` | Une erreur est journalisée puis ignorée, et l'exécution suivante ne prend que les commandes expédiées la veille. La commande reste expédiée sans facture. | Sélectionner toutes les commandes expédiées sans facture |

## Constats mineurs

| N° | Point | Où | Constat et impact | Recommandation |
|---|---|---|---|---|
| **M1** | Les filtres sont perdus | `app/(app)/orders/OrdersFilters.tsx:18` | Les filtres vivent dans l'état de la page, pas dans l'adresse : revenir d'une commande les remet à zéro. | Les garder dans les paramètres de l'adresse |
| **M2** | Un nom fait d'espaces est accepté | `lib/validation/profile.ts:6` | La longueur est vérifiée avant le retrait des espaces ; l'en-tête n'affiche alors aucun nom. | Retirer les espaces d'abord, puis vérifier |
| **M3** | Thème **System** lu une seule fois | `app/ThemeScript.tsx:12` | Le mode de l'appareil est lu au chargement d'une page ; un changement pendant la visite est ignoré. | Écouter le changement de jeu de couleurs |

## Constats de production

| N° | Point | Gravité | Constat et impact | Recommandation |
|---|---|---|---|---|
| **P1** | `APP_URL` pointe vers la préproduction | Important | Réglée sur l'adresse de préproduction dans l'application conteneur ; chaque lien de chaque e-mail ouvre la préproduction (`lib/mail/links.ts:6`). | La régler sur `https://orders.example.org` |
| **P2** | Sauvegardes conservées 7 jours | Important | La base garde 7 jours de sauvegardes ; `infra/db.tf:22` et `docs/DEPLOYMENT.md` disent 35. Une erreur découverte au bout d'une semaine ne peut pas être annulée. | Appliquer de nouveau l'infrastructure as code |
| **P3** | Un compte de stockage inutilisé | Mineur | `acmeordersprdold` contient les fichiers de la version 1, lus par rien, mais l'identité de l'application peut encore y écrire. | Retirer le rôle, puis le compte |
| **P4** | L'alerte sur les tâches en échec ne prévient personne | Important | `alert-jobs-failed` envoie à un groupe d'actions dont la seule adresse est une boîte aux lettres désactivée (à confirmer). Des échecs comme I5 passent inaperçus. | La diriger vers une adresse surveillée, puis la tester |

## Réglages sans effet

| N° | Point | Gravité | Constat et impact | Recommandation |
|---|---|---|---|---|
| **R1** | **Language** n'atteint pas les e-mails | Mineur | **Settings › Language** ne change que l'interface ; chaque e-mail part en anglais (`lib/mail/send.ts:22`). | Passer la langue du destinataire aux modèles d'e-mail |
| **R2** | `LOG_LEVEL` n'est jamais lue | Mineur | Déclarée dans l'application conteneur, mais le journaliseur a un niveau fixe (`lib/log.ts:5`). L'augmenter pendant un incident ne change rien. | La lire, ou la supprimer |

## Les points déjà corrigés

| Constat d'origine | Preuve |
|---|---|
| Des commandes d'une autre région trouvées par la recherche (audit de mars 2025) | `scopeWhere` appelé dans `lib/services/searchService.ts:31`, depuis la version 2.2.0 |
| Cookie de session sans l'attribut `Secure` (audit de mars 2025) | `lib/auth/index.ts:80` |
| PDF de factures lisibles par leur adresse sans session (audit de mars 2025) | La route vérifie la session, `invoices:read` et le périmètre (`app/api/invoices/[id]/pdf/route.ts:14-22`) |

## Ce qui n'a pas pu être vérifié

- L'inscription d'Acme Orders chez le fournisseur d'identité : les groupes envoyés, les adresses de redirection, l'expiration de son secret. Demandez à l'équipe identité.
- Si la boîte aux lettres de l'alerte est vraiment désactivée (P4). Demandez à l'équipe d'exploitation.
- Une restauration de la base : aucune n'a été observée. Demandez à l'équipe d'infrastructure la date du dernier test de restauration.
- Les systèmes partenaires : la base contient trois clés d'API actives, mais personne n'a pu dire quel partenaire détient chacune. Demandez au responsable de l'administration des ventes.

## La documentation existante à ne plus suivre

| Document | État | Remplacé par |
|---|---|---|
| `docs/DEPLOYMENT.md` | Décrit un serveur de cache qui n'existe pas et une sauvegarde de 35 jours qui n'est pas appliquée | [Ressources du déploiement](#/examples/resources) |
| `docs/SECURITY.md` | Annonce une session d'une heure ; elle dure 8 heures | [Connexion](#/examples/technical-sub~la-session) |
| `docs/APPROVALS.md` | Dit qu'un rejet annule la commande ; elle revient en brouillon | [Étape d'un parcours : la validation](#/examples/journey-step) |
