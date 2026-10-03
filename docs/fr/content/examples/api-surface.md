> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `api-surface`, écrit pour Acme Orders, le produit fictif du kit. Ses preuves `fichier:ligne` renvoient à un code fictif. Le tableau ci-dessous est généré à partir de `facts/api.json`, écrit par `doc-kit facts --source api` sur le commit `a1b2c3d`.

## En bref

7 routes ; une seule, la sonde de santé, est publique. La sécurité au niveau ligne impose l'isolation par région à la base (une politique, `orders_region_isolation`) ; le manque ci-dessous est une route qui ne la vérifie jamais dans le code, en s'appuyant sur la seule base de données.

## Les routes

::faits{source="api" colonnes="method,route,file"}

| Route | Auth | Rôle | Isolation | Preuve |
|---|---|---|---|---|
| GET `/api/orders` | Session | `orders:read` | `region_id` | [[verifie searchService.ts:31]] |
| POST `/api/orders` | Session | `orders:write` | `region_id` | [[verifie searchService.ts:31]] |
| GET `/api/orders/[id]` | Session | `orders:read` | Politique base | [[deduit orders_rls.sql:1]] |
| POST <code>/api/orders/[id]/<wbr>approval</code> | Session | `orders:approve` | Non vérifiée | [[verifie approvalService.ts:88]] |
| GET `/api/customers` | Session | `customers:read` | `region_id` | [[verifie searchService.ts:31]] |
| GET `/api/jobs/[job]` | Session | `jobs:read` | N/A | [[verifie jobs/route.ts:12]] |
| GET `/api/v1/health` | Aucune | Aucun | N/A | [[verifie health/route.ts:1]] |

## Règles d'accès à la base de données

::faits{source="db" colonnes="table,rls,policies"}

Seule `orders` porte une politique de sécurité au niveau ligne. `customers` et `approval_steps` reposent entièrement sur le filtrage par `region_id` dans le code applicatif — non vérifié pour `approval_steps` (voir Manques).

## Routes publiques

| Route | Pourquoi elle est publique | Preuve |
|---|---|---|
| `/api/v1/health` | Sonde de l'équilibreur de charge | [[verifie app/api/v1/health/route.ts:1]] |

## Manques

- C2 — `decide` (`lib/services/approvalService.ts:88-97`) accepte tout titulaire du rôle `orders:approve`, de n'importe quelle région : ni `scopeWhere`, ni politique de base sur `approval_steps` ([[verifie lib/services/approvalService.ts:88]]).
- `GET /api/orders/[id]` n'a aucun contrôle applicatif de locataire ; ça fonctionne aujourd'hui seulement parce que la politique de la base sur `orders` le couvre par hasard ([[deduit infra/migrations/0012_orders_rls.sql:1]]). Une requête qui contournerait le contexte de session de l'ORM ne serait pas protégée.
