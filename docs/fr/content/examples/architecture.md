> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `architecture`, écrit pour Acme Orders, le produit fictif du kit. Ses preuves `fichier:ligne` renvoient à un code fictif.

## En bref

Ce dossier décrit l'implantation en production d'Acme Orders : ce qui tourne, où, comment on y accède, et avec quoi l'application communique. Il est reconstitué à partir du portail du fournisseur cloud, consulté en lecture seule le 30 septembre 2026, de l'infrastructure as code du dépôt (`infra/`) et du code de la version 2.4.0. Il ne remplace pas un dossier d'architecture validé par l'équipe d'infrastructure.

- **Ce qui tourne** : une application conteneur, `acme-orders-prd-app`, 2 réplicas de l'image `acme-orders:2.4.0` prise dans le registre partagé.
- **Le travail planifié** : trois tâches planifiées appellent l'application la nuit : factures, retards de paiement, archivage. La tâche de relance n'a pas de déclencheur ([C1](#/examples/findings~c1-la-tache-de-relance-ne-tourne-jamais-en-production)).
- **Les données** : un serveur PostgreSQL managé et un compte de stockage pour les PDF des factures, tous deux joints par des points d'accès privés.
- **Les secrets** : un coffre de secrets, lu par la plateforme au démarrage avec l'identité managée ; 6 références.
- **Le réseau** : une entrée HTTPS publique, sur l'application conteneur seulement ; des sorties vers le fournisseur d'identité, le relais de messagerie et le registre.
- **Hors du groupe** : le fournisseur d'identité, le relais de messagerie, le registre d'images, les systèmes partenaires.
- **Supervision et sauvegarde** : un espace de journaux, une règle d'alerte qui ne prévient personne ([P4](#/examples/findings~constats-de-production)) ; des sauvegardes de la base conservées 7 jours ([P2](#/examples/findings~constats-de-production)).
- **12 flux numérotés**, dont 2 absents ou qui ne fonctionnent pas.

> [!NOTE] Comment lire ce dossier
> - « **D'après le portail** » : observé le 30 septembre 2026.
> - « **Infrastructure as code** » : prévu par `infra/` ; la production a pu diverger.
> - « **Déduit** » : une conclusion tirée de ces sources, non observée directement.
> - « **À confirmer** » : inconnu ; demandez à l'équipe d'infrastructure.

## Dans cette partie

Le détail du déploiement tient dans deux pages, qui jouent le rôle de sous-pages de ce dossier :

| Sous-page | Ce que vous y trouverez |
|---|---|
| [Variables d'environnement](#/examples/variables) | Les 22 variables de l'application conteneur, comparées au code ; les références au coffre. |
| [Ressources du déploiement](#/examples/resources) | Les 19 ressources du groupe, par famille, ce qui se sert de chacune, et les sauvegardes. |

## Le schéma

::schema{id="ex-architecture" titre="Acme Orders en production. Au centre, le groupe de ressources : l'application conteneur, les tâches planifiées, et à droite les données jointes par des points d'accès privés. À l'extérieur : les utilisateurs et les partenaires à gauche, les services partagés en haut. Les numéros renvoient au tableau des flux ; en pointillé : un flux absent ou qui ne fonctionne pas."}

## Les flux numérotés

| N° | De → vers | Protocole | Authentification | Données et code |
|---|---|---|---|---|
| **#1** | Utilisateurs → application | HTTPS 443 | Cookie de session | Pages et actions serveur (`middleware.ts`) |
| **#2** | Application → fournisseur d'identité | HTTPS, OIDC | Secret client | Code et jeton d'identité (`lib/auth/index.ts:52`) |
| **#3** | Application → relais de messagerie | SMTP 587, STARTTLS | Utilisateur et mot de passe | E-mails de validation et de facture (`lib/mail/send.ts:30`) |
| **#4** | Registre → plateforme | HTTPS | Identité managée | L'image, à chaque déploiement (d'après le portail) |
| **#5** | Application → PostgreSQL | TLS 5432, point d'accès privé | Mot de passe tiré du coffre | Toutes les données métier (`db/client.ts:9`) |
| **#6** | Application → stockage des factures | HTTPS, point d'accès privé | Identité managée | PDF des factures (`lib/storage/invoices.ts:8`) |
| **#7** | Plateforme → coffre de secrets | HTTPS, point d'accès privé | Identité managée | 6 références, au démarrage (`infra/app.tf:58-71`) |
| **#8** | Application → journaux, télémétrie | HTTPS | Chaîne de connexion | Requêtes, traces, erreurs (`instrumentation.ts:6`) |
| **#9** | Planificateur → application | HTTPS, `/api/jobs/*` | En-tête à secret partagé | Factures, retards de paiement, archivage (`infra/jobs.tf:8-40`) |
| **#10** | Planificateur → application, relances | — | — | **Absent** : aucun déclencheur déclaré ([C1](#/examples/findings~c1-la-tache-de-relance-ne-tourne-jamais-en-production)) |
| **#11** | Systèmes partenaires → application | HTTPS, `/api/v1/*` | Clé d'API | Expéditions et paiements (`app/api/v1/`) |
| **#12** | Règle d'alerte → exploitation | E-mail | — | **Inopérant** : une boîte aux lettres désactivée, à confirmer ([P4](#/examples/findings~constats-de-production)) |

> [!NOTE] Ce que le tableau laisse ouvert
> - **#1** : si une passerelle ou un pare-feu se trouve devant l'application conteneur (à confirmer).
> - **#3** : si le relais de messagerie est joint par une adresse publique ou par le réseau privé (à confirmer).
> - **#4** : le portail montre l'étiquette (tag) de l'image, pas son empreinte (digest) ; que l'étiquette `2.4.0` corresponde au code lu ici est déduit.
> - **#11** : quels partenaires appellent encore ; la base contient trois clés d'API actives (d'après une requête en lecture seule).

## Les composants

| Composant | Nom en production | Rôle | Pour aller plus loin |
|---|---|---|---|
| Application conteneur | `acme-orders-prd-app` | Serveur Next.js : pages, actions serveur, API | [Ressources](#/examples/resources~calcul) |
| Tâches planifiées | `acme-orders-prd-job-*` (3) | Appellent `/api/jobs/*` la nuit | [Parcours](#/examples/journey) |
| PostgreSQL | `acme-orders-prd-pg` | Commandes, validations, factures, utilisateurs, journal d'audit | [Ressources](#/examples/resources~donnees) |
| Stockage des factures | `acmeordersprdst` | PDF des factures | [Ressources](#/examples/resources~donnees) |
| Coffre de secrets | `acme-orders-prd-kv` | 6 secrets | [Variables](#/examples/variables) |
| Espace de journaux | `acme-orders-prd-logs` | Journaux, télémétrie, la règle d'alerte | [Diagnostic](#/examples/troubleshooting~ou-regarder) |

## Ce que le DAT ne montre pas

> [!NOTE] À confirmer avec l'équipe d'infrastructure
> - **Accès** : qui détient quel rôle sur le groupe ; ce constat a été fait avec un rôle de lecteur seulement.
> - **Entrée** : une passerelle ou un pare-feu devant l'application conteneur (flux #1).
> - **Sortie** : le chemin vers le relais de messagerie et vers le fournisseur d'identité, et l'existence d'une adresse sortante fixe pour les partenaires.
> - **DNS et certificat** : qui gère `orders.example.org`, et quand son certificat est renouvelé.
> - **Registre** : combien de temps les anciennes images sont conservées ; un retour arrière en dépend.
> - **Sauvegarde** : la date du dernier test de restauration, et si les sauvegardes sont copiées dans une autre région.
> - **Supervision** : qui doit recevoir l'alerte sur les tâches en échec (flux #12).

## Qui gère quoi

> [!DROITS] Responsabilités
> - **Ressources, réseau, variables, secrets, supervision** : l'équipe d'infrastructure, par l'infrastructure as code (`infra/`) et son pipeline. Une modification faite seulement dans le portail est perdue au déploiement suivant ; P2 est une dérive de ce genre.
> - **Image de l'application** : l'équipe de développement d'Acme Orders la construit dans son pipeline et la déploie en changeant l'étiquette.
> - **Inscription chez le fournisseur d'identité, groupes** : l'équipe identité.
> - **Relais de messagerie, registre, zones DNS privées** : l'équipe plateforme.
> - **Réglages stockés en base** : les administrateurs de l'application, dans [[menu Administration › Roles]], [[menu Administration › Approval chains]] et [[menu Administration › Users]].
