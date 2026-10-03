# Changelog

All notable changes to doc-kit are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). `doc-kit upgrade` shows the
entries between a project's `kit` range and the installed version.

## [Unreleased]

### Changed

- The folders of `engine/` no longer import one another in a cycle (they were build, sync, check, capture and facts).
  `engine/core/` holds what they share: `hash.mjs` (was in `sync/`), `text.mjs` and `page-templates.mjs` (were in
  `build/`), and `translations.mjs` (the translated-file state, taken out of `build/languages.mjs`). The import
  resolver moves to `engine/facts/imports.mjs` and `readProjectVersion` to `engine/project/version.mjs`.
  `test/unit/layers.test.mjs` fails on a new folder cycle (RULES.md M14).
- Direct tests for the build's text helpers and number formats (`text.test.mjs`) and for `optimize` (options,
  threshold, re-encoding).

## [0.2.0] - 2026-10-03

### Added

- **Production statistics** (ARCHITECTURE.md §6.14):
  - each command appends its time, and the time of its parts, to `usage/<version>.jsonl` in the project;
  - captures are measured part by part: navigation, wait, actions, masking, measure, shot, encoding, comparison;
  - `facts` is measured source by source;
  - `doc-kit stats` groups the lines by step, version, command, model, phase, page or actor, with `--since`,
    `--csv` and `--json`;
  - the global `--profile` option prints a run's timings;
  - `init` writes the `usage/` folder, and an older project opts in by creating it.
- **`::usage{view}`** (`::consommation`) and the `documentation-cost` page template (the 31st). They render:
  - a summary: kit, agent and human time, the number of agents and the models used, tokens, and cost from
    `llm.prices`;
  - one row per version;
  - the time per step, with each step's parts;
  - tokens and cost per model;
  - the ten slowest parts.
- **Statistics hook**: `doc-kit skill install --hooks` registers `scripts/usage-hook.mjs` on `SubagentStop` in
  `.claude/settings.json`. Each AI agent's tokens (input, output, cache), model and time are then appended to
  `usage/` automatically. The settings already in the file are kept, and the hook is never added twice.
- `llm.prices.<model>.cacheWrite` (default 1.25 × input); `cacheRead` defaults to 0.1 × input.
- **Model routing per brief**: `llm.routing` in `doc.config.mjs` overrides the skill's `DEFAULT_ROUTING`
  (`haiku`: `triage`, `translate`; `sonnet`: the writing briefs, `findings-verification`,
  `maintainability-review`; `opus`: `inventory`, `code-health`, `security-review`, `production-technical`).
  `brief.mjs` prints the model to launch with, and `--estimate` prices with it.
- **A shared prompt cache per wave**: an agent is launched with the brief's full text as its prompt, common part
  first, instead of "Read <brief>". Every agent of a wave after the first reads that part from the cache.
- **`sync --apply --auto-intact`** marks the pages whose only changes are probably intact without any agent. The
  skill's update cycle uses it, and then works only on the pages still flagged:
  - it stops when none is left;
  - triage runs on haiku, at most 5 pages per agent, with the agents in parallel;
  - each update agent handles one page, up to 8 run in parallel, and edits the page instead of rewriting it.

- **`doc-kit changes [--since <ref>]`**: what changed in the application since a git reference. It compares the
  facts committed at `<ref>` with the facts on disk: routes and their authentication, tables and columns,
  environment variables, dependencies and versions, security findings, secrets (never values), AI agent files,
  import cycles and the number of tests. It writes `.doc-kit/changes.md`, ready for a pull request comment or the
  release notes.
- **The `capture-plans` brief** (skill, sonnet): an agent drafts the capture plans of a set of screens from the
  code and the facts. It writes the frame, 3 to 8 captioned zones on stable targets and masks, then checks every
  entry with `capture --verify` and `--preview`. It never clicks in a live application, and the read-only capture
  stays the only way a page is opened.
- **`capture --verify`** replays the plans as tests. Each page is opened, its actions played, and its frame and
  zones located, read-only, but nothing is written. A screen that changed fails with the zone it could not find.
  Run it in CI against the demo, or before a release.
- **`doc-kit record <route> [--id] [--force]`**: writes a capture plan entry from what a person does in the
  browser. Playwright's recorder (codegen) opens on the application with the saved session. Clicks, typing,
  choices and keys become the entry's route and actions in `captures/plans/<id>.mjs`; the lines it cannot
  translate stay at the top of the file as comments. It is refused on production and on `capture.forbidden`
  routes, because the recorder is not read-only.
