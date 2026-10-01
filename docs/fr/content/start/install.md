## L'objectif

À la fin de cette page, la commande `doc-kit` répond sur votre poste, son navigateur est installé, et
`doc-kit doctor` ne signale aucun problème. Comptez environ cinq minutes, surtout pour le téléchargement de Chromium.

> [!RECETTE] Ce qu'il vous faut
> - **Node.js 20 ou plus récent**, avec npm. Vérifiez avec `node --version`.
> - Environ 300 Mo d'espace disque pour Chromium, le navigateur qui prend les captures.
> - Un accès réseau au registre npm et aux téléchargements des navigateurs de Playwright, une seule fois.
> - Une copie du dépôt du kit (le kit n'est pas encore publié sur le registre npm).

## Qui fait quoi

| Étape | Où | Résultat |
|---|---|---|
| 1. Récupérer le kit | Un dossier de votre choix | Les fichiers du kit, avec ses deux dépendances installées |
| 2. Installer Chromium | Le dossier du kit | Le navigateur sans interface utilisé par `capture`, `view`, `audit` et `check tables` |
| 3. Mettre la commande dans le chemin | Votre poste, ou rien du tout | `doc-kit` répond depuis n'importe quel dossier |
| 4. Vérifier | N'importe quel dossier | `doc-kit doctor` liste ce qui est en place |

## Étape 1 — Récupérer le kit et ses dépendances

Clonez le dépôt (ou décompressez-en une archive), puis installez ses dépendances. Le kit n'en a que deux :
`marked` (le moteur Markdown) et `playwright` (le pilotage du navigateur).

```bash
git clone <URL du dépôt> doc-kit
cd doc-kit
npm ci
```

Le kit ne dépend pas de son emplacement sur le disque : un chemin avec des espaces fonctionne.

## Étape 2 — Installer Chromium

```bash
npx playwright install chromium
```

Sur une machine Linux sans bureau (un agent de CI, un conteneur), installez aussi les bibliothèques du système :
`npx playwright install --with-deps chromium`.

## Étape 3 — Mettre la commande dans le chemin

Choisissez l'une des trois façons. Elles exécutent le même code.

| Façon | Commande | Quand |
|---|---|---|
| Un lien global | `npm link` (dans le dossier du kit) | Votre propre poste : `doc-kit` répond partout et suit le dossier du kit |
| Sans rien installer | `npx --prefix <dossier du kit> doc-kit <commande>` | Un poste partagé, ou pour essayer le kit |
| Node seul | `node <dossier du kit>/cli/doc-kit.mjs <commande>` | Les scripts, et avant qu'un projet existe |

Chaque projet de documentation déclare aussi le kit dans son propre `package.json`
(`"doc-kit": "file:<chemin relatif vers le kit>"`, écrit par `doc-kit init`). Après `npm install` dans le projet,
`npx doc-kit <commande>` lance le kit du projet, même sans lien global.

## Étape 4 — Vérifier l'installation

```bash
doc-kit --version
doc-kit doctor
```

`doc-kit doctor` affiche une ligne par vérification : ✔ en ordre, ⚠ à regarder, ✖ à corriger, chaque problème suivi
de `→` et de sa correction. Hors d'un projet de documentation, il ne vérifie que l'environnement et signale l'absence
de projet.

## Comment savoir que ça marche

- **Version** : `doc-kit --version` affiche `doc-kit 0.1.0` (ou la version de votre copie).
- **Node** : la première ligne de `doctor` est ✔, avec votre version de Node et la plage exigée (`>=20`).
- **Dépendances** : `doctor` affiche ✔ pour `marked 18.0.14, playwright 1.60.0`.
- **Navigateur** : `doctor` affiche ✔ avec le chemin de l'exécutable Chromium.
- **Aide** : `doc-kit --help` liste toutes les commandes, et `doc-kit --help --lang fr` les liste en français.

## Erreurs fréquentes et remèdes

| Symptôme | Cause probable | Remède |
|---|---|---|
| « Chromium pour Playwright n'est pas installé » | Étape 2 sautée, ou une autre version de Playwright | Lancez la commande exacte que `doctor` affiche après `→` |
| « dépendances du kit non installées : marked, playwright » | `npm ci` n'a pas été lancé dans le kit | `npm install --prefix "<dossier du kit>"` |
| `doc-kit: command not found` | Pas de lien global | Utilisez `npx --prefix <dossier du kit> doc-kit` ou `npm link` |
| Node refuse la syntaxe, ou `doctor` affiche ✖ Node | Node antérieur à la version 20 | Installez une version LTS actuelle de Node |

## Pièges et limites à connaître

> [!ATTENTION] Un Chromium par version de Playwright
> Playwright télécharge le navigateur qui correspond à sa propre version. Une mise à jour du kit peut demander de
> relancer `npx playwright install chromium` : `doctor` vous le dit.

> [!NOTE] Réseaux privés
> Derrière un proxy, renseignez la variable habituelle `HTTPS_PROXY` avant `npm ci` et `npx playwright install`. Le
> kit lui-même ne fait aucun appel réseau, sauf vers l'application que vous capturez.

## Droits requis

> [!DROITS] Ce qu'il vous faut sur le poste
> - Le droit d'écrire dans le dossier du kit (pour `npm ci`) et dans le cache Playwright de votre utilisateur.
> - `npm link` écrit dans le dossier global de npm : sur un poste géré, préférez `npx --prefix`.
> - Aucun droit d'administrateur n'est nécessaire par ailleurs.
