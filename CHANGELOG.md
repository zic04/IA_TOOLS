# Changelog

All notable changes to doc-kit are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). `doc-kit upgrade` shows the
entries between a project's `kit` range and the installed version.

## [Unreleased]

Fixes for the frictions found by a pilot run on a real application with a separate front end and no screenshots.

### Added

- **Help of a command**: `doc-kit <command> --help` and `doc-kit help <command>` print the usage and every option of
  that command, in the language of the messages (`cli.help.*`, fragment `i18n/<language>/help.json`).
- **No-screenshot mode**: `capture.mode: "app" | "none"` (default `"app"`) and `doc-kit init --capture none` (also asked
  in interactive mode). With `"none"`: no example capture plan and no capture script in the skeleton, starter pages
  and `doc-kit new` describe "The screen" with a table `| Element | What it shows |`, the home page has no
  "interactive screens" callout, `capture` and `connect` explain the mode and stop with exit code 2 (`connect --forget`
  still runs), `doctor` expects neither a session nor a plans folder, the guided mode never offers `connect` or
  `capture`, the skill's briefs tell the writers to write tables, and `audit` counts `annotated` as `n/a`, so level 2
  is reachable.
- **Capture variants in templates**: `<!-- doc-kit:capture=app -->`, `<!-- doc-kit:capture=none -->` and
  `<!-- doc-kit:end -->` markers; `init` and `new` keep the variant of the project (`captureVariant` in
  `engine/build/page-templates.mjs`). The `screen` and `editor` templates hold a "The screen" without screenshot.
- **`app.dir`**: the application root, written by `init`; given to the agents as `{{appDir}}` by the skill's
  `brief.mjs`, checked by `doctor`.
- **`init` recap**, printed before anything is written, also with `--yes`: folder, product name and where it was found,
  slug, language, URL, version and its file, capture mode, sign-in, coverage, masked `.env` files, application folder,
  and where to rename the product afterwards.
- `doctor` warns "version never incremented?" (⚠, no longer ✔) when the documented version is `0.0.0` or `1.0.0` while
  a `version.txt`, `VERSION` or `CHANGELOG.md` of the application gives another one; it checks `app.dir`.
- `brief.mjs --list` prints the available languages and the templates of each.
- **Capture target**: `capture.target: "local" | "demo" | "production"` (default `"local"`), where the screenshots are
  taken. With `"production"`: read-only always, even without a session (`readOnly: false`, or `<PREFIX>_READONLY=0`,
  is refused with exit code 2); `doc-kit capture` prints "PRODUCTION — read-only · N screenshots · <url>" and asks for a
  confirmation whose default is No, or needs the new `--yes` option without a terminal (exit code 2 otherwise);
  `doc-kit demo` refuses to run (exit code 2); `doc-kit connect` says it is production first; `doctor` shows the target
  and warns "no forbidden route declared" while `capture.forbidden` is empty; the guided mode shows the production
  banner before `connect` and `capture`; the skill's `brief.mjs` gives `captureMode=production` (or `demo`).
- **`init` asks where the screenshots are taken**: "1. local or demo application, 2. production, read-only, 3. no
  screenshots" (replaces the capture-mode question), and `--target local|demo|production`. Production asks its own URL
  (never the local one detected), prints the safety reminders (server-side writes on render are not blocked: list
  them in `capture.forbidden`; the session file is a secret; real data is the owner's decision) and writes
  `capture.readOnly: true`. The recap shows the target.
- **`init` goes on in a terminal**: "Open the browser now to sign in? (Y/n)" runs `npm install` when needed, then
  `connect`; "Take a first test screenshot with --preview? (Y/n)" runs `capture --preview --yes`. Never with `--yes`
  (the next commands are printed instead); the next steps leave out what was done.
- **Skill**: in the scoping phase, Claude asks whether the screenshots are taken on production (read-only) and whether
  to open the browser now (AskUserQuestion when available), then runs `doc-kit init --target …` and `doc-kit connect`.
- **`doc-kit view --full`**: the whole page in one image, from its top (the window first takes the height of the
  page, so that the menu and the sticky panels follow it): a long editor page is reviewed in one view.
- **Coverage of the plan**: an element that only the entry of a page not written yet cites gets `plannedBy` (the page);
  `runCoverage` returns `planned`. `check coverage` prints "missing: /x — planned in <page>, not written yet" and
  "N more elements are cited only by the entries of pages not written yet (P/T once they are written)"; `audit` shows
  the coverage "with the pages not written yet" next to `coverage` and names the page in the coverage action.
- **`audit` says how many pages remain to write**: "Pages: 1 written of 81 — 80 to write (72 without a file, 8 still
  in template guidance)" in the summary; `written` carries `missing` and `drafts` in `audit.json` and in the report.