- **`changes --record`** keeps each version's changes in `changes/<version>.json`, which is committed. The
  directive `::changes{version, sources}` (`::changements`) shows every recorded version in the site, most recent
  first. The `release-notes` template starts from it.
- **`doc-kit hooks install | uninstall | status`** installs git hooks (`post-merge` after a pull, `post-checkout`
  after a branch switch) that run `facts` then `sync` in the background. They never block git and cost no tokens.
  Existing hooks are kept: the kit only adds or removes its own block, in the folder git reports, so
  `core.hooksPath` is respected.
- **CI on every build of the application**: the new example (c) in `ci/github-actions.yml` runs `facts`,
  `changes` against the base branch and `sync --check`. On a pull request it posts both reports as a single
  comment, updated at each push, then builds the site.
- **Developer overview**:
  - `facts --source modules`: the import graph (JS/TS and Python), with fan-in, fan-out, import cycles and
    orphan files;
  - `facts --source history`: git history per file, with commits, lines changed, authors, main author and their
    share, last change, and the bus factor. It uses read-only, hardened git and records author names only;
  - `db` facts gain `references` (Prisma relations, SQLAlchemy `ForeignKey`, SQL `REFERENCES`);
  - `::erd{title, tables}` (`::mcd`) draws the entity-relationship diagram from `facts/db.json` as inline SVG
    that follows the theme;
  - the `data-model`, `code-map` and `maintainability-review` templates use them.
- **Parallel captures**: `capture.concurrency` (default 4, production always 1). Each capture runs in its own
  browser context, and events and results stay in plan order. On the demo, 12 captures take 2.9 s instead of
  7.3 s one at a time, and about 40 s before the condition-based waits.
- **`capture.scale: 2`**: captures stay sharp on high-density (Retina) screens. The image holds twice the pixels;
  the zone file keeps the size it is shown at and records `scale`; the viewer shows it at that size. Images are
  about 2.3 times heavier, so the default stays 1.
- **`capture.clock`**: a fixed date and time for every capture, so that "today" and relative dates stay the same
  from run to run.
- **`capture --trace`**: a failed capture leaves its Playwright trace in `.doc-kit/traces/<id>.zip`, and the
  command prints how to open it.
- The standard (`standard/captures.md`) documents a pinned Docker renderer, so that committed images are
  identical across machines.

### Changed

