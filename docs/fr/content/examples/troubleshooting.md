> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `troubleshooting`, écrit pour Acme Orders, le produit fictif du kit. Ses preuves `fichier:ligne` renvoient à un code fictif.

## En bref

Cette partie part d'un symptôme, dans les mots de la personne qui le signale, et mène en une minute à sa cause probable, à la vérification qui tranche, à la correction, et à la page qui explique le mécanisme. Elle suit le code de la version 2.4.0 et la production observée le 30 septembre 2026.

> [!MECANISME] Trois réflexes avant de chercher plus loin
> - **Un rôle change à la connexion suivante.** Après un changement de groupe, demandez d'abord à la personne de se déconnecter puis de se reconnecter ([I3](#/examples/findings~constats-importants)).
> - **« Introuvable » veut souvent dire « hors de votre périmètre ».** Une commande d'une autre région reçoit la réponse « Order not found », jamais « interdit » (`lib/services/orderService.ts:61-66`).
> - **Une tâche planifiée n'a peut-être pas tourné.** Les factures ne sont faites que la nuit, et les relances jamais ([C1](#/examples/findings~c1-la-tache-de-relance-ne-tourne-jamais-en-production)). Regardez les lignes `[jobs]` avant de soupçonner le code.

## Le schéma

::schema{id="ex-troubleshooting" titre="Par où commencer : les trois questions préalables, puis les quatre familles de symptômes, chacune avec ses symptômes typiques. La famille mise en valeur a sa propre page dans ces exemples."}

## Avant tout : les vérifications qui expliquent la moitié des symptômes

