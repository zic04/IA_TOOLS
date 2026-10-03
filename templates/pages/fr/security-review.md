## En bref

<!-- consigne : l'exposition globale en un paragraphe : ce qui compte le plus, en langage clair, avant tout détail. -->

Exemple : « L'authentification est saine ; le principal manque est un secret de repli codé en dur et un en-tête de sécurité absent. »

## Périmètre et méthode

<!-- consigne : ce qui a été vérifié (le code, puis une sonde de l'instance locale ou de démo — jamais la production), sur quel commit et quelle version, et ce qui est hors périmètre. -->

Exemple : « Vérifié sur le code au commit abc1234, version 2.4.0. Les faits d'abord (`facts --source api`, `facts --source security`), puis une sonde en lecture seule de l'instance locale ou de démo (`doc-kit probe`) ; la production n'est jamais sondée. »

## Authentification et sessions

<!-- consigne : comment une session s'établit et se maintient, sa durée de vie, et comment un changement de rôle ou de droit prend effet (immédiatement, ou seulement à la prochaine connexion). Chaque point vérifié, déduit ou inconnu. -->

## Contrôle d'accès

<!-- consigne : la matrice statique d'abord (générée par `doc-kit facts --source api`), puis les résultats de la sonde (`doc-kit probe`, local ou démo seulement) — ce qui a répondu comme attendu, et ce qui n'a pas répondu comme attendu. -->

::faits{source="api" colonnes="method,route,auth,guards,file"}

| Route | Attendu | Anonyme | Constat |
|---|---|---|---|
| `GET /chemin` | Protégée | 401 | aucun |

## Traitement des entrées

<!-- consigne : où une entrée utilisateur atteint un gabarit, un shell, une requête ou une redirection sans être contrôlée ni échappée ; chacune un constat `security` (règle, fichier, ligne) ou sa propre preuve. -->

## Secrets et configuration

<!-- consigne : où vivent les secrets, si une valeur par défaut est codée dans le code, et une configuration laissée en état de développement (mode debug, CORS permissif). -->

## Dépendances

<!-- consigne : facultatif. Dépendances directes vulnérables ou non maintenues ; renvoyer vers la page `dependencies` plutôt que la répéter. -->

## En-têtes de sécurité HTTP

<!-- consigne : facultatif. Les constats d'en-têtes de la sonde (Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options, protection contre le cadrage, Referrer-Policy, Permissions-Policy) et les attributs des cookies. -->

## Journalisation et supervision

<!-- consigne : facultatif. Ce qu'un événement sensible laisse comme trace (qui a approuvé quoi, les connexions échouées), et ce qui passerait inaperçu aujourd'hui. -->

## Constats

<!-- consigne : une entrée par constat, chacun rattaché à un OWASP Top 10 ou une exigence ASVS, vérifié/déduit/inconnu, avec une preuve et une recommandation ; générer les faits d'abord : `doc-kit facts --source security`. Candidats pour le registre des risques. -->

| Constat | OWASP | Preuve | Recommandation |
|---|---|---|---|
| Constat d'exemple | A07:2021 | [[verifie chemin/fichier.ts:12]] | Ce qu'il faut changer |
