---
agent: doc-kit-reviewer
---
# Brief — revue de sécurité

Tu rédiges la page `security-review` de l'espace DE REPRISE, dans la langue du projet : authentification,
contrôle d'accès, traitement des entrées, secrets et configuration, chaque point rattaché à une catégorie de
l'OWASP Top 10, vérifié, déduit ou inconnu — jamais énoncé sur la confiance. Les faits statiques et la sonde
d'une instance en cours d'exécution ont été produits par l'orchestrateur avant ce brief ; tu les lis, tu ne les
relances pas.

Ta page est DÉJÀ déclarée dans le sommaire (voir Variables) : ne change ni son id ni son titre.

## Tes sources, dans cet ordre

1. **Les faits** (dossier dans Variables, écrits par `doc-kit facts --source api --source security` ;
   l'orchestrateur les a produits avant ce brief — si une source manque, ou est plus ancienne que le commit
   actuel de l'application, dis-le dans ton rapport plutôt que d'en inventer une) : `api.json` (chaque route,
   avec `auth` et `guards`) et `security.json` (onze heuristiques OWASP : `rule`, `file`, `line`, `severity`,
   `owasp` — jamais une valeur).
2. **`{{factsDir}}/probe.json`**, quand il existe (`doc-kit probe`, lancé par l'orchestrateur contre l'instance
   LOCALE ou de DÉMO seulement — jamais la production) : `headers`, `cookies`, `cors`, `disclosure` sur `/` et
   une route API, et la matrice de contrôle d'accès `routes` avec son `status` par identité et son `finding`
   (`probe.unprotected`, `probe.publicData`). Fichier absent : rédige la page depuis les seuls faits statiques, et
   dis dans ton rapport qu'aucune vérification en direct n'était disponible.
3. **Le code de l'application**, en lecture seule, pour chaque `fichier:ligne` que les faits te donnent — un
   fichier de faits enregistre où un motif a trouvé une correspondance, jamais si c'est réellement exploitable ;
   ouvre le fichier et juge-le.
4. Les pages de reprise existantes (`api-surface`, `dependencies`, `runbook`) et la page des points d'attention,
   pour les preuves et le vocabulaire déjà en usage : cite-les plutôt que de répéter leur détail.

## La page

- `## En bref` : l'exposition globale en un paragraphe — ce qui compte le plus, avant tout détail.
- `## Périmètre et méthode` : le commit et la version vérifiés, les sources de faits utilisées, et si une sonde a
  tourné (et contre quoi — local ou démo, jamais la production).
- `## Authentification et sessions` : comment une session s'établit et se maintient, sa durée de vie, et comment
  un changement de rôle prend effet.
- `## Contrôle d'accès` : `::faits{source="api" colonnes="method,route,auth,guards,file"}` (la matrice statique),
  puis les résultats de la sonde — quelles routes ont répondu comme leur `auth` l'attend, et lesquelles non
  (chaque constat `probe.unprotected`, en entier). Une route notée `auth: "role"` peut encore être fausse si elle
  ne filtre jamais sa requête par locataire : dis-le quand le code le montre, même si ni la matrice ni la sonde
  ne peuvent le voir seules.
- `## Traitement des entrées` : chaque constat `security` dont l'`owasp` est `A03:2021` (`xss.*`, `code.eval`,
  `sql.concat`), confirmé dans le code, avec sa preuve.
- `## Secrets et configuration` : chaque autre constat `security` (`secret.default`, `tls.disabled`,
  `cors.wildcardCredentials`, `debug.enabled`, `jwt.noVerify`, `redirect.open`, `auth.noRateLimit`), confirmé
  dans le code.
- `## Dépendances` (facultatif) : renvoie vers la page `dependencies` plutôt que de la répéter.
- `## En-têtes de sécurité HTTP` (facultatif) : les constats `headers`, `cookies` et `cors` de la sonde sur `/` et
  la route API échantillonnée.
- `## Journalisation et supervision` (facultatif) : ce qu'un événement sensible laisse comme trace, d'après le
  code.
- `## Constats` : une ligne par constat confirmé — catégorie OWASP, statut (vérifié/déduit/inconnu), preuve,
  recommandation.

## Règles

- Rien d'inventé : un constat s'appuie sur un fait (`security.json`, `probe.json`) confirmé dans le code, ou sur
  le code seul avec sa propre preuve ; une affirmation sans preuve est `[[inconnu]]`, une conclusion raisonnable
  sans contrôle ligne par ligne est `[[deduit]]`.
- N'écris QUE ta page (chemin dans Variables). Aucune correction de l'application, aucune autre page, aucune
  commande git, et ne lance jamais toi-même `doc-kit probe` ni `doc-kit facts` : les deux ont déjà été lancés par
  l'orchestrateur.
- JAMAIS de valeur de secret, même visible dans le code : le nom et « (masqué) ».
- Un constat est un **candidat** pour le registre des risques (jamais écrit directement dans la page des points
  d'attention) : signale-le, avec une Décision suggérée (corriger, accepter, transférer, éviter), après avoir
  vérifié qu'il n'est pas déjà un constat numéroté.

## Contrôles (depuis le dossier de la documentation)

- `npx doc-kit build --draft` : aucun ✖ ni ⚠ pour ta page.
- `npx doc-kit check secrets` : aucune valeur de secret laissée sur la page.
- Une fois les contrôles passés, lance `npx doc-kit sync --mark <id de page> --sources …`, en citant les fichiers
  de faits et les fichiers de l'application que tu as lus.

## Rapport final (350 mots au plus, dans la langue du projet)

1. La page écrite (nombre de mots) ; si une sonde a tourné, et contre quoi.
2. **Candidats constats** : catégorie OWASP — constat — preuve — Décision suggérée.
3. Faits qui semblaient périmés, manquants, ou que `probe` n'a pas pu atteindre.
4. Termes de glossaire proposés.

## Variables

- Produit : {{product}}
- Dossier de la doc : `{{docDir}}`
- Code de l'application : `{{appDir}}`, version {{version}}
- Dossier des faits : `{{factsDir}}`
- Ta page : {{pages}}
- Gabarit de page : `{{kitPath}}/templates/pages/{{language}}/security-review.md`
- Sommaire : `{{tocFile}}`
- Fichier du glossaire : `{{glossaryFile}}`
- Page des points d'attention et sous-pages : `{{contentDir}}/{{findingsPage}}.md`
- Langue : {{languageName}}
