# Captures d'écran

Une capture doc-kit est une image WebP **et** la position de ses zones annotées : `images/<id>.webp` et `images/zones/<id>.json`. Le site en fait un écran interactif, avec des pastilles numérotées, une légende et une visite guidée. Ce document fixe d'abord la sécurité, puis la qualité.

## 1. Sécurité

### La production ne s'écrit jamais

Un site entier peut être capturé **en production**, quand son propriétaire le demande, « sans aucune modification ». Ces règles ont permis de le faire sans incident :

| Règle | Comment | Contrôle |
|---|---|---|
| Toute requête qui n'est pas `GET`, `HEAD` ou `OPTIONS` est **bloquée dans le navigateur** | Actif dès qu'une session est utilisée (`capture.readOnly: "auto"`) ; toujours avec `capture.target: "production"`, où il ne peut pas être désactivé ; forçable par `<PREFIXE>_READONLY=1` | Dernière ligne de chaque campagne : « Lecture seule : N requête(s) d'écriture bloquée(s) » |
| On ne clique **que pour naviguer** | Pages, onglets, menus, ouverture d'une fenêtre ou de l'assistant puis touche Échap, survol | Relecture du plan |
| Boutons interdits, même bloqués | Enregistrer, Créer, Valider, Supprimer, Signer, Envoyer, Importer, Synchroniser, Réindexer, Se déconnecter ; toute saisie qui déclenche un enregistrement automatique | Relecture du plan |
| Petits lots | 3 à 8 captures par commande : la production est partagée | — |
| Production déclarée | `capture.target: "production"` : un bandeau et une confirmation (non par défaut) avant chaque campagne, `doc-kit demo` refusé | `doc-kit doctor` affiche la cible, ⚠ tant que `capture.forbidden` est vide |

Certains blocages sont normaux : un signal de présence (par exemple `POST /api/presence`) et les actions serveur qui chargent une page. Une page qui charge ses données par une action serveur (un `POST`) s'affiche donc **incomplète**. Décrivez-la ; ne contournez pas le blocage.

### La limite : les écritures faites par le serveur au rendu

Le blocage ne porte que sur les requêtes **du navigateur**. Une écriture faite **par le serveur pendant le rendu** d'une page passe quand même.

> [!ATTENTION] Le cas d'Acme Orders
> Ouvrir la fiche d'une commande qui n'a pas encore de circuit de validation **en crée un** : `app/(app)/orders/[id]/page.tsx:88-92` appelle `ensureApprovalChain`, et le valideur est notifié. Trois valideurs ont reçu des notifications pour des commandes que personne n'avait touchées, avant que le mécanisme ne soit connu. C'est devenu le constat de production P9.

D'où trois règles :
1. **Avant d'ouvrir une page de détail**, lisez le code qui la rend (`page.tsx`, un chargeur, un contrôleur). S'il appelle une fonction comme `create…`, `ensure…`, `upsert…` ou `update…`, n'ouvrez pas la page : décrivez-la d'après le code.
2. Déclarez ces routes dans **`capture.forbidden`** (expressions régulières sur le chemin de la route). Le moteur refuse de les ouvrir.
3. Pour une capture indispensable, réutilisez une fiche **déjà ouverte** (son écriture a déjà eu lieu), et listez ces fiches dans la page « Maintenir la doc ».

### La session

| Règle | Détail |
|---|---|
| La personne se connecte **elle-même** | `doc-kit connect` ouvre une fenêtre de navigateur visible ; SSO et MFA fonctionnent. L'adaptateur d'authentification reconnaît la session : `manual` vérifie que l'application ne redirige pas vers une page de connexion, `nextauth` lit `/api/auth/session`, `api-me` appelle le point « me » de l'API |
| Un compte administrateur | Pour voir tous les écrans. Jamais un compte de service partagé |
| Stockée hors du dépôt | Dans le dossier de travail `.doc-kit/`, ignoré par git |
| Jamais copiée, affichée ni transmise | Pas dans un rapport, pas dans un ticket, pas à un autre agent |
| **Supprimée en fin de campagne** | `doc-kit connect --forget`. Tant qu'elle est valide, elle donne accès à l'application |
| **Arrêt si elle expire** | Redirection vers la page de connexion (reconnue par `auth.loginPattern`, par défaut `login\|signin\|sign-in\|oauth\|authorize`) ou réponse 401 : le moteur s'arrête (code de sortie 3). Reconnectez-vous ; ne contournez pas |

### Le renouvellement de session : la seule exception

Une session dont le jeton d'accès vit quelques minutes, renouvelé par un `POST`, expirerait sinon en pleine campagne. `capture.sessionRefresh` déclare **une** requête autorisée à franchir la lecture seule — envoyée une fois, hors de toute page, avant la vérification de la session ; rien d'autre ne change : toute requête faite par une page reste `GET`/`HEAD`/`OPTIONS`.

Ne l'acceptez que si les trois conditions sont réunies :
1. **Le point d'accès n'écrit rien d'autre** : il renouvelle la session, il ne touche pas aux données métier.
2. **La preuve dans le code** : lisez le gestionnaire ; il ne fait rien de plus que cela.
3. Une **décision écrite** du propriétaire de l'application, notée dans `reason` (au moins 20 caractères) et dans le guide de rédaction du projet.

Déclarée ou non, chaque campagne qui utilise une session affiche le résultat avant que les captures ne commencent : « Session renouvelée : POST … », ou, en cas d'échec, un avertissement — jamais silencieux, et pas fatal en soi : la vérification de session qui suit décide si la campagne continue.

### Le masquage

