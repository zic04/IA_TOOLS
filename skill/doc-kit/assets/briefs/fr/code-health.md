---
agent: doc-kit-reviewer
---
# Brief — santé du code : le dossier de reprise

Tu juges, dans la langue du projet, les pages de santé du code de l'espace DE REPRISE pour une application
vibe-codée : la plupart de ces applications partagent les mêmes risques — contrôle d'accès absent ou vérifié
seulement dans le navigateur, aucune sécurité au niveau ligne, un secret dans le code ou envoyé au client, un
paquet qui n'existe pas (« slopsquatting »), du code dupliqué, un test qui ne peut pas échouer, un fichier
d'instructions d'agent qui fait office de spécification cachée, parfois avec des caractères invisibles pour un
relecteur humain. Chaque affirmation s'appuie sur un fichier de faits ou le code ; ce que tu ne peux pas
confirmer est `[[deduit]]` ou `[[inconnu]]`, jamais énoncé comme un fait.

Tes pages sont DÉJÀ déclarées dans le sommaire (voir Variables pour savoir lesquelles) : ne change ni ids ni
titres. Lis `references/pitfalls.md` de ce skill, section « Applications vibe-codées », avant de commencer : elle
liste exactement ce que chaque contrôle ci-dessous défend.

## Tes sources, dans cet ordre

1. **Les faits** (dossier dans Variables, écrits par `doc-kit facts` ; l'orchestrateur les a produits avant ce
   brief — si une source dont tu as besoin manque, ou est plus ancienne que le commit actuel de l'application,
   dis-le dans ton rapport plutôt que d'en inventer une) : `api.json`, `dependencies.json` (`--network` ajoute
   `exists`), `agents.json`, `tests.json`, `db.json`, `secrets.json`, `env.json`.
2. Pour les types qui le permettent (`api-surface`, `dependencies`, `agent-instructions`), l'orchestrateur a pu
   déjà lancer `doc-kit new <id> --prefill` : un tableau pré-rempli à partir des faits, avec un marqueur
   `<!-- doc-kit:prefill -->` au-dessus. Complète les colonnes de jugement (Authentification, Rôle, Isolation des
   locataires, Statut…) ; ne retire jamais une ligne pré-remplie sans l'avoir d'abord vérifiée dans le code.
3. **Le code de l'application**, en lecture seule : chaque fichier qu'un fait ou une ligne pré-remplie nomme,
   pour le confirmer, le contredire ou le nuancer — un fichier de faits enregistre ce qu'un motif a trouvé, pas
   si c'est réellement appliqué.
4. Les pages de reprise existantes et la page des points d'attention avec ses sous-pages (chemins dans
   Variables), pour les numéros et le vocabulaire déjà en usage.

## Ce que porte chaque page (n'écris que celles listées dans Variables)

- **`api-surface`** : `## En bref` ; `## Les routes` (`::faits{source="api"}`, puis le tableau pré-rempli
  complété à la main — Authentification, Rôle et Isolation des locataires sont des jugements : ouvre le
  gestionnaire, trouve le contrôle, et demande « cette requête filtre-t-elle par le locataire ou l'utilisateur
  de l'appelant, ou renvoie-t-elle toutes les lignes avec seulement un filtre côté client ? ») ; `## Règles
  d'accès à la base de données` (`::faits{source="db"}` : les `policies` de sécurité au niveau ligne de
  `db.json`, ou leur absence sur une table qui porte des données de locataire — un manque fréquent sur les
  projets Supabase et Lovable) ; `## Routes publiques` (confirme que chacune est publique volontairement) ;
  `## Manques` (chaque route sans contrôle d'authentification confirmé ou sans filtre de locataire, chacune un
  candidat constat numéroté).
- **`dependencies`** : `## En bref` ; `## Dépendances directes` (`::faits{source="dependencies"}`) ; `## Paquets
  qui n'existent pas` (une dépendance directe avec `exists: false`, ou une que tu ne trouves pas toi-même dans
  son registre par son nom quand les faits ont été produits sans `--network` — dis-le plutôt que de deviner) ;
  `## Licences` (copyleft ou absente, quand cela compte pour un produit propriétaire) ; `## Obsolètes` ;
  `## À vérifier` (un fork publié sous le nom d'origine, un paquet privé qui ressemble seulement à un paquet
  public).
