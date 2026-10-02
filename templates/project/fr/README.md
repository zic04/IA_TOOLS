# Documentation {{name}}

<!-- doc-kit:capture=app -->
Le site de documentation du produit **{{name}}**, livré en **un seul fichier HTML autonome** dans `dist/`. Il s'ouvre hors ligne dans un navigateur, avec des captures interactives (pastilles, visite guidée), une recherche (Ctrl+K), un thème clair et un thème sombre, et l'impression de toute la documentation.
<!-- doc-kit:capture=none -->
Le site de documentation du produit **{{name}}**, livré en **un seul fichier HTML autonome** dans `dist/`. Il s'ouvre hors ligne dans un navigateur, avec une recherche (Ctrl+K), un thème clair et un thème sombre, et l'impression de toute la documentation. Il ne contient aucune capture (`capture.mode: "none"` dans `doc.config.mjs`) : chaque écran est décrit par un tableau de ses éléments.
<!-- doc-kit:end -->

Le moteur est **doc-kit**, relié par `package.json`. Ce dossier ne contient que le contenu.

## Prérequis

Node.js 20 ou plus, puis :

```bash
npm ci
```

Si le navigateur de capture manque : `npx playwright install chromium`.

## Commandes

| Script | Commande doc-kit | Rôle |
|---|---|---|
| `npm run site` | `doc-kit build` | Produit `dist/` ; strict : s'arrête sur une page, une capture ou un lien manquant |
| `npm run dev` | `doc-kit dev` | Serveur local qui reconstruit et recharge à chaque modification |
<!-- doc-kit:capture=app -->
| `npm run captures` | `doc-kit capture` | Refait les captures déclarées dans `captures/plans/` |
<!-- doc-kit:end -->
| `npm run coverage` | `doc-kit check coverage` | Chaque écran de l'application est-il documenté ? |
| `npm run tables` | `doc-kit check tables` | Aucun tableau ne déborde à 1 440 px |
| `npm run optimize` | `doc-kit optimize` | Recompresse les images lourdes |
| `npm run audit` | `doc-kit audit` | Score, niveau de maturité, avertissements |
<!-- doc-kit:capture=app -->
| `npm run all` | Captures, optimisation, site, tous les contrôles, audit | La chaîne complète |
<!-- doc-kit:capture=none -->
| `npm run all` | Optimisation, site, tous les contrôles, audit | La chaîne complète |
<!-- doc-kit:end -->

Pendant la rédaction, `doc-kit build --draft` tolère les pages et captures manquantes et les signale (encadré « Capture à produire »).

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
- Le standard du kit, `node_modules/doc-kit/standard/` : structure, gabarits, rédaction, captures, qualité, maturité, remise.
- La page « Maintenir cette documentation » du site : le même contenu, pour celui qui reprend le projet.