- **Maintainability** (AUDIT.md M4, M7, M9 to M11):
  - one table-of-contents reader, `engine/project/toc.mjs`, for `audit`, `context`, `translate` and the CLI.
    `safeToc` now reads a legacy `sommaire.json`; it used to see no table of contents at all;
  - one JavaScript brace scanner, `engine/util/js-scan.mjs`, for `facts --source quality`, `init` and `export`.
    `init` now finds a layout's title after a brace in a block comment, and `export` no longer adds a second
    `fallback` when the version object holds a nested template literal;
  - the capture durations are in `engine/capture/timings.mjs`. `view` and `check tables` wait for the page to
    settle, and `view --tour` for the step's card, instead of fixed delays;
  - `doctor` checks Chromium through a seam (`ctx.chromium`), so its tests no longer depend on the browser
    installed on the machine;
  - dead code removed, and references to a document absent from the repository now point to ARCHITECTURE.md;
  - 109 exports that no other file used are internal again. A new rule (RULES.md M10) and its test,
    `exports.test.mjs`, reject any export that no other file uses; it does the job of knip without adding a
    dependency.
  - `build()` is split into named steps: `engine/build/build-context.mjs` (shared readers and problems) and
    `engine/build/render-language.mjs` (one language's data). It went from 532 lines to 51, with the same
    output byte for byte.
  - `runAudit()` is split the same way: from 239 lines to 59, with its actions in `engine/audit/actions.mjs`
    (one handler per criterion) and the thresholds in `engine/audit/thresholds.mjs`. The output is the same
    on every fixture.
  - `runCaptures()` too: from about 330 lines to 86, with one capture's steps in `engine/capture/take.mjs`
    and the worker pool in `runWorkers`. The images, zone files and reports are the same on the demo.
  - the kit's JavaScript is formatted by Prettier (pinned dev dependency, 120 columns): `npm run format`, and
    `npm run format:check` in the CI. The reformatting commit is listed in `.git-blame-ignore-revs`. Rule
    RULES.md M11.
  - ESLint (pinned dev dependency, `eslint.config.mjs`): the recommended rules, plus the size rules of RULES.md
    M5 as warnings, capped by `--max-warnings` so that their number can only go down. `npm run lint` runs in the
    CI. It found 18 problems, all fixed: unused imports and variables, initial values always overwritten, and
    a regular expression with spaces that were hard to count. Rule RULES.md M12.
  - Type checking of the JavaScript from its JSDoc (TypeScript 6.0.3, pinned dev dependency, `tsconfig.json`,
    nothing compiled): `npm run typecheck` runs in the CI. It found 162 places where the JSDoc no longer matched
    the code: undocumented options, missing type definitions, return types without a property the code sets.
    All are fixed in the JSDoc; no runtime behaviour changed and no bug was found. Rule RULES.md M13.
  - The messages of the skill's scripts are in `skill/doc-kit/i18n/{en,fr}.json`, installed with the skill: a
    `common` section and one section per script, instead of tables in the code. `consolidation.mjs`, whose
    messages were in English only, now speaks the project's language (or `--lang`). Tests check that both
    languages have the same keys and variables, and that every key a script uses exists.
- Captures run with `reducedMotion: "reduce"`.
- **Captures wait on conditions, not on fixed sleeps.** A capture waits until no request is in flight, fonts and
  images are ready, the DOM has been still for 150 ms and animations have ended, capped at 10 s. `delay` and
  `settle` are now minimums, 0 by default; they were fixed waits of 2,500 and 600 ms. On the demo a capture takes
  0.5–0.7 s instead of about 3.3 s.

### Security

- **`facts --network` keeps private package names private, and `probe` respects `capture.forbidden`** (AUDIT.md
  S13). A package the application declares private is no longer sent to npm or PyPI: an npm scope with its own
  registry in `.npmrc`, every npm package when `.npmrc` replaces the default registry, every pip package behind a
  private index, and any package from a folder, a workspace, git or a URL. It is marked `private: true` in
  `facts/dependencies.json`. `probe` never requests a route of `capture.forbidden` (the home page and the sampled API
  route included) and lists them in `forbidden` in `facts/probe.json`.

- **The generated site has a Content Security Policy** (AUDIT.md S9). Pages may hold HTML and diagrams are inlined
  unsanitised; the site now tells the browser to run only its own inline scripts, each allowed by its SHA-256 hash,
  and to load only embedded images and fonts, with no request, frame or form. A script, an inline event handler, a
  `javascript:` link, an iframe or an external image written in a page no longer runs or loads; a page that relied
  on an embedded iframe or an external image must embed it differently. `doc-kit dev` allows its live-reload client.

- **`check secrets` reads more** (AUDIT.md S11): the attribute values of the site's HTML (`href`, `title`, `alt`,
  `data-*`…), which it used to drop with the tags; the translations folder; and the zone files of every language
  (`<images>/<lang>/zones`), not only the source's.

- **The session file is private from its first byte** (AUDIT.md S10). It used to be written, then made readable by
  its owner only; for a moment, and on a failure of that second step, others could read it. It is now created with
  mode 0600 and replaces an older file in a single rename. SECURITY.md says what Windows does instead, and that a
  session file outside `.doc-kit/` gets no `.gitignore`.

- **Masking reaches more of the page** (AUDIT.md S6). Before, a sensitive value stayed visible in a screenshot when
  it was in an iframe, in a shadow root, in an `alt` or `aria-label` attribute, split across several elements, or
  generated by CSS. The kit now masks every frame and every open shadow root, those attributes, a value split
  across elements (the smallest element holding it is masked whole) and the `content` of `::before`/`::after`.
  A closed shadow root, and text drawn in an image or a canvas, remain out of reach: SECURITY.md says so.

- A mask target that matches nothing stops its capture (`cli.capture.error.maskMissing`): what it should hide is
  never shown. Masking also runs again just before the shot.

Fixes from the audit of 2026-10-03 (AUDIT.md §3), each guarded by a test in `test/unit/security.test.mjs` so that it
cannot come back (RULES.md).

- **ReDoS** in the private key detector of `check secrets` and `facts`: a `BEGIN PRIVATE KEY` line followed by
  blank lines made the scan exponential (over a minute for 24 lines). The expression is linear again, and every
  scanner of untrusted text now runs under a time budget on adversarial input, in a worker that names any check
  that hangs.
