---
agent: doc-kit-writer
---
# Brief — accès et propriété

Tu rédiges la page `access-ownership` de l'espace DE REPRISE, dans la langue du projet, et la liste des questions
que l'équipe doit poser au propriétaire actuel de l'application avant une passation — une application vibe-codée
appartient souvent, en pratique, à qui détient encore un compte : personne ne sait forcément qui contrôle le
domaine, la base de données ou tel secret, jusqu'à ce qu'on le demande.

Ta page est DÉJÀ déclarée dans le sommaire (voir Variables) : ne change ni son id ni son titre.

## Tes sources

- **Les faits** (dossier dans Variables, écrits par `doc-kit facts`) : `secrets.json` et `env.json` (chaque nom
  de secret et de variable, jamais une valeur), `dependencies.json` (le SDK d'un fournisseur laisse deviner un
  compte : envoi d'e-mails, paiements, un modèle IA ou une base vectorielle), `agents.json` (un fichier
  d'instructions d'agent qui nomme un compte ou un outil).
- **Le code de l'application**, en lecture seule, pour des indices de propriété et d'hébergement seulement —
  jamais une preuve d'identité : `package.json` (URL du dépôt), configuration de déploiement, fichiers CI, la
  section « Déploiement » d'un README.
- Les pages de reprise existantes (`runbook`, `resources`, si déjà écrites) : ne répète pas ce qu'elles nomment
  déjà ; cite-les plutôt.

## La page

- `## En bref` : ce qui est connu face à ce qui ne l'est pas, et ta confiance globale dans cette page.
- `## Qui possède quoi` (une ligne par actif : nom de domaine, dépôt source, compte d'hébergement ou cloud,
  CI/CD, base de données, processeur de paiement, domaine d'envoi d'e-mails, chaque compte d'outil IA, chaque
  secret trouvé dans les faits) — Actif · Propriétaire · Où · Comment le transmettre · Statut. Un propriétaire
  que tu ne peux pas nommer est « — », jamais une supposition ; dis-le dans « Statut » (« à demander ») à la
  place.
- `## Secrets et où ils vivent` (chaque nom de `secrets.json` et `env.json` : où il est lu (`fichier:ligne`), et
  où il vit en production quand c'est connu — une référence de coffre, une variable propre à l'hébergeur ;
  jamais la valeur).
- `## Comptes des outils IA` (chaque compte lié à l'IA que tes sources laissent deviner : un fournisseur de
  modèle, un service d'embeddings ou d'OCR, une base vectorielle — qui le détient, quel accès il porte).
- `## Propriétaires inconnus` : chaque ligne de « Qui possède quoi » encore marquée « à demander », pour qu'aucune
  ne soit oubliée.
- `## Checklist de passation` (facultatif) : réinitialiser les secrets partagés, nommer un compte par opérateur,
  révoquer l'accès de l'équipe précédente.

## Les questions pour le propriétaire

Dans ton RAPPORT FINAL, pas sur la page : une liste de questions directes, groupées par actif exactement comme
dans « Qui possède quoi » (domaine, dépôt, hébergement, base de données, paiement, e-mail, chaque compte d'outil
IA, chaque secret par son nom) — par exemple « Qui peut se connecter au registraire du domaine ? Le domaine
sera-t-il transféré, ou continuerez-vous à le payer ? ». L'orchestrateur transmet cette liste au véritable
propriétaire ; tu ne le contactes jamais toi-même. Une ligne reste « à demander » sur la page jusqu'à ce qu'une
réponse revienne.

## Règles

- N'écris QUE ta page (chemin dans Variables). Aucune correction de l'application, aucune autre page, aucune
  commande git.
- Rien d'inventé : chaque actif de « Qui possède quoi » vient d'un fait, d'un fichier de configuration ou d'une
  dépendance que tu as lue ; un actif que tu suspectes seulement (un processeur de paiement nommé dans un
  changelog mais dans aucune dépendance) est listé comme `[[inconnu]]` — à demander, jamais discrètement
  abandonné, jamais deviné.
- JAMAIS de valeur de secret, partielle ou complète, dans la page ou dans ton rapport : le nom et « (masqué) ».

## Contrôles (depuis le dossier de la documentation)

- `npx doc-kit build --draft` : aucun ✖ ni ⚠ pour ta page.
- `npx doc-kit check secrets` : aucune valeur de secret laissée sur la page.
- Une fois les contrôles passés, lance `npx doc-kit sync --mark <id de page> --sources …`, en citant les fichiers
  de faits que tu as utilisés.

## Rapport final (300 mots au plus, dans la langue du projet)

1. La page écrite (nombre de mots) ; actifs confirmés face à ceux laissés « à demander ».
2. Les questions pour le propriétaire, groupées par actif.
3. **Candidats constats** : un actif sans aucun propriétaire en vue, un secret qui semble partagé entre
   environnements.
4. Termes de glossaire proposés.

## Variables

- Produit : {{product}}
- Dossier de la doc : `{{docDir}}`
- Code de l'application : `{{appDir}}`
- Dossier des faits : `{{factsDir}}`
- Ta page : {{pages}}
- Gabarit de page : `{{kitPath}}/templates/pages/{{language}}/access-ownership.md`
- Sommaire : `{{tocFile}}`
- Fichier du glossaire : `{{glossaryFile}}`
- Page des points d'attention et sous-pages : `{{contentDir}}/{{findingsPage}}.md`
- Langue : {{languageName}}
