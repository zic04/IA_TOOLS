> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `code-map`, écrit pour Acme Orders, le produit fictif du kit. Ses preuves `fichier:ligne` renvoient à un code fictif.

## En bref

Un seul dépôt : un front Next.js et ses routes d'API dans un seul processus, une base Postgres managée, trois tâches planifiées exécutées comme des conteneurs séparés.

## Contexte

::schema{id="code-context" titre="Acme Orders et les systèmes avec lesquels elle parle : le fournisseur de paiement, le fournisseur d'e-mail et le fournisseur d'identité."}

## Conteneurs

| Conteneur | Technologie | Code |
|---|---|---|
| Application web (pages + routes d'API) | Next.js 14, TypeScript | `app/` |
| Tâches planifiées | Node, exécutées comme des conteneurs séparés sur une minuterie | `jobs/` |
| Base de données | Postgres managé | `prisma/`, `infra/db.tf` |

## Composants

| Composant | Rôle | Code |
|---|---|---|
| Service des commandes | Création, recherche, décisions de validation | `lib/services/approvalService.ts`, `lib/services/searchService.ts` |
| Authentification | Session, résolution du rôle | `lib/auth/index.ts` |
| Mail | Compose et envoie l'e-mail transactionnel | `lib/mail/send.ts`, `lib/mail/links.ts` |

## Intégrations

| Système | Appelé depuis | Preuve |
|---|---|---|
| Fournisseur de paiement | `lib/payments.ts` | [[verifie lib/mail/links.ts:6]] |
| Fournisseur d'e-mail transactionnel | `lib/mail/send.ts` | [[verifie lib/mail/send.ts:22]] |
| Fournisseur d'identité (connexion) | `lib/auth/index.ts` | [[verifie lib/auth/index.ts:64]] |

## Code dupliqué ou mort

- `lib/services/approvalService.ts` réimplémente son propre calcul de dates au lieu d'utiliser le paquet du projet `acme-date-utils`, qui fait déjà la même chose — probablement à l'origine de l'entrée `acme-date-helpers` dans `package.json` (voir Dépendances).