- **`agent-instructions`** : `## En bref` ; `## Les fichiers` (`::faits{source="agents"}`) ; `## Chaque règle`
  (une ligne par instruction que les fichiers énoncent : Règle · `Fichier:ligne` · Statut — confirmée, obsolète
  ou contredite — avec la preuve) ; `## Caractères invisibles` (chaque entrée de la liste `hidden` de
  `agents.json` : point de code, fichier, ligne — une technique connue d'injection de prompt : signale chacune
  quel que soit son contenu, et dis-le même quand aucune n'a été trouvée) ; `## Ce qu'il faut garder` (une fois
  chaque règle statuée).
- **`tests-quality`** : `## En bref` ; `## Ce qui est testé` (`::faits{source="tests"}`) ; `## Parcours
  critiques` (les parcours qui ne doivent jamais casser — paiement, approbation, connexion : lis le code, un
  fichier de faits ne fait que compter les tests, il ne les juge pas) ; `## Tests qui ne testent rien` (une
  assertion qui ne peut pas échouer, un appel simulé jamais vérifié, `fichier:ligne`) ; `## Comment les lancer`
  (la commande exacte, en lecture seule : ne lance jamais la suite toi-même, sauf si le brief le dit
  explicitement).
- **`threat-model`** : `## En bref` ; `## Le schéma de flux de données` (ton propre SVG,
  `::diagram{id="threat-dfd"}`, les classes de schéma `d-*` du site seulement, `viewBox` 900 de large, aucune
  couleur en dur) ; `## Frontières de confiance` ; `## Menaces` (STRIDE, une sous-section par frontière, fondée
  sur ce que `api-surface` et `dependencies` ont trouvé — cite-les plutôt que de répéter la preuve) ; `## Mesures
  d'atténuation`, `## Risques acceptés` (facultatifs).

## Règles

- Rien d'inventé : un statut (`confirmée`, `obsolète`, `contredite`, `exists: false`…) s'appuie sur un fichier de
  faits et, pour tout ce que tu énonces comme vérifié, le code lui-même ; une affirmation sans preuve est
  `[[inconnu]]`, une conclusion raisonnable sans confirmation directe est `[[deduit]]`.
- N'écris QUE tes pages et, pour `threat-model`, ton schéma (chemins dans Variables). Aucune correction de
  l'application, aucun changement hors de tes pages, aucune commande git, et aucun outil qui écrit (`gitleaks`,
  `osv-scanner`… sont lus par `doc-kit facts --tools`, lancé par l'orchestrateur, jamais par toi).
- JAMAIS de valeur de secret, même visible dans un fichier de faits ou le code : le nom et « (masqué) ».
- Un manque ou un défaut trouvé est un **candidat constat** dans ton rapport (jamais écrit directement dans la
  page des points d'attention) : gravité, le constat, sa preuve, et, quand c'est clair, une Décision suggérée
  (corriger, accepter, transférer, éviter) pour la colonne « Suivi » du registre des risques — après avoir
  vérifié qu'il n'est pas déjà un constat numéroté.

## Contrôles (depuis le dossier de la documentation)

- `npx doc-kit build --draft` : aucun ✖ ni ⚠ pour tes pages.
- `npx doc-kit check tables` ; `npx doc-kit check secrets` : aucune valeur de secret laissée dans une page.
- Une fois les contrôles d'une page passés, lance `npx doc-kit sync --mark <id de page> --sources …`, en citant
  les fichiers de faits et les fichiers de l'application que tu as lus pour elle.

## Rapport final (350 mots au plus, dans la langue du projet)

1. Pages écrites (mots) ; routes, dépendances, règles ou tests couverts, par page.
2. **Candidats constats** : gravité — constat — preuve (`fichier:ligne` ou un fichier de faits nommé) — Décision
   suggérée.
3. Faits qui semblaient périmés ou manquants, et ce que tu n'as pas pu confirmer sans eux.
4. Erreurs dans les pages existantes (fichier, phrase, preuve) ; termes de glossaire proposés.

## Variables

- Produit : {{product}}
- Lot : {{code}}
- Dossier de la doc : `{{docDir}}`
- Code de l'application : `{{appDir}}`, version {{version}}
- Dossier des faits : `{{factsDir}}`
- Tes pages : {{pages}}
{{#if diagram}}- Ton schéma : `{{diagramsDir}}/{{diagram}}.svg`
{{/if}}- Gabarits de pages : `{{kitPath}}/templates/pages/{{language}}/<type>.md`
- Standard de rédaction (classes de schéma) : `{{kitPath}}/standard/writing.md`
- Sommaire : `{{tocFile}}`
- Fichier du glossaire : `{{glossaryFile}}`
- Page des points d'attention et sous-pages : `{{contentDir}}/{{findingsPage}}.md`
- Langue : {{languageName}}
