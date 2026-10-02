# Brief — batch {{code}}: writing and screenshots ({{product}})

You write part of the documentation site of **{{product}}**{{#if description}} ({{description}}){{/if}}, in
{{languageName}}. Other agents write the other batches AT THE SAME TIME{{#if otherWriters}} ({{otherWriters}}){{/if}}.

- Documentation folder: `{{docDir}}`; run every command from this folder.
- Application code: `{{appDir}}`{{#if stack}} ({{stack}}){{/if}}{{#if labels}}; exact interface labels: `{{labels}}`{{/if}}.
- Application: {{appUrl}} (version {{version}}).
- Your pages: {{pages}}
- Your screenshot prefix: `{{prefix}}` (ids `{{prefix}}-<name>`, kebab-case). Your capture plan:
  `{{plansDir}}/{{code}}.mjs`.

## Read first

1. `{{guideFile}}`: MANDATORY conventions (templates; extended syntax `:::screen`, `::capture`, `::diagram`,
   `::before-after`, `:::steps`; callouts `[!TIP]`, `[!WARNING]`, `[!CAUTION]`, `[!PERMISSIONS]`, `[!NOTE]`,
   `[!RECIPE]`, `[!HOW]`; chips `[[perm …]]`, `[[menu …]]`, `[[key …]]`, `[[status …]]`, `[[route …]]`; links `#/id`).
   A `:::screen` legend has exactly as many items as the screenshot has zones.
2. The REFERENCE page for style and depth: `{{contentDir}}/{{referencePage}}.md` and its capture plan. Match that level:
   what it is for, how it works (the REAL mechanism, read in the code), annotated screens, a reference of every setting,
   step by step, pitfalls, permissions.
3. The template of each of your pages (`template` field of the page in `{{tocFile}}`):
   `{{kitPath}}/templates/pages/{{language}}/<type>.md`. The build checks its required sections.
4. `{{tocFile}}` (your pages are declared there: ids, titles, summaries, routes, permissions; change neither ids nor
   titles — in a project created before the kit this file may be `contenu/sommaire.json` with French keys, which the
   kit normalises when reading), `{{targetsFile}}`, and the syntax of a capture plan entry (header of
   `{{kitPath}}/engine/capture/plans.mjs`).
5. The inventory: `.doc-kit/inventory-{{slug}}.md` (navigation, routes, editors, roles and permissions, status of the
   existing documentation). Documents it marks as outdated are not copied: always check in the code.
{{#if reads}}6. Also read: {{reads}}
{{/if}}
## Screenshots

{{#if captureMode=production}}**PRODUCTION, READ-ONLY.** A session, created by an authorised person, is saved in `.doc-kit/` (ignored by git):
never copy, display or quote it. The application owner asked in writing for screenshots of production, without any
change{{#if dataPolicy}}; data: {{dataPolicy}}{{/if}}.

- Command, in small batches of 3 to 8 screenshots: `npx doc-kit capture "{{prefix}}-<pattern>*" --preview`.
- The engine BLOCKS in the browser every request that is not GET, HEAD or OPTIONS (the last line counts the blocked
  write requests). That is no licence to click write buttons: navigation ONLY (pages, tabs, menus, opening a dialog or
  an assistant then Escape, hover). Never: Save, Create, Approve, Delete, Sign, Send, Import, Synchronise, Reindex,
  Sign out, nor typing in a field that saves on its own.
- SERVER-SIDE writes while rendering: the browser block cannot stop them. Before opening a detail page, read its
  rendering code (page component, loader, controller): if a `create…`, `ensure…`, `upsert…`, `update…`, `insert…`,
  `save…` or `sync…` function is called while rendering, do not open it and describe it from the code. Routes listed
  in `capture.forbidden` (`doc.config.mjs`) are never opened.
- A page that needs a POST to load its data (server action, RPC) shows up incomplete: describe it, do not work around it.
- To read the API (ids of objects to capture…): only through a Playwright context that loads the session AND aborts
  everything but GET (`ctx.route("**/*", r => ["GET","HEAD","OPTIONS"].includes(r.request().method()) ? r.continue() : r.abort())`).
  No curl. If the permission system refuses a read, do not try another way: read the value on screen and say so in
  your report.
- NEVER a secret (key, password, token, internal URL) in a picture. The engine masks GUIDs and the values of the local
  `.env`, not production-only values: check every picture and add `masks` when needed.
- If the session expires (redirect to the sign-in page, 401), STOP and say so in your report.
- Production is shared: no needless loops, no bursts of reloads.
{{#if productionNotes}}
⚠ ADDITIONAL INSTRUCTION: {{productionNotes}}
{{/if}}{{/if}}{{#if captureMode=demo}}**PREPARED DEMO** (fictitious data), on {{appUrl}}. The orchestrator ran `doc-kit demo`: do not run it again.

- Command: `npx doc-kit capture "{{prefix}}-<pattern>*" --preview`.
- No value change during a screenshot: an editor that saves on its own would write to the database. Only navigation
  clicks, opening a block or a dialog, and read-only test buttons are allowed.
- If the demo lacks some data, do not create it by hand: ask for it in your report (it will be added to the setup
  script, `capture.setup`).
{{/if}}{{#if captureMode=none}}{{#if screenshots=none}}**NO SCREENSHOT AT ALL** (`capture.mode: "none"` in `doc.config.mjs`): never run `doc-kit capture` or
`doc-kit connect`, never write a `:::screen`. In "The screen", one table per panel or dialog, `| Element | What it shows |`,
one row per element in reading order (top to bottom, then left to right): the exact label in bold, then its role,
values, default and effect, in 1 to 3 sentences, read in the code (components, translation files).
{{/if}}{{#if screenshots!=none}}**NO NEW SCREENSHOT.** Reuse at most 1 or 2 EXISTING screenshots per page (`{{imagesDir}}/*.webp`; look at them
with Read first). A screenshot with zones (`{{imagesDir}}/zones/<id>.json`) is inserted with
`:::screen{capture="<id>" title="…"}` and a list of EXACTLY as many items as zones; `::capture` is refused for it.
{{/if}}{{/if}}{{#if captureMode!=none}}
- LOOK at every zones preview (`<id>.zones.png`, written under `.doc-kit/` by `--preview`, with the Read tool) and fix
  the targets until each zone frames exactly the right element: 3 to 12 zones per screen, in reading order; `up` or
  `within` to frame a whole row; `viewport: { height: 2200 }` and `frame` for long panels; the `main` target helper for
  the area without the menu.
- Target labels: copy the exact character from the labels file (straight or typographic apostrophe), or use a regular
  expression.
{{/if}}
## Rules

- Write ONLY your `{{contentDir}}/<id>.md` files, your plan `{{plansDir}}/{{code}}.mjs` and, when useful,
  `{{diagramsDir}}/{{prefix}}-*.svg` (the site's `d-*` diagram classes only, table in `{{kitPath}}/standard/writing.md`;
  check in light AND dark). Change neither the application, nor `{{tocFile}}`, `{{glossaryFile}}`, `doc.config.mjs`,
  `{{targetsFile}}`, the kit, nor the files of other batches. Do not use `doc-kit new`, `connect` or `demo`. No git command.
- Nothing invented: every label (bold, exact), behaviour, default, bound, permission and limit is checked in the code;
  cite `file:line` for the mechanism. What is inferred is said to be inferred. Gaps between code, screen and existing
  documentation: a `> [!NOTE] Observed gaps` callout (described, never fixed).
- Internal links: only to ids of `{{tocFile}}` (`#/id`); anchors (`#/id~anchor`) only to YOUR pages.
- A page longer than its template's `maxWords` (2,000 to 3,500 words): propose a split into sub-pages in your report
  (do not touch the table of contents).
- Application defects found: do not touch the findings pages; list them as candidates in your report, after checking
  that they are not already an existing finding (`{{contentDir}}/{{findingsPage}}.md`; otherwise quote its number).
- Depth: VERY detailed and educational. Every screen element, every action, every setting: label, role, values,
  default, effect, permissions; and the real mechanism.

## Checks (from `{{docDir}}`)

- `npx doc-kit build --draft`: no ✖ or ⚠ for your pages ("page not written yet" messages about other batches' pages are normal).
- `npx doc-kit check tables`: no table overflow on your pages.
- Visual review of at least 2 pages: `npx doc-kit view <page-id> --output .doc-kit/{{code}}-<name>.png`, then with
  `--tour 2` and with `--theme dark`; Read the pictures; fix; then delete your review pictures.

## Final report ({{languageName}}, 350 words at most)

In this order, so that it can be pasted as is into the consolidation file:
1. Pages written (word counts); screenshots and zones produced; blocked write requests observed.
2. **Candidate findings**: numbered list; proposed severity (Critical, Important, Minor) — finding — `file:line`;
   number of the existing finding if any; "inferred" if not observed.
3. **Errors in existing pages**: file, sentence, proof.
4. **Proposed glossary**: term — one-sentence definition.
5. What could not be captured or checked, and why; proposed sub-page splits.
