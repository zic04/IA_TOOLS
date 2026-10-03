> [!NOTE] À propos de cet exemple
> Cette page est l'exemple du gabarit `security-review`, écrit pour Acme Orders, le produit fictif du kit. Ses preuves `fichier:ligne` pointent vers une base de code fictive. Le tableau de contrôle d'accès est généré depuis `facts/api.json` ; les autres tableaux depuis `facts/security.json` (`doc-kit facts --source security`). Les résultats de la sonde sont écrits à la main ici, comme les rapporterait un `doc-kit probe` lancé sur une copie locale — probe ne touche jamais la production.

## En bref

L'authentification est saine et le contrôle d'accès correspond à la matrice statique, sans surprise en direct côté sonde. Deux manques réels : le secret de signature de session retombe sur une valeur codée en dur quand la variable d'environnement est absente, et une politique CORS configurée pour toute l'application combine une origine générique avec les identifiants — inutilisée aujourd'hui (aucune route n'est appelée en inter-origine), mais à une intégration près de devenir exploitable.

## Périmètre et méthode

Vérifié sur le code au commit `a1b2c3d`, version 2.4.0 — le même commit que [Exemple · Surface d'API](#/examples/api-surface) et [Exemple · Dépendances](#/examples/dependencies). Les faits d'abord (`doc-kit facts --source api --source security`), puis une sonde en lecture seule d'une copie locale d'Acme Orders (`doc-kit probe`) ; la production n'est jamais sondée (voir le guide du kit, « Pourquoi probe ne touche jamais la production »). Hors périmètre : la configuration du fournisseur d'identité lui-même (demander à l'équipe identité, voir [Exemple · Accès et propriété](#/examples/access-ownership)).

## Authentification et sessions

Session établie après connexion chez le fournisseur d'identité ; le cookie est signé avec `SESSION_SECRET` ([[verifie lib/auth/index.ts:64]]). Le rôle est lu une fois et mis en cache dans la session pendant 8 heures (I3 des constats) : un rôle retiré par un administrateur s'applique encore jusqu'à l'expiration de la session ou la déconnexion de la personne ([[deduit lib/auth/index.ts:70]]).

## Contrôle d'accès

::faits{source="api" colonnes="method,route,auth,guards,file"}

La sonde correspond exactement à la matrice statique : chaque route sauf le contrôle de santé répond 401 à une requête anonyme.

| Route | Attendu | Anonyme | Constat |
|---|---|---|---|
| `GET /api/orders` | Protégée | 401 | aucun |
| `POST /api/orders/[id]/approval` | Protégée | 401 | aucun |
| `GET /api/v1/health` | Ouverte | 200 | aucun (pas de donnée personnelle dans la réponse) |

Une route qui répond correctement à un appelant anonyme n'est pas la même chose qu'une route qui répond correctement au *bon* appelant : `POST /api/orders/[id]/approval` exige le rôle `orders:approve` ([[verifie lib/services/approvalService.ts:88]]), exactement ce que rapporte ici `auth: "role"` — mais le contrôle de rôle seul n'est pas le bug. Le manque (C2 des constats) se situe un niveau plus bas : `decide` n'appelle jamais `scopeWhere`, si bien que tout détenteur du rôle, de n'importe quelle région, peut approuver une commande qui n'est pas la sienne. `probe` ne peut pas le voir : il n'a pas de seconde région depuis laquelle appeler.

## Traitement des entrées

- **A03:2021 — Script intersite (XSS).** Le champ des notes de commande est rendu avec l'échappatoire HTML brut de React, sans assainissement préalable ([[verifie components/orders/OrderNotes.tsx:18]]). Une note contenant une balise script s'exécuterait dans le navigateur de la prochaine personne qui ouvre la commande.

## Secrets et configuration

::faits{source="security" colonnes="rule,file,line,severity,owasp"}

- **A07:2021 — Secret de repli codé en dur.** `SESSION_SECRET` retombe sur une chaîne littérale quand la variable d'environnement n'est pas définie ([[verifie lib/auth/index.ts:2]]) ; un environnement mal configuré signerait chaque session avec un secret visible dans le dépôt.
- **A05:2021 — CORS permissif, inutilisé aujourd'hui.** `lib/http/cors.ts:9` autorise n'importe quelle origine avec les identifiants ; aucune route actuelle n'est appelée en inter-origine, donc rien ne l'exploite encore, mais la politique devrait être restreinte aux domaines partenaires qui en auront vraiment besoin plutôt que laissée ouverte « au cas où ».
- **A05:2021 — Un indicateur de développement laissé actif.** `jobs/runner.ts:4` met `debug: true` sans condition ; dans le conteneur des tâches planifiées, cela ne signifie aujourd'hui que des journaux plus bavards, mais mieux vaut l'éteindre avant qu'on ne s'appuie dessus pour autre chose.

## Dépendances

Voir [Exemple · Dépendances](#/examples/dependencies) : une dépendance directe n'existe pas dans son registre, signe probable d'un nom de paquet inventé par un assistant IA. Aucune dépendance connue comme vulnérable n'a été trouvée dans cette passe.

## En-têtes de sécurité HTTP

Le contrôle d'en-têtes de la sonde sur `/` et sur `GET /api/orders` :

| En-tête | Présent |
|---|---|
| `Strict-Transport-Security` | Oui (HTTPS seulement) |
| `X-Content-Type-Options` | Oui |
| `Content-Security-Policy` | Non |
| Protection contre le cadrage (`X-Frame-Options` ou `frame-ancestors`) | Non |

Cookies : le cookie de session porte `Secure` et `HttpOnly`, mais aucun attribut `SameSite` — il retombe sur le choix propre du navigateur plutôt qu'une valeur choisie délibérément par Acme Orders.

## Journalisation et supervision

Chaque décision d'approbation est écrite dans le journal d'audit avec son acteur et son résultat (utilisé partout dans la page des constats) ; une connexion échouée n'est pas journalisée du tout côté application, si bien qu'une tentative de mot de passe deviné chez le fournisseur d'identité n'y laisserait aucune trace — le fournisseur d'identité peut toutefois la journaliser de son côté.

## Constats

| Constat | OWASP | Preuve | Recommandation |
|---|---|---|---|
| Secret de session de repli codé en dur | A07:2021 | [[verifie lib/auth/index.ts:2]] | Faire échouer le démarrage si `SESSION_SECRET` est absent, plutôt que de retomber sur une valeur |
| Politique CORS permissive, inutilisée aujourd'hui | A05:2021 | [[verifie lib/http/cors.ts:9]] | Restreindre `allow_origins` aux domaines partenaires qui en ont besoin, retirer le joker |
| Indicateur de développement laissé actif | A05:2021 | [[verifie jobs/runner.ts:4]] | Le lire depuis une variable d'environnement, par défaut désactivé |
| Notes de commande non assainies | A03:2021 | [[verifie components/orders/OrderNotes.tsx:18]] | Assainir avant le rendu, ou stocker et rendre en texte brut |
| Portée région manquante sur l'approbation (renvoi) | A01:2021 | [[verifie lib/services/approvalService.ts:88]] | Voir C2 de [Exemple · Constats](#/examples/findings) — ce n'est pas cette revue qui l'a découvert mais la revue de la surface d'API ; listé ici car c'est aussi un manque de contrôle d'accès |

Aucun en-tête de sécurité manquant au-delà de ceux listés, et aucun résultat de sonde n'a changé depuis la revue précédente, sauf les deux nouveaux ci-dessus (le secret de repli et la politique CORS), introduits lors du dernier sprint sur les intégrations partenaires.