- **Redirects to forbidden routes**: a navigation of the application is fetched without following redirects and its
  chain checked before the browser follows it; a forbidden route is no longer requested through a server redirect.
  `capture.forbidden` also matches the percent-decoded, doubled-slash and trailing-slash forms of a path.
- **git option injection**: a reference from `sync.json` (`app.commit`) or `sync --since` is checked
  (`isSafeRef`) and passed after `--end-of-options`; `--since -x` is a usage error (exit code 2).
- **Untrusted repositories**: git runs with hardened options and is refused, with a warning
  (`cli.git.unsafeConfig`), in a repository whose configuration names a program; binaries are resolved on the
  `PATH` only, never in the folder read.
- **`export`** leaves out every `.doc-kit/` folder, the session file wherever `<PREFIX>_SESSION` puts it, any JSON
  browser session, keys, certificates and tool credentials.
- **`doc-kit dev`** refuses a request whose `Host` is not the server itself (DNS rebinding).
- `facts --tools` passes `--redact` to gitleaks.
- Site: a zone bubble opened with Enter no longer closes when focusing the zone scrolled the page; the bubble now
  follows its target on scroll and closes only when the target leaves the window.
- The kit's CI runs in `.github/workflows/ci.yml` (tests on three systems, security rules, `npm audit`); the CI
  examples pin actions by commit and install without scripts.

Fixes for the frictions found by a pilot run on a real application with a separate front end and no screenshots, and
the first lot of the spaces (one source, one site per audience).

### Added

