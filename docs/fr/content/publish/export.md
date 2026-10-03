## L'objectif

Transmettre un projet de documentation à une autre équipe, qui peut le reconstruire **sans le dépôt du kit** : le
contenu, les captures, le site construit et une copie du moteur, dans un seul dossier ou une seule archive.

> [!RECETTE] Ce qu'il vous faut
> - Un projet dont le build strict passe (`doc-kit build`) et dont les contrôles sont au vert (`doc-kit check all`).
> - La session de production supprimée, s'il y en a eu une (`doc-kit connect --forget`).
> - Un dossier cible nouveau ou vide.

## Qui fait quoi

| Étape | Qui | Résultat |
|---|---|---|
| 1. Contrôles finaux | Le rédacteur | Build strict, contrôles, audit au niveau visé |
| 2. Export | Le rédacteur | Un dossier autonome, et une archive |
| 3. Reconstruction | L'équipe qui reçoit | Le même site, construit à partir de la copie |
| 4. Diffusion | Le propriétaire | Le fichier HTML là où les lecteurs peuvent l'ouvrir |

## Étape 1 — Lancer les contrôles finaux

```bash
doc-kit build
doc-kit check all
doc-kit audit
doc-kit connect --forget
```

Regardez une page par section dans les deux thèmes, et une visite guidée : `doc-kit view <page> --theme dark`,
`doc-kit view <page> --tour 2`.

## Étape 2 — Exporter le projet

```bash
doc-kit export ../acme-orders-docs --with-dist --zip
```

```text
⚠ version.file pointe hors du projet (../../package.json) : la copie affiche la version figée (version.fallback)
· non exportés : package-lock.json
✔ ../acme-orders-docs : 26 fichiers du projet + moteur 0.3.0 embarqué (172 fichiers) · version documentée 2.4.0
✔ archive ../acme-orders-docs.zip (0.5 Mo)
```

| Quoi | Dans la copie |
|---|---|
| Les fichiers du projet | Tout sauf `node_modules/`, `.doc-kit/` (la session !), `.git/`, les fichiers `.env`, `package-lock.json`, les journaux, et `dist/` sans `--with-dist` |
| Le moteur | `vendor/doc-kit/` : moteur, ligne de commande, adaptateurs, textes, schémas, gabarits, standard ; ni tests, ni exemples, ni skill, ni documentation |
| `package.json` | Dépend de `"doc-kit": "file:./vendor/doc-kit"` |
| `doc.config.mjs` | `version.fallback` fixé à la version documentée, commentaires conservés |
| `EXPORT.json` | Version du kit, date, dossier source, produit, version, et le commit git quand il y en a un |
| `README.md` | Une section « Copie autonome » : comment reconstruire, ce qui demande l'application |

Chaque chemin de la configuration qui pointe hors du projet (`version.file`, `masking.env`, sources de couverture)
est signalé : il manquera dans la copie.

## Étape 3 — Reconstruire la copie ailleurs

```bash
cd acme-orders-docs
npm install
npm run site
```

`npm run site` est `doc-kit build`, avec le moteur embarqué. Node.js 20 ou plus récent suffit ; Chromium n'est
nécessaire que pour les captures, `view` et le contrôle des tableaux (`npx playwright install chromium`).

## Étape 4 — Diffuser le site

Le livrable est le fichier HTML de `dist/`. Au-delà d'environ 10 Mo, ne le joignez pas à un e-mail : partagez un
lien vers un espace documentaire, un dépôt ou un hébergement statique. Si le site montre des données réelles,
réservez son accès aux personnes qu'autorise le propriétaire.

## Comment savoir que ça marche

- **La copie se construit** : `npm install` puis `npm run site` dans la copie se terminent avec le code 0.
- **Aucun secret n'a voyagé** : la copie n'a ni dossier `.doc-kit/` ni fichier `.env`.
- **La version est figée** : le `doc.config.mjs` de la copie contient `fallback: "2.4.0"` ; le site affiche
  `v2.4.0`.
- **L'archive s'ouvre** : `acme-orders-docs.zip` contient les mêmes fichiers que le dossier.

## Erreurs fréquentes et remèdes

| Symptôme | Cause probable | Remède |
|---|---|---|
| « le dossier … existe déjà et n'est pas vide » | La cible a déjà servi | Un nouveau dossier, ou videz-le |
| « la cible est le projet lui-même » | `doc-kit export .` | Exportez vers un autre dossier |
| « --with-dist : le site n'est pas construit » | Pas encore de fichier dans `dist/` | `doc-kit build`, puis exportez à nouveau |
| La copie affiche une ancienne version | `version.file` est resté derrière | Mettez à jour `version.fallback` dans la copie quand l'application change |

## Pièges et limites à connaître

> [!ATTENTION] Ce que la copie ne peut pas faire seule
> Le contrôle de couverture a besoin du code de l'application, et de nouvelles captures demandent une application
> qui tourne. Dans la copie, ces deux limites sont indiquées dans la section du README ; retirez-y `coverage` si le
> code n'est pas disponible.

> [!NOTE] Mettre à jour le moteur d'une copie
> Remplacez `vendor/doc-kit/` par un kit plus récent, puis lancez `npx doc-kit upgrade` pour voir les changements et
> appliquer les migrations ([Passer à un kit plus récent](#/migrate/upgrade)).

> [!NOTE] Un projet avec des espaces
> `--with-dist` copie les exports par espace là où `build` les a écrits, en plus du site complet : un dossier de
> reprise transmis à une équipe n'a jamais besoin que les pages métier en soient retirées à la main
> ([Deux espaces, une seule source](#/spaces/overview~exporter-la-ou-la-confidentialite-commence-vraiment)).

> [!NOTE] La liste de contrôle de la passation
> `standard/delivery.fr.md` liste tout ce qu'il faut vérifier avant une passation : contrôles, sécurité, contenu de
> reprise, export et diffusion, chaque point avec sa preuve.

## Droits requis

> [!DROITS] Qui fait quoi
> - **Exporter** : accès en lecture au projet de documentation ; accès en écriture au dossier cible.
> - **Reconstruire** : Node.js et npm sur la machine qui reçoit ; aucun accès à l'application.
> - **Diffuser** : le propriétaire décide qui peut lire un site qui montre des données réelles.
