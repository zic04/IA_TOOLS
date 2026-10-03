# Étude — captures d'écran et statistiques de production

*3 octobre 2026. Trois volets : ce que propose le marché, et une mesure du pipeline actuel du kit (Playwright 1.60,
application de démonstration). Elle se termine par l'architecture recommandée et un plan d'action chiffré, plus la
conception des statistiques de temps, de jetons et de modèles demandée, puis l'optimisation des agents IA (§ 7).*

---

## 1. En bref

- **Garder Playwright comme moteur.** Aucun autre outil du marché ne combine les captures **en lecture seule** derrière
  une connexion SSO, la recapture **déclenchée par le code** (`--stale`) et un **site HTML hors ligne en un seul
  fichier**. Les outils du commerce (Scribe, Arcade, Storylane…) capturent à la main dans une extension et se mettent
  à jour en éditant par IA, pas en recapturant.
- **Le gros gain est dans notre pipeline, pas dans un changement d'outil.** Les **pauses fixes représentent 80 à
  94 % du temps** d'une capture (2,5 s par défaut, plus 0,6 s). Avec des attentes sur condition et quatre captures en
  parallèle, une campagne de captures est **environ 10 à 15 fois plus rapide**.
- **La qualité professionnelle passe par trois choses :**
  - un **rendu reproductible** (image Docker Playwright figée), sans lequel les images diffèrent de 4 à 14 % d'une
    machine à l'autre à cause des polices ;
  - des images **nettes sur écran Retina** (densité ×2) ;
  - un **rendu déterministe** : horloge figée, animations et mouvements réduits, polices attendues.
- **Ce qui distinguerait vraiment le kit :**
  - des plans de capture **proposés par une IA** (Playwright MCP), puis relus par un humain ;
  - des **sélecteurs qui se réparent** : une correction est proposée, jamais appliquée en silence ;
  - un **contrôle en deux temps** : on compare d'abord la structure de la page (arbre d'accessibilité), et on ne
    recapture l'image que si elle a changé.

**Avancement**

| Action | État |
|---|---|
| S1, S4 : fichier `usage/<version>.jsonl`, `doc-kit stats` (`--by`, `--since`, `--csv`, `--json`) | **Fait** |
| S2 : chronométrage des commandes, des étapes de chaque capture et de chaque source des faits ; option `--profile` | **Fait** (les autres commandes : à affiner) |
| A1 : attentes sur condition (`engine/capture/stable.mjs`) | **Fait** : 0,5 à 0,7 s par capture au lieu de 3,3 s sur la démo |
| C1 : erreur si une cible de masquage ne trouve rien, et nouveau masquage avant la prise de vue | **Fait** |
| S3 : hook Claude Code (`skill install --hooks`), jetons, modèle et temps de chaque agent | **Fait** |
| S5 : page « Coût de la documentation » (`::usage`, gabarit `documentation-cost`), avec le nombre d'agents et les modèles utilisés | **Fait** |
| G1 : pages probablement intactes marquées sans agent (`sync --apply --auto-intact`) | **Fait** |
| G2, G3 : on s'arrête quand plus aucune page n'est signalée ; tri par lots de 5 pages au plus ; une page par agent de mise à jour, en parallèle (consignes du skill) | **Fait** |
| G8 : API Batch | **Écarté** (pas de clé API) |
| Le reste des § 5, 6 et 7 | À faire |

---

## 2. Le marché

### 2.1 Outils de guides et de démos interactives (commerciaux)

| Outil | Capture | Mise à jour quand l'interface change | Hors ligne | Prix 2026 (indicatif) |
|---|---|---|---|---|
| Scribe, Tango, Dubble | Extension, une capture par clic, texte IA | Recapture manuelle | Non | 15 à 35 $/mois par utilisateur |
| Guidde, Clueso, Trainn | Vidéo et étapes, voix IA, plus de 30 langues | Nouvelle édition à la main | Non | 19 à 120 $/mois |
| **Folge** | Application de bureau, captures locales, 11 formats d'export (PDF, Word, HTML, Markdown…) | Manuelle | **Oui** | **89 $ une fois** |
| Supademo, Arcade | Extension : capture d'image, **copie HTML** ou vidéo ; narration IA | Arcade régénère seulement les étapes modifiées (selon l'éditeur) | Non | 32 à 350 $/mois |
| Storylane, Navattic, Walnut, Reprise, HowdyGo | **Copie HTML** de l'application (démos commerciales) | Retouche du texte par IA ; sinon recapture | Non | 40 $/mois à plus de 30 000 $/an |