### Changed

- The guided mode's `connect` question says that a browser window opens, where you sign in before pressing Enter.

- **Product name** detected by `init`: the `metadata.title` of the Next.js root layout first, then `package.json`
  without its `-frontend`, `-front`, `-web`, `-ui`, `-client` or `-app` suffix (a generic name gives way to the root
  `package.json`, then to the folder name).
- **Version source** detected by `init`: `version.txt` or `VERSION` at the application root, then the root
  `package.json`, then the front end's, then `pyproject.toml`.
- **Masking files** detected by `init`: the `.env` and `.env.local` files that exist at the application root and in the
  front-end folder (never `*.example`); `masking.env` is empty when there is none.
- The comments of the generated `doc.config.mjs` are in the language of the project (`templates/project/<language>/`).
- The French templates and briefs avoid elision traps with the product name ("du produit …", "l'application …").
- The example routes of the skeleton and of the page templates are fictional (`/example/…`, `/exemple/…`).
- **Coverage** no longer counts a page that still holds template guidance: neither its text nor its entry in the
  table of contents (titles, `routes`, journeys, suggestions).
- The guided mode shows the folder in full ("No documentation project (doc.config.mjs) for this folder: …").
- `brief.mjs` speaks the project's language; `{{appDir}}` comes from `app.dir`, else the documentation folder's
  parent or grandparent that holds `.git`, else its grandparent, with a warning when it was guessed and when the
  coverage source sits in a separate front end.
- **A written page** (`standard/maturity.md`) is a declared page whose file exists and holds no template guidance.
  `written` owns the pages not written yet (without a file, or drafts that keep their guidance) and is now required
  at 100 % for level 3; every other page indicator is measured on the written pages only: `conformant`,
  `completeness`, `annotated`, `proofs`, `tooLong` and `takeover` (a draft is named as the page to write, never as
  present). `blocking` leaves out the build errors of the pages not written yet (shown next to it, counted by
  `written`) and the elements that a page not written yet plans. `guidance` counts the template text left outside the
  page bodies: the summary placeholder of `new` on a written page, guidance in the home page or a section
  introduction. Level 1 still counts a draft as the first page of its section.
- **Coverage** counts only what the written pages cite: the entry of a page declared without its file covers nothing
  either (before: its `routes` counted, so a plan alone reached 91 %).
- The template's examples never satisfy a criterion: proofs, numbered findings and `:::screen` blocks are looked for
  outside HTML comments, in written pages only (before: the sample "(C1)" of the findings skeleton validated it).
- **Audit actions**: an unwritten page is listed once (outside Take over at level 2, the others at level 3), with
  `doc-kit new <id>` for a missing file or the guidance left in a draft; when every element must be handled, the
  sentence says it once ("Document the 4 elements…", not "4, at least 4"); `typedChoose` never asks for more pages than
  it lists.
- **Numbers of the summaries**, in the language of the messages, each noun in the plural form of its number
  (`engine/build/format.mjs`): `build` ("0,3 Mo · 81 pages · 1 schéma"; without screenshots, `capture.mode: "none"`,
  the screenshots are not counted), `check images` ("0 errors, 0 warnings", no more "error(s)"), `check secrets`,
  `check links`, `check tables` ("1 440 px"), `audit` ("1 page").
- **Skeleton without screenshots**: the table of contents (tagline, subtitle of Use, summary of Maintaining the docs)
  no longer speaks of illustrated or annotated screens; `README.md`, `WRITING-GUIDE.md`, the maintaining-docs page and
  the technical architecture page get `capture=none` variants (browser of `view`/`check tables`/`audit`, strict build
  messages, folder layout, checks, transfer, tooling limits), so a `none` project only mentions screenshots to state
  the decision and how to add them later.
