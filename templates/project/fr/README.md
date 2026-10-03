# Documentation {{name}}

<!-- doc-kit:capture=app -->
Le site de documentation du produit **{{name}}**, livré en **un seul fichier HTML autonome** dans `dist/`. Il s'ouvre hors ligne dans un navigateur, avec des captures interactives (pastilles, visite guidée), une recherche (Ctrl+K), un thème clair et un thème sombre, et l'impression de toute la documentation.
<!-- doc-kit:capture=none -->
Le site de documentation du produit **{{name}}**, livré en **un seul fichier HTML autonome** dans `dist/`. Il s'ouvre hors ligne dans un navigateur, avec une recherche (Ctrl+K), un thème clair et un thème sombre, et l'impression de toute la documentation. Il ne contient aucune capture (`capture.mode: "none"` dans `doc.config.mjs`) : chaque écran est décrit par un tableau de ses éléments.
<!-- doc-kit:end -->

Le moteur est **doc-kit**, relié par `package.json`. Ce dossier ne contient que le contenu.

Ce squelette déclare deux **espaces** : Métier (`utiliser`, `fonctionnalites`, `configurer`, `administrer` — sans
code, pour les utilisateurs, key users et product owners) et Reprise (`reprendre` — pour celui qui exploite,
sécurise et fait évoluer l'application). `doc-kit build` écrit le site complet plus un export par espace,
chacun privé de l'autre espace. Voir `standard/structure.fr.md` pour la vue d'ensemble, et le haut de
`content/toc.json`.

## Prérequis

Node.js 20 ou plus, puis :

```bash
npm ci
```

<!-- doc-kit:capture=app -->
Si le navigateur de capture manque : `npx playwright install chromium`.
<!-- doc-kit:capture=none -->
Si le navigateur de `doc-kit view`, `doc-kit check tables` et `doc-kit audit` manque : `npx playwright install chromium`.
<!-- doc-kit:end -->

## Commandes

| Script | Commande doc-kit | Rôle |
|---|---|---|
<!-- doc-kit:capture=app -->
| `npm run site` | `doc-kit build` | Produit `dist/` ; strict : s'arrête sur une page, une capture ou un lien manquant |
<!-- doc-kit:capture=none -->
| `npm run site` | `doc-kit build` | Produit `dist/` ; strict : s'arrête sur une page ou un lien manquant |
<!-- doc-kit:end -->
| `npm run dev` | `doc-kit dev` | Serveur local qui reconstruit et recharge à chaque modification |
<!-- doc-kit:capture=app -->
| `npm run captures` | `doc-kit capture` | Refait les captures déclarées dans `captures/plans/` |
<!-- doc-kit:end -->
| `npm run coverage` | `doc-kit check coverage` | Chaque écran de l'application est-il documenté ? |
| `npm run tables` | `doc-kit check tables` | Aucun tableau ne déborde à 1 440 px |
| `npm run optimize` | `doc-kit optimize` | Recompresse les images lourdes |
| `npm run audit` | `doc-kit audit` | Score, niveau de maturité, avertissements |
| `doc-kit facts --source <nom>` | | Lit le code de l'application dans `facts/<nom>.json` (env, api, db, dependencies, agents, secrets, tests), pour le dossier de reprise |
| `doc-kit sync` | | Rapporte ce que la documentation doit suivre depuis la dernière vérification (`sync.json`) ; `--mark --all` enregistre aujourd'hui comme dernière vérification |
<!-- doc-kit:capture=app -->
| `npm run all` | Captures, optimisation, site, tous les contrôles, audit | La chaîne complète |
<!-- doc-kit:capture=none -->
| `npm run all` | Optimisation, site, tous les contrôles, audit | La chaîne complète |
<!-- doc-kit:end -->

<!-- doc-kit:capture=app -->
Pendant la rédaction, `doc-kit build --draft` tolère les pages et captures manquantes et les signale (encadré « Capture à produire »).
<!-- doc-kit:capture=none -->
Pendant la rédaction, `doc-kit build --draft` tolère les pages pas encore écrites et les signale (« page pas encore écrite »).
<!-- doc-kit:end -->

## Le flux de travail

1. **Déclarer** la page dans `content/toc.json`, avec son `template` (type de page).
2. **Créer** la page depuis le modèle : `npx doc-kit new <id-de-page> --template <type>`.
3. **Écrire** chaque section en suivant sa consigne `<!-- consigne : … -->`, puis retirer la consigne.
<!-- doc-kit:capture=app -->
4. **Capturer** : déclarer l'écran dans `captures/plans/<lot>.mjs`, puis `npx doc-kit capture "<motif>" --preview` et regarder l'aperçu des zones dans `.doc-kit/`.
<!-- doc-kit:capture=none -->
4. **Décrire les écrans** : dans la section « L'écran », un tableau des éléments dans l'ordre de lecture, avec leurs libellés exacts.
<!-- doc-kit:end -->
5. **Contrôler** : `npm run site`, `npx doc-kit check all`, `npm run audit`.
6. **Remettre** : `npx doc-kit export <dossier>`, et la checklist du standard du kit (`delivery.fr.md`).

Lancer `npx doc-kit` sans commande ouvre le mode guidé : il propose l'étape suivante.

## Maintenir le dossier de reprise à jour

Pour les pages de Reprise (`acces-et-propriete`, `manuel-exploitation`, `instructions-agents`, et tout
`api-surface`, `data-model`, `dependencies`, `code-map`, `tests-quality`, `threat-model` ajouté) : lancez
d'abord `npx doc-kit facts --source <nom>` (env, api, db, dependencies, agents, secrets, tests), remplissez le
tableau de la page depuis le résultat (`::faits{…}` ou à la main), marquez ce qui n'a pas pu être lu
directement avec `[[verifie …]]`, `[[deduit]]` ou `[[inconnu]]`. Une fois le dossier vérifié,
`npx doc-kit sync --mark --all` enregistre ce qui a été vérifié, et contre quelle version — la prochaine
reprise (ou `npx doc-kit sync` sans `--mark`) rapporte alors exactement ce qui a changé depuis.

<!-- doc-kit:capture=app -->
## Captures en production

```bash
npx doc-kit connect                       # la personne se connecte elle-même
npx doc-kit capture "prod-*" --preview    # toute requête d'écriture est bloquée dans le navigateur
npx doc-kit connect --forget              # supprimer la session après usage
```

Ne jamais commiter `.doc-kit/` (session, aperçus) : il est dans `.gitignore`.
<!-- doc-kit:capture=none -->
## Ajouter des captures plus tard

Mettez `capture.mode: "app"` dans `doc.config.mjs`, puis suivez la phase de capture de la méthode du kit : `npx doc-kit connect`, un plan dans `captures/plans/`, `npx doc-kit capture --preview`. Ne jamais commiter `.doc-kit/` : il est dans `.gitignore`.
<!-- doc-kit:end -->

## Pour aller plus loin

- `WRITING-GUIDE.md` : les règles propres à ce projet.
<!-- doc-kit:capture=app -->
- Le standard du kit, `node_modules/doc-kit/standard/` : structure, gabarits, rédaction, captures, qualité, maturité, remise.
<!-- doc-kit:capture=none -->
- Le standard du kit, `node_modules/doc-kit/standard/` : structure, gabarits, rédaction, qualité, maturité, remise.
<!-- doc-kit:end -->
- La page « Maintenir cette documentation » du site : le même contenu, pour celui qui reprend le projet.
