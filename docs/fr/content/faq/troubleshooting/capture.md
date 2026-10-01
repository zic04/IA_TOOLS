## En bref

- **Une capture demande trois choses** : l'application qui tourne à `app.url`, une session valide (sauf si
  `auth.adapter` vaut `none`), et Chromium.
- **La session expire** : le kit la vérifie avant la campagne et pendant celle-ci, et s'arrête à la première page de
  connexion avec le code de sortie 3. Les captures déjà prises sont conservées.
- **Les cibles sont cherchées pendant 8 secondes** : une zone, un cadre ou une action qui échoue nomme sa cible ;
  `--preview` montre ce qui a été mesuré.
- **Certains échecs sont des protections** : une route interdite, une écriture bloquée. Ce ne sont pas des bugs à
  contourner.

## Se connecter

### « pas de session : .doc-kit/session.json »

- **Causes probables**
  1. `doc-kit connect` n'a jamais été lancé dans ce projet, ou la session a été supprimée (`--forget`).
  2. `<PREFIXE>_SESSION` pointe vers un autre fichier.
- **Vérifier** : `doc-kit doctor`, ligne « session ».
- **Corriger** : `doc-kit connect` ; pour une application publique, `auth: { adapter: "none" }` ou
  `capture --no-session`.
- **Comprendre** : [Connexion et sessions](#/capture/sessions).

### « la session a expiré (page de connexion : …) »

- **Causes probables**
  1. La durée de vie de la session de l'application est écoulée (souvent quelques heures).
  2. Vous vous êtes déconnecté de l'application dans un autre navigateur, ce qui a révoqué la session.
- **Vérifier** : `doc-kit doctor` donne l'âge de la session.
- **Corriger** : `doc-kit connect`, puis refaites les captures restantes (`doc-kit capture "utiliser-*"`).
- **Comprendre** : [Connexion et sessions](#/capture/sessions~expiration).

### « pas de terminal où appuyer sur Entrée »

- **Causes probables**
  1. `connect` tourne dans un tube ou une tâche d'intégration continue, avec l'adaptateur `manual`.
- **Vérifier** : lancez-le dans un terminal interactif.
- **Corriger** : connectez-vous depuis un terminal ; ou utilisez un adaptateur qui détecte la session (`nextauth`,
  `api-me`).
- **Comprendre** : [Les adaptateurs](#/reference/adapters).

### « l'application est injoignable : http://127.0.0.1:4173 (…) »

- **Causes probables**
  1. L'application ne tourne pas, ou elle écoute sur un autre port.
  2. `<PREFIXE>_URL` ou `DOC_KIT_URL` pointe ailleurs.
- **Vérifier** : `doc-kit doctor --network`.
- **Corriger** : démarrez l'application ; corrigez `app.url`, ou passez `--url` à `connect`.
- **Comprendre** : [Clés du projet, de la version et de la connexion](#/reference/configuration/project).

## Capturer

### « zone 3 (role button “New order”) introuvable — … »

- **Causes probables**
  1. L'élément n'est pas encore visible : la page se charge lentement, ou une action aurait dû l'afficher.
  2. Le libellé a changé dans l'application, ou la cible ne correspond à rien (`exact`, casse).
- **Vérifier** : `doc-kit capture "<id>" --preview`, puis l'image d'aperçu ; le libellé dans l'application.
- **Corriger** : augmentez `delay`, ajoutez une action `wait`, ou précisez la cible (`within`, `has`, `nth`).
- **Comprendre** : [Cibles et actions](#/capture/targets-actions).

### « la route /orders/1041/approval est interdite (capture.forbidden : …) »

- **Causes probables**
  1. L'entrée ouvre une route listée dans `capture.forbidden` : son serveur écrit pendant le rendu.
- **Vérifier** : le code serveur de la route, et la raison pour laquelle elle a été interdite.
- **Corriger** : décrivez la page d'après son code ; ou réutilisez un enregistrement déjà ouvert et resserrez le
  motif.
- **Comprendre** : [Démo ou production : capturer sans risque](#/capture/safety~routes-interdites-pourquoi-le-navigateur-ne-suffit-pas).

### « la page a demandé une route interdite (…) : capture arrêtée »

- **Causes probables**
  1. La page a navigué vers un chemin interdit : une action du plan a cliqué sur son lien, ou la page y redirige.
- **Vérifier** : les dernières lignes de la campagne listent la navigation refusée.
- **Corriger** : retirez l'action, capturez une autre page, ou décrivez celle-ci d'après son code.
- **Comprendre** : [Démo ou production : capturer sans risque](#/capture/safety~pendant-la-campagne-prechargement-ou-navigation).

### « 1 requête de préchargement vers une route interdite interrompue — GET … »

- **Causes probables**
  1. Normal : la page précharge un lien vers une route interdite (un menu, un lien « suivant »). La requête a été
     annulée avant d'atteindre le serveur, et la capture a été prise.
- **Vérifier** : l'image montre bien la page du plan.
- **Corriger** : rien.
- **Comprendre** : [Démo ou production : capturer sans risque](#/capture/safety~pendant-la-campagne-prechargement-ou-navigation).

### « plans de capture captures/plans : 2 erreurs »

- **Causes probables**
  1. Une entrée a une clé inconnue (une faute de frappe, une ancienne clé), une valeur du mauvais type, ou pas d'`id`
     ou de `route`.
- **Vérifier** : les lignes qui suivent, une par erreur : `fichier › id (CAPTURES[index]) › chemin: ce qui ne va pas`.
- **Corriger** : chaque entrée listée ; une seule entrée invalide arrête la commande. Une marge négative, une fenêtre
  de 150 px ou `steps: 0` sont valides.
- **Comprendre** : [Les plans de capture](#/capture/plans).

### « Lecture seule : 3 requêtes d'écriture bloquées — POST /api/… »

- **Causes probables**
  1. Normal : un signal de présence, une balise de mesure d'audience, une action serveur qui charge des données.
  2. Un clic du plan sur un bouton qui enregistre.
- **Vérifier** : la liste des requêtes bloquées, sur la dernière ligne.
- **Corriger** : rien pour un signal de présence ; retirez le clic qui enregistre ; une page chargée par un `POST`
  est capturée incomplète : décrivez-la telle qu'elle est.
- **Comprendre** : [Démo ou production : capturer sans risque](#/capture/safety~lecture-seule).

### « arrêté par un contrôle anti-robot (…) »

- **Causes probables**
  1. Une page de protection (« Just a moment… ») ne s'est pas levée en 20 s dans le Chromium du kit.
- **Vérifier** : ouvrez l'application dans votre propre navigateur.
- **Corriger** : mettez `browser: "chrome"` dans `auth`, reconnectez-vous avec `doc-kit connect`, et refaites la
  capture.
- **Comprendre** : [Connexion et sessions](#/capture/sessions).

## Environnement

### « navigateur Chromium introuvable pour Playwright »

- **Causes probables**
  1. Le navigateur n'a jamais été installé, ou la version de Playwright du kit a changé.
- **Vérifier** : `doc-kit doctor`, ligne « Chromium pour Playwright ».
- **Corriger** : la commande exacte affichée après `→`, en général `npx playwright install chromium` dans le kit.
- **Comprendre** : [Installer doc-kit](#/start/install).

### « un module est introuvable » à la lecture d'un plan

- **Causes probables**
  1. Un plan importe `doc-kit/targets`, et les dépendances du projet ne sont pas installées.
- **Vérifier** : `doc-kit doctor`, ligne « dépendances du projet ».
- **Corriger** : `npm install` dans le projet de documentation.
- **Comprendre** : [Les plans de capture](#/capture/plans).

## Pour aller plus loin

- [Diagnostic par symptôme](#/faq/troubleshooting) : les réflexes et les premières vérifications.
- [Problèmes de build et de rédaction](#/faq/troubleshooting/build) : l'autre domaine.
- [Le masquage](#/capture/masking) : quand une valeur apparaît dans une image.
