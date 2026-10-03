> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `runbook`, écrit pour Acme Orders, le produit fictif du kit. Ses preuves `fichier:ligne` renvoient à un code fictif.

## En bref

`npm install && npm run dev` démarre toute la pile en local, contre un Postgres local. La production se déploie automatiquement à chaque envoi sur `main` ; rien n'est déployé à la main.

## Installation

:::etapes
1. **Installer Node 20 et les dépendances** : `npm install`.
2. **Démarrer un Postgres local** : `docker compose up -d db`, puis `npx prisma migrate deploy`.
3. **Copier `.env.example` vers `.env.local`** : renseigner `DATABASE_URL`, `SESSION_SECRET` et `PAYMENT_KEY` (demander une clé de bac à sable à l'équipe plateforme ; ne jamais committer le fichier).
:::

## Construction

`npm run build` produit le paquet de production dans `.next/` ; ça prend environ 90 secondes et échoue le pipeline si la vérification des types échoue.

## Déploiement

:::etapes
1. **Envoyer sur `main`** : le pipeline [[verifie .github/workflows/deploy.yml:1]] construit l'image, lance les migrations de base de données, puis met à jour l'application conteneur.
2. **Surveiller le déploiement** : la console cloud montre la nouvelle révision à 100 % du trafic une fois sa sonde de santé passée deux fois d'affilée.
:::

## Retour arrière

- Remettre le trafic sur la révision précédente depuis la console cloud (conservée 7 jours). Les migrations sont additives (nouvelles tables et colonnes seulement) : revenir en arrière sur le code ne demande jamais de retour arrière de base assorti, mais une migration qui supprimerait une colonne en demanderait un — aucune n'en a supprimé jusqu'ici ([[deduit prisma/migrations]]).

## Tâches planifiées

| Tâche | Fréquence | Ce qu'elle fait | Preuve |
|---|---|---|---|
| Tâche de facturation | Toutes les 15 minutes | Génère les factures des commandes expédiées | [[verifie jobs/invoiceJob.ts:1]] |
| Tâche de relance | Déclarée, jamais planifiée | Devrait relancer les valideurs après 48 heures ; voir C1 des constats | [[verifie jobs/reminderJob.ts:38]] |
| Tâche d'archivage | Toutes les nuits à 02:00 | Déplace les commandes de plus de 2 ans vers le stockage froid | [[deduit infra/jobs.tf:30]] |

## Sauvegarde et restauration

:::etapes
1. **Sauvegardes** : la base managée prend un instantané quotidien, conservé 7 jours (`infra/db.tf:22`) ; le guide de déploiement annonce 35 jours, ce qui ne correspond pas (P2 des constats).
2. **Restauration** : depuis la console cloud, vers une nouvelle instance ; aucune restauration n'a été testée depuis la mise en service ([[inconnu]]) — en planifier une avant que la reprise soit terminée.
:::

## Quand ça casse

> [!NOTE] Premiers réflexes
> - Vérifier `/api/v1/health` d'abord : ça vérifie seulement que le processus répond, pas la base de données.
> - Si les commandes ne sont plus facturées, vérifier l'historique d'exécution de la tâche de facturation avant tout (I5 des constats : une exécution en échec est ignorée silencieusement).