- `doctor` checks one more contrast pair: `chrome-text` on `chrome-2` (the search field of the top bar).

### Fixed

- **A declared page without its file** is one problem, `page not written yet: <id> (<file>)` (a warning with
  `--draft`), never the cascade of the "required section missing" errors of its template, nor "anchor not found" for
  the links into it: 385 errors became 75 on a plan of 81 pages with 72 not written yet.
- **The Ctrl K key of the top bar** was nearly unreadable in the light theme: the generic `kbd` gave it the page
  surface (white) under the light chrome text (1.5:1); it now sits on `chrome-2` in both themes (9.9:1).

## [0.1.0] - 2026-10-01

First public release.

### Added

- **The generated site**: one self-contained HTML file that opens offline, with sections, groups, sub-pages,
  breadcrumbs and previous / next links; annotated screenshots with numbered markers, a legend and a guided tour;
  a before / after slider; full-text search (`Ctrl+K` or `/`); glossary tooltips; inline SVG diagrams; light and dark
  themes remembered per browser; printing of one page or of the whole documentation; keyboard navigation and screen
  reader announcements.
- **Extended Markdown**: `:::screen`, `:::steps`, `::capture`, `::diagram`, `::before-after`, seven callout types and
  five inline badges, each with an English and a French spelling; internal links and anchors checked by the build.
- **Page templates**: 13 page types (`screen`, `editor`, `recipe`, `technical`, `technical-sub`, `journey`,
  `journey-step`, `troubleshooting`, `troubleshooting-area`, `findings`, `architecture`, `variables`, `resources`), in
  English and in French, with their required sections checked by the build.
- **The documentation standard** (`standard/`, English and French): structure, templates, writing rules, capture
  safety, quality gates, maturity levels, handover checklist, commented configurations.
- **Command line**: `init`, `doctor`, `connect`, `demo`, `capture`, `inventory`, `dev`, `new`, `build`, `view`, `open`,
  `check`, `audit`, `optimize`, `export`, `upgrade`, `migrate`, `skill install`, and a guided mode when no command is
  given; `--json` output; messages in English and French; documented exit codes (0, 1, 2, 3).
- **Captures**: plans as JavaScript modules; targets by role, text, field, label, placeholder, CSS or block, with
  options; actions (click, hover, type, select, press, scroll, wait, wheel, eval); zones and `union`; frames; masks;
  desktop and mobile contexts; map framing; WebP encoding through Chromium, without native dependency; zone
  previews.
- **Capture safety**: read-only by default with a session (write requests aborted and counted), forbidden routes
  never opened, session checked before and during the run, automatic masking of GUIDs, local `.env` values and
  patterns.
- **Adapters**: authentication (`manual`, `none`, `nextauth`, `api-me`) and coverage (`next-app-router`,
  `react-router`, `i18n-registry`, `glob`), plus project adapters declared as `local:<path>`.
- **Checks**: coverage, links, table widths, images (orphan, missing, heavy, outdated) and secrets.
- **Audit**: about fifteen indicators, four maturity levels, and the prioritised actions to reach the next one, as
  Markdown and JSON reports.
- **Live writing**: `doc-kit dev` rebuilds and reloads the site on every change, with build errors shown over the page.
- **Delivery and maintenance**: `export` writes a self-contained copy with the engine vendored; `upgrade` shows the
  changes and applies the migrations of the kit; `migrate` rewrites legacy French-keyed projects, which are also
  read as they are.
- **Theme**: colour tokens for both themes, WCAG contrast check, sanitised logo and favicon, extra icons, coloured
  status badges, and overrides of any text of the site.
- **Claude Code skill**: the method in phases, brief templates for parallel agents, scripts, installed with
  `doc-kit skill install` and checked by `doctor`.
- **Examples**: a fictional demo application (Acme Orders) and its documentation project, used by the tests.
- **Documentation** of the kit, in English and in French, built with the kit itself, with an example page of each
  type; CI examples for GitHub Actions and Azure Pipelines.
- Two runtime dependencies only (`marked`, `playwright`); Node.js 20 or later on Windows, macOS and Linux.
