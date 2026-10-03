## L'objectif

Chaque modification de la documentation est construite et contrôlée par un pipeline : une page absente, un lien
cassé, une légende qui ne correspond plus à sa capture ou un secret dans une page font échouer la tâche, et le site
construit et le rapport d'audit sont gardés comme artefacts.

> [!RECETTE] Ce qu'il vous faut
> - Le projet de documentation dans le dépôt de l'application (`docs/manual/`), avec ses captures **committées**.
> - Un accès, depuis le pipeline, au dépôt du kit, dans une version qu'accepte la plage `kit` du projet.
> - Un agent Linux avec Node.js 20 ou plus récent.
> - Les deux exemples prêts à l'emploi du kit : `ci/github-actions.yml` et `ci/azure-pipelines.yml`. Chacun contient
>   d'abord les tests du kit lui-même, puis l'exemple commenté pour un projet de documentation.

## Qui fait quoi

| Étape | Où | Résultat |
|---|---|---|
| 1. Rendre le kit disponible | Le pipeline | Le kit récupéré à côté de l'application, au chemin de la dépendance `file:` |
| 2. Installer | Le kit, puis le projet de documentation | Les dépendances du kit, Chromium, le projet relié au kit |
| 3. Construire et contrôler | Le projet de documentation | Build strict, tous les contrôles, l'audit |
| 4. Publier | Le pipeline | Le site et `audit.md` comme artefacts |

## Étape 1 — Rendre le kit disponible

Le projet dépend du kit par `"doc-kit": "file:<chemin>"` dans `docs/manual/package.json`. Récupérez le kit à ce
chemin, relatif à `docs/manual`. Avec l'application dans `app/` et le kit dans `doc-kit/` de l'espace de travail, le
chemin est `file:../../../doc-kit`.

```yaml
- uses: actions/checkout@v4
  with: { path: app }
- uses: actions/checkout@v4
  with: { repository: <owner>/doc-kit, ref: v0.3.0, path: doc-kit }
```

## Étape 2 — Installer le kit, Chromium et le projet

```bash
cd doc-kit && npm ci && npx playwright install --with-deps chromium
cd ../app/docs/manual && npm install
```

Chromium est nécessaire à `doc-kit check tables` et à la mesure des tableaux de `doc-kit audit` ; sans lui, lancez
les autres contrôles un par un, et l'audit marque les tableaux « non mesuré ».

## Étape 3 — Construire, contrôler et auditer

```bash
npx doc-kit build          # code 1 à la moindre erreur : rien n'est écrit
npx doc-kit check all      # couverture, liens, tableaux, images, secrets
npx doc-kit audit          # informatif : code 0, écrit .doc-kit/audit.md
```

Pour exiger un niveau de maturité, faites échouer la tâche vous-même :

```bash
npx doc-kit audit --json > audit.json
node -e "process.exit(require('./audit.json').level >= 3 ? 0 : 1)"
```

## Étape 4 — Publier les artefacts

Gardez `dist/` (le site) et `.doc-kit/audit.md` (le rapport) comme artefacts de la tâche, même quand un contrôle
échoue : le rapport dit quoi corriger. Les exemples utilisent `actions/upload-artifact` et `PublishPipelineArtifact`.

## Comment savoir que ça marche

- **Un lien cassé fait échouer la tâche** : changez un lien en `#/utiliser/rien` dans une branche ; l'étape de build
  se termine avec le code 1.
- **L'artefact s'ouvre** : l'artefact `documentation` contient `<Produit>-Documentation.html`, qui s'ouvre hors
  ligne.
- **Le rapport est là** : `audit.md` donne le niveau et les prochaines actions.
- **Aucun secret dans les journaux** : la tâche n'a ni fichier de session, ni adresse de l'application, ni
  identifiants.

## Erreurs fréquentes et remèdes

| Symptôme | Cause probable | Remède |
|---|---|---|
| « les dépendances du projet ne sont pas installées » | `npm install` n'a pas été lancé dans `docs/manual`, ou le chemin `file:` n'atteint pas le kit | Récupérez le kit au chemin indiqué dans `package.json` |
| « le projet demande le kit ^1.0.0, or le kit installé est en version 0.1.0 » | Le pipeline récupère une autre version du kit | Récupérez une étiquette qu'accepte la plage `kit`, ou lancez `doc-kit upgrade` |
| « navigateur Chromium introuvable pour Playwright » | Étape 2 sautée | `npx playwright install --with-deps chromium` dans le kit |
| « source de couverture introuvable » (ignorée) | Le code de l'application n'est pas récupéré | Récupérez l'application à côté de sa documentation |

## Pièges et limites à connaître

> [!ATTENTION] Ne capturez jamais dans un pipeline
> Une capture demande une personne qui se connecte, et la session est un secret : elle n'a sa place ni dans un
> pipeline, ni dans ses variables. Les captures sont prises sur un poste de travail, relues, et committées avec le
> contenu. Le pipeline ne fait que construire et contrôler.

> [!NOTE] La CI du kit lui-même
> La première partie de chaque fichier d'exemple est la CI du kit : `npm ci`,
> `npx playwright install --with-deps chromium`, `npm test` et `npm run test:e2e`, sous Linux, Windows et macOS.

## Droits requis

> [!DROITS] Ce dont le pipeline a besoin
> - Un accès en lecture au dépôt de l'application et au dépôt du kit.
> - Un accès en écriture aux artefacts du pipeline.
> - **Aucun** accès à l'application elle-même : ni URL, ni compte, ni session.
