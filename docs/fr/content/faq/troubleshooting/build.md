## En bref

- **Le build strict n'écrit rien tant qu'il reste une erreur** : l'ancien fichier de `dist/` reste là, inchangé.
  Lisez les lignes au-dessus de la dernière ; `doc-kit build --draft` liste tous les problèmes d'un coup.
- **Tout est vérifié par rapport au sommaire** : ids de page, cibles des liens, étapes des parcours, types de page. La
  plupart des erreurs sont un nom qui ne correspond pas.
- **Les légendes et les zones sont comptées** : la légende d'un bloc `:::ecran` a exactement un élément par zone de
  sa capture.
- **La configuration est validée strictement** : une clé inconnue est une erreur, avec son chemin et la clé connue la
  plus proche.

## Construire

### « N erreurs — site NON généré. »

- **Causes probables**
  1. Une page déclarée n'a pas encore de fichier (`page pas encore écrite : <id> (content/…)`) : une ligne par page, jamais une par section de son gabarit.
  2. Une capture est citée mais pas encore prise, ou son image manque.
  3. Une page typée n'a pas l'une de ses sections obligatoires.
- **Vérifier** : les lignes au-dessus, une par erreur, chacune avec l'id de la page entre crochets.
- **Corriger** : écrivez la page (`doc-kit new`), prenez la capture, ajoutez la section ; pendant la rédaction,
  utilisez `--draft`.
