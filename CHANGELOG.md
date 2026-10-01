# Changelog

All notable changes to doc-kit are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). `doc-kit upgrade` shows the
entries between a project's `kit` range and the installed version.

## [Unreleased]

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
