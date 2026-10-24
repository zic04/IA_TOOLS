## En bref

Acme Orders répond sur une douzaine de routes ; quatre d'entre elles ne vérifient jamais qui les appelle. Il n'y a
jamais qu'un seul compte de démo, donc l'isolation entre locataires ne s'applique pas — mais l'isolation entre rôles,
elle, s'applique, et rien ne la vérifie aujourd'hui.

## Les routes

`doc-kit facts --source api` ne trouve rien : Acme Orders répond par des comparaisons directes de chaînes sur le
chemin de la requête (`serve.mjs`) plutôt que par un routeur que l'adaptateur sait analyser ; le tableau ci-dessous a
donc été entièrement complété à la main à partir du code. Il n'y a pas d'isolation entre locataires à vérifier : la
démo n'a qu'un seul compte.

::facts{source="api" columns="method,route,file"}

| Méthode | Route | Authentification | Rôle | Preuve |
|---|---|---|---|---|
| GET | `/login` | Aucune | Publique | [[verified serve.mjs:41]] |
| POST | `/login` | Aucune | Publique | [[verified serve.mjs:33]] |
| GET | `/api/me` | Cookie de session | Connecté | [[verified serve.mjs:52]] |
| GET | `/api/orders` | Cookie de session | Connecté | [[verified serve.mjs:54]] |
| GET | `/api/orders/[id]` | Cookie de session | Connecté | [[verified serve.mjs:55]] |
| POST | `/api/settings` | Cookie de session | Connecté | [[verified serve.mjs:49]] |
| GET | `/orders/[id]/approval` | Cookie de session | Connecté — écrit à l'affichage | [[verified serve.mjs:59]] |
| POST | `/api/demo/reset` | Aucune | Publique | [[verified serve.mjs:40]] |

## Règles d'accès à la base de données

::facts{source="db" columns="table,rls,policies"}

Il n'y a pas de base de données : Acme Orders garde tout dans un seul objet en mémoire, initialisé depuis
`data.json` et abandonné au redémarrage ([[verified serve.mjs:22]]). Aucune sécurité au niveau des lignes ne
s'applique, car aucune ligne ne survit à un redémarrage.

## Routes publiques

| Route | Pourquoi elle est publique | Preuve |
|---|---|---|
| `GET`/`POST` `/login` | La page de connexion elle-même | [[verified serve.mjs:41]] |
| `GET` `/style.css`, `/app.js` | Ressources statiques, nécessaires avant la connexion | [[verified serve.mjs:43]] |
| `POST` `/api/demo/reset` | Commodité pour `capture.setup` ; réinitialise les données de démo, rien de plus | [[verified serve.mjs:40]] |

## Manques

- [C1](#/risks/findings~c1-aucun-controle-d-acces) — le seul contrôle est « quelqu'un est-il connecté »
  ([[verified serve.mjs:46]]) ; aucune route ne distingue [[perm orders:read]] de [[perm orders:approve]].
- [I1](#/risks/findings~i1-ouvrir-la-chaine-d-approbation-ecrit-lors-d-un-get) — `GET /orders/[id]/approval` écrit à
  l'affichage ([[verified serve.mjs:59]]), et la page d'une commande la précharge automatiquement
  ([[verified app.js:16]]).
