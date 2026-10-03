## The goal

Bring a documentation project written **before doc-kit**, with French keys and folder names (`contenu/sommaire.json`,
`titre`, `groupes`…), under the kit, and **prove** that the site it produces has not changed. The content is never
rewritten by hand: the kit reads the legacy format as it is, then `doc-kit migrate` rewrites the JSON files.

> [!RECIPE] What you need
> - The kit installed ([Install doc-kit](#/start/install)), and a copy of the legacy project (work on a copy until the
>   comparison passes).
> - The legacy project's own build, if it still runs: it gives the reference to compare with.
> - Half an hour for a site of about a hundred pages.

## Who does what

| Step | Result |
|---|---|
| 1. Declare the project | A `doc.config.mjs` with the legacy folder names |
| 2. Build as it is | The kit reads the legacy files; a warning lists them |
| 3. Keep a reference | A build of the current state, with a fixed date |
| 4. Migrate | The JSON files rewritten in the current format |
| 5. Compare | The equivalence check of the two builds |
| 6. Type the pages | The audit's suggestions applied, to measure the real level |

## Step 1 — Declare the project

Add `doc.config.mjs` at the root of the documentation folder. Keep the legacy folder names with `paths`:

```js
import { defineConfig } from "doc-kit/config";

export default defineConfig({
  kit: "^0.2.0",
  product: { name: "Acme Orders" },
  language: "fr",
  paths: { content: "contenu", images: "images", diagrams: "schemas" },
  version: { file: "../../package.json" },
});
```

Then make the project depend on the kit (`"doc-kit": "file:<path to the kit>"` in its `package.json`), run
`npm install`, and run `doc-kit doctor`. The legacy engine files (`generer.mjs` and its folders) are no longer used.

## Step 2 — Build as it is

```bash
doc-kit build --draft
```

The kit normalises the legacy files **when it reads them**, and warns:
`legacy French-keyed files read (contenu/sommaire.json, contenu/glossaire.json, images/zones/*.json (1), contenu/accueil.md)`.
The Markdown keeps both spellings (`:::ecran`, `[!ASTUCE]`): it is never rewritten. Capture plans are normalised
when they are read too.

## Step 3 — Keep a reference build

```bash
doc-kit build --date 2026-10-01 --output ../reference.html
```

`--date` fixes the date written in the site, so that two builds of the same content are identical. When the legacy
engine still runs, its own build, made with a frozen clock, is an even better reference: the kit's
`test/tools/equivalence.mjs prepare` prepares the copies and both builds.

## Step 4 — Migrate the JSON files

```bash
doc-kit migrate
```

```text
✔ contenu/sommaire.json → contenu/toc.json
✔ contenu/glossaire.json → contenu/glossary.json
✔ contenu/accueil.md → contenu/home.md
✔ images/zones/liste-commandes.json → images/zones/liste-commandes.json
4 files rewritten.
```

Nothing is written when the normalised table of contents is invalid (exit code 1). Running it again says `nothing
to migrate`.

## Step 5 — Compare the two builds

```bash
doc-kit build --date 2026-10-01 --output ../candidate.html
node <kit folder>/test/tools/equivalence.mjs compare --reference ../reference.html --candidate ../candidate.html --levels bytes,1,2,3
```

| Level | Compares |
|---|---|
| `bytes` | The HTML itself, ignoring the generator tag and the texts embedded by the kit |
| `1` | The site's data: pages, menu, search index, glossary, journeys |
| `2` | The images: same ids, same SHA-256 |
| `3` | The visible text of the home page, every section and every page |
| `4` | Screenshots of a sample of pages, light and dark, at most 0.1 % of pixels apart |

The command prints a JSON report and exits with code 0 when every requested level passes.

## Step 6 — Type the pages

A site written before page types declares no `template`: `doc-kit audit` keeps it at level 2 however complete it is.
The audit lists the pages that already follow a type, with the type to declare, and the closest type of the others
with the headings they lack. Add `"template"` (or `"gabarit"` in a legacy plan: `doc-kit new` and the audit keep the
file's style) and rename the few headings, then audit again.

## The legacy keys

| Legacy | Current |
|---|---|
| `contenu/sommaire.json`, `contenu/accueil.md`, `glossaire.json` | `content/toc.json`, `content/home.md`, `glossary.json` |
| `titre`, `titre_menu`, `resume`, `niveau`, `groupes`, `droits`, `gabarit`, `fichier` | `title`, `menuTitle`, `summary`, `level`, `groups`, `permissions`, `template`, `file` |
| `accroche`, `sous_titre`, `points`, `icone`, `vedette`, `parcours` + `etapes` | `tagline`, `subtitle`, `highlights`, `icon`, `featured`, `journeys` + `steps` |
| Glossary `terme`, `motif` | `term`, `pattern` |
| Zone files `fichier`, `titre`, `largeur`, `hauteur`, `l`, `libelle`, `cote` (`coin`, `droit`, `bas`, `droit-bas`) | `file`, `title`, `width`, `height`, `w`, `label`, `side` (`corner`, `right`, `bottom`, `bottom-right`) |
| Plans `titre`, `contexte` (`bureau`), `vue`, `stockage`, `delai`, `cadre`, `masques`, `stabiliser` | `title`, `context` (`desktop`), `view`, `storage`, `delay`, `frame`, `masks`, `settle` |
| Actions `clic`, `survol`, `saisir`, `choisir`, `touche`, `defiler`, `attendre`, `molette` (`crans`, `sens`), `valeur` | `click`, `hover`, `type`, `select`, `press`, `scroll`, `wait`, `wheel` (`steps`, `direction`), `value` |
| Targets `nom`, `texte`, `champ`, `bloc`, `dans`, `parent`, `encadre`, `dernier`, `filtre`, `cote`, `marge`, `margeV`, `libelle` (any target: zone, frame, mask) | `name`, `text`, `field`, `block`, `within`, `up`, `framed`, `last`, `has`, `side`, `margin`, `marginY`, `caption` |

When both spellings are present, the current (English) key wins.

## How to check it works

- **Doctor**: `doc-kit doctor` shows ✔ for the configuration and finds `contenu/toc.json`.
- **Build**: `doc-kit build` (strict) passes, without the legacy warning.
- **Equivalence**: the comparison reports `"ok": true` for every level you asked.
- **Audit**: `doc-kit audit` reports the level, and its typing suggestions are applied.

## Common errors and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| "table of contents not found: content/toc.json" | `paths.content` not declared | `paths: { content: "contenu" }` |
| "diagram not found: diagrams/flow.svg" | `paths.diagrams` not declared | `paths: { diagrams: "schemas" }` |
| "unknown key" on a page entry | A legacy key the kit does not know | Rename it by hand, then build again |
| `level1` differences on `meta` | A different product name or version | Same `product.name` and version in both builds |

## Pitfalls and limits

> [!WARNING] Work on a copy
> `doc-kit migrate` rewrites files in place. Keep the legacy project untouched until the comparison passes, and
> commit the migration as one change of its own.

## Required permissions

> [!PERMISSIONS] What the migration needs
> - Write access to the copy of the documentation project.
> - No access to the application: the migration touches neither the captures nor the application.
