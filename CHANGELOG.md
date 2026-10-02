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

### Changed

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