| Masqué automatiquement | Limite |
|---|---|
| Les GUID (`masking.guid: true`) | — |
| Les valeurs du `.env` **local** de l'application dont le nom évoque une URL, un tenant, un client, un compte, un hôte, une adresse e-mail ou un utilisateur (`masking.env`), sauf `localhost` (`masking.exclude`) | Il ne connaît pas les valeurs **de production** : une URL de passerelle, un nom d'index ou une clé partiellement affichée ne figurent pas dans le `.env` local |
| Les éléments listés dans les `masks` d'une capture | À écrire capture par capture |
| Les motifs de `masking.patterns` | — |

**Relisez chaque image** avant de la garder : clé, mot de passe, jeton, chaîne de connexion, URL interne. Le masquage automatique ne remplace pas cette relecture.

### Les données affichées

- **Données réelles en clair** (commandes, clients, montants, noms) : seulement sur **décision écrite** du propriétaire de l'application, notée dans le guide de rédaction du projet.
- Sinon, une **démo préparée** par un script **idempotent** (`capture.setup`, lancé par `doc-kit demo`). Pour Acme Orders : deux clients de démonstration, des personnes fictives, des commandes dans chaque statut.
- Données personnelles de tiers : jamais. En production, Acme Orders ne capture ni fiche client ni facture PDF (elles montrent des adresses postales), et masque les lignes de détail des tableaux de bord.

## 2. Qualité

| Règle | Pourquoi | Comment |
|---|---|---|
| **3 à 12 zones** par écran | Moins : la capture n'apprend rien ; plus : la visite guidée lasse | Découper en plusieurs captures, une par panneau |
| **Ordre de lecture** | Les pastilles se suivent de haut en bas, puis de gauche à droite | L'ordre des `zones` dans le plan |
| **Légende = zones** | L'élément *n* de la liste explique la pastille *n* | Le build bloque si les nombres diffèrent |
| **Cadres serrés** | L'image montre le panneau, pas tout l'écran | `frame` (marges de 34 px à l'horizontale et 10 px à la verticale par défaut) ; la cible `main` pour la zone principale sans le menu |
| **Viewport haut** pour les panneaux longs | Ni défilement, ni zone coupée | `viewport: { height: 2200 }` |
| Plusieurs champs sur une rangée | Une seule pastille | Une zone `{ union: [cible, …] }` : elle couvre la boîte englobante de toutes ses cibles |
| **Vérifier chaque aperçu** | Une zone mesurée sur le mauvais élément ne se voit qu'à l'image | `doc-kit capture "<motif>" --preview`, puis regarder `<id>.zones.png` dans `.doc-kit/` (zones en rouge) |
| Identifiants stables | Ils sont cités dans le Markdown | kebab-case, préfixés par lot : `util-commandes-liste`, `cf-circuit-regles`, `prod-admin-utilisateurs` |
| Carte cadrée de façon déterministe | La même image à chaque campagne | `view: { lon, lat, zoom }` dans le plan, avec `capture.map` dans la configuration |
| Attente suffisante | L'écran a fini de charger | Le kit attend que la page soit stable (réseau calme, polices, DOM immobile, animations finies) ; `delay` n'ajoute qu'un minimum, par exemple 3 000 ms pour une carte dessinée dans un canvas |
| Une date figée | « Aujourd'hui », les dates relatives et les comptes à rebours ne changent pas l'image d'une campagne à l'autre | `capture.clock: "2026-01-15T09:00:00Z"` dans la configuration |
| Les mêmes pixels partout | Les polices et le lissage diffèrent d'un système à l'autre (4 à 14 % des pixels sur la démo) | Prendre les images versionnées dans un moteur de rendu figé : `docker run --rm --network host -v "$PWD:/w" -w /w mcr.microsoft.com/playwright:v1.60.0-noble npx doc-kit capture --compare` (Linux ; la version de Playwright du kit) |
| Un échec expliqué | Une capture en échec montre pourquoi, étape par étape | `doc-kit capture --trace`, puis `npx playwright show-trace .doc-kit/traces/<id>.zip` |
| Images légères | Le site est un seul fichier | `doc-kit optimize` recompresse les images de plus de 200 Ko |

Par exemple, dans un plan de captures d'Acme Orders, le client et la date de commande sont sur la même rangée et n'ont qu'une pastille :

```js
import { button, field } from "../targets.mjs";

zones: [
  { css: "header" },                                       // ① la barre du haut
  { union: [field("Client"), field("Date de commande")] }, // ② une seule pastille pour les deux champs de la rangée
  button("Soumettre à validation"),                        // ③ l'action principale
],
```

Une capture sans zone s'insère avec `::capture` ; une capture avec zones exige `:::ecran` (`:::screen` en anglais) et sa légende.

## 3. Production ou démo

| | Production en lecture seule | Démo locale préparée |
|---|---|---|
| Ce qu'on montre | L'état réel, les vrais volumes, les vraies anomalies | Un jeu de données choisi pour tout montrer |
| « Ce que ça change » (avant / après) | Impossible : on ne modifie rien | Possible : on règle, on capture, on revient en arrière |
| Pages chargées par une action serveur | Incomplètes (le `POST` est bloqué) | Complètes |
| Écritures du serveur au rendu | Risque réel (`ensureApprovalChain`) : `capture.forbidden` | Sans conséquence |
| Données personnelles | Décision écrite du propriétaire ; relecture de chaque image | Fictives |
| Préparation | Une connexion (`doc-kit connect`) | Un script idempotent (`doc-kit demo`), l'application lancée en local |
| Faits « en production » | Observés directement, datés | À prendre ailleurs : des captures de production séparées (`captures/plans-prod/`, préfixe `prod-`) |

Les deux se combinent bien : documentez les éditeurs sur la démo, et la configuration de production par des captures de production en lecture seule, rangées dans un dossier de plans séparé, choisi par `<PREFIXE>_PLANS`.
