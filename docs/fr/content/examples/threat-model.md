> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `threat-model`, écrit pour Acme Orders, le produit fictif du kit. Ses preuves `fichier:ligne` renvoient à un code fictif.

## En bref

Le risque principal est l'accès aux données d'une autre région : deux des trois tables liées à une région n'ont aucune protection au niveau base, et une route d'API prend une décision de validation sans vérifier la région de l'appelant du tout (C2 des constats).

## Le schéma de flux de données

::schema{id="threat-dfd" titre="Une requête traverse trois frontières de confiance : navigateur vers application, application vers base de données, application vers le fournisseur de paiement."}

## Frontières de confiance

| Frontière | Ce qui la traverse |
|---|---|
| Navigateur → application | Le cookie de session, à chaque requête |
| Application → base de données | Les requêtes SQL, avec la variable de session de région fixée par l'application |
| Application → fournisseur de paiement | Le montant de la commande et un jeton de carte, jamais le numéro de carte |

## Menaces

### Navigateur → application

- **Élévation de privilège** : un rôle est mis en cache dans la session pendant 8 heures (I3 des constats) ; une personne retirée d'un rôle le garde jusqu'à l'expiration de la session ([[verifie lib/auth/index.ts:64]]).

### Application → base de données

- **Divulgation d'information** : `decide` accepte tout titulaire du rôle `orders:approve`, de n'importe quelle région, car elle n'appelle jamais `scopeWhere` et `approval_steps` n'a pas non plus de politique de sécurité au niveau ligne (C2 des constats) ([[verifie lib/services/approvalService.ts:88]]).
- **Divulgation d'information** : `customers` n'a aucune politique de sécurité au niveau ligne ; chaque requête doit se souvenir de filtrer par région dans le code applicatif ([[deduit prisma/schema.prisma:1]]).

### Application → fournisseur de paiement

- **Altération** : la clé d'API du fournisseur de paiement vit dans un secret de l'application conteneur ; rien dans le code ne la fait tourner automatiquement ([[verifie infra/jobs.tf:14]]).

## Mesures d'atténuation

- La sécurité au niveau ligne sur `orders` atténue la majeure partie du risque de divulgation inter-régions pour cette table (voir [Exemple · Dossier d'architecture technique](#/examples/architecture) et son [ADR](#/examples/adr)).
- L'authentification par session bloque l'accès anonyme à toute route sauf la sonde de santé.

## Risques acceptés

- Le délai du cache de rôle (I3) est accepté pour l'instant : raccourcir la session a été jugé trop perturbant pour les utilisateurs qui restent connectés toute la journée ; à revoir si un incident de retrait de rôle survient avant l'expiration naturelle du cache.
