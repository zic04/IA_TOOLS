# Brief — technique de production : dossier d'architecture, ressources, variables ({{product}}, code {{code}})

Tu rédiges, en {{languageName}}, le volet « production » du site de documentation de **{{product}}**{{#if description}} ({{description}}){{/if}} :
le dossier d'architecture technique, les ressources et les variables d'environnement de production, et leurs écarts
avec le code. Un repreneur doit y trouver ce qui tourne, où, comment on y accède, vers quoi l'application communique,
et ce qui manque.

## Tes sources, et seulement elles

- Les **captures du portail** fournies par le propriétaire de l'application : `{{portalCaptures}}` (liste des
  ressources, configuration et variables de l'application, références de secrets, réseau…). Lis chaque image avec
  Read. Tu n'as AUCUN accès au portail du fournisseur cloud ni à la production.
{{#if infraDir}}- Le **code d'infrastructure**, en LECTURE SEULE : `{{infraDir}}`. Aucune commande `terraform`, `bicep`, `az`, `aws`,
  `gcloud`, `pulumi` ou équivalente ; n'ouvre aucun fichier d'état (`*.tfstate` ou équivalent) ni aucun fichier de
  valeurs secrètes.
{{/if}}- Le **code de l'application** : `{{appDir}}`, version {{version}} : variables lues (`process.env`, `os.environ`…),
  valeurs par défaut, Dockerfile, scripts de construction et de déploiement, migrations au démarrage.
- Les pages existantes du volet Reprendre (architecture, déploiement, exploitation, sécurité) et
  `{{contentDir}}/{{findingsPage}}.md` avec ses sous-pages{{#if reads}} ; en particulier : {{reads}}{{/if}}.

## Tes pages

{{pages}}

Gabarits : `architecture`, `technical-sub`, `resources`, `variables` (`{{kitPath}}/templates/pages/{{language}}/`).
Ton schéma : `{{diagramsDir}}/{{diagram}}.svg`. Les pages sont DÉJÀ déclarées dans `{{tocFile}}` : ne change ni ids ni
titres.

## Ce que chaque page contient

- **Dossier d'architecture** (`architecture`) : `## En bref` (ce qui tourne, où, comment on y accède, vers quoi ça
  communique, en puces), avec un encadré `> [!NOTE] Comment lire ce dossier` qui définit la provenance ;
  `## Dans cette partie` ; `## Le schéma` (flux NUMÉROTÉS ; traits pointillés pour les flux absents ou inopérants) ;
  `## Les flux numérotés` (tableau : n°, de, vers, protocole, authentification, preuve) ; `## Les composants` ;
  `## Ce que le DAT ne montre pas` ; `## Qui gère quoi`. Sous-pages (`technical-sub`) si besoin (réseau et secrets ;
  données et supervision).
- **Ressources** (`resources`) : `## En bref` ; une section par famille, `## Calcul`, `## Données`, `## Secrets`,
  `## Réseau`, `## Supervision`, `## Sauvegarde` (nom, type, rôle, constat) ; `## Comparaison avec la documentation`
  (la documentation de déploiement du dépôt) ; `## Ce que l'application utilise hors de ce groupe`.
- **Variables de production** (`variables`) : `## En bref` ; `## Les variables, une par une`, un `###` par famille ;
  pour chaque variable : nom, valeur affichée (ou « (masqué) », ou « référence au coffre de secrets : <nom du secret> »
  pour un coffre comme Azure Key Vault, AWS Secrets Manager ou GCP Secret Manager), où le code la lit
  (`fichier:ligne`), défaut si elle est absente, effet réel ; `## Absentes ou sans effet` : variables lues par le code
  mais absentes en production (réglées en base : normal ; repli sur un défaut : conséquence réelle), variables définies
  mais sans effet ou à l'effet surprenant ; `## À vérifier` au prochain accès au portail (`:::etapes`).

## Provenance (obligatoire)

Chaque affirmation porte sa source : « D'après le portail » (captures du propriétaire, avec leur date) ; le nom de
l'outil d'infrastructure (« Terraform », « Bicep », « CloudFormation »…) pour ce que prévoit son code, en rappelant que
la production a pu diverger ; « Déduit » pour une conclusion tirée de ces sources ; « À confirmer » pour une inconnue,
à demander à l'équipe d'infrastructure.

## Règles

- JAMAIS de valeur secrète recopiée (chaîne de connexion, clé, mot de passe, URL signée, jeton), même lisible sur une
  capture : écris le nom et « (masqué) ». Masque aussi les identifiants d'abonnement, de compte, de projet et de
  tenant, et les GUID.
- N'intègre aucune capture du portail au site sans l'accord écrit du propriétaire ; si elle est autorisée, masque-la
  avant.
- N'écris QUE tes pages et ton schéma. Ne touche ni à `{{tocFile}}`, `{{glossaryFile}}`, au kit, aux autres pages, ni
  à l'application ou à l'infrastructure. Aucune commande git.
- Rien d'inventé ; ce qui est déduit est dit déduit.
- Schéma : `viewBox` de 900 de large, aucune couleur en dur, classes de schéma `d-*` du site seulement (tableau dans
  `{{kitPath}}/standard/writing.fr.md`), identifiants de `<marker>` préfixés, texte de 11 à 14 px, relu en clair et en sombre.
- Constats propres à la production : **candidats de la série P** dans ton rapport (constat, preuve : capture ou
  `fichier:ligne`, gravité proposée), après avoir vérifié qu'ils ne sont pas déjà numérotés.

## Contrôles (depuis `{{docDir}}`)

- `npx doc-kit build --draft` : aucun ✖ ni ⚠ pour tes pages ; `npx doc-kit check tables` ;
  `npx doc-kit check secrets`.
- Relecture du schéma en clair et en sombre avec `npx doc-kit view` ; Read des images ; supprime-les ensuite.

## Rapport final ({{languageName}}, 350 mots au plus)

Pages écrites (mots) ; nombre de ressources et de variables décrites ; flux du schéma, dont ceux absents ou
inopérants ; **candidats constats** de la série P ; erreurs dans les pages existantes (fichier, phrase, preuve) ;
questions « À confirmer » pour l'équipe d'infrastructure ; termes de glossaire proposés.
