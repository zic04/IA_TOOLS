# Documentation {{name}}

Le site de documentation de **{{name}}**, livré en **un seul fichier HTML autonome** dans `dist/`. Il s'ouvre hors ligne dans un navigateur, avec des captures interactives (pastilles, visite guidée), une recherche (Ctrl+K), un thème clair et un thème sombre, et l'impression de toute la documentation.

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
| `npm run captures` | `doc-kit capture` | Refait les captures déclarées dans `captures/plans/` |
| `npm run coverage` | `doc-kit check coverage` | Chaque écran de l'application est-il documenté ? |
| `npm run tables` | `doc-kit check tables` | Aucun tableau ne déborde à 1 440 px |
| `npm run optimize` | `doc-kit optimize` | Recompresse les images lourdes |
| `npm run audit` | `doc-kit audit` | Score, niveau de maturité, avertissements |
| `npm run all` | Captures, optimisation, site, tous les contrôles, audit | La chaîne complète |

Pendant la rédaction, `doc-kit build --draft` tolère les pages et captures manquantes et les signale (encadré « Capture à produire »).

## Le flux de travail

1. **Déclarer** la page dans `content/toc.json`, avec son `template` (type de page).
2. **Créer** la page depuis le modèle : `npx doc-kit new <id-de-page> --template <type>`.
3. **Écrire** chaque section en suivant sa consigne `<!-- consigne : … -->`, puis retirer la consigne.
4. **Capturer** : déclarer l'écran dans `captures/plans/<lot>.mjs`, puis `npx doc-kit capture "<motif>" --preview` et regarder l'aperçu des zones dans `.doc-kit/`.
5. **Contrôler** : `npm run site`, `npx doc-kit check all`, `npm run audit`.
6. **Remettre** : `npx doc-kit export <dossier>`, et la checklist du standard du kit (`delivery.fr.md`).

Lancer `npx doc-kit` sans commande ouvre le mode guidé : il propose l'étape suivante.

## Captures en production

```bash
npx doc-kit connect                       # la personne se connecte elle-même
npx doc-kit capture "prod-*" --preview    # toute requête d'écriture est bloquée dans le navigateur
npx doc-kit connect --forget              # supprimer la session après usage
```

Ne jamais commiter `.doc-kit/` (session, aperçus) : il est dans `.gitignore`.

## Pour aller plus loin

- `WRITING-GUIDE.md` : les règles propres à ce projet.
- Le standard du kit, `node_modules/doc-kit/standard/` : structure, gabarits, rédaction, captures, qualité, maturité, remise.
- La page « Maintenir cette documentation » du site : le même contenu, pour celui qui reprend le projet.
