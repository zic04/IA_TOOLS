## L'objectif

Faites passer un projet de documentation à une version plus récente du kit : lisez ce qui a changé, voyez exactement
ce que le kit changerait dans le projet, puis appliquez. La plage `kit` du projet accepte alors la nouvelle version.

> [!RECETTE] Ce qu'il vous faut
> - Le nouveau kit installé (une copie plus récente du dépôt, `npm ci`, et Chromium si Playwright a changé).
> - Le projet de documentation commité, pour que les modifications de la mise à jour soient faciles à relire.

## Qui fait quoi

| Étape | Commande | Résultat |
|---|---|---|
| 1. Voir | `doc-kit upgrade` | Les changements depuis votre version, les migrations, le diff ; rien n'est écrit |
| 2. Appliquer | `doc-kit upgrade --apply` | Les fichiers modifiés, et `kit` fixé à `^<nouvelle version>` |
| 3. Vérifier | `doc-kit doctor`, `doc-kit build`, `doc-kit audit` | Le projet fonctionne avec le nouveau kit |

## Étape 1 — Voir ce qui change

```bash
doc-kit upgrade
```

```text
Plage du projet ^0.0.1 (doc.config.mjs) · kit installé 0.1.0
⚠ le projet exige ^0.0.1 : le kit 0.1.0 est refusé tant que la mise à jour n'est pas appliquée

Changements :
  [0.1.0] - 2026-10-01
    First public release.
    …

Migrations :
  ✔ 0.1.0 — base du format de projet (aucun changement)

1 fichier à modifier :
--- a/doc.config.mjs
+++ b/doc.config.mjs
@@ -2,7 +2,7 @@
 export default {
-  kit: "^0.0.1",
+  kit: "^0.1.0",
   product: { name: "Acme Orders", slug: "acme-orders" },

Rien n'a été écrit (simulation). Pour appliquer : doc-kit upgrade --apply
```

- Les **changements** sont les entrées du `CHANGELOG.md` du kit plus récentes que la version de base de votre plage
  (`^0.0.1` → 0.0.1) et pas plus récentes que le kit installé, de la plus récente à la plus ancienne.
- Les **migrations** sont les scripts du kit (`engine/migrations/<version>.mjs`) pour les mêmes versions, exécutés
  **en mémoire** : le diff montre chaque fichier qu'ils modifieraient.
- `doc-kit upgrade` fonctionne même quand la plage refuse le kit installé : c'est précisément là qu'on en a besoin.

## Étape 2 — Appliquer

```bash
doc-kit upgrade --apply
```

`✔ 1 fichier mis à jour ; le projet exige désormais le kit ^0.1.0.` Quand une migration échoue, rien n'est écrit et
la commande se termine avec le code 1, en nommant la migration.

## Étape 3 — Vérifier le projet

```bash
doc-kit doctor
doc-kit build
doc-kit audit
```

Un kit plus récent peut exiger de nouvelles sections ou signaler de nouveaux avertissements : l'audit les liste, page
par page.

## Comment savoir que ça marche

- **Plage** : `doc.config.mjs` indique `kit: "^<nouvelle version>"` ; `doc-kit doctor` affiche ✔ pour le kit.
- **Idempotence** : relancé, `doc-kit upgrade` répond `le projet est à jour`.
- **Build** : `doc-kit build` passe ; les captures prises avec l'ancien kit fonctionnent toujours (le format des
  zones est stable).
- **Skill** : `doc-kit doctor` signale un skill Claude Code périmé : `doc-kit skill install`.

## Erreurs fréquentes et remèdes

| Symptôme | Cause probable | Remède |
|---|---|---|
| « pas de CHANGELOG.md dans le kit » | Une copie du moteur sans son journal des modifications | Les changements ne peuvent pas être listés ; les migrations s'exécutent quand même |
| « la migration 0.2.0 a échoué : … » | Le projet diffère de ce qu'attend la migration | Rien n'a été écrit ; signalez le problème avec le `doc.config.mjs` du projet |
| « Chromium pour Playwright n'est pas installé » | Le nouveau kit utilise un Playwright plus récent | `npx playwright install chromium` dans le kit |

## Pièges et limites à connaître

> [!ATTENTION] Une copie exportée
> Un projet exporté avec `doc-kit export` a son propre moteur dans `vendor/doc-kit/`. Remplacez d'abord ce dossier
> par le nouveau kit, puis lancez `npx doc-kit upgrade` dans la copie.

> [!NOTE] Écrire une migration
> Une migration est un fichier `engine/migrations/<version>.mjs` du kit : elle exporte `version` et
> `migrate({ files, config, root })`, ne lit et n'écrit qu'à travers `files` (`read`, `write`, `exists`, `list`,
> `remove`, chemins relatifs au projet), et elle est idempotente. Son titre est le texte `cli.migration.<version>`.
> `0.1.0.mjs` sert de modèle : il ne change rien.

## Droits requis

> [!DROITS] Ce dont la mise à jour a besoin
> - Le droit d'écrire dans le projet de documentation (seulement avec `--apply`).
> - Le droit de lire le nouveau kit.