> Aucun de ces outils ne recapture automatiquement quand le code change, et un seul fonctionne hors ligne, avec des
> captures faites à la main. Sur ce point, le kit est déjà en avance. On peut leur reprendre trois idées :
> - l'**enregistreur** : on clique, l'outil écrit les étapes ;
> - la **narration vocale** et la **vidéo** des visites ;
> - la **démo HTML interactive**.

### 2.2 Captures automatisées et comparaison visuelle

| Outil | Rôle | Intérêt pour le kit |
|---|---|---|
| **Doc Detective** (libre) | Rejoue les étapes décrites dans la doc, capture et réécrit l'image si elle a changé | L'outil le plus proche ; idée : **rejouer les visites guidées comme des tests** |
| shot-scraper (libre) | Captures Playwright décrites en YAML ; vidéo d'un scénario depuis la v1.10 | Le format YAML et la vidéo |
| Argos (gratuit jusqu'à 5 000 images par mois), Percy, Chromatic, Applitools | Revue des différences d'images en CI, filtrage des faux positifs par IA | Relire les images de la doc dans les PR |
| Screenshotbot (libre, hébergeable soi-même) | Serveur de comparaison | Alternative à Argos sans SaaS |
| ScreenshotOne, Urlbox, ApiFlash | API de captures hébergées | **Inutilisables ici** : pas de garde de lecture seule derrière une connexion SSO |
| Mintlify, GitBook, ReadMe | Agents qui proposent des modifications de texte | Pas d'automatisation des captures |

### 2.3 Moteurs et agents IA

| | Verdict |
|---|---|
| **Playwright** (1.63 aujourd'hui) | **Le meilleur pour ce besoin.** Nouveautés utiles : arbre d'accessibilité avec positions des éléments (1.60), horloge contrôlée, agents planner/generator/healer (1.56), **enregistrement vidéo annoté** (1.59), `codegen` |
| Puppeteer, Selenium 4 / WebDriver BiDi, Cypress | Aucun gain : moins riches, ou faits pour les tests |
| **Playwright MCP** | Un agent lit l'arbre d'accessibilité : idéal pour **rédiger les plans de capture** |
| Chrome DevTools MCP | Diagnostiquer une capture (réseau, performances) |
| Stagehand v3 | Réparation des sélecteurs avec cache ; l'IA n'est appelée qu'en cas d'échec |
| browser-use, Skyvern, *computer use* | Trop lourds pour ce besoin |

### 2.4 Image ou copie HTML ?

|  | Image WebP (actuel) | Copie HTML (SingleFile, rrweb, démos) |
|---|---|---|
| Poids | 30 à 150 Ko | 0,3 à 5 Mo par écran |
| Netteté | Dépend de la densité de pixels | Vectorielle |
| Texte cherchable | Non | Oui |
| **Masquage des secrets** | **Fiable (au pixel)** | Il faut réécrire le DOM : risque de fuite |
| Fidélité | Exacte | Les canvas, iframes et shadow DOM peuvent casser |

**Décision :** l'image reste la référence. La copie HTML peut devenir une **option « démo interactive »** pour
quelques écrans choisis, sans scripts, avec masquage du DOM et dans une iframe isolée.

### 2.5 Formats d'image

| Format | Support 2026 | Pour des captures d'interface |
|---|---|---|
| WebP | Universel | Le bon choix aujourd'hui |
| AVIF | Environ 94 % des navigateurs | 20 à 50 % plus léger que le WebP avec perte, mais lent à encoder et il brouille le texte fin ; le navigateur ne sait pas l'encoder, il faudrait un module WebAssembly |
| JPEG XL | Safari ; Chrome derrière un drapeau | Le meilleur sans perte, mais **pas encore utilisable** |

---

## 3. Le pipeline actuel : mesures

Mesures faites sur l'application de démo, en Chromium headless, avec les deux plans de la démo.

| Étape | Durée |
|---|---|
| Lancement du navigateur | 290 ms |
| Nouveau contexte puis nouvelle page | 140 ms |
| Navigation (`load`) | environ 17 ms |
| **Pause fixe après la navigation** (`delay`, 2 500 ms par défaut) | **2 500 ms** |
| **Pause fixe après les actions** (`settle`) | **600 ms** |
| Capture d'image (1 348 × 583) | environ 60 ms |
| Encodage WebP | 50 à 80 ms |
| Comparaison (`--compare`) | 20 à 50 ms |
| **Total par capture** | **3,3 à 3,4 s, dont 94 % de pause** |

Problèmes relevés :

| # | Constat | Où |
|---|---|---|
| C1 | Les pauses fixes occupent l'essentiel du temps | `engine/capture/capture.mjs:384` et `:394` |
| C2 | Les captures s'enchaînent une par une | `capture.mjs:461` |
| C3 | Les images varient de **4 à 14 %** d'un système à l'autre, à cause des polices (`system-ui`, qui donne DejaVu Sans sous Linux) ; une image change même de taille | e2e `sync.test.mjs` |
| C4 | Ni horloge figée, ni mouvement réduit : « Aujourd'hui » et les dates relatives bougent | `capture.mjs:316-328` |
| C5 | Images à densité ×1, donc **floues sur Retina** | `deviceScaleFactor: 1` |
| C6 | **Une cible de masquage qui ne trouve rien est ignorée en silence** (confidentialité) | `masking.mjs:115-120` |
| C7 | Le texte n'est pas re-masqué juste avant la prise de vue, alors que l'application peut ré-afficher des données en attendant les zones (jusqu'à 8 s) | `capture.mjs:428` |
| C8 | Une capture qui échoue ne laisse aucune trace | — |
| C9 | Un sélecteur ambigu prend le premier élément sans prévenir | `actions.mjs:71` |
| C10 | Aucune nouvelle tentative après un délai dépassé | `actions.mjs:95` |
| C11 | La comparaison ne sait pas ignorer une zone qui change à chaque fois (date, compteur) | `compare.mjs:16-47` |
| C12 | Plans écrits à la main, sans enregistreur ni aperçu en direct | `plans.mjs`, `targets.mjs` |
| C13 | D'autres pauses fixes : `view` (900/500/450 ms), `check tables` (120 ms par page) | `view.mjs:378-397`, `tables.mjs:426-431` |

---

## 4. Architecture recommandée

```text
Plans de capture (JS, + ancres d'accessibilité en YAML)
   │  ▲  proposés par IA (Playwright MCP / agent planner), relus par un humain
   │  │  enregistrés en cliquant (doc-kit record = codegen + session)
   ▼
Moteur de rendu : image Docker Playwright figée (mcr.microsoft.com/playwright:v1.60.0-noble)
   ├─ 1 navigateur, N contextes en parallèle, session SSO partagée
   ├─ garde de lecture seule (inchangée) + blocage des domaines tiers (analytics, chat, cookies)
   ├─ rendu déterministe : horloge figée, fuseau, langue, mouvements réduits, polices attendues
   ├─ attentes sur condition : réseau calme, polices prêtes, animations finies, DOM stable
   └─ réparation : un sélecteur cassé → correction proposée dans le plan, jamais appliquée seule
   │
   ├─ 1er contrôle : l'arbre d'accessibilité (YAML) a-t-il changé ?  ── non → image conservée, aucune capture
   └─ 2e contrôle : capture ×2 → masquage (texte + pixels, re-vérifié) → pastilles
                      │
                      ▼
Encodage WebP ×2 ; AVIF en option, via un module WebAssembly
   │
Comparaison : zones ignorées, anticrénelage → planches avant / après → revue en PR (Argos ou Screenshotbot)
   │
En option : vidéo annotée des visites (Screencast 1.59), démo HTML isolée
   │
Site HTML hors ligne en un seul fichier
```

---

## 5. Plan d'action

Gains estimés à partir des mesures du § 3 ; « effort » : S = moins d'un jour, M = un à trois jours, L = plus.

### Lot A — rapidité (rentable tout de suite)

| # | Action | Gain | Effort |
|---|---|---|---|
| A1 | **Attentes sur condition** à la place de `delay` et `settle` : réseau calme (plafonné), `document.fonts.ready`, animations terminées, aucune modification du DOM pendant 150 ms, deux images d'animation. `delay` et `settle` deviennent des minimums facultatifs. | Environ **×5** : 3,3 s → 0,5 s par capture | S |
| A2 | **Captures en parallèle** : N contextes (`capture.concurrency`, 4 par défaut), arrêt commun si la session expire, et 1 seul contexte en production | Environ **×3,5** de plus | M |
| A3 | **Blocage des domaines tiers** (`capture.allowOrigins`) | Rend A1 efficace sur une vraie application | S |
| A4 | Supprimer les autres pauses fixes (`view`, `check tables`, défilement) | Secondes gagnées par build | S |

### Lot B — qualité professionnelle

| # | Action | Gain | Effort |
|---|---|---|---|
| B1 | **Moteur de rendu Docker figé** : `doc-kit capture --docker` et `ci/capture.Dockerfile` ; avertir si `channel: "chrome"` | Mêmes pixels partout ; plus de fausses différences | S |
| B2 | **Rendu déterministe** : `capture.clock` (horloge figée), `reducedMotion`, polices attendues avant de mesurer les zones | Dates et animations stables | S |
| B3 | **Images ×2** (`capture.scale: 2`) ; largeur fixée dans la visionneuse (`app.js:840`) | Net sur Retina ; poids environ ×2,3 (66 Ko au lieu de 29) | S |
| B4 | Capture en **thème sombre** (`colorScheme: dark`) quand l'application le permet | Images qui suivent le thème du site | M |
| B5 | Retirer le profil de couleur ICC (456 octets) de chaque WebP | Petit gain de poids | S |

### Lot C — robustesse et confidentialité

| # | Action | Gain | Effort |
|---|---|---|---|
| C1 | **Erreur si une cible de masquage ne trouve rien**, et nouveau masquage juste avant la prise de vue | Aucune fuite silencieuse | S |
| C2 | Masquage dans le **shadow DOM** et les **iframes** | Couvre les composants web | M |
| C3 | **Trace Playwright quand une capture échoue** (`.doc-kit/traces/<id>.zip`), plus une image de l'échec | Diagnostic en un clic (`show-trace`) | S |
| C4 | **Nouvelle tentative** (`--retries 1`) sur les délais dépassés, jamais sur une route interdite | Moins d'échecs aléatoires | S |
| C5 | **Avertissement** si un sélecteur trouve plusieurs éléments | Fini les zones posées sur le mauvais élément | S |
| C6 | Comparaison avec des zones à ignorer (`ignore: [cible]`) et prise en compte de l'anticrénelage | Moins de recaptures inutiles | M |

### Lot D — productivité et IA

| # | Action | Gain | Effort |
|---|---|---|---|
| D1 | **`doc-kit record <route>`** : `codegen` de Playwright avec la session, traduit en plan du kit | Un plan écrit en cliquant | M |
| D2 | **`capture <id> --watch --preview`** : le navigateur reste ouvert et l'aperçu se met à jour à chaque modification du plan | 0,5 s par essai au lieu de 3 à 7 s | M |
| D3 | **Ancres d'accessibilité** (arbre YAML avec positions, Playwright 1.60) et contrôle en deux temps | Recapture seulement si la structure change | M |
| D4 | **Plans proposés par IA** (Playwright MCP / agent planner), relus par un humain | Premier jet des plans en minutes | M |
| D5 | **Réparation des sélecteurs** : une correction est proposée sous forme de diff du plan | Moins de maintenance | M |
| D6 | **Visites rejouées comme des tests**, à la façon de Doc Detective | La doc qui casse se voit en CI | M |
| D7 | **Vidéo annotée** des visites (Screencast 1.59), en option | Vidéo de formation sans outil payant | L |
| D8 | **Démo HTML interactive**, en option et isolée | Démo à la Arcade, hors ligne | L |
| D9 | Revue des images dans les PR (Argos, ou Screenshotbot hébergé soi-même) | Relecture visuelle | M |

**Ordre conseillé :** A1, C1, C3, B1, B2, puis A2, B3, A3, C4, C5, puis le lot D.

---

## 6. Statistiques : temps, jetons, modèles

### Constat

Le skill enregistre déjà une ligne par agent dans `skill/doc-kit/scripts/usage.mjs` : brief, agent, modèle, jetons,
durée et pages. Il produit aussi un rapport avec le coût. Mais :
- le fichier est dans `.doc-kit/`, **ignoré par git**, donc perdu d'une session à l'autre ;
- **rien n'est publié** dans le site ;
- les données ne sont **pas rattachées à une version** de l'application ;
- les étapes du kit (captures, faits, build…) **ne sont pas chronométrées**, et le temps humain n'est pas compté.

### Conception

**Fichier** : `usage/<version>.jsonl`, versionné avec le projet. Une ligne par événement :

```json
{"at":"2026-10-03T09:12:04Z","version":"1.4.0","run":"r-20261003-0912","phase":"update",
 "step":"capture","sub":"orders-list","part":"wait","ms":412,
 "model":null,"tokens":{"in":0,"out":0,"cacheRead":0,"cacheWrite":0},"pages":["use/orders"],"actor":"kit"}
```

**Les étapes mesurées** (`step`, puis `sub` / `part` pour le détail) :

| Étape | Détail mesuré |
|---|---|
| `setup` | `init`, `connect` (temps humain de connexion), `demo` |
| `facts` | par source (api, db, dépendances, env, sécurité, qualité, tests, outils externes) |
| `inventory` / `probe` | par adaptateur, par rôle |
| `capture` | par capture : navigation, actions, **attente**, masquage, prise de vue, encodage, comparaison |
| `generate` | par page et par agent (tri, rédaction, relecture) : durée, jetons, modèle |
| `translate` | par page et par langue : durée, jetons, modèle |
| `update` | `sync`, `sync --apply`, `capture --stale`, réécriture des pages |
| `build` / `check` / `audit` | rendu Markdown, assemblage, recherche ; chaque contrôle |
| `review` | relecture humaine, marquée par `sync --mark` |

**Collecte :**
- Le kit chronomètre lui-même chaque commande et ses sous-étapes. `--profile` affiche le détail en fin de commande.
- Les agents IA passent par un **hook Claude Code** (`SubagentStop` / `Stop`) qui écrit les jetons réels (entrée,
  sortie, cache) et le modèle. Il n'y a plus d'appel manuel à `usage log` ; `usage scan` reste pour rattraper un
  historique.
- La **phase** (création, mise à jour, traduction) et la **version** sont prises automatiquement dans `sync.json`.

**Restitution :**
- `doc-kit stats [--by step|version|model|page|phase] [--since <version>] [--json|--csv]`.
- **Une page « Coût de la documentation »**, générée à la fin de l'espace Reprise :
  - totaux : jetons, coût estimé (si `llm.prices` est renseigné), temps machine, temps humain, pages, captures ;
  - **un tableau par version** : création, puis chaque mise à jour, avec jetons, durée, modèles et pages touchées ;
  - **la répartition du temps par étape**, en barres horizontales, avec le classement des étapes les plus lentes :
    c'est là qu'on voit où optimiser ;
  - la répartition par modèle et par phase ;
  - des ratios : jetons par page, minutes par page et par capture, coût d'une mise à jour comparé à la création ;
  - un export CSV ou JSON des données brutes.

### Plan

| # | Action | Effort |
|---|---|---|
| S1 | Format `usage/<version>.jsonl` et module `engine/stats/` (écriture, lecture, agrégats) | S |
| S2 | Chronométrage des commandes et des sous-étapes, option `--profile` | M |
| S3 | Hook Claude Code, installé par `doc-kit skill install` : jetons et modèle de chaque agent | M |
| S4 | `doc-kit stats` (terminal, JSON, CSV) | S |
| S5 | Page « Coût de la documentation » générée dans le site | M |
| S6 | Migration de l'ancien `.doc-kit/usage.jsonl` | S |

**Ordre conseillé pour l'ensemble :** S1 → S2 (les mesures servent à prouver les gains suivants) → A1 → C1 → C3 → B1
→ B2 → S3 → S4 → S5 → A2 → B3 → la suite.

---

## 7. Agents IA : paralléliser et choisir le bon modèle

### Constat

Le skill orchestre trois types d'agents :

| Type | Modèle actuel | Usage |
|---|---|---|
| `doc-kit-triage` | haiku | Trier les pages à mettre à jour |
| `doc-kit-writer` | sonnet | Rédiger et mettre à jour les pages |
| `doc-kit-reviewer` | opus | Inventaire, santé du code, vérification des constats, sécurité, dossier technique |

Les points faibles :
- **Vagues en série** : W1 → W2 → … → W7. Chaque vague attend la fin de la précédente, même quand ses pages n'en
  dépendent pas. Les dossiers confiés à opus, qui ne dépendent que des faits, partent souvent tard.
- **Plusieurs pages par agent** : l'historique s'allonge à chaque page, donc le coût croît à peu près comme le
  **carré** du nombre de pages. La règle mesurée est de 21 allers-retours par page, ce qui fait que l'estimation
  actuelle est environ 10 fois trop basse.
- **Le cache de prompt n'est pas vraiment partagé** : chaque agent commence par « lis le brief X », dont le nom
  diffère d'un agent à l'autre, et le brief arrive comme résultat d'outil. Chaque agent repaie donc la partie
  commune au plein tarif.
- **Un seul agent de tri pour toutes les pages signalées** : son historique grossit avec chaque page.
- **Opus partout pour la vérification des constats**, même les plus simples.
- **Aucune API Batch**, alors que la traduction et le tri n'ont pas besoin d'outils. Le tarif Batch est 50 % moins
  cher.
- **Des appels à un modèle là où les faits suffisent** : `sync` sait déjà qu'une page est « probablement intacte »
  et que ses preuves tiennent, mais la page repasse quand même par le tri.

### Plan

Économies estimées par rapport au coût actuel, à confirmer avec `doc-kit stats` (§ 6).

| # | Action | Jetons | Temps |
|---|---|---|---|
| G1 | **Sauter sans IA ce qui n'a pas changé** : `sync --apply --auto-intact` marque les pages inchangées dont les preuves tiennent ; on ne traduit que les pages périmées ; pour une petite différence, on envoie seulement le diff et on modifie la page (`Edit`) au lieu de la réécrire | −40 à 70 % en maintenance | −50 % |
| G2 | **Arrêter tôt** : si le tri dit « intact » partout, pas de vague de mise à jour. Le tri est découpé en lots de 5 pages au plus, sur haiku, en parallèle | coût du tri divisé | −60 % sur le tri |
| G3 | **Une page par agent et `orchestration.maxParallel`** (8 à 10 par défaut) : des historiques courts, en parallèle | −20 à 35 % | −50 à 70 % par phase |
| G4 | **Table de routage des modèles** `llm.routing` dans `doc.config.mjs`, lue par `brief.mjs` : | −30 à 50 % sur les phases opus ; traduction −60 à 70 % | — |
|    | – **haiku** : tri, traduction (nouvel agent `doc-kit-translator`), glossaire, compléments des tableaux pré-remplis, pré-inventaire | | |
|    | – **sonnet** : fonctionnalités, écrans, parcours, procédures, mises à jour, accès, maintenabilité, vérification des constats | | |
|    | – **opus** seulement pour la synthèse de l'inventaire, la santé du code, la sécurité des pages sensibles (authentification, surface d'API, menaces) et un **échantillon de 20 %** des constats, plus tous les constats graves | | |
| G5 | **Un vrai préfixe commun** : le brief est inséré directement dans la consigne de l'agent, partie commune d'abord, puis les variables, puis le contexte. Le cache sert enfin à toute la vague | −15 à 25 % en entrée | −10 % |
| G6 | **Les vagues deviennent un graphe de dépendances** (`brief.mjs --plan` produit les dépendances) : les dossiers opus partent juste après les faits, chaque constat est vérifié dès que son lot est rendu, chaque page est traduite dès qu'elle est validée | 0 | −30 à 40 % de bout en bout |
| G7 | **Paquets de contexte partagés** (`context --pack`) : un fichier commun à 10 pages n'est extrait qu'une fois, en tête, donc mis en cache | −10 à 20 % en entrée | — |
| G8 | ~~**Mode Batch**~~ — *écarté : pas de clé API* — pour la traduction, le tri et l'échantillon de relecture (`translate --batch-export` / `--batch-import`, résultats en JSON) | **−50 % du prix** sur ces phases | hors du temps d'attente |
| G9 | **Plus de génération sans IA** : `new --prefill` s'étend à la matrice des rôles, aux ressources, à la qualité des tests et à la carte du code. L'IA ne complète que les cellules à juger, sur haiku | −30 à 60 % sur ces pages | −40 % |
| G10 | **Des estimations justes** : allers-retours × (préfixe au tarif du cache + croissance), calibrés sur `usage/`, avec le modèle de la table de routage. Écriture dans le cache comptée à 1,25×, lecture à 0,1× | — | — |
| G11 | **Budgets par gabarit** : environ 8 000 jetons de contexte pour une mise à jour ou un tri, 16 000 pour une nouvelle page | −10 à 20 % | — |
| G12 | **Jetons et modèle de chaque agent enregistrés** dans `usage/` par un hook Claude Code (§ 6, S3) : les gains ci-dessus deviennent mesurables | — | — |

**Ce que chaque action demande :**
- **Claude Code seul** (champ `model:` de chaque agent, plusieurs agents lancés en même temps) : G2 à G6.
- **L'API Anthropic directement**, avec une clé : G8 (Batch) et le cache explicite d'une heure.
- **Le kit seul, sans IA** : G1, G7, G9, G10, G11.

**Ordre conseillé :** G12 et G1 + G2 (mesurer, puis supprimer le travail inutile), G3, G4 + G5, G6 et G9, puis G8 et
G7, avec G10 tout au long.

## Sources

- Playwright, notes de version : https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/release-notes-js.md
- Arcade, Storylane, Navattic : https://www.arcade.software/post/best-interactive-demo-software-2026 ·
  https://www.storylane.io/blog/navattic-vs-arcade
- Supademo, HowdyGo, Walnut, Reprise : https://supademo.com/blog/howdygo-alternatives
- Scribe, Tango, Folge, Dubble : https://folge.me/scribe-alternative · https://dubble.so/compare/scribe-alternatives
- Clueso, Guidde : https://www.docsie.io/blog/articles/clueso-vs-guidde-pricing-comparison-2026/
- Comparaison visuelle : https://argos-ci.com/blog/percy-vs-chromatic-vs-argos · https://argos-ci.com/blog/visual-testing-pricing
- shot-scraper : https://simonwillison.net/2025/Dec/29/shot-scraper/
- Doc Detective : https://doc-detective.com
- Agents navigateur : https://menuagentic.com/blogs/browser-use-vs-stagehand-vs-skyvern-vs-playwright-mcp/
- JPEG XL : https://www.photoformatlab.com/blog/jpeg-xl-chrome-browser-support-2026

*Les prix et certaines fonctions viennent de comparatifs publiés par les éditeurs eux-mêmes. Ce sont des ordres de
grandeur, à vérifier avant tout achat.*