- **`capture.sessionRefresh`** (ARCHITECTURE.md §6.3a): the only declared exception to the read-only lock, for a
  short-lived session that renews itself through a `POST`. `{ method?: "POST", path, json?, reason }`, `reason` at
  least 20 characters (the application owner's written decision that the endpoint writes nothing else); default
  `null`. Before each session-based `capture` run, and only then, `refreshSession` (`engine/capture/session.mjs`)
  sends this one request outside any page and writes the response's cookies back to the session file; every
  request a page itself makes still stays `GET`/`HEAD`/`OPTIONS`. A failure is a warning
  (`cli.capture.sessionRefreshFailed`), not fatal: the session check that follows decides. Success prints
  `cli.capture.sessionRefreshed` before the captures start.
- **Spaces** (ARCHITECTURE.md §6.1a): `content/toc.json` may declare `spaces` (`"business"`, `"takeover"`, or objects
  `{ id, title, shortTitle, subtitle, icon, for }`); every section then names its `space`, a page or a journey may name
  another one. `business` and `takeover` have default texts in English and French and a default icon. The build
  checks the declaration (`space.missing`, `space.unknown`, `space.undeclared`, `space.duplicate`, `space.title`: errors
  that stop even a draft build; `space.empty`: a warning).
- **Space selector in the site**: "Everything" and one button per space in the top bar (`aria-pressed`; at the head of
  the side menu below 1080 px); `#/@<id>` opens the home page of a space; the current space is remembered
  (`<theme key>.space`) and follows the page shown. With a space current, the top and side menus, previous / next,
  the home page doors and journeys, the search suggestions and the full print show that space only; the search lists
  its results first, then "In {space} (n)" for the others. The home page shows one door per space in "everything"
  mode, a "You are reading" strip otherwise; a page shows a space badge, and its breadcrumb starts with the space.
- **One file per space**: `build` also writes, for each space, an export from which the other spaces are physically
  removed (pages, sections, search entries, journey steps counted as "+ n steps in another part of the
  documentation", images; statistics recounted); a link to another space becomes its text followed by "(see the
  {space} documentation)" (warning `space.excludedLinks`). New configuration key `spaces: { export, output }`
  (`output` must contain `{space}`, key `spaceOutput`); default: the output with `-<space>` before its extension.
- **`--space <id>`** for `build` (that export alone; `--output` then names it), `view` and `open`; an unknown id
  (with the closest one) or no space declared is a usage error (exit code 2). `build --json` adds
  `sites: [{ space, output, stats, excludedLinks }]`. `dev` serves each export at `/space/<id>` too, and
  `export --with-dist` copies the exports wherever they are written.
- **`counterpart`** on a page (`"<page id>[~anchor]"`, with or without spaces): one line under the page badges,
  "Same topic, for {space}: {title} →" or "Related: {title} →"; checked like an internal link (`link.counterpart`,
  `link.anchor`), also by `check links`; removed from an export that does not hold its target.
- **Audit by space**: with a `takeover` space, the takeover pages are the pages of that space; with spaces, `audit.md`
  shows a table "Level by space" and `audit.json` carries `spaces: [{ id, title, pages, level, indicators, criteria }]`
  (page indicators measured on the pages of the space, `written2`, `takeover4` and `proofs4` n/a where they do not
  apply).
- Legacy French keys `espaces`, `espace` and `pendant` are read as `spaces`, `space` and `counterpart`.
- New i18n fragment `i18n/<language>/spaces.json`.

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
- **Business space** (ARCHITECTURE.md §6.8): five page types (`feature`, `business-rules`, `roles-matrix`, `process`,
  `release-notes`), templates and examples in English and French. `:::rule{id title}` (`:::regle`) defines a
  business rule once, rendered as an `h3` so it is in the page outline, the search index and a link target;
  `[[feature …]]` (`[[fonctionnalite …]]`) and `[[rule …]]` (`[[regle …]]`) cite a feature sheet or a rule as a link
  chip; `::features{}`, `::rules{}` and `::roles{}` (`::fonctionnalites{}`, `::regles{}`) generate their tables.
  Citations and the generated tables are resolved once every page has rendered (`engine/build/business.mjs`), so a
  rule may be defined on a page further down the table of contents than the page that cites it. A page declares its
  feature id with the `feature` field of `content/toc.json` (`feature.template`, `feature.duplicate`,
  `feature.noId`, `feature.unknown`, `rule.duplicate`, `rule.attributes`, `rule.unknown`); a business page that
  cites a `file:line` proof gets the warning `business.technical`.
- **Glossary `technical`** (§6.8): an entry may carry `technical` (where the term lives in the code), shown in its
  tooltip when the project has no spaces, or the current space is `takeover` or "everything"; dropped from the
  exports other than `takeover`.
- **`doc-kit inventory --features [--write] [--force]`**: groups what the coverage adapters see into candidate
  features (by the first static segment of a route, an API route or an i18n key), each with a suggested id, its
  routes, API routes and keys, and the sheet that already cites it, if any; `--write` writes `features.json`
  (refused when it exists, exit code 1, unless `--force`, which keeps the existing ids and appends the new
  candidates).
- **Coverage adapters `openapi`** (an OpenAPI 3 or Swagger 2 document, JSON only; a `.yaml`/`.yml` file answers
  `reason: "yaml"`) **and `features`** (the entries of `features.json`).
- New i18n fragment `i18n/<language>/business.json`.
- **Takeover space** (ARCHITECTURE.md §6.9): ten page types for the team that takes an application over
  (`access-ownership`, `api-surface`, `runbook`, `data-model`, `dependencies`, `code-map`, `tests-quality`,
  `agent-instructions`, `adr`, `threat-model`), templates and examples in English and French, and `findings`
  becomes a risk register (a combined "Follow-up" column: owner, decision, status, due date).
- **`doc-kit facts [--source <name>]… [--network] [--tools] [--json]`**: reads the application's code (`app.dir`)
  and writes one file per source into `paths.facts` (`facts/<source>.json`, default folder `facts`), never into the
  application: `dependencies` (every package.json, package-lock.json v2/v3, pnpm-lock.yaml, yarn.lock v1 and
  berry, requirements*.txt, poetry.lock and pyproject.toml found under the application, searched recursively, at
  most 4 folders deep — a separate front end and API, each with its own manifest, is the usual case; each manifest
  is read on its own, so the same package named by two manifests gives two items, de-duplicated by name for
  coverage), `env` (names read by the code and by an example env file, never a value; besides the literal
  `process.env`/`os.environ` forms, also a Node destructuring read, `const { X, Y } = process.env`, and a
  pydantic settings class, `BaseSettings` v1 or v2, with its `env_prefix` and the `alias`/`validation_alias`/`env`
  overrides), `api` (Next.js App Router route handlers, `pages/api`, FastAPI with `APIRouter`/`include_router`
  prefix composition, Express), `db` (Prisma, SQLAlchemy, SQL migrations with row-level security and policies),
  `agents` (AGENTS.md and the other instruction files, their size, and any hidden Unicode character), `secrets`
  (file and rule only, never the value) and `tests` (a rough count per file, and a coverage report when one
  exists). `--network` adds, for `dependencies`, whether each direct package exists in its registry (the name
  only); `--tools` also runs `gitleaks` (scrubbed of `Secret`/`Match`), `osv-scanner`, `syft` and `knip` when they
  are on the PATH, each into `facts/tool-<name>.json`. Same code, same application: the same file, `generated`
  aside. Exit code 2 without `app.dir` (`facts.noApp`).
- **`::facts{source="…" columns="…"}`** (`::faits{… colonnes="…"}`): a table built from a facts file at build time,
  with a caption giving the generation date and the application's commit; an unknown source or column fails a
  strict build (`facts.missing`, `facts.column`).
- **Claim badges `[[verified]]`, `[[deduced]]`, `[[unknown]]`** (`[[verifie]]`, `[[deduit]]`, `[[inconnu]]`), with
  or without a `file:line` proof.
- **Coverage adapters `fastapi`** (one item per route handler, sharing the parsers of `engine/facts/api.mjs`) **and
  `facts`** (one item per fact of a source that is worth citing: `env`, `api`, `db`, the direct `dependencies`, or
  `agents`; `{ available: false, reason: "noFacts" }` when the file is missing); **`next-app-router` gains the
  `api` option** (a second family of route handlers, no change when it is left out).
- **`audit`**: two informative indicators, never part of a criterion — `facts` (`{ files, stale }`: a facts file is
  stale when its `commit` differs from the application's current HEAD) and `claims` (verified, deduced and unknown
  claims tallied on the written takeover pages, with the verified ratio); shown in `audit.md` under "Facts and
  claims" when there is something to show, and always in `audit.json`.
- `paths.facts` (default `"facts"`).
- New i18n fragment `i18n/<language>/takeover.json`.
- **Agent economy** (ARCHITECTURE.md §6.11): three Claude Code agent types (`skill/doc-kit/agents/*.md`) —
  `doc-kit-triage` (`haiku`, read-only), `doc-kit-writer` (`sonnet`, reads and writes), `doc-kit-reviewer`
  (`opus`, read-only) — installed by `skill install` into `<skills folder>/../agents/` and reported by `doctor`
  like the skill (current, missing, outdated, modified). Every brief template now starts with a front matter
  line `agent: <type>` and is split in two: a common part first (rules, safety, syntax, standard — identical
  byte for byte whatever the variables, so a wave's agents share their prompt cache) and a variable part last
  (batch, pages, paths); new briefs `triage` and `update` (English and French), built on `doc-kit context
  <page> --update` and `.doc-kit/sync-report.json`. `brief.mjs` reports the agent type to launch with, and
  `--estimate` gives input tokens (the brief and the files it cites, characters ÷ 4) and output tokens (1.4 per
  word of a new page's `maxWords`, 0.3 for an update), with the cost when `llm.prices` is set. New
  `skill/doc-kit/scripts/usage.mjs` (`log`, `report [--json]`, `scan --transcripts <folder>`, tolerant of
  anything but `message.usage`) measures what the agents actually consumed and compares it with a fresh
  estimate. The context file's header also gives the product (`product.name`) and the documented version
  (`readProjectVersion`). `writing-batch` and `update` rewritten to a **sober method**: the context file and the
  page's own template only, at most 3 extra targeted reads per page for a writer (1 for an update), the page
  written once, one `build --draft` per batch, `view` only with screenshots — an agent over this step budget
  stops and reports instead of exploring. Measured on a real application (FastAPI + Next.js, 81 pages, nine
  admin pages): −69 % cost, −49 % duration, 47 → 21 round-trips versus the previous brief, same conformance
  (details: `references/agent-orchestration.md` §8 of the skill, `docs/*/content/skill/cost-and-speed.md`).
- **`doc-kit sync [--since <ref>] [--apply [--labels]] [--mark <page…> | --all] [--sources <file[:lines]…>]
  [--date YYYY-MM-DD] [--check] [--estimate]`** (ARCHITECTURE.md §6.10): what the documentation must follow
  after a change of the application. `--mark`/`--all` record, in `sync.json` (`paths.sync`, default the project
  root), each page's dependencies — the files behind its `routes` (derived for `next-app-router`, `react-router`,
  `fastapi` and `glob` without changing the adapters, `engine/sync/routes.mjs`), the local import closure of
  those files (`engine/sync/imports.mjs`: relative paths, `tsconfig`/`jsconfig` `paths` aliases, Python relative
  and absolute imports; bounded to 3 levels and 200 files), its `file:line` proofs, its captures, its `::facts`
  tables, its `counterpart` and its declared `sources` (new optional page field) or `--sources`. The report
  (default; writes `.doc-kit/sync.md`, `.doc-kit/sync-report.json`, one `.doc-kit/sync/<page>.diff` per page)
  compares this reference with the application now, or with a git commit (`--since`, read only): proofs moved or
  broken, labels whose value changed (`sync.labels`, or the `messages` of the `i18n-registry` adapters), pages to
  review by priority (`direct`, `shared`, `probablyIntact` — a shared file changed but its diff touches nothing
  the page names), stale screenshots, new or removed coverage elements, and pages never marked. `--apply` rewrites
  a moved proof's `file:line` and, with `--labels`, a changed label — only inside `**bold**`, code spans,
  `[[menu …]]` badges and quotes — then restamps the pages left unchanged; `--check` gives CI a gate (exit code 1
  on anything but `unchanged`/`unmarked`); `--estimate` prices the pages to review (`llm.prices`). A marked page's
  footer shows "Checked against version {version} on {date}" (`ui.footer.verified`); `audit` gains the
  informative `upToDatePages` indicator; the guided mode offers `sync` before the menu when `sync.json`'s
  `app.version` differs from the documented one. New configuration keys `paths.sync`, `sync: { labels }`,
  `capture.compareThreshold` and `llm: { currency, prices }` (read by `--estimate`); new i18n fragment
  `i18n/<language>/sync.json`.
- **Skill**: `SKILL.md` reorganised around the business and takeover spaces, the `facts` → `sync` → `triage` →
  `update` maintenance cycle, and the economy of the agents (ARCHITECTURE.md §8, §6.11); new briefs
  `functional-spec` (feature sheets, business rules, roles matrix, process; `doc-kit-writer`), `code-health`
  (the takeover dossier's `api-surface`, `dependencies`, `agent-instructions`, `tests-quality` and
  `threat-model` from `doc-kit facts`; `doc-kit-reviewer`), `access-ownership` (who owns what, and the
  questions for the owner; `doc-kit-writer`) and `system-dossier` (`runbook`, `data-model`, `code-map` and
  `adr` — install/build/deploy/rollback commands checked in the repository, the data model from
  `new --prefill` and `facts/db.json`, a C4-style code map, reconstructed ADRs; `doc-kit-writer`), in English
  and French, with the same byte-identical common part guarantee as the existing briefs; `writing-batch`,
  `journey`, `troubleshooting` and `production-technical` now prepare each page with `doc-kit context <page>`
  instead of the whole inventory and end it with `sync --mark <page> --sources …`.
  `references/pitfalls.md` gains a "Vibe-coded applications" section (missing or client-only access control,
  no row-level security, secrets, slopsquatting, duplicated code, misleading tests, agent instructions as a
  hidden specification, outdated dependencies, no account owner); `references/templates.md` documents the 28
  page types; `references/method.md` details both spaces, the full takeover dossier and the update cycle. New
  computed brief placeholders `{{featuresFile}}` and `{{factsDir}}`.
- **Documentation**: five new guides, in English and French, as a new "Spaces" section (`spaces/overview`,
  `spaces/business`, `spaces/takeover`) plus `publish/sync` ("Keeping up with the application") and
  `skill/cost-and-speed`; `write/page-templates`, `method/standard`, `faq/questions`,
  `faq/troubleshooting/build` and `skill/phases` updated for the 28 page types, the two spaces and the agent
  economy; 8 new glossary terms (space, space export, feature sheet, business rule, fact, verified claim, sync
  reference, context folder). `start/first-five-minutes` now describes the real two-space skeleton (27 files,
  the sample `features/example-feature` and its technical `counterpart`); `publish/audit` documents
  `upToDatePages`, "Level by space" and the informative `facts`/`claims` section; `publish/checks` documents the
  `openapi`, `features`, `facts` and `fastapi` coverage adapters, `next-app-router`'s `api` option, and the
  build-time gates specific to spaces and the business/takeover types (`space.*`, `feature.*`, `rule.*`,
  `facts.*`, `business.technical`, `link.counterpart`); `reference/adapters` gained the missing `api`/`apiFamily`
  options of `next-app-router`.
- **Standard and skeleton**: `structure` rewritten around the two spaces (Business: Use, Features, Administer,
  Process; Takeover: Understand, Operate, Secure, Risks, Maintain), which page type belongs where, `counterpart`,
  Diátaxis ("one page, one reader"), and when a project keeps a single space; `templates` documents the 15 new
  types alongside the 13 original ones; `writing` adds the `F-xx`/`BR-xx` (`RG-xx` in French) identifiers, the
  access box, one rule as one statement plus a Given/When/Then example, "no code in the Business space", the
  `[[verified]]`/`[[deduced]]`/`[[unknown]]` claim badges and the risk register (owner, decision, status, due
  date); `maturity` documents the level by space, `facts` and `claims` as informative measures, and
  `upToDatePages` as a new level-4 criterion (met, `n/a`, without `sync.json`); `quality` lists the `feature.*`,
  `rule.*`, `business.technical`, `facts.*`, `space.*` and `link.counterpart` problems; `delivery` adds
  `sync --mark --all` and the per-space exports to the handover checklist; `config` shows fictional examples of
  `spaces`, `paths.facts`, `paths.sync`, `sync.labels`, `capture.compareThreshold` and `llm`. `doc-kit audit`:
  `upToDatePages` (ARCHITECTURE.md §6.10) is now measured as a level-4 criterion (`upToDatePages4`, `≥ 90 %` or
  `n/a` without `sync.json`), in the global level and in each space's. The `init` skeleton now declares
  `"spaces": ["business", "takeover"]`, adds a `features` part with a sample `feature` sheet (its `counterpart`
  a new `technical-sub` page under the architecture overview) and, to the Takeover space, sample
  `access-ownership`, `runbook` and `agent-instructions` pages; the findings page's guidance now describes the
  risk register; `README.md` and `WRITING-GUIDE.md` explain the two spaces and the `facts` → `sync` cycle.
- **Demo**: `examples/demo-docs` now declares both spaces (Business: `F-01`/`F-02` feature sheets, a
  `business-rules` registry, a `roles-matrix`; Takeover: `access-ownership`, `api-surface`, `findings`, a
  `counterpart` between a feature sheet and its technical page), with its own `facts/` and `sync.json` committed.
  `examples/demo-app-v2` is a second version of the demo app (a renamed label, a modified screen, an added
  route) that drives a new end-to-end test of the full update cycle (`sync` report, `--apply --labels`,
  `capture --stale --compare`, `--mark`, `--check`).
- **Reviews** (§6.13): two optional takeover page types, `security-review` and `maintainability-review`, each
  built from deterministic facts first. The `api` source now also reports `auth` (`none`/`user`/`role`/`unknown`)
  and `guards` for every route, classified against `review.guards.role`/`.user` (default patterns, overridable).
  New source `security` (eleven OWASP Top 10 heuristics: `rule`, `file`, `line`, `severity`, `owasp` — never a
  value) and `quality` (functions, complexity, duplication, TODOs per file; A-to-E ratings and tooling found,
  project-wide); `facts --tools` also runs `semgrep` when `review.semgrep` names a local rules folder (never
  `--config auto`). New command `doc-kit probe [--as <role>]… [--json]`: a safety-checked GET/HEAD-only check of
  a running LOCAL or DEMO instance (never production, no option overrides it) — security headers, cookies, CORS
  and version disclosure on `/` and one API route, then the access control of every `GET` route against its
  `auth` (`probe.unprotected`, `probe.publicData`); at most 4 requests a second, a response body never stored;
  writes `facts/probe.json`. `connect --as <role>` saves a role's session separately
  (`.doc-kit/session-<role>.json`) for `probe` to use, leaving the plain session file untouched. New
  configuration key `review: { guards: { role, user }, params, semgrep }` (`params`: path parameter → example
  value, for `probe` to fill a parameterised route). New briefs `security-review` (`doc-kit-reviewer`) and
  `maintainability-review` (`doc-kit-writer`); their findings are candidates for the risk register. New guide
  "Security and maintainability reviews" (`spaces/reviews`), the `review.*` configuration keys, and the `probe`/
  `connect --as` CLI reference, in English and French; two new Acme Orders examples.
- **Languages** (§6.12): one source, several languages in a single multilingual site (a language selector,
  `#/[<lang>/]<path>`), or `build --lang <l>` for a mono-language file; `languages` + `paths.translations` +
  `capture.languages`; `doc-kit translate status|--mark|--fix-anchors`, `context <page> --translate <lang>`,
  `capture --lang <l>`, `init --languages`; new brief `translate`.

### Changed

- A project that declares neither spaces nor counterparts keeps the same site data and the same visible text
  (equivalence levels 1 to 3): the texts and site data of the spaces are only emitted when used. The home page doors
  fill the width (`auto-fit`) instead of a fixed grid of 4 columns.
- `build()` returns `sites` (`[]` without spaces); the Markdown engine reports what each rendered document uses
  (screenshots, diagrams, legend items), so that an export recounts its statistics.
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