| Vérification | Où regarder | Ce qui piège |
|---|---|---|
| Est-ce le bon compte ? | Le nom dans l'en-tête ; [[menu Administration › Users]] | Le nom vient de **Settings** et peut être modifié : deux personnes peuvent afficher le même nom |
| La personne s'est-elle reconnectée depuis le dernier changement de rôle ? | **Last sign-in** dans l'écran Users ; l'entrée `auth.signin` | **Role** dans l'écran Users est le rôle configuré, pas celui que porte la session ([I3](#/examples/findings~constats-importants)) |
| La commande est-elle dans le périmètre de la personne ? | **Region** de la commande et du compte | « Order not found » ne dit rien du périmètre ([le filtrage par périmètre](#/examples/technical~le-filtrage-par-perimetre)) |
| La commande est-elle archivée ? | La recherche, [[touche Ctrl+K]] | Une commande archivée quitte la liste sans prévenir |
| La tâche planifiée a-t-elle tourné ? | Les lignes `[jobs] done`, requête 2 ci-dessous | L'historique du planificateur ne mentionne même pas les relances, qui ne tournent jamais ([C1](#/examples/findings~c1-la-tache-de-relance-ne-tourne-jamais-en-production)) |
| L'e-mail est-il parti ? | Les lignes `[mail]`, requête 1 ci-dessous | Le journal d'audit enregistre la décision, pas l'e-mail |
| Quel environnement s'est ouvert ? | La barre d'adresse | Les liens des e-mails ouvrent la préproduction ([P1](#/examples/findings~constats-de-production)) |

## Où regarder

### Les écrans d'administration

| Écran | Ce qu'il dit |
|---|---|
| [[menu Administration › Users]] | **Last sign-in**, **Region**, **Role** et **Active** de chaque compte |
| [[menu Administration › Roles]] | Les groupes du fournisseur d'identité associés à chaque rôle |
| [[menu Administration › Approval chains]] | Le circuit actif de chaque type de commande ; **Test the rule** |
| [[menu Administration › Audit log]] | Chaque écriture, filtrée par code, par personne ou par date |

### Le journal d'audit

| Code | Ce qu'il prouve |
|---|---|
| `auth.signin` | La personne s'est connectée, et le rôle qu'elle a obtenu |
| `auth.signin.denied` | Une connexion refusée, avec sa raison : `no_role` ou `no_groups_claim` |
| `order.submit` | La commande a quitté le brouillon |
| `approval.chain.create` | Un circuit a été créé : à la soumission, ou par l'ouverture de la page **Approval chain** ([I1](#/examples/findings~constats-importants)) |
| `approval.decide` | Une décision, avec l'étape et le valideur |
| `role.mapping.update` | Un groupe a été associé à un rôle, ou dissocié |
| `reminder.sent` | Jamais présent en production ([C1](#/examples/findings~c1-la-tache-de-relance-ne-tourne-jamais-en-production)) |

### Les journaux du serveur

| Préfixe | Écrit par | Quand |
|---|---|---|
| `[auth]` | `lib/auth/index.ts:102` | Une connexion est refusée, avec `reason=`, ou le retour du fournisseur (callback) échoue |
| `[scope]` | `lib/scope.ts:41` | Quelqu'un demande un objet hors de son périmètre |
| `[approval]` | `lib/services/approvalService.ts:75` | Un circuit est déterminé, une étape est décidée |
| `[mail]` | `lib/mail/send.ts:48` | Un e-mail est envoyé, ou échoue |
| `[jobs]` | `app/api/jobs/[job]/route.ts:30` | Une tâche démarre, se termine (`done`) ou échoue |
| `[invoice]` | `jobs/invoiceJob.ts:57` | Une facture ne peut pas être créée |

### Requêtes prêtes à l'emploi

Les journaux du serveur arrivent dans l'espace de journaux du déploiement. Ces requêtes sont écrites dans le langage KQL (Kusto Query Language) de cet espace ; la table `AppLogs` et ses colonnes ont été vérifiées, et chaque requête exécutée, le 30 septembre 2026.

Requête 1, les e-mails en échec des dernières 24 heures :

```kusto
AppLogs
| where TimeGenerated > ago(24h)
| where Message has "[mail] send failed"
| project TimeGenerated, Replica, Message
| order by TimeGenerated desc
```

Requête 2, les exécutions de chaque tâche planifiée, par jour, sur 7 jours. `reminders` n'apparaît jamais ([C1](#/examples/findings~c1-la-tache-de-relance-ne-tourne-jamais-en-production)) :

```kusto
AppLogs
| where TimeGenerated > ago(7d) and Message has "[jobs] done"
| extend Job = extract(@"job=(\w+)", 1, Message)
| summarize Runs = count() by Job, bin(TimeGenerated, 1d)
```

Requête 3, les demandes hors périmètre par personne, sur 24 heures :

```kusto
AppLogs
| where TimeGenerated > ago(24h) and Message has "[scope] denied"
| extend User = extract(@"user=(\S+)", 1, Message)
| summarize Denied = count() by User
| order by Denied desc
```

Requête 4, les connexions refusées et leur raison, sur 7 jours :

```kusto
AppLogs
| where TimeGenerated > ago(7d) and Message has "[auth] denied"
| extend Reason = extract(@"reason=(\w+)", 1, Message)
| summarize Count = count() by Reason
```

## Dans cette partie

Dans ces exemples, seul le premier domaine a sa propre page ; sur un vrai site, chaque ligne mène à sa sous-page.

| Sous-page | Symptômes traités | Constats principaux |
|---|---|---|
| [1. Accès](#/examples/troubleshooting-area) | « Access denied », une connexion qui tourne en boucle, « Order not found », une liste vide, un bouton absent, des droits qui ne changent pas | C2, I3 |
| 2. Validations | « No approver found », une commande bloquée en attente, le mauvais circuit | C1, I1, I4 |
| 3. Factures | Expédiée mais pas facturée, un PDF manquant | I5, P4 |
| 4. E-mails | Pas d'e-mail, un lien qui ouvre un autre environnement, des e-mails en anglais | C1, P1, R1 |

## Pour aller plus loin

- [Points d'attention](#/examples/findings) : chaque numéro cité dans cette page, avec sa preuve et sa recommandation.
- [Parcours de bout en bout : une commande](#/examples/journey) : à quelle étape une commande attend, et qui elle attend.
- [Étape d'un parcours : la validation](#/examples/journey-step) : les messages de la validation, avec leur origine.
- [Dossier d'architecture technique (DAT)](#/examples/architecture) : où se trouvent l'espace de journaux et les tâches planifiées.