- **Comprendre** : [Construire le site](#/publish/build).

### « les dépendances du projet ne sont pas installées »

- **Causes probables**
  1. `npm install` n'a pas été lancé dans le projet de documentation.
  2. Le chemin `file:` de `package.json` n'atteint pas le kit (le projet ou le kit a été déplacé).
- **Vérifier** : `doc-kit doctor`, ligne « dépendances du projet ».
- **Corriger** : `npm install` dans le projet, après avoir corrigé le chemin si besoin.
- **Comprendre** : [Installer doc-kit](#/start/install~etape-3-mettre-la-commande-dans-le-chemin).

### « le projet demande le kit ^1.0.0, or le kit installé est en version 0.1.0 »

- **Causes probables**
  1. Le projet a été créé ou mis à jour avec un autre kit.
- **Vérifier** : `kit` dans `doc.config.mjs`, et `doc-kit --version`.
- **Corriger** : `doc-kit upgrade`, puis `doc-kit upgrade --apply` ; ou utilisez le kit qu'attend le projet.
- **Comprendre** : [Passer à un kit plus récent](#/migrate/upgrade).

## Rédiger

### « [utiliser/commandes] lien cassé : #/utiliser/commande » ou « ancre introuvable »

- **Causes probables**
  1. Une faute de frappe dans l'id de la page, ou une page renommée.
  2. Une ancre écrite à la main qui ne correspond pas au titre (accents, ponctuation).
- **Vérifier** : l'id dans `content/toc.json` ; l'ancre apparaît dans l'adresse quand vous cliquez sur le `#` à côté
  du titre.
- **Corriger** : corrigez le lien ; une ancre est le titre en minuscules, sans accents, avec `-` à la place du reste.
- **Comprendre** : [Le Markdown étendu](#/write/markdown~liens).

### « écran « orders-list » : 4 zone(s) capturée(s) mais 3 élément(s) dans la légende »

- **Causes probables**
  1. Une zone a été ajoutée au plan, ou un élément de la légende a été retiré.
  2. Deux éléments de la légende sont sur une même ligne, ou une sous-liste compte comme des éléments.
- **Vérifier** : `images/zones/orders-list.json` liste les zones ; la légende est la liste numérotée à l'intérieur
  du bloc.
- **Corriger** : un élément numéroté par zone, dans l'ordre du plan ; ou changez les zones et refaites la capture.
- **Comprendre** : [Zones, union et légendes](#/capture/zones).

### « section obligatoire absente pour le gabarit « screen » : « Droits requis » »

- **Causes probables**
  1. La section manque, ou son titre ne **commence** pas par le libellé (« Droits » au lieu de « Droits requis »).
  2. La page n'est pas de ce type.
- **Vérifier** : les titres `##` de la page ; les libellés dans `standard/templates.json`.
- **Corriger** : ajoutez ou renommez la section ; ou retirez `template` de l'entrée de la page.
- **Comprendre** : [Les gabarits de page](#/write/page-templates~comment-une-section-est-reconnue).

### « la page existe déjà : content/… » avec `doc-kit new`

- **Causes probables**
  1. Le fichier a déjà été créé ; `new` n'écrase jamais rien.
- **Vérifier** : `content/<id-de-page>.md`.
- **Corriger** : modifiez le fichier existant, ou choisissez un autre id.
- **Comprendre** : [Les gabarits de page](#/write/page-templates~creer-une-page-doc-kit-new).

## Espaces, faits et synchronisation

### « la section « use » n'a pas d'espace » ou « espace inconnu « takeove » »

- **Causes probables**
  1. `spaces` vient d'être déclaré, et une section (ou une page, ou un parcours) n'a pas encore reçu de `space`.
  2. Une faute de frappe dans une valeur de `space`.
- **Vérifier** : `spaces` dans `content/toc.json` liste les identifiants déclarés ; l'erreur nomme la section ou
  l'identifiant exact essayé.
- **Corriger** : ajoutez `"space": "business"` (ou le bon identifiant) à la section ; corrigez la faute de frappe.
- **Comprendre** : [Deux espaces, une seule source](#/spaces/overview~declarer-les-espaces).

### « "space" est utilisé mais le sommaire ne déclare aucun "spaces" »

- **Causes probables**
  1. Un champ `space` a été copié depuis un autre projet avant que `spaces` lui-même soit déclaré.
- **Vérifier** : le début de `content/toc.json`.
- **Corriger** : déclarez `spaces` d'abord, ou retirez le champ `space`.
- **Comprendre** : [Deux espaces, une seule source](#/spaces/overview~declarer-les-espaces).

### « aucune application à lire » avec `doc-kit facts` ou `doc-kit sync`

- **Causes probables**
  1. `app.dir` n'est pas renseigné dans `doc.config.mjs`.
- **Vérifier** : `app.dir`, relatif au projet, doit pointer vers le dossier racine de l'application.
- **Corriger** : renseignez-le (`init` l'écrit normalement) ; relancez ensuite la commande.
- **Comprendre** : [Reprendre une application vibe-codée](#/spaces/takeover~lire-le-code-automatiquement-doc-kit-facts).

### « aucun fait à partir duquel préremplir : facts/env.json » avec `doc-kit new --prefill`

- **Causes probables**
  1. `doc-kit facts` n'a jamais été lancé, ou pas pour la source dont le type a besoin.
- **Vérifier** : le fichier nommé dans le message, sous `paths.facts`.
- **Corriger** : lancez `doc-kit facts --source <nom>` d'abord, puis recréez la page avec `--prefill`.
- **Comprendre** : [Coût et vitesse](#/skill/cost-and-speed~partir-des-faits-new-prefill).

## Configurer

### « doc.config.mjs › capture.storgae: clé inconnue »

- **Causes probables**
  1. Une faute de frappe ; le message propose la clé la plus proche (« vouliez-vous dire « storage » ? »).
  2. Une clé d'une autre version du kit.
- **Vérifier** : la liste des clés permises, affichée après `→`.
- **Corriger** : corrigez la clé ; `doc-kit doctor` valide de nouveau le fichier.
- **Comprendre** : [La configuration](#/reference/configuration).

### « texts : clé i18n inconnue … » (avertissement)

- **Causes probables**
  1. Une clé qui n'existe pas dans les textes du kit, souvent à cause d'une faute de frappe.
- **Vérifier** : `doc-kit build --verbose` affiche la clé la plus proche.
- **Corriger** : corrigez la clé dans `texts`.
- **Comprendre** : [Langues et textes](#/reference/i18n).

## Pour aller plus loin

- [Diagnostic par symptôme](#/faq/troubleshooting) : les réflexes et les premières vérifications.
- [Problèmes de capture et de session](#/faq/troubleshooting/capture) : l'autre domaine.
- [Les contrôles](#/publish/checks) : ce que le build ne vérifie pas.
