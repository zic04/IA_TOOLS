# Writing guide — {{name}} documentation

This guide sets the rules **specific to this project**. The rules shared by every doc-kit site are in the kit's standard, `node_modules/doc-kit/standard/`:

| Topic | Standard file |
|---|---|
| The two spaces (Business, Takeover), required "Take over" pages | `structure.md` |
| The 28 page templates and their sections | `templates.md` |
| Nothing made up, `file:line` proofs, exact labels, gaps, links, glossary, findings, diagrams; writing in the Business space; claim status; the risk register | `writing.md` |
<!-- doc-kit:capture=app -->
| Capture safety and quality | `captures.md` |
<!-- doc-kit:end -->
| Blocking checks and warnings | `quality.md` |
| Maturity levels | `maturity.md` |
| Handover checklist | `delivery.md` |

When this guide and the standard disagree, this guide wins for this project. Complete every line marked "to complete".

## 1. Non-negotiable principles

1. **English**, professional register, imperative mood for actions ("Choose…", "Click…").
2. **Nothing made up**: every label, default, bound and behaviour is checked in the code (§2).
3. **Exact screen labels, in bold**, with the case and characters of the translation file.
4. **Explain how it works**, not only the screen: who computes what, in which order, with which limits.
5. **Observed gaps** described in a `> [!NOTE] Observed gaps (vX.Y.Z)` box, never fixed in the application from this folder.
6. **Permissions**: every screen page ends with a `> [!PERMISSIONS]` box.
<!-- doc-kit:capture=app -->
7. **Data shown in the captures**: see §3.
<!-- doc-kit:capture=none -->
7. **No screenshot**: each screen is described by a table of its elements (§3).
<!-- doc-kit:end -->
8. **No code in the Business space** (`use`, `features`, `configure`, `administer`): a business page cites no `file:line` proof; link its `counterpart` for the implementation detail.

## 2. Sources of truth

| You state… | You check it in… |
|---|---|
| A screen label | to complete (e.g. `{{appDir}}/messages/en.json`) |
| A default value | to complete (components, types) |
| A server bound | to complete (validation schemas, data model) |
| A behaviour | to complete (routes, server actions, services) |
| A permission | to complete (catalogue of permissions and roles) |

The repository's existing documentation helps find where to look; it is never proof.

<!-- doc-kit:capture=app -->
## 3. Captures

- **Data**: to complete. Either "production read-only, real data in clear by written decision of <owner> on <date>", or "demo prepared by `captures/setup-demo.mjs`, fictional names".
- **Ids**: kebab-case, prefixed by batch: `use-…` (Use), `cf-…` (Configure), `admin-…` (Administer), `r-…` (Take over); `prod-` first for a production capture.
- **Routes never to open** (a write on the server while rendering): to complete, and to declare in `capture.forbidden` of `doc.config.mjs`.
- **Forbidden during a capture**: every button that writes and every input that saves. Only navigation is allowed.
- **Session**: deleted at the end of every capture run (`doc-kit connect --forget`).
<!-- doc-kit:capture=none -->
## 3. Screens without screenshots

- **Mode**: this documentation takes no screenshot (`capture.mode: "none"` in `doc.config.mjs`), by decision of: to complete.
- **"The screen"**: one table per panel or dialog, `| Element | What it shows |`, one row per element in reading order (top to bottom, then left to right), the exact label in bold.
- **Adding screenshots later**: `capture.mode: "app"`, then the capture rules of the kit's standard (`captures.md`).
<!-- doc-kit:end -->

## 4. Diagrams

- `diagrams/<name>.svg`, a `viewBox` 900 wide, inserted by `::diagram{id="name" title="…"}`.
- Only the site's classes (`d-box`, `d-line`, `d-dashed`, `d-text`, `d-arrow`…), never a hard-coded colour.
- `<marker>` ids prefixed with the code of the diagram.

## 5. Reference page

The page to imitate in this project: to complete (the first finished editor page). Until then, the worked examples of the kit's standard (`templates.md`).

## 6. Checks before delivering

```
doc-kit build --draft     # while writing: no ✖ or ⚠ line about your pages
doc-kit build             # strict: must pass once every page exists
doc-kit check all         # links, tables, images, secrets, coverage
doc-kit audit             # maturity level, pages too long, guidance left
doc-kit view <page-id> --theme dark
```

## 7. Files managed centrally

<!-- doc-kit:capture=app -->
`doc.config.mjs`, `content/toc.json`, `content/glossary.json`, `content/home.md` and `captures/targets.mjs` are managed centrally: propose your changes (new page, summary, term, capture helper) instead of editing them in parallel.
<!-- doc-kit:capture=none -->
`doc.config.mjs`, `content/toc.json`, `content/glossary.json` and `content/home.md` are managed centrally: propose your changes (new page, summary, term) instead of editing them in parallel.
<!-- doc-kit:end -->

## 8. The Takeover dossier: facts, then sync

The Takeover pages (`access-ownership`, `runbook`, `agent-instructions`, and any `api-surface`, `data-model`,
`dependencies`, `code-map`, `tests-quality`, `threat-model` you add) follow a two-step cycle:

1. **`doc-kit facts --source <name>`** reads the application's code (env names, API routes, database tables,
   dependencies, agent instruction files, secrets, tests) into `facts/<source>.json`, **committed** with this
   project. `::facts{source="…" columns="…"}` turns one into a table at build time; fill the rest by hand.
2. Mark what you could not read directly: `[[verified file:line]]`, `[[deduced …]]`, `[[unknown]]` (see
   `writing.md`).
3. Once the dossier is checked, **`doc-kit sync --mark --all`** records, in `sync.json` (also committed), which
   pages were checked and against which version of the application. The next time someone opens this project,
   `doc-kit sync` (no `--mark`) reports exactly what changed since — not a full re-read.

`facts/` and `sync.json` are never in `.gitignore`: they are the project's memory of what was checked, and
when.
