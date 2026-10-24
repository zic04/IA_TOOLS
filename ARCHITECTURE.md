# doc-kit — architecture and interface contract

This file is the **contract** shared by everyone who works on the kit, whether people or agents.
Any change to an interface described here goes first into this file, then into the code, then into `CHANGELOG.md`.

## 0. Principles

- **Product-neutral and open source (MIT).** The kit contains no information about any particular application, company or customer: no product names, no business terms, no internal URLs, no brand colours.
  - Examples, fixtures and documentation use a **fictional product** ("Acme Orders"), and the demo app is shipped in `examples/`.
  - Anything specific to one application lives in **that application's** documentation folder, in its `doc.config.mjs`.
- **The name is defined once.** `doc-kit` is provisional. The product name, command name and package name come from `engine/brand.mjs` and from `package.json`. No other file may hard-code them in prose, except the README files and the documentation.
- **English code, two documentation languages.** Code, identifiers, comments, configuration keys and CLI options are in English.
  - Every user-facing string (generated site, CLI messages, templates) goes through i18n, in English (`en`) and French (`fr`).
  - The documentation of the kit exists in both languages.
- **Shared engine.** A project keeps only its content. It depends on the kit through `"doc-kit": "file:<relative path to the kit>"`, which on Windows is a directory junction.
  - `doc-kit export` produces a **self-contained** copy of a project: engine vendored, no kit needed.
- **Location.** The kit is its own repository. Nothing in the kit may depend on where it sits on disk.
- **Few dependencies.** Only two runtime dependencies: `marked` 18.0.14 and `playwright` 1.64.0.
  - Validation is home-made, a subset of JSON Schema.
  - Tests use `node:test`.
- **Runs everywhere.** Node ≥ 20 on Windows, macOS and Linux.
  - Paths may contain spaces: use `pathToFileURL` for every dynamic `import()`, and never build `file://` URLs by hand.
- **Never in tests or examples:** a commit or destructive git command, access to any real application, a real secret.

## 1. Repository layout

```
doc-kit/
├─ package.json          name "doc-kit" (provisional), bin { "doc-kit": "cli/doc-kit.mjs" }, exports (§1.1), engines node ≥ 20
├─ README.md (en) · README.fr.md · CHANGELOG.md · ARCHITECTURE.md · LICENSE (MIT)
├─ CONTRIBUTING.md · CODE_OF_CONDUCT.md · SECURITY.md
├─ cli/doc-kit.mjs       dispatcher (node:util parseArgs) → cli/commands/<command>.mjs; no command = guided mode (§4.1)
├─ cli/common.mjs        shared helpers of the commands: context, messages, prompts
├─ engine/
│  ├─ brand.mjs          product name, command name, site generator tag
│  ├─ project/           find.mjs, load.mjs, validate.mjs, defaults.mjs, env.mjs, toc.mjs, semver.mjs, browser.mjs
│  ├─ core/              shared by the folders below (no folder cycle, RULES.md M14): hash.mjs, text.mjs,
│  │                     page-templates.mjs (required sections of §6.4), translations.mjs (translated files, §6.12),
│  │                     behaviours.mjs (kinds of behaviour, cards and scenarios read, §6.8a), adapters.mjs and
│  │                     adapters-matrix.mjs (what the kit reads: standard/adapters.json, §5), glob.mjs, xml.mjs (the
│  │                     bounded XML reader of the sources and of the dependency manifests)
│  ├─ build/             build.mjs (pure functions), markdown.mjs (extensions), markdown-product.mjs and behaviours.mjs
│  │                     (rules, stories, behaviour cards, scenarios, §6.8a), fact-directives.mjs (the directives
│  │                     drawn from the facts: ::facts, ::erd, ::changes, the developer views), search.mjs,
│  │                     assemble.mjs, languages.mjs (§6.12), spaces.mjs (§6.1a)
│  ├─ capture/           capture.mjs, targets.mjs, actions.mjs, masking.mjs, webp.mjs, plans.mjs, session.mjs (adapters)
│  ├─ check/             coverage.mjs, links.mjs, tables.mjs, images.mjs, secrets.mjs (detectors, and the filter
│  │                     withoutSecrets of every file written for people or agents)
│  ├─ facts/             one module per source of `doc-kit facts` (§6.9), listed by registry.mjs; stacks.mjs (the stack
│  │                     adapters of a run, §5), code-files.mjs (the files the readers of code are given), api.mjs
│  │                     (sources api and screens), languages.mjs (source stack); deps/ (the manifests of npm,
│  │                     Python, Maven and Gradle, NuGet, Composer, Go, Bundler, Cargo); network.mjs (the only network
│  │                     gateway, RULES.md S12) and declarations.mjs (where a private registry or index is declared);
│  │                     freshness.mjs (stale facts files); tools.mjs (--tools)
│  ├─ inputs/            the sources (§6.19): model.mjs (inputs.json), repos.mjs (the only git commands that write,
│  │                     RULES.md S2), ingest.mjs, status.mjs, and the bounded readers zip.mjs, docx.mjs,
│  │                     diagrams.mjs, pdf.mjs (and core/xml.mjs), reconcile.mjs (the DAT and the code,
│  │                     standard/technologies.json)
│  ├─ backlog/           the backlog export (§6.8b): model.mjs (the items), index.mjs (the exporters), one module per
│  │                     tool (azure, jira, gitlab, github, json), csv.mjs, markup.mjs (inert HTML, wiki, Markdown)
│  ├─ audit/             audit.mjs (indicators), criteria.mjs (criteria, level), actions.mjs, thresholds.mjs,
│  │                     takeover.mjs, depth.mjs (the depth of the feature sheets), report.mjs (audit.md,
│  │                     audit.json), optional.mjs (measures that may be "not measured")
│  ├─ dev/               server.mjs (watch, rebuild, live reload via SSE), client.js, environment.mjs (shared by dev,
│  │                     doctor, init and the guided mode), zip.mjs (export --zip), skeleton.mjs (the skeleton
│  │                     `init` writes, cut to the spaces chosen, §2.1)
│  ├─ site/              template.html, app.js, style.css, icons.mjs, default-logo.svg, lib/ (the modules of app.js:
│  │                     compare.js, board.js, search-core.js, topics.js; spliced in by site-script.mjs)
│  ├─ theme/             default-tokens.json, tokens.mjs, contrast.mjs
│  ├─ i18n.mjs           dictionary loading and merging, t(key, vars), plurals
│  └─ migrations/        runner.mjs, <version>.mjs (used by upgrade)
├─ i18n/                 en.json, fr.json, and fragments <language>/{capture,audit,ux,help,spaces}.json (§6.5)
├─ adapters/coverage/    next-app-router.mjs, react-router.mjs, i18n-registry.mjs, glob.mjs, openapi.mjs, features.mjs (§6.8),
│                        fastapi.mjs, facts.mjs (§6.9)
├─ adapters/auth/        manual.mjs (default), none.mjs, nextauth.mjs, api-me.mjs
├─ adapters/stack/       next.mjs, express.mjs, fastapi.mjs (the routes, guards, screens and hints of a framework, §5)
├─ schemas/              config, toc, glossary, zones, capture-plan, spaces, bricks, inputs, backlog, technologies,
│                        behaviour-analysis (.schema.json)
├─ templates/project/    common/, en/, fr/ (skeleton written by `init`)
├─ templates/pages/      en/, fr/ (one Markdown template per page type, §7)
├─ standard/             quality standard, in en and fr (§7)
├─ docs/                 the kit's own documentation, itself a doc-kit project (en + fr)
├─ examples/
│  ├─ demo-app/          tiny fictional web app (static, fake sign-in), to try the full flow in minutes
│  └─ demo-docs/         its documentation project (config, plans, pages), also used by the tests
├─ skill/doc-kit/        Claude Code skill: SKILL.md, references/, assets/, scripts/
├─ test/                 unit/, snapshot/, e2e/, tools/{equivalence,fixed-date,diff-html}.mjs
└─ ci/                   github-actions.yml, azure-pipelines.yml (examples)
```

### 1.1 Package exports

- `doc-kit` → `engine/build/build.mjs`: the build, as pure functions.
- `doc-kit/targets` → `engine/capture/targets.mjs`: helpers for capture plans (`field`, `toggle`, `card`, `button`, `link`, `tab`, `main`, `union`). `union(a, b, …)` returns `{ union: [a, b, …] }`, one zone over the bounding box of several targets (§6.3).
- `doc-kit/config` → `engine/project/defaults.mjs`: `defineConfig(c) => c`, for editor autocompletion.
- `doc-kit/package.json`.

## 2. A documentation project

### 2.1 What `init` creates

`doc-kit init <app-dir>` creates `<app-dir>/docs/manual/`. The folder name can be changed with `--dir`. `<app-dir>` (default: the current folder) is the **application root**; the front end may sit in a sub-folder (`frontend`, `front`, `web`, `client`, `ui`, `app`, `apps/web`).
- It detects the framework (`next` with `app/` or `src/app/` → `next-app-router`; `react-router`), a Python back end, the dev script's port, the product name, the version file and the `.env` files, then asks for the product name, the language, the application URL, where the screenshots are taken (the capture target), the sign-in method and the spaces, shows the recap and confirms.
- `--name`, `--lang`, `--url`, `--framework next|react-router|none`, `--auth`, `--capture app|none`, `--target local|demo|production` and `--spaces <id,…>|none` answer in advance; `--yes` takes the detected values and the options without any question (required without a terminal). With `--yes`, the site language is `--lang`, else the system language (`LC_ALL`, `LC_MESSAGES`, `LANG`), else English.
- **Capture target** (`capture.target`, §3). The question "Where will the screenshots be taken?" offers 1. local or demo application, 2. production, read-only, 3. no screenshots (`capture.mode: "none"`).
  - Choice 1 writes `local` when the URL is a loopback address (`localhost`, `*.localhost`, `127.x`, `[::1]`), else `demo`. `--capture app` removes choice 3; `--target` or `--capture none` skip the question; `--target` together with `--capture none` is a usage error (exit code 2).
  - **Production**: the production URL is asked (default: the URL already answered, unless it is a loopback address; with `--target production`, it replaces the URL question), then the safety reminders are printed: read-only blocks the browser's writes but **not** a write made by the server while it renders a page (list such routes in `capture.forbidden`); the session file is a secret; the screenshots show real data (the owner's written decision). `capture.target: "production"` and `capture.readOnly: true` are written.
  - With `--yes`, `--target production` requires `--url` (exit code 2 otherwise) and the reminders are printed too.
- **Follow-up**, only in interactive mode with screenshots (never with `--yes`, `--json` or without a terminal): once the files are written,
  - "Open the browser now to sign in? (Y/n)" (not asked with `auth: none`): `npm install` in the project when the kit is not linked yet, then `connect` (visible browser: the person signs in, then presses Enter);
  - then "Take a first test screenshot with --preview? (Y/n)" (the question names production when it is the target): `capture --preview --yes` on the example plan;
  - a step that fails stops the follow-up, its message is printed and its exit code becomes `init`'s; closing the input at these questions counts as "no" (the project is written);
  - the next steps printed at the end leave out what was done. The tests replace these steps through the context (`steps` of `createContext`, §4): no npm, no browser.
- **Product name**: `--name`; else the `title` of the `metadata` exported by the Next.js root layout of the front end (`app/layout.*` or `src/app/layout.*`, a string or `{ default }`); else `productName`, `displayName` or `name` of the front end's `package.json`, without its scope and without a `-frontend`, `-front`, `-web`, `-ui`, `-client` or `-app` suffix; a generic name (`frontend`, `web`, `app`…) gives way to the root `package.json`, then to the folder name. Renaming afterwards: `product.name` in `doc.config.mjs` (the slug and the output follow unless they are set) and the `title`, `tagline`, section titles and journey titles of `content/toc.json`.
- **Version** (`version.file`, `version.pattern`): `version.txt` or `VERSION` at the application root, else the root `package.json` when it has a `version`, else the front end's `package.json`, else the `pyproject.toml` of a Python-only application.
- **Masking files** (`masking.env`): `.env` and `.env.local` at the application root and in the front-end folder, only the files that exist (never `*.example`).
- **Application folder** (`app.dir`): the application root, relative to the documentation project.
- **Recap.** Before writing anything, with or without `--yes`, `init` prints what it is about to write: folder, product name (and where it was found), slug, language, URL, version (and the file it is read in), capture mode, capture target (with screenshots), sign-in, spaces, coverage adapter and source, masking files, application folder, and where to rename the product afterwards. Without `--yes`, a confirmation follows.
- It writes `templates/project/common/` then `templates/project/<language>/`, variables filled; every `.md` file goes through the capture variants (§6.4), and `captures/plans/example.mjs` is only written in capture mode `app`. The skeleton's `kit` range is set to accept the installed kit. A non-empty target folder is refused (exit code 1). The writing is `engine/dev/skeleton.mjs` (`writeSkeleton`).
- **Spaces** (§6.1a). The skeleton holds the four standard spaces, each with its sections and its journey (`space` set: "I use…", "I specify a feature", "I administer…", "I take the project over"). The question "Who is the documentation for?" offers 1. the four (default), 2. `use, product` (users and product owners, no code), 3. `admin, develop` (a takeover), 4. `use` alone, 5. none; `--spaces` takes `none` or any ids of the four, each once, comma-separated (put in the skeleton's order; anything else: `init.spacesInvalid`, exit code 2, nothing written). The spaces left out lose their sections and the files of their pages (and their folders left empty); the counterparts, journey steps and suggestions that named those pages go, and a journey of a space left out, or left without a step, goes too (`tailorToc`, pure). The operating part of Administer (section `operate`/`exploiter`: production setup, access and ownership, runbook) goes to Develop when Develop is kept without Administer. `none`: the same pages, without `spaces` and without any `space` (one documentation for everyone). `content/toc.json` is rewritten laid out as the template is (Prettier at 120 columns: `jsonText`). The example capture plan stays: without Use, no page cites its capture (`home`) until one does. The JSON output has `spaces` (`[]` for none).
- **Capture mode `none`** (`--capture none`, or the answer to the question): `capture.mode: "none"` in the configuration, no example capture plan, starter pages that describe each screen with a table (`| Element | What it shows |`) instead of a `:::screen`, a home page without the "interactive screens" callout, `package.json` scripts without `doc-kit capture`, no sign-in question, and next steps without `connect` and `capture`.
- The example routes of the skeleton are fictional (`/example/…`, `/exemple/…`), so that they never match a route of the application.

```
doc.config.mjs · package.json · .gitignore · README.md · WRITING-GUIDE.md
content/   toc.json, glossary.json, home.md, <section>/index.md, <page-id>.md
captures/  plans/*.mjs, targets.mjs, [setup.mjs, fixtures/]
images/    <id>.webp, zones/<id>.json
diagrams/  *.svg
theme/     logo.svg, [extra.css]
adapters/  [project-specific adapters]
dist/      (git-ignored)    .doc-kit/ (git-ignored: session, zone previews, audit reports, briefs, work files)
```

Folder names can be overridden in the configuration (`paths`). This is how older projects that use `contenu/` and `schemas/` keep working.

### 2.2 Finding the project

The project is the folder given by `--project <dir>`. Without it, the CLI looks for `doc.config.mjs` in the current folder and then in each parent folder. The kit is located from the CLI's `import.meta.url`.

### 2.3 The intended first five minutes

```
npm install -g <kit folder>     (or: npx --prefix <kit folder> doc-kit)
doc-kit init ../my-app          detects the framework, asks for the product name, language, app URL, where the
                                screenshots are taken (local or demo, production read-only, none) and the sign-in method;
                                then offers to open the browser (connect) and to take a first test screenshot
doc-kit connect                 opens Chromium on the app; you sign in (SSO and MFA work); press Enter to save the session
doc-kit capture                 takes the example capture, read-only
doc-kit dev                     opens the site with live reload
```

Running `doc-kit` with no command starts the **guided mode** (§4.1): it detects where you are, suggests the next step, and runs it once you confirm.

## 3. `doc.config.mjs`

```js
import { defineConfig } from "doc-kit/config";
export default defineConfig({
  kit: "^0.4.0",                                    // accepted kit version range (otherwise exit code 3)
  product: { name: "Acme Orders", slug: "acme-orders" },
  language: "en",                                   // "en" | "fr": language of the site and of the CLI messages
  languages: null,                                  // §6.12: ["fr", "en"], the first is the source language (then language = languages[0])
  output: "dist/Acme-Orders-Documentation.html",   // default: dist/<name>-Documentation.html
  paths: { content: "content", images: "images", diagrams: "diagrams", facts: "facts" }, // + sync: "." (§6.10), translations: "translations" (§6.12)
  version: { file: "../../package.json", pattern: "\"version\"\\s*:\\s*\"([^\"]+)\"", fallback: "0.0.0" },
  env: { prefix: "ACME" },                          // also reads ACME_URL, ACME_SESSION, ACME_PLANS, ACME_READONLY, ACME_VERSION
                                                    // default prefix: the slug in upper case (ACME_ORDERS)
  app: { url: "http://localhost:3000", dir: "../.." },   // dir: the application root (code), relative to the project
  auth: { adapter: "manual" },                      // manual | none | nextauth | api-me | local:adapters/x.mjs (+ adapter options)
  capture: {
    mode: "app",                                    // "app": the screens are captured · "none": no screenshot at all
    target: "local",                                // "local" | "demo" | "production" (read-only, confirmed): where (mode "app")
    plans: "captures/plans",
    setup: null,                                    // demo data preparation script (doc-kit demo)
    locale: null,                                   // default: derived from language (en-US, fr-FR)
    timezone: "UTC",
    viewports: { desktop: { width: 1600, height: 1000 }, mobile: { width: 390, height: 844 } },
    webpQuality: 0.82,
    geolocation: null,                              // { latitude, longitude } for the mobile context
    storage: {},                                    // localStorage set before each capture; "{version}" is substituted
    cookies: [],                                    // e.g. [{ name: "NEXT_LOCALE", value: "en" }]
    languages: {},                                  // §6.12: { en: { locale, cookies, storage } }, used by `capture --lang en`
    selectors: { block: null, frame: null },        // CSS selectors used by the { block } and { framed } targets
    map: null,                                      // { x, y, z }: URL parameters used to frame a map (plan field `view`)
    forbidden: [],                                  // JS regular expressions on the route path: never opened
    readOnly: "auto",                               // "auto" (on whenever a session is used) | true | false
    sessionRefresh: null,                           // { method?, path, json?, reason }: the only exception (§6.3a)
  },
  masking: { env: [], exclude: "localhost|127\\.0\\.0\\.1", guid: true, patterns: [], allow: [] },   // §3, masking
  coverage: [],                                     // e.g. [{ adapter: "next-app-router", app: "../../app" }]
  theme: { key: null, logo: null, colors: {}, dark: {}, icons: {} },   // key default: <slug>-doc-theme
  sync: { labels: [] },                             // §6.10: message files whose labels are followed
  llm: { currency: null, prices: {} },              // §6.11: prices per million tokens, by model; no default
  spaces: { export: true, output: null },           // one HTML file per space of toc.json (§6.1a); output: a path with {space}
  statuses: {},                                     // { "0": ["st-0", "0 · paid"] }: coloured [[status n]] badges
  texts: {},                                        // i18n overrides: { "home.primaryAction": "Explore the editors" }
  feedback: null,                                   // { label, url }: "Report a problem" link
  extra: {},                                        // free; passed to the project's own scripts
});
```

- **Neutral defaults.** No cookie, no CSS framework selector, no brand colour and no geolocation are applied unless the configuration asks for them.
- **`app.dir`** (default `null`): the application root, the folder given to `init`, which writes it. The skill's `brief.mjs` gives it to the agents as `{{appDir}}` (§8), and `doctor` looks there for a `version.txt`, `VERSION` or `CHANGELOG.md` that contradicts the documented version.
- **`capture.mode`** (default `"app"`): `"none"` declares a documentation without screenshots.
  - `capture` and `connect` explain the mode and stop with exit code 2 (`connect --forget` still deletes a session);
  - `doctor` checks neither the session nor the capture plans folder; the guided mode never offers `connect` or `capture`;
  - `audit` counts `annotated` as `n/a` (`standard/maturity.md`): level 2 is reachable;
  - `init` and `new` write the `none` variant of the templates (§6.4).
- **`capture.target`** (default `"local"`, only meaningful with `capture.mode: "app"`): where the screenshots are taken. `"local"`: the application on this machine; `"demo"`: a demo copy, with prepared data (`capture.setup`); `"production"`: the real application, read-only. With `"production"`:
  - read-only is mandatory: `capture.readOnly: "auto"` behaves as `true` even without a session (`--no-session`, `auth: none`); `capture.readOnly: false` is a validation error (path `capture.readOnly`, key `productionReadOnly`, exit code 2), and so is `<PREFIX>_READONLY` / `DOC_KIT_READONLY` set to a false value (`env.productionReadOnly`, exit code 2). `readOnlyMode(capture, hasSession)` in `engine/capture/capture.mjs` gives the effective value;
  - `capture` prints a banner, "PRODUCTION — read-only · N screenshots · <url>", then asks for confirmation in a terminal, **default No**: a reflexive Enter never starts a production run, and one key confirms a run typed on purpose. Without a terminal, or with `--json`, `--yes` is required (exit code 2 otherwise: `capture.productionConfirm`). Declining captures nothing (exit code 0);
  - `demo` refuses to run (exit code 2, `demo.production`): a demo data script never runs against production;
  - `connect` prints a production line before opening the browser; `doctor` shows the target, ⚠ when `capture.forbidden` is empty; the guided mode shows a production banner before offering `connect` or `capture` (§4.1);
  - the skill's `brief.mjs` gives `captureMode=production` to the agents (`demo` for `"demo"` or a `capture.setup`).
- **`capture.sessionRefresh`** (default `null`): the only declared exception to the read-only lock (§6.3a) — one request that renews a short-lived session, sent once before each capture run.
- **`spaces`** (§6.1a), only read when `content/toc.json` declares `spaces`: `export: false` writes the full site alone; `output` is the path of each export, relative to the project, and must contain `{space}` (validation error, path `spaces.output`, key `spaceOutput`, exit code 2).
- **`languages`** (§6.12, default `null`): the languages of the documentation, at least two (`languagesMin`, path `languages`), unique (`languagesDuplicate`, path `languages[i]`), each one a language the kit speaks (`LANGUAGES` of `engine/i18n.mjs`: `en`, `fr`; `languagesUnsupported`, path `languages[i]`). The first is the **source language**: `language` must be absent or equal to it (`languagesSource`, path `language`); `completeConfig` sets `language` to `languages[0]`. `paths.translations` (default `"translations"`) is the folder of the translations; it must not be inside `paths.content` (`translationsInsideContent`, path `paths.translations`: the translations are never content for coverage, audit or sync). **`capture.languages`** (default `{}`): one entry per language captured with `capture --lang <l>`, `{ locale, cookies, storage }` with the shapes of `capture.locale`, `capture.cookies` and `capture.storage`, every field optional (`locale` defaults to the locale of that language); a key that is not a declared language is an error (`captureLanguageUnknown`, path `capture.languages.<key>`). All exit code 2.
- **Strict validation.** An unknown key is an error, reported with its path (for example `capture.storgae`), and the command exits with code 2. A key whose value is `undefined` counts as absent (a JavaScript helper passing an optional argument through), here and in the capture plans.
- **`masking`** says what is secret, for the screenshots (`engine/capture/masking.mjs`) and for `check secrets` (`engine/check/secrets.mjs`):
  - `env`: the application's `.env` files; the values of the keys whose name suggests a URL, host, tenant, client, account, e-mail, user or secret, longer than 6 characters, are masked and reported, except those matching `exclude`;
  - `exclude`: a JavaScript regular expression (case-insensitive); a value matching it is neither masked nor reported;
  - `guid`: GUIDs are masked and reported (the nil GUID is not). Only their owner knows whether one is public: they stay reported until `allow` names them;
  - `patterns`: more regular expressions, masked and reported;
  - `allow`: regular expressions (case-sensitive, searched in the value) of values **known to be public**, a documented public API key for example: `check secrets` does not report them. The screenshots are still masked. An invalid expression is a configuration error (exit code 2, path `masking.allow[i]`).
  - `check secrets` never reports, whatever the detector: an address that means nothing outside the machine or the private network (`0.0.0.0`, `::`, loopback, `10.x`, `172.16-31.x`, `192.168.x`, `169.254.x`, alone, with a port, or as the host of a URL without credentials); a match inside a URL template (a URL with `{…}` placeholders, like map tiles `https://…/{z}/{x}/{y}.png?key=…`); a placeholder (`<password>`, `${SECRET}`, `example`, `exemple`, `motdepasse`…). The JSON output counts what was set aside, by rule (`ignored`: `local`, `template`, `exclude`, `allow`). Credentials in a URL, PEM blocks holding key material, tokens and the values of the `env` files stay reported.
- **Precedence**, from strongest to weakest:
  1. CLI option;
  2. `DOC_KIT_*` variable;
  3. `<PREFIX>_*` variable;
  4. configuration file;
  5. default value.
- **Variables mapped onto the configuration** (`engine/project/env.mjs`): `URL` → `app.url`, `PLANS` → `capture.plans`, `READONLY` → `capture.readOnly` (`auto | true | false`), `VERSION` → `version.fallback`. `SESSION` names the session file (§5).
- **Derived defaults** (`engine/project/defaults.mjs`): `product.slug` from the name, `output`, `theme.key` (`<slug>-doc-theme`), `env.prefix` (the slug in upper case, dashes → underscores), `capture.locale` (`en-US`, `fr-FR`).
- Commented, fictional and validated examples: `standard/config.md` (en) and `standard/config.fr.md` (fr).

## 4. CLI

`doc-kit <command> [options]`. Global options: `--project <dir>`, `--json`, `--verbose`, `--lang en|fr` (message language; by default, the project's language), `--help`, `--version`.

**`--lang` in a multilingual project** (§6.12). When `doc.config.mjs` declares `languages`, `--lang <l>` keeps its meaning (the messages) and **also** selects the documentation language of the commands that have one: `build` (a mono-language file), `capture` (the screenshots of that language), `view` and `open` (the site shown in that language), `translate` (the language reported, marked or fixed) and `context --translate` (the target language). On these commands, `<l>` must then be one of `languages`, else a usage error, `build.langUnknown` (`{ lang, known }`, exit code 2; `checkLanguageOption` in `engine/build/languages.mjs`). Without `languages`, `--lang` only chooses the messages, as before.

**Help.** `doc-kit --help` (or `doc-kit help`) prints the list of the commands. `doc-kit <command> --help` and `doc-kit help <command>` print the usage of that command and every one of its options, in the message language, then the global options (`cli.help.<command>` and `cli.help.globals`); exit code 0, nothing runs. An unknown command after `help` is a usage error (exit code 2). `help` is not a command module: the dispatcher handles it.

**Message language.** Unless `--lang` is given, every command speaks the project's language (`language` of `doc.config.mjs`, English when it is absent) from its first message: before running the command, the dispatcher locates the project (`--project`, or from the current folder upwards) and reads only that key (`ctx.useProjectLanguage()` in `cli/common.mjs`), so that `doctor`, which checks the configuration piece by piece, and the errors raised before the project is loaded are translated too. A configuration that cannot be imported, or an invalid language, leaves the language as it is (`DOC_KIT_LANG`, else English); the command reports the problem. `init` creates a project elsewhere: the project around it does not choose its language. The guided mode does the same.

| Command | Main options | What it does |
|---|---|---|
| *(none)* | | guided mode (§4.1) |
| `help [command]` | | the list of the commands, or the usage and options of one command |
| `init [app-dir]` | `--dir --name --lang --url --framework next\|react-router\|none --auth --capture app\|none --target local\|demo\|production --yes` | creates the documentation project (§2.1); `--lang` (global) is also the site language; in a terminal, then offers `connect` and a test capture |
| `doctor` | `--network` | checks the environment and the project, one line per check with its fix; ⚠ "version never incremented?" when the documented version is `0.0.0` or `1.0.0` while a `version.txt`, `VERSION` or `CHANGELOG.md` of the application (`app.dir`, or the folder of `version.file`) gives another one; a line with the capture target (mode `app`), ⚠ "no forbidden route declared" for `production` with an empty `capture.forbidden` |
| `connect` | `--url --forget --as <role>` | visible browser: the person signs in, the session is saved (§5); `--forget` deletes it; `--as <role>` saves it as `.doc-kit/session-<role>.json`, for `probe` (§6.13); refused (2) when `capture.mode` is `none`, except `--forget`; a production line first with `capture.target: "production"` |
| `probe` | `--as <role>…` (global `--json`) | checks a running LOCAL or DEMO instance, GET and HEAD only: security headers, cookies, CORS, and the access control of every GET route against the static matrix (§6.13); refused (2) otherwise |
| `demo` | | runs `capture.setup` in its own Node process (variables `DOC_KIT_PROJECT`, `DOC_KIT_URL`, `DOC_KIT_CONFIG`); refused (2) with `capture.target: "production"` |
| `capture [patterns…]` | `--plans --preview --no-session --yes --compare --stale` (global `--lang <l>`, §6.12) | headless captures (§6.3); `--preview` also writes `.doc-kit/<id>.zones.png`, the zones drawn in red; refused (2) when `capture.mode` is `none`; with `capture.target: "production"`, a banner and a confirmation (default No), `--yes` without a terminal (§3); `--lang <l>` (multilingual project) captures with `capture.languages.<l>` into `<images>/<l>/` |
| `build` | `--draft --date YYYY-MM-DD --output --space <id>` (global `--lang <l>`, §6.12) | the site; strict by default (exit code 1, nothing written), `--draft` turns the problems into warnings. With spaces (§6.1a): the full site and one export per space, one summary line each; `--space <id>` writes that export alone (`--output` then names it); an unknown id (`build.spaceUnknown`, with the closest id) or `--space` without spaces (`build.noSpaces`) is a usage error (exit code 2). With languages (§6.12): one multilingual file, or with `--lang <l>` the mono-language file of `<l>` (default output: `-<l>` before the extension). `--json`: `{ ok, output, stats, languages: [{ id, source, current, stale, unmarked, missing }], sites: [{ space, output, stats, excludedLinks }], errors, warnings }` (with `--space`, `output` and `stats` are those of the full site, computed but not written; `languages` is `[]` without `languages`) |
| `dev` | `--port` (default: first free port from 4400) | draft build served on `127.0.0.1`, rebuilt and reloaded on every change; with spaces, each export at `/space/<id>` too, listed in the start message (`--json`: `spaces: [{ space, url }]`) |
| `new <page-id>` | `--template <type> --title --parent --prefill` | page from a template, declared in the table of contents; in a multilingual project (§6.12), the same entry at the same place in each translated `toc.json` that matches the source there (`--json`: `translations: [{ lang, file }]`) |
| `check [coverage\|links\|tables\|images\|secrets\|all]` | `--width` (tables, default 1440 px) `--threshold` (images, default 200 KB) | the checks; `all` by default, coverage skipped when no adapter is configured |
| `audit` | (global `--json`) | maturity level and actions (standard/maturity.md); writes `.doc-kit/audit.md` and `.doc-kit/audit.json` |
| `inventory` | `--features --write --force` (global `--json`) | what the coverage adapters see, and what is already cited; `--features`: candidate features (§6.8) |
| `sync` | `--since --apply --labels --mark --all --sources --date --check --estimate` (global `--json`) | what the documentation must follow after a change of the application; mechanical fixes; marks checked pages (§6.10) |
| `context <page…>` | `--budget --update --translate <lang>` (global `--json`) | the context file of a page for an agent (§6.11); `--translate <lang>`: the translator's dossier of that page instead (§6.12), exclusive with `--update` |
| `translate status` · `translate --mark <page…> \| --mark --all` · `translate --fix-anchors [page…]` | `--check` (status) (global `--lang <l>`, `--json`) | the state of the translations (§6.12): `status` lists, per language, the files `current`, `stale`, `unmarked` and `missing` (`--check`: exit code 1 when a file is stale or missing); `--mark` records the source fingerprint of the listed pages (or content paths such as `home.md`, `toc.json`) in `translations/<l>/.sources.json`; `--fix-anchors` rewrites, deterministically, the `#/page~anchor` links of the translated pages whose anchor is a heading of the source page, from the position of that heading in the translated page. `--lang` limits to one language; without it, every language but the source |
| `facts` | `--source <name> --network --tools` (global `--json`) | facts read in the application code, written to `facts/<source>.json` (§6.9) |
| `bricks [<id\|preset>]` · `bricks run [<id\|preset>…]` | `--deps --stale --force --network --tools` (global `--json`) | the state of every brick of the project and why, one brick, or runs the bricks named / out of date (§6.18) |
| `inputs [status]` · `inputs add <kind> <value>` · `inputs fetch [<name>…]` · `inputs ingest [<file>…]` | `--name --role --branch --depth --env --read-only --kind --tool --title` (global `--json`) | the sources of the project (inputs.json): their state; declares one; clones or updates the shared repositories; converts the documents for the agents (§6.19) |
| `view <page[~anchor]>` · `open [page]` | `--theme light\|dark --height --full --tour N --output --space <id>` | screenshot of a page of the built site (`--full`: the whole page in one image) · the site in the default browser; `--space <id>`: the export of that space instead of the full site (same usage errors as `build`) |
| `optimize` | `--threshold` (200 KB) `--quality` (0.68) | re-encodes the heavy screenshots, kept when 20 % lighter |
| `export <target>` | `--with-dist --zip` | self-contained copy, engine vendored in `vendor/doc-kit/`; `--with-dist` includes the exports per space too |
| `backlog export <azure\|jira\|github\|gitlab\|json>` | `--output --all` (global `--lang <l>`, `--json`) | the backlog in a tool's import format (§6.8b), beside the built site (`<name>-backlog-<target>`); refused (1, nothing written) on an error of the backlog; a line with a secret replaced (1, written); an unknown target is a usage error (2). `--json`: `{ target, files: [{ file, items }], skipped, toLink, removed }` |
| `upgrade` | `--apply` | kit changes since the project's range, migrations as a diff; written with `--apply` |
| `skill install` | `--target <skills folder> --force` | installs the Claude Code skill (§8) |

**Exit codes**
- 0: OK.
- 1: a check failed (content, coverage, capture, a forbidden route).
- 2: invalid usage or configuration.
- 3: environment problem (incompatible kit, missing browser, app unreachable, session expired).
- `doctor` returns the most serious failed category: 3 (environment) > 2 (invalid configuration) > 1 (a project check); warnings never fail.
- `audit` is informative: 0 whatever the level; 2 when the configuration cannot be read; 3 for an incompatible kit.

**Environment variables** (besides the configuration variables of §3)

| Variable | Effect |
|---|---|
| `DOC_KIT_LANG` | message language when neither `--lang` nor a project gives one |
| `DOC_KIT_SESSION` · `<PREFIX>_SESSION` | session file, relative to the project (§5) |
| `DOC_KIT_NO_BROWSER=1` | `audit` opens no browser: the table widths (`wideTables`) are "not measured" |
| `DOC_KIT_NO_OPEN=1` | `dev` and `open` print the address without opening a browser (tests, remote machines) |
| `CLAUDE_CONFIG_DIR` | `skill install` and `doctor` use `$CLAUDE_CONFIG_DIR/skills` instead of `~/.claude/skills` |

**Test seams.** `createContext(globals, io)` (`cli/common.mjs`) also accepts `steps` (the follow-up steps of `init`: `install`, `connect`, `capture`) and `launch` (the browser launcher given by `capture` and `connect` to the engine), so that the tests run these paths without npm and without a browser. Its `exec` (`(bin, args, options) => { status, stdout, stderr, refused? } | null`, by default `defaultExec`, that is `spawnHardened` of `engine/util/safe-git.mjs`: git hardened and given a cleaned environment, every binary taken from the `PATH` without the project's folders, the application's or a `node_modules/.bin`) is how a command starts git: `doctor`, `export`, `check secrets` and the audit's secrets measure pass it to the engine's git helpers (`git`, `isIgnored`, `isTracked`, `trackedByGit`), like `facts`, `sync` and `hooks`, so that a test gives a fake and never starts the machine's git.

**Adding a command.** Create `cli/commands/<name>.mjs`. It exports `options`, in `node:util` `parseArgs` format, and `run({ ctx, values, positionals })`, which returns an exit code, and add its `cli.help.<name>` text (usage, then every option) in both languages. The dispatcher discovers commands from the files in that folder. The options of all commands are merged into a single parser, so an option name used by two commands must have the same type in both; an option that belongs to another command is a usage error. `LATER` (in `cli/doc-kit.mjs`) lists commands announced but not delivered yet; it is empty, every command exists.

**Messages.** Every error has the form `✖ <what is wrong>`, followed by `  → <what to do>`. All messages come from `cli.*` i18n keys.

### 4.1 Guided mode

`doc-kit` without a command (`detectSituation` in `cli/doc-kit.mjs`) finds the project (`--project`, or from the current folder upwards) and the first step missing:

| Step | Situation |
|---|---|
| `init` | no documentation project here |
| `install` | the project's dependencies are missing (`npm install`) |
| `doctor` | the configuration cannot be used |
| `connect` | no session, while the authentication adapter needs one (never with `capture.mode: "none"`) |
| `capture` | no screenshot yet (never with `capture.mode: "none"`) |
| menu | everything is in place: `dev`, `audit`, `build`, `doctor` |

- The folder is shown as an absolute path, quoted when it contains a space.
- With a terminal, it asks for confirmation (or a choice in the menu) and runs the step; `init` keeps asking through the same prompts.
  - The `connect` question says that a browser window opens, where the person signs in before pressing Enter.
  - With `capture.target: "production"`, the banner "PRODUCTION — read-only · <url>" comes first, before the question (or the next step, without a terminal) of `connect` and `capture`; the confirmed `capture` runs with `--yes` (one question, asked after the banner).
- Without a terminal (CI, pipes), it prints the next step and exits with code 0, running nothing. `--json` prints `{ step, folder, next }`.

## 5. Adapters

```js
// adapters/coverage/<name>.mjs
export default {
  name: "next-app-router",
  options: { app: { type: "string", default: "app" } },              // validated like the configuration
  async inventory({ root, options, tools }) {                         // tools: read, walk, json, i18nKey
    return { available: true, families: [{ name: "Routes", items: [{ id: "/orders/[id]", match: ["/orders/[id]"] }] }] };
  },                                                                   // or { available: false, reason }
};
// adapters/auth/<name>.mjs
export default {
  name: "manual",
  options: {},
  browser: "chromium",                                                 // or "chrome"
  detects: false,                                                      // true: connect polls session() (no Enter needed)
  async session(page, options, { appUrl, isSignInUrl }) { /* null | { who, details, expires } */ },
};
// adapters/stack/<name>.mjs (or a project's, config.stacks.adapters: ["local:adapters/x.mjs"])
export default {
  name: "express",
  files: /\.(js|ts|mjs|cjs)$/,                                        // the files it is given, by their relative path
  marker: /\b(?:app|router)\.(?:get|post)\(/,                         // optional: a file whose text does not match is not given
  api({ sources }) { return [{ method, route, file, line, guards }]; },  // sources: Map(file → text)
  screens({ sources }) { return [{ route, file, line, guards? }]; },     // the screens of a front-end router
  behaviours(text, sink, file) { sink.push({ family, signal, field, via }, index); },
};                                                                     // one of api, screens, behaviours at least
```

- **Options.** `options` maps each option to a schema (validator of §3; `required: true` marks a mandatory option); the configuration entry is validated against it, defaults applied, and an error is reported with its path (`coverage[0].ap`, `auth.loginPatern`), exit code 2.
- **Coverage.** The kit does the search in the content (normalised text of `content/**/*.md|json`), the report and the exit code.
  - An item is `{ id, label?, match: [texts], whole? }`; it is covered when one of its `match` texts appears (case and white space ignored) — with `whole: true` (an id), only whole: no letter or digit right before or after it (`F-01` is not cited by `F-010`).
  - Only **written** pages cover an item. A page declared without its file, or that still contains template guidance (§6.4), is not written yet: neither its text nor its entry in the table of contents (id, titles, `routes`, its id in `journeys` and `suggestions`) count. Neither the plan alone nor the examples of a skeleton cover a route.
  - An item that only the entry of a page not written yet cites gets `plannedBy: <page id>`, and the result counts `planned` (covered once every declared page is written): `check coverage` prints it apart, `audit` shows it next to `coverage` and lists the page in the coverage action.
  - `{ available: false, reason, vars }`: the check of that adapter is skipped (not failed); `reason` is translated through `cli.adapter.reason.<reason>` (`notFound`, `blockNotFound`, `error`), else shown as is.
  - The adapters receive `tools`: `resolve`, `exists`, `read`, `json`, `walk`, `glob`, `i18nKey`; paths are relative to the documentation project.
  - Built-in: `next-app-router` (`app`, `family`, `exclude`), `react-router` (`file`, `pattern`, `prefix`, `family`, `exclude`), `i18n-registry` (`source`, `block`, `pattern`, `flags`, `messages`, `key`, `aliases`, `fallback`, `exclude`, `family`), `glob` (`base`, `pattern`, `match`, `family`, `exclude`). Routes are covered as is, with `:id`, `{id}` or `[id]`, or by their static prefix (`/orders/` for `/orders/[id]`).
  - Also built-in: `openapi` and `features` (§6.8); `fastapi`, `facts` and the `api` option of `next-app-router` (§6.9).
- **Authentication.** Every authentication adapter accepts the common options `start` (path opened by `connect` and by the session check, default `/`), `loginPattern` and `browser` (`chromium` | `chrome`).
  - The session (Playwright `storageState`) is written in `.doc-kit/session.json`, or in `<PREFIX>_SESSION` / `DOC_KIT_SESSION` (relative to the project); a `.doc-kit/` folder gets a `.gitignore` that ignores everything.
  - A page is a sign-in page when it leaves the application's origin, or when its path and query match `loginPattern`; a 401 answer counts too.
  - Built-in: `manual` (default), `none` (public application: no session, `none: true`), `nextauth` (`endpoint`, default `/api/auth/session`; detects), `api-me` (`url`, default `/api/me`; `proof`, default `id`; `who`, default `name`; detects).
- **The `manual` authentication adapter:**
  - `connect` opens the app; the user signs in, then presses Enter in the terminal, and the session (`storageState`) is saved;
  - before a capture, the session is considered valid if the app does not redirect to a sign-in page;
  - the sign-in page is detected by the `auth.loginPattern` option, which defaults to `login|signin|sign-in|oauth|authorize`.
- **Stack adapters** (`adapters/stack/`, engine/facts/stacks.mjs) read a framework for `doc-kit facts` (§6.9): its API routes and their guards (`api`), its screens (`screens`), its behaviour hints (`behaviours`).
  - The kit gives each one the texts of its files (`files` on the path, then `marker` on the text), never a test, a fixture, a generated file or a file over 512 KB (engine/facts/code-files.mjs), and never runs anything of the application. It adds `framework` (the adapter's name unless the item names one) and classifies `auth` from the guards with `review.guards` (§6.13): an adapter returns names, never a verdict.
  - Built-in: `next` (App Router `route.*` and `pages/api`; the screens of the App Router and of the Pages Router), `express` (and Fastify, Hono, Koa), `fastapi`, `nestjs`, `angular`, `vue-router`, `react-router`, `spring`, `aspnet`, `laravel`, `symfony`, `django`, `flask`, `go`, `rails`, `rust` (what each reads: the documentation's page "What the kit reads"). The helpers several share are engine modules (engine/facts/stack-js.mjs, stack-c.mjs, stack-py.mjs, stack-php.mjs): an adapter never imports another. `config.stacks.disabled` turns one off; `config.stacks.adapters` adds the project's own (`local:` only: a file of the documentation project, never of the application), loaded by `loadAdapter` and checked for its shape (`adapter.invalid`).
  - What the kit keeps of the adapters (engine/facts/api.mjs): 5,000 routes or screens per adapter and 32 guards per route at most (engine/facts/stack-common.mjs, which the adapters compose their guards with); a segment of a route that looks like a key or a token written "…"; and, when two of the kit's adapters read one declaration (a file and a line — in an application without a manifest, a `@router.get` is FastAPI's form and Flask's), the routes of the one whose name the file holds, else another of its files, else the first in the registry. A project's adapter is never overruled.
  - Every expression of an adapter that scans the application's text is linear and in test/tools/redos-worker.mjs (RULES.md S5); a call's arguments are read once, 4,000 characters at most (`callSpan` of engine/facts/behaviour-common.mjs: a longer call keeps the arguments of its first 4,000 characters), and the line of a match comes from a binary search (`textIndex`), never from a walk of the text.
- **Infra adapters** (`adapters/infra/`, engine/facts/infra.mjs) read what the infrastructure files of the application declare, for the source `infra` (§6.9): `export default { name, files, marker?, infra({ sources }) }` → items. Same rules as the stack adapters: given the texts of their files (never a test, a generated file, a file over 512 KB; a folder named `test/` is the test environment there — `k8s/overlays/test/` — while `tests/`, `spec/`, `fixtures/` and a Maven `src/test/` are never read), running nothing, every expression linear; the project's own in `config.infra.adapters` (`local:`, a file of the documentation project), the kit's turned off with `config.infra.disabled`. Every item goes through one whitelist (`keptInfra`), the project's adapters' too: its kind, provider, type, name, file and line, and when known its environment, image and tag, replicas, ports, whether it runs as root, has TLS, is open to all, its schedule, the names of its variables, its source and version — never a value, a secret's content or a credential (a name a secret detector finds is written "…"). YAML is read by engine/core/yaml.mjs: block and flow collections, scalars, several documents, one pass, bounded (64 levels, 200,000 nodes, 64 KB per block scalar), never expanding an alias nor resolving a tag; JSON (ARM templates, CloudFormation's JSON form) by engine/core/json-tree.mjs into the same nodes, with their lines (JSON.parse checks it first, 256 levels at most, comments blanked). Shared helpers: engine/facts/infra-common.mjs (the environment of a file from its path, a range open to all, an image reference's name and tag, a source without its query but its ref, a file's folder and name) and engine/facts/infra-lexer.mjs (what the Terraform and Bicep walks share: comments and blanks, an item, the tokens of an address range — one written as a variable, a parameter or an expression leaves openToAll unknown, never false).
- **The registry** (`standard/adapters.json`, `schemas/adapters.schema.json`, engine/core/adapters.mjs) lists what the kit reads of an application: its languages by extension (`core`: read by the kit's own sources — JavaScript, TypeScript, Python, HTML, SQL), and its adapters by family — `stack`, `deps` (the dependency readers of engine/facts/deps/), `lowcode` (a platform detected, never read), `coverage`, `auth`. The built-in adapters of `loadAdapter` are its entries. `detect` says what tells that an application uses a stack or a platform: a dependency (`ecosystem:name`, `*` for any characters) or a file (a glob); it is data, never a branch on an id. The compatibility matrix of the kit's documentation (`reference/compatibility`) is generated from it (`node test/tools/adapters-matrix.mjs --write`; test/unit/stacks.test.mjs fails when it is out of date).
- **Project adapters.** An adapter specific to a project is declared as `adapter: "local:adapters/x.mjs"`.

## 6. File formats

### 6.1 `content/toc.json`

```json
{
  "title": "…", "tagline": "…",
  "spaces": ["use", "product", "admin", { "id": "develop", "subtitle": "…" }, { "id": "ops", "kind": "admin", "title": "…" }],
  "sections": [{ "id": "use", "space": "use", "title": "…", "shortTitle": "…", "icon": "…", "subtitle": "…", "highlights": ["…"], "featured": false,
                 "groups": [{ "title": "…", "pages": [{ "id": "use/start", "title": "…", "menuTitle": "…", "summary": "…",
                                                       "level": 1, "template": "screen", "routes": ["/"], "permissions": ["…"],
                                                       "space": "use", "counterpart": "take-over/orders-api" }] }] }],
  "journeys": [{ "title": "…", "description": "…", "space": "use", "steps": ["use/start"] }],
  "suggestions": ["use/start"]
}
```

- `level: 2` marks a sub-page. It is attached to the last level-1 page above it in the same group.
- `template` is optional. When it is present, the build checks the required sections of that page type (§6.4).
- `file` is optional: the page source, relative to `content/` (default `<id>.md`).
- The home page is `content/home.md`; each section may have an introduction, `content/<section>/index.md`.
- `spaces`, `space` and `counterpart` are optional (§6.1a). Without them, the site is exactly what it was before spaces existed.

### 6.1a Spaces (one source, one site per audience)

A **space** is the part of the documentation written for one audience. The standard defines four, one per **kind** (`standard/structure.md`; the kinds are data, `standard/spaces.json`, schema `schemas/spaces.schema.json`, read once by `engine/core/space-profiles.mjs`):
- `use` ("Using the application"): how to do each task, screen by screen; read by users, key users and support;
- `product` ("The product"): what each feature does, for whom, its rules and its acceptance criteria; read by product owners, business analysts and key users;
- `admin` ("Administering the application"): settings, access rights, operations and the technical architecture document; read by application administrators and operators;
- `develop` ("Developing the application"): how the application is built and secured, and what to fix first; read by developers, the takeover team and security.

A **kind** (profile) says what the kit does differently for the pages of a space of that kind, so that the build, the site and the audit read flags, never space ids: `noCode` (its readers read without the code: a business page that cites a file is reported, §6.8; `use`, `product`), `proofs` (its written pages are expected to carry `file:line` proofs, and are the takeover pages of the audit, outside `written2`; `develop`), `glossaryTechnical` (its readers see the technical correspondence of the glossary, §6.8; `admin`, `develop`), `board` (its home shows the Product board, §6.8b; `product`), `depth` (the audit measures the depth of its feature sheets, `standard/maturity.md`; `product`), `takeoverItems` (the required takeover pages that live in it, standard/maturity.md: `dat` and `operations` in `admin`, the five others in `develop`), `preferTypes` (the page types the audit guesses first) and `icon` (its default icon).

One source, two kinds of output (DITA's single-sourcing): **one HTML file with a space selector**, where the filter only changes what is shown, and **one HTML file per space**, an export from which the other spaces' content is **physically removed**. Only the export is fit to hand to an audience that must not see the rest (the develop and admin spaces list variables, hosts, risks).

**Declaring the spaces** (`content/toc.json`)
- `spaces`: a list. Each item is a space id (string) or an object `{ id, kind, title, shortTitle, subtitle, icon, for }`.
  - `id`: `^[a-z][a-z0-9-]*$`, unique (`space.duplicate`, error).
  - `kind`: a standard space (`use`, `product`, `admin`, `develop`) is its own kind and is declared by its id alone; a space of the project's own names its kind (`{ "id": "ops", "kind": "admin", "title": "…" }`). No kind (the spaces `business` and `takeover` of kit 0.3 among them: no migration, the projects of 0.3 are started again), an unknown one, or a standard space given another kind: `space.kind`, error.
  - The standard spaces have default texts in the site language (`ui.spaces.<id>.title|shortTitle|subtitle|for`); every space takes the default icon of its kind; a field of the object overrides its default. Any other id must have a `title` (`space.title`, error); its `shortTitle` defaults to its `title`.
  - `for`: one line naming the readers ("Users, key users, support"). Shown on the home page's space doors and as the tooltip of the selector.
  - Order: the order of the selector and of the home page doors.
- `space` on a **section**: required for every section as soon as `spaces` is declared (`space.missing`, error); it must name a declared space (`space.unknown`, error).
- `space` on a **page**: optional, overrides its section's space. A section then appears in every space where it has pages, with only those pages; its overview page (`#/<section>`) belongs to the section's own space.
- `space` on a **journey**: optional; default: the space of its first step.
- `space` anywhere while `spaces` is not declared: `space.undeclared`, error.
- These errors (`space.missing`, `space.unknown`, `space.undeclared`, `space.duplicate`, `space.kind`, `space.title`) stop any build, even a draft one, like an invalid outline (`resolveSpaces` in `engine/build/spaces.mjs`).
- A declared space without any page: `space.empty`, warning.
- The **effective space** of a page is its own `space`, else its section's.

**`counterpart`** (page field, with or without spaces): `"<page id>"` or `"<page id>~<anchor>"`, or a list of them — the same subject for other readers. The pages a counterpart joins, either way, form a **topic group** (`engine/core/counterparts.mjs`: `topicGroups`, a union of the declared links in the order of the site; each member keeps the anchor first declared for it): declared once, it is shown on each member. A feature sheet, its screen, its technical page and its runbook share their `F-xx` identifier (§7). `context` lists the group's other pages, and `sync` follows their files (one level, §6.10).
- Rendered at the top of the page, under its badges, by the site module `engine/site/lib/topics.js` (`app.js` leaves `<nav class="pendant" data-topic hidden>` for a page with a `topic`): "This topic for:" (`ui.topic`) then one chip per page of the group in the order of the spaces — the page read `<strong aria-current="page">`, the others links (`#/<id>[~anchor]`) — each named by its space's `shortTitle`, with the page's title when its space holds two members; without spaces, "Related:" (`ui.topic.plain`) and the titles.
- Each target is checked like an internal link (`engine/check/links.mjs`, the build and `check links`): unknown page or the page itself → `link.counterpart`, unknown anchor → `link.anchor` (not checked while the target page is not written yet, §6.4). An unknown page, or the page itself, joins no group; a target whose anchor fails joins it (the strict build stops on `link.anchor`).
- Translations: each member's anchor is mapped by position to the language's outline; unmappable, dropped, warning `translation.anchor` once per page it points into.

**Site data** (§9: new keys are in English, and are emitted **only** when they are declared, so that a project without spaces keeps identical site data):
- the texts of `i18n/<language>/spaces.json` are embedded only in a site that declares spaces or a counterpart;
- `spaces: [{ id, kind, title, shortTitle, subtitle, icon, for, pages, tech?, board? }]`: texts resolved at build time, `icon` resolved like a section icon, `pages` = number of pages of the space, `tech: true` when its kind shows the glossary's technical correspondence, `board: true` when its home shows the Product board (§6.8b);
- `board`: the Product board (§6.8b), only when it is shown;
- `sections[].space`, `pages[].space` (effective space), `journeys[].space`;
- `pages[].topic: [{ id, anchor? }]`: the other pages of its topic group, when it belongs to one;
- in an export only: `meta.space` (the id of the exported space), `spaces` holding that space alone, and `journeys[].hidden` (number of steps removed, when > 0).

**The modules of the site** (`engine/site/lib/*.js`): `app.js` stays one script; the build
(`engine/build/site-script.mjs`) splices its modules in at its `/* @lib */` line, in file name order, each in a block
of its own (strict mode: what it declares stays local). A module sees `EXT.api` only (`data()`, `t`, `th`, `esc`,
`icon`, `$`, `$$`, `memo`) and adds to `EXT`: its `hydrators` run on every content rendered (`hydrate`). Its texts
are `ui.*` keys, checked like `app.js`'s (no hard-coded text, every key embedded). A site folder without `lib/` (an
older engine, `siteDir`) gives `app.js` as it is.

**Site behaviour** (`engine/site/app.js`, `template.html`, `style.css`; only when `D.spaces` exists)
- **Current space**: a space id, or `null` for "everything". It comes from, in this order: the URL `#/@<id>` (`#/@` = everything; an unknown id = everything); the effective space of the page shown (a section overview: the section's own space); the value remembered in `localStorage` under `__THEME_KEY__.space` (read and written inside `try`/`catch`, like the theme; `""` for everything); else `null`. Showing a page, a section overview or `#/@<id>` makes that space current and remembers it; the plain home page `#/` keeps the current one. `#/@<id>` shows the home page of that space.
- **Selector** in the top bar (`#espaces`, `role="group"`, `aria-label="{{t:template.spaces}}"`): one "Everything" button (`ui.spaces.all`, tooltip `ui.spaces.allFor`) then one button per space (`shortTitle`, tooltip `for`), the current one `aria-pressed="true"`. They are `<button>` elements that lead to `#/@<id>`. Below 1080 px it moves to the head of the side menu (`.lat-espaces`, `aria-label` `ui.spaces.label`). In an export there is no selector: the top bar shows the space's `shortTitle` as a label (`.espace-unique`).
- **Filter** (a space is current): the top navigation, the side menu, previous/next (the neighbours within the space, in `order`), the home page doors and journeys, the search suggestions, and "print everything" (the space only). `app.js` replaces `D.sections`, `D.order`, `D.journeys` and `D.suggestions` with their part of the space. A section shown for some of its pages (its own space is another one) loses its "featured" mark, its subtitle and its highlights, the side menu does not offer its overview, and its links in the top navigation and on its home page door lead to its first page of the space. In "everything" mode the side menu shows the title of each space above its sections, and nothing is filtered.
- **Home page**: in "everything" mode, one door per space (icon, title, `for` as "Readers: {for}" (`home.spaces.for`), `subtitle`, number of pages) leading to `#/@<id>`, then the home page Markdown and every journey, by audience (each group under its space, `.parcours-public`: its icon and `shortTitle`, in the order of the spaces; a journey's space its own, else its first step's; a journey of no space first, without a heading). With a space current, a strip "You are reading: {title} · Show everything" (`home.spaces.current`, `home.spaces.showAll`; not in an export, which holds nothing else), then the doors of that space's sections, the home page Markdown and the space's journeys; the primary action targets the first featured section of the space, else its first own section. The door grid is no longer fixed at 4 columns: `repeat(auto-fit, minmax(240px, 1fr))`, one column on a phone, a single door keeping the width of a door.
- **Page**: a space badge (`puce espace`, the space's icon and `shortTitle`) among the page badges; the breadcrumb starts with the space (Home › {space} › section…).
- **Search**: with a space current, the results of that space first, then, under a heading "In {space} ({n})" (`ui.search.inSpace`, `n`: the results of that space shown), those of each other space, in declaration order; the limit of 24 results applies to the whole list. In "everything" mode the order is unchanged and each result's path starts with its space's `shortTitle`. **Search in** (`#recherche-portee`, `role="group"`, `ui.search.scope`, with two spaces or more — never in an export): "All" (`ui.search.scope.all`, the order above) then one chip per space (`aria-pressed`), which keeps that space's results alone, without heading. The scoring is the site module `engine/site/lib/search-core.js` (`EXT.searchCore`: `match`, `mark`, pure, run in `vm` by the tests): per term, the entry's title (12 at the start of a word, 8 inside), its page's title (4, 3), its text (each occurrence, at most 4, one more when one starts a word), a page entry +2; every term required. A term no entry holds is read as its close words (`closeWords`: the index's words of 3 letters or more within 1 edit from 4 letters, 2 from 8 — insert, delete, replace, swap — or whose start is; the 8 closest: fewer edits, a whole word before a start, then the order of the index), their score halved, said above the results (`.recherche-proche`, `ui.search.fuzzy`) and read out with the count (`#recherche-statut`). The index (`engine/build/search.mjs`) is written once the second pass has resolved the generated tables and the citations: a page entry first (its summary, then its introduction), then one entry per h2/h3.
- Texts: `ui.spaces.*`, `ui.search.inSpace`, `ui.search.scope*`, `ui.topic*`, `ui.journey.hidden`, `home.spaces.*`, `template.spaces`, `render.spaces.*`, `cli.build.space*`, `cli.build.noSpaces`, `cli.build.link.counterpart`, `cli.validate.spaceOutput`, `cli.dev.space` and `cli.audit.spaces.*`, in the i18n fragment `i18n/<language>/spaces.json` (§6.5).

**Exports, one per space** (`build()`, `engine/build/spaces.mjs`)
- When `spaces` is declared and `config.spaces.export` is not `false`, `build()` returns, besides the full site (`html`, `data`, `output`, unchanged), `sites: [{ space, html, data, stats, output, excludedLinks }]`, one per declared space, in declaration order. Without spaces, `sites` is `[]`. `options.space` limits `sites` to that space (the full site is still computed), even with `export: false`; `options.spaceOutput` then overrides that export's output.
- The pages are rendered once. Each export **filters the site data**:
  - `sections`: the sections that have at least one page in the space, their groups reduced to those pages (an empty group is dropped);
  - `pages`, `order`, `search` (search index), `suggestions`: the pages of the space only;
  - `journeys`: the journeys of the space; their steps in another space are removed and counted in `hidden` (the site prints "+ {n} steps in another part of the documentation", `ui.journey.hidden`);
  - sections kept for some of their pages (their own space is another one) lose their introduction, subtitle, highlights and "featured" mark (they belong to that space, with the section overview);
  - images: only those used by the kept pages, the kept section introductions and the home page; `meta.stats` is recounted on what is kept (pages, screenshots, zones, diagrams), from what each rendered document uses (`render().used` of the Markdown engine);
  - **links**: in the kept pages, the kept section introductions and the home page, a link `#/<target>[~anchor]` whose target page or section is not in the export becomes its text in a `<span class="lien-exclu">`, followed by " (see the {space} documentation)" (`render.spaces.excludedLink`, `{space}` = the `shortTitle` of the target's space). Their number is `excludedLinks`, reported as a warning `space.excludedLinks` `{ space, n }` (never an error: it is what an export is for); a link whose target is unknown (a broken link, reported by the link check) is left as it is;
  - `topic`: the members the export keeps (none: no `topic`, no line);
  - the glossary is kept whole, but its technical correspondence (§6.8), kept only in the export of a space whose kind shows it (`tech`: `admin`, `develop`);
  - `board` (§6.8b): kept when the export shows it, as for the whole site (its space's kind does, or a page it keeps holds `::board{}`), reduced to the features whose sheet it keeps, their stories and the epics left with one; otherwise, or when it keeps no feature, neither `board` nor the `ui.board.*` texts.
- **Output**: `config.spaces.output`, a path containing `{space}`, relative to the project; default: the full site's output actually built (`--output` included) with `-{space}` inserted before its extension (`dist/Acme-Orders-Documentation.html` → `dist/Acme-Orders-Documentation-use.html`).
- The links of each export are valid by construction: no other check runs per export. `check images` keeps working on the full site, which holds every page.

**Audit** (`engine/audit/audit.mjs`, `standard/maturity.md`)
- **Takeover pages** (`engine/audit/takeover.mjs`). With spaces, their kinds decide: the takeover pages (proofs expected, outside `written2`, claims counted) are the pages whose effective space is of a kind with `proofs` (`develop`); for the project, each required takeover page is looked for in the pages of every space whose kind holds takeover pages (`takeoverItems`: `admin`, `develop`); it belongs to the first declared space whose kind holds it (else to the dossier's main space), whose own level counts it among that space's pages, and it is suggested in the usual part of that space (`parts` in `TAKEOVER_ITEMS`, standard/structure.md: Operate, Understand, Risks, Maintain), else in its section that already holds a page of that type, else in its first section — its `section` in `takeover[]`; `takeoverSection` is the first section of the `develop` space (else of the first space holding takeover pages, else none: `takeover.noSection`). Without spaces, as before: the section `take-over` or `reprendre`, else the last section.
- **Level by space.** With spaces, the result also holds `spaces: [{ id, title, pages, level, indicators, criteria }]`: the same criteria, the page indicators (`written`, `typed`, `conformant`, `completeness`, `annotated`, `proofs`, `tooLong`) measured on the pages of the space, the project-wide ones (configuration, build, home page, glossary, journeys, coverage, blocking problems, wide tables, screenshot versions) shared. `takeover4` of a space counts the required takeover pages that belong to it — each belongs to the first declared space whose kind holds it, else to the dossier's main space (`develop` without `admin`: all 7) — found among its own pages (its threshold: their number; the project's: all 7). A criterion that does not concern a space counts as met and is shown `n/a`, as its kind says: `written2` in a kind with `proofs` (`develop`), `proofs4` in the others, `takeover4` in a space no required takeover page belongs to (`use`, `product`, a second space of the same kind). The global level is unchanged (every page).
- `audit.md` shows a table "Level by space" (`cli.audit.spaces.*`) under the global level; `audit.json` carries `spaces`. Without spaces, both are unchanged.
- **The criteria** (`engine/audit/criteria.mjs`): `criteriaOf(indicators, project)` and `levelOf(criteria)`, shared by the project's level and each space's; `ratio`, `count`, `notMeasured` the kinds of indicator.
- **The depth of the feature sheets** (`engine/audit/depth.mjs`, `standard/maturity.md`): `depthOf(backlog, pages, applies)` reads `build().backlog` on the written pages — `featureSheets` (sheets with a story ÷ written sheets; `featureSheets3` = 100 %), `scenarios` (their stories with a scenario ÷ their stories; `scenarios4` ≥ 80 %), `behaviourDepth` (the rubrics of their cards answered ÷ their rubrics, from the model's `rubrics: { answered, total }`; `behaviourDepth4` ≥ 90 %). `n/a` (ratio 0 ÷ 0) without a written sheet, and with spaces declared none of a kind with `depth` (`standard/spaces.json`: `product`) — `measuresDepth(declared)`; by space, measured in a kind with `depth` only. `DEPTH_ACTIONS`: `featureStories`, `scenarios` (`need` of `thresholds.mjs`), `behaviourDepth`. `depthReport` → `audit.json` `depth: { backlog: { epics, features, stories, withCriteria, versions }, features: [{ id, title, page, state, score, criteria, gaps }] }` (`gaps`: what is still open in the sheet, for the skill's depth loop, §6.11a), the table "Depth of the feature sheets" of `audit.md` (`cli.audit.depth.*`); informative.

### 6.2 `images/zones/<id>.json`

```json
{ "file": "<id>.webp", "title": "…", "route": "/…", "width": 1430, "height": 844,
  "version": "1.2.0", "captured": "2026-10-01", "commit": "9f2c…", "plan": "51aa…",
  "zones": [{ "n": 1, "x": 3.18, "y": 7.98, "w": 94.49, "h": 7.57, "label": "…" }] }
```

- `x`, `y`, `w` and `h` are percentages of the image.
- `side` is optional: where the numbered pin sits (`corner`, `right`, `bottom`, `bottom-right`; default: left). `capture` writes `corner` when the zone starts less than 32 px from the left edge, unless the plan gives `side`.
- `version` and `captured` are written by `capture` and are optional when reading. `captured` is the ISO date (`YYYY-MM-DD`) of the run; `version` is the documented version (`version` of §3).
  - The build copies them, for the screenshots the pages use, into the site data as `meta.screenshots` (`{ id: { captured?, version? } }`, absent when none is known). The site shows them in the footer: "Screenshots taken on {date}", or "between {from} and {to}", with the version.
  - `check images` and `audit` report a capture taken on another version than the documented one.
- `width` and `height` are the exact size of the image (`capture` crops on whole pixels). `label` comes from the zone's `caption` in the plan.

### 6.3 Capture plans

Each `captures/plans/*.mjs` file exports `CAPTURES`. The full syntax is documented at the top of `engine/capture/plans.mjs`.

- **Entry fields:** `id`, `title`, `route`, `context` (a key of `capture.viewports`: `desktop` by default, `mobile` is a touch screen), `viewport`, `view` (map framing: `{ lon, lat, zoom }` converted to Web Mercator metres, or `{ x, y, z }` passed as is, in the URL parameters of `capture.map`), `storage`, `delay` (minimum wait after loading, default 0: the kit waits until the page is stable — no request in flight and no DOM change for 150 ms, fonts and images ready, finite animations ended, capped at 10 s, `engine/capture/stable.mjs`), `actions`, `settle` (minimum wait after the actions, default 0: stable again). Captures run `capture.concurrency` at a time (default 4, always 1 for `capture.target: "production"`), each worker with its own browser contexts and guard state; results and messages keep the order of the plan. `capture.clock` (ISO date) fixes the page's clock; contexts use `reducedMotion: "reduce"`; `capture --trace` keeps the Playwright trace of a failed capture in `.doc-kit/traces/<id>.zip`; `capture --verify` opens, plays and locates the frame and every zone of each entry but takes and writes nothing (`cli.capture.verified`, exit code 1 when a zone or the frame is not found), `frame` (default margins: 34 px horizontally, 10 px vertically), `zones` (in the order of the markers; 3 to 12 recommended), `masks`.
- **Actions:** `click` (+ `options`, Playwright click options), `hover`, `type` + `value`, `select` + `value`, `press`, `scroll`, `wait`, `wheel`, `eval`.
- **Targets:** `{ role, name }`, `{ text }`, `{ field }`, `{ label }`, `{ placeholder }`, `{ css }`, `{ block }` (a container matching `capture.selectors.block` whose button or heading starts with the text). Exactly one kind per target.
- **Target options:** `exact`, `nth`, `last`, `has`, `within`, `up`, `framed` (closest ancestor matching `capture.selectors.frame`, or with a border on its four sides), `margin`, `marginY` (vertical margin of a `frame`), `side`.
- **Grouping zones:** a zone is either a target or `{ union: [target, …] }`. A union covers the bounding box of all its targets, for example several fields on the same row. Zone options: `caption` (written as `label` in the zone file), `side`, `margin`.
- **Masks:** every match of a `masks` target is masked, unless `nth` or `last` names one.
- **Duplicates:** an id that appears in two files is an error.
- **Validation:** entries are checked against `schemas/capture-plan.schema.json` as they are written (a French key of a former plan is an unknown key, §6.7). The schema accepts what the engine executes (`engine/capture/*.mjs`), no more: a negative `margin` / `marginY` tightens a zone or a frame; a negative `nth` counts from the last match; a `viewport` side is any whole number of pixels ≥ 1 (a 150 px strip); `wheel.steps` may be 0; `delay`, `settle` and a numeric `wait` are any number ≥ 0; `wheel.direction` stays `-1` or `1`.
- **Plan errors:** every entry of every file is checked before anything runs. The errors are listed together under one `capture.planInvalid` (`{ folder, n }`), one line each: `<file> › <id> (CAPTURES[<index>]) › <path>: <what is wrong>` (each detail carries `file`, `entry`, `path`, `key`, `vars`). One invalid entry still stops the command (exit code 2); a duplicate id is reported once the entries are valid.
- **Safety:** with a session, every request other than `GET`/`HEAD`/`OPTIONS` is aborted and counted (`capture.readOnly: "auto"`); with `capture.target: "production"`, always (§3). The only declared exception is `capture.sessionRefresh` (§6.3a), sent once before the run starts, outside any page. A route matching `capture.forbidden` is refused before the run (exit code 1). During the run, a server renders a page for any `GET` of its route, so every request to a forbidden path is aborted in the browser, whatever its kind (`requestGuard` in `engine/capture/capture.mjs`):
  - a **prefetch or sub-resource** (fetch, XHR, framework payload such as a React Server Components request, `<link rel=prefetch>`, an iframe…) is aborted silently and counted: the capture goes on, and the last lines say "N prefetch request(s) to forbidden routes aborted — list" (`prefetched` and `prefetchedRequests` in `--json`). Aborting it is exactly what prevents the server-side render;
  - a **navigation of a top-level frame** (the plan's own route, a click on a link, a pop-up, a redirect, or a client-side navigation whose URL ends on a forbidden path) fails the capture (`cli.capture.error.forbiddenHit`, exit code 1) and is listed as refused;
  - service workers are blocked whenever the guard is active, so that no request escapes it.

### 6.3a Session renewal: the only exception to read-only

A session whose access token lives a few minutes and renews itself through a `POST` would otherwise expire mid-campaign: read-only (§6.3) aborts that very request. `capture.sessionRefresh` (schema §3, default `null`) declares **one** request allowed to cross the lock: `{ method?: "POST", path, json?, reason }`, `path` relative to `app.url`, `reason` a string of at least 20 characters.

- **The rule:** before each `doc-kit capture` run that uses a session, and only then — never while a page is open, never again during the run — `refreshSession` (`engine/capture/session.mjs`) opens a context that loads the session, sends this one request, and writes the cookies of the response back to the session file. Every request a page itself makes still stays `GET`/`HEAD`/`OPTIONS`; the exception does not widen.
- **`reason` is mandatory** (schema `required`, `minLength: 20`): the application owner's written decision that this endpoint writes nothing else, not a developer's guess. A shorter string, or an object without it, is a configuration error (exit code 2).
- **Still forbidden:** any other method, any other path, any request from inside a page, a second request mid-run. The schema only accepts `method: "POST"`.
- **Messages:** success prints `cli.capture.sessionRefreshed` (method, path, status) before the captures start; a failure prints `cli.capture.sessionRefreshFailed` as a warning, not fatal — the session check that follows (§5) decides whether the run goes on.

### 6.4 `standard/templates.json` (read by the build and by `audit`)

```json
{
  "aliases": {
    "en": { "What it is for": ["What it's for", "What this screen is for", "What this editor is for"], "Pitfalls and limits": ["Pitfalls", "Known limits"] },
    "fr": { "À quoi ça sert": ["À quoi sert"], "Pièges et limites à connaître": ["Pièges et limites", "Pièges"] }
  },
  "types": {
    "screen": {
      "title": { "en": "Screen page", "fr": "Page d'écran" },
      "sections": {
        "en": ["What it is for", "How it works", "The screen", "Each action", "Settings reference", "Step by step", "Common use cases", "Pitfalls and limits", "In production", "Required permissions"],
        "fr": ["À quoi ça sert", "Comment ça marche", "L'écran", "Chaque action", "Référence de chaque réglage", "Pas à pas", "Cas d'usage courants", "Pièges et limites à connaître", "En production", "Droits requis"]
      },
      "required": [0, 1, 2, 7, 9],
      "maxWords": 2500,
      "template": "templates/pages/{language}/screen.md",
      "example": "docs/content/examples/screen.md"
    }
  }
}
```

- **Source of truth.** The example above shows the `screen` entry. The sections, required indexes and word limits of every type are those of `standard/templates.json`. A type may also set `contextBudget`, the token budget of its context file (`doc-kit context` without `--budget`, §6.11; 16,000 when absent), and `digests`, the digests of facts its context file gets (the runbook: `["infra"]`, §6.11 point 5d).
- **Matching a section.** A required section is found when a `##` heading of the page **starts with** its label or with one of its aliases. Case and accents are ignored.
- **`required`.** It holds indexes into `sections`, so it is language-neutral. The `en` and `fr` section lists have the same length and the same order.
- **Template guidance.** Guidance left in a page is marked `<!-- guidance:` (en) or `<!-- consigne :` (fr). The build warns about it (a missing required section is an error in a strict build, a warning with `--draft`); for `audit`, the page is a draft, not written yet (`standard/maturity.md`).
- **A page declared without its file** is one problem, `page.missing` ("page not written yet: <id>"), an error in a strict build and a warning with `--draft`: its template's sections are not checked, nor the anchors that point into it, until its file exists.
- **Capture variants.** A template (page templates and the `.md` files of the project skeleton) may hold the two variants of a passage, one per capture mode (§3, `capture.mode`), each on its own lines:

  ```
  <!-- doc-kit:capture=app -->
  …with a :::screen block or a screenshot callout…
  <!-- doc-kit:capture=none -->
  …the same passage without screenshot: a table | Element | What it shows |, in reading order…
  <!-- doc-kit:end -->
  ```

  `init` and `new` keep the lines of the project's mode and remove the markers (`captureVariant(text, mode)` in `engine/core/page-templates.mjs`); text outside the markers is common to both modes. The `screen` and `editor` templates use them for "The screen" (and "What it changes").

### 6.4a Template fragments

`standard/templates.json` holds the 13 original types and the aliases. A group of types may live in its own fragment, `standard/templates/<group>.json`, with the same shape (`{ "aliases"?, "types" }`): `loadPageTemplates` merges the fragments into the table in file name order. A type defined twice is an error (thrown when the table is loaded: a kit defect, never a project's). Current fragments: `business.json` (§6.8) and `takeover.json` (§6.9).

### 6.5 i18n

`i18n/en.json` and `i18n/fr.json` hold flat keys grouped by namespace:

| Namespace | Content |
|---|---|
| `ui.*` | Site interface at runtime. Embedded in the HTML. |
| `template.*` | Texts of the HTML template. |
| `render.*` | Strings produced by the Markdown extensions. |
| `callouts.*` | Callout titles. |
| `home.*` | Home page texts (rendered at runtime by `app.js`). Embedded in the HTML. |
| `cli.*` | CLI messages. |

- **Embedded keys:** only `ui.*` and `home.*` are embedded in the generated HTML.
- **Fragments:** a feature can keep its keys in `i18n/<language>/<feature>.json`, so that features can be written independently. Fragments are merged with `i18n/<language>.json` (in file name order), and a key defined twice is an error. Current fragments, in `en/` and `fr/`:
  - `capture.json`: `cli.capture.*`, `cli.connect.*`, `cli.demo.*`, `cli.adapter.*`, `cli.check.*`, `cli.inventory.*`;
  - `audit.json`: `cli.audit.*`, `cli.new.*`;
  - `ux.json`: `cli.init.*`, `cli.doctor.*`, `cli.dev.*`, `cli.export.*`, `cli.upgrade.*`, `cli.skill.*`, `cli.guided.*`, `cli.prompt.*`, and a few `ui.*` keys (footer, zones, search);
  - `help.json`: `cli.help.*`, the help of each command (`cli.help.<command>`) and of the global options (`cli.help.globals`);
  - `spaces.json`: the spaces and their exports (§6.1a): `ui.spaces.*`, `ui.search.inSpace`, `ui.search.scope*`, `ui.topic*`, `ui.journey.hidden`, `home.spaces.*`, `template.spaces`, `render.spaces.*`, `cli.build.space*`, `cli.audit.spaces.*`;
  - `business.json` (§6.8) and `takeover.json` (§6.9).
  - `sync.json` (§6.10) and `context.json` (§6.11);
  - `languages.json` (§6.12): `ui.language.*` (`label`, and one autonym per kit language, `ui.language.en`, `ui.language.fr`, identical in both files), `ui.translation.missing`, `cli.build.translation.*`, `cli.build.languages.*`, `cli.build.langUnknown*`, `cli.validate.languages*`, `cli.validate.translationsInsideContent*`, `cli.validate.captureLanguageUnknown*`, `cli.translate.*` (including the help `cli.help.translate`), `cli.context.translate.*`, `cli.capture.lang*`, `cli.audit.languages.*`, `cli.sync.summary.translations`, `cli.sync.translations.*`, `cli.init.languages*`, `cli.init.ask.languages`, `cli.doctor.languages*`, `cli.guided.situation.translate`, `cli.guided.menu.translate`. Its `ui.*` keys are embedded only in a site that declares `languages`; such a site also embeds `template.*` (the site re-applies the template texts when the language changes);
  - `reviews.json` (§6.13).
- **Plurals:** `{ "one": "…", "other": "…" }`, resolved with `Intl.PluralRules`.
- **Variables:** `{n}`, `{name}`…
- **Parity:** both files have the same keys and the same variables. A test checks this.
- **Overrides:** `config.texts` can override any key.

### 6.6 Extended Markdown syntax (both spellings are accepted)

| English | French |
|---|---|
| `:::screen{capture="id" title="…"}` | `:::ecran{capture="id" titre="…"}` |
| `:::steps` | `:::etapes` |
| `::capture{id="…" title="…"}` | `::capture{id="…" titre="…"}` |
| `::diagram{id="…" title="…"}` | `::schema{id="…" titre="…"}` |
| `::before-after{before after before-label after-label title}` | `::avant-apres{avant apres libelle-avant libelle-apres titre}` |
| `[!TIP]` | `[!ASTUCE]` |
| `[!WARNING]` | `[!ATTENTION]` |
| `[!CAUTION]` | `[!ERREUR]` |
| `[!PERMISSIONS]` | `[!DROITS]` |
| `[!NOTE]` | `[!NOTE]` |
| `[!RECIPE]` | `[!RECETTE]` |
| `[!HOW]` | `[!MECANISME]` |
| `[[perm …]]` | `[[droit …]]` |
| `[[menu …]]` | `[[menu …]]` |
| `[[key …]]` | `[[touche …]]` |
| `[[status …]]` | `[[statut …]]` |
| `[[route …]]` | `[[route …]]` |
| `[[feature F-03]]` | `[[fonctionnalite F-03]]` |
| `[[rule BR-12]]` | `[[regle RG-12]]` |
| `:::rule{id="BR-12" title="…"}` | `:::regle{id="RG-12" titre="…"}` |
| `::features{}` · `::rules{}` · `::roles{}` | `::fonctionnalites{}` · `::regles{}` · `::roles{}` |
| `::facts{source="env" columns="…"}` | `::faits{source="env" colonnes="…"}` |
| `[[verified …]]` · `[[deduced …]]` · `[[unknown …]]` | `[[verifie …]]` · `[[deduit …]]` · `[[inconnu …]]` |

A callout's displayed title comes from `callouts.*`, in the project's language.

### 6.7a Diagram classes (SVG)

Diagrams (`diagrams/*.svg`) use only the site's classes, so they follow the light and dark themes. A diagram never contains hard-coded colours.

| Role | English (current) | French (legacy, still styled) |
|---|---|---|
| Boxes | `d-box`, `d-box-2`, `d-brand`, `d-warn`, `d-danger`, `d-info`, `d-violet` | `s-boite`, `s-boite-2`, `s-marque`, `s-alerte`, `s-danger`, `s-info`, `s-violet` |
| Solid fills | `d-solid` (brand colour), `d-chrome` (dark chrome colour) | `s-plein`, `s-navy` |
| Lines | `d-line`, `d-line-brand`, `d-dashed` | `s-trait`, `s-trait-marque`, `s-pointille` |
| Text | `d-title`, `d-text`, `d-small`, `d-white` (on `d-solid`), `d-on-chrome` (on `d-chrome`) | `s-titre`, `s-texte`, `s-petit`, `s-blanc` |
| Arrowheads | `d-arrow`, `d-arrow-brand` | `s-fleche`, `s-fleche-marque` |

`<marker>` ids are prefixed with the diagram's own code, because several diagrams share the same page.

**Trusted content.** Pages (Markdown with inline HTML) and diagrams (SVG) are inserted into the site **as written, without sanitisation**, like in most static site generators. The documentation sources are trusted content: never build pages or diagrams that come from an untrusted source. This is stated in `SECURITY.md`.

### 6.7 Legacy format (projects created before doc-kit)

The French-keyed formats of the projects written before doc-kit (`contenu/sommaire.json`, `glossaire.json`, `accueil.md`, and French keys such as `titre`, `groupes`, `fichier`, `libelle`, `clic` in the table of contents, the glossary, the zone files and the capture plans) and the `doc-kit migrate` command that rewrote them were **removed in 0.4.0**: such a project starts again from `doc-kit init`. The kit reads only `toc.json`, `glossary.json` and `home.md` (§2.1), with the English keys of their schemas (`schemas/*.schema.json`): a file under a former name is not read, and a French key is treated like any other unknown key — an error of the schema, except in a zone file (a tolerant reader, §6.2) where it is ignored and the required key it replaced is reported missing. Folder names stay free (`paths`, §3), and the Markdown keeps both spellings (§6.6).

### 6.8 Business pages: features, rules, roles (the Product space)

The business pages describe **each feature** for the people who use it, decide about it or support it — written for the Product space (and Use): no code, no `file:line`. The page types follow the use case of Cockburn (actors, main path, numbered variants), the business rules of RuleSpeak (one statement, one example "Given / When / Then"), the user stories and acceptance criteria of agile product work (Connextra, Gherkin), and a specification of each behaviour precise enough to be tested (§6.8a).

**Page types** (`standard/templates/business.json`; templates `templates/pages/{en,fr}/<type>.md`; examples `docs/{en,fr}/content/examples/<type>.md`). Labels below in English; the French labels are in the fragment. `*` = required.

| Type | Sections | maxWords |
|---|---|---|
| `feature` | What it is for* · Who uses it* · User stories* · Main path* · Variants · Behaviours* · Business rules* · Fields and inputs · States · Messages* · Rights by action* · Acceptance criteria* · Limits · Open questions | 4000 |
| `business-rules` | How to read this page* · The rules* · Rules by feature · Retired rules | 3000 |
| `roles-matrix` | In short* · The roles* · Who can do what* · Responsibilities · How to get a role | 2000 |
| `process` | In short* · Who takes part* · The steps* · The states · What happens on its own, and what waits for someone* · Deadlines and reminders · When it goes wrong · Features involved | 2200 |
| `release-notes` | In short* · Latest version* · Earlier versions | 3000 |

- **The feature sheet** is a specification a product owner can check against the application: its user stories (`:::story`), its behaviours (`:::behaviour` cards), its acceptance criteria (`:::scenario`), §6.8a. A section that does not apply stays, with one line: "Not applicable — the reason". Its context file gets a larger budget (template field `contextBudget`: 24,000 tokens; `doc-kit context` without `--budget`, §6.11). Aliases keep the headings of 0.3 valid: "Main scenario" is "Main path", "Règles métier" is "Règles de gestion".
- **Main path**: numbered steps (`:::steps`), optionally illustrated with a `:::screen` or a `::capture` when a screenshot makes a step clearer (neither is required: unlike "The screen" of `screen`/`editor`, §6.4, this section has no capture variant). **Variants** are numbered after the step they branch from: "3a. If …".
- **Fields and inputs**, **Messages**, **Rights by action**: tables (Field · Required · Format and accepted values · Default · Check and its message; Message · When it appears · What to do; Action · Right `[[perm …]]` · Condition).
- **Business rules** of a feature: the rules that only concern it are defined there (`:::rule`); the others are cited (`[[rule …]]`).
- **Who can do what** (roles matrix): `::roles{}`, or a table written by hand.

**Identifiers**
- `^[A-Z][A-Z0-9]{0,5}-\d{1,4}$`. Conventions: `F-01` for features; `BR-01` (en) or `RG-01` (fr) for business rules.
- **Feature**: page field `feature` in `toc.json`, only on a page of template `feature` (`feature.template`, error, when the template is another or absent). One sheet per id (`feature.duplicate`, error). A `feature` page without an id: `feature.noId`, warning. The page fields `feature` and `title` are cited by coverage like the other entries of a written page (§5).
- **Rule**: defined once, anywhere, by a container
  ```
  :::rule{id="BR-12" title="An order above the threshold waits for a manager"}
  Statement, in one or two sentences.

  **Example.** **Given** an order of 12,000 € and a threshold of 10,000 €, **when** the buyer submits it, **then** it waits for a manager's approval.
  :::
  ```
  (`:::regle{id="RG-12" titre="…"}`). Rendered as `<div class="regle">` holding an `h3` (`id` = the rule id in lower case, `br-12`; text "BR-12 · title"; the usual anchor link, so that it appears in the page outline, in the search index and as a link target), then the body. Defined twice: `rule.duplicate`, error. Without `id` or `title`: `rule.attributes`, error.
- **Citations** (badges, §6.6): `[[feature F-03]]` (`[[fonctionnalite F-03]]`) → a link chip to the sheet, `title` = its title; `[[rule BR-12]]` (`[[regle RG-12]]`) → a link chip to `#/<page>~br-12`, `title` = the rule's title. An unknown id: `feature.unknown` / `rule.unknown`, error. In an export (§6.1a) a chip whose target is excluded becomes plain text, like any link.
- **Generated tables** (directives, resolved once every page is rendered):
  - `::features{}` (`::fonctionnalites{}`): every feature sheet, in table of contents order: Id · Feature (link) · Summary · Who (the page's `permissions`);
  - `::rules{}` (`::regles{}`): every rule: Id (link) · Rule · Defined in (link) · Cited by (the feature ids of the pages that cite it, else the pages);
  - `::roles{}`: rows = the feature sheets, columns = the distinct `permissions` of these sheets in order of first appearance, a cell "✔" (with a text alternative, `render.business.allowed`) when the sheet lists the permission.
- **Business pages cite no code**: a page of a business type (`feature`, `business-rules`, `roles-matrix`, `process`, `release-notes`) whose effective space is of a kind read without the code (`noCode`: `use`, `product`, §6.1a) and that contains a `file:line` proof gets the warning `business.technical` (a `screen` or `editor` page keeps the proofs of its "How it works", whatever its space) ("move the technical detail to its counterpart").

**Glossary**: an entry may have `technical` (string): where the term lives in the code ("table `orders`, column `status`, enum `OrderStatus`"). Site data `glossary[].tech`, emitted only when at least one entry has it. The term's bubble shows it under the definition, introduced by `ui.glossary.technical`, when the project has no spaces, or when the current space is "everything" or a space whose kind shows it (`glossaryTechnical`, site data `spaces[].tech`: `admin`, `develop`). The exports of the other spaces drop it.

**Coverage adapters** (§5)
- `openapi`: `file` (required: an OpenAPI 3 or Swagger 2 document in **JSON**, relative to the project), `family` (default "API"), `prefix`, `exclude`. One item per operation: id `GET /orders/{id}`, `label` = `summary` or `operationId`, `match` = the path in its `{id}`, `:id` and `[id]` forms. A YAML file: `{ available: false, reason: "yaml" }` (the kit's YAML reader, engine/core/yaml.mjs, serves the infrastructure files only; FastAPI serves its document as JSON at `/openapi.json`).
- `features`: `file` (default `features.json`, relative to the project), `family` (default "Features"); its items are matched whole (`whole: true`: `F-01` is not cited by `F-010`). The file is a list `[{ id, title, routes?, api?, keys?, sources?, behaviours? }]` (`schemas/features.schema.json`, other fields of an entry allowed; `sources`: globs of the feature's code, relative to `app.dir`; `behaviours`: the kinds of card its sheet describes; both read by `context` and `sync`, §6.10, §6.11, through `engine/core/features.mjs`); one item per feature, `match: [id]`: a feature is covered when a written page cites its id, in practice its sheet (`feature` of `toc.json`).

**`inventory --features [--write] [--force]`**: groups what the configured adapters see into candidate features: screen routes by their first static segment (`/orders`, `/orders/[id]`, `/orders/new` → `orders`), API routes by their first segment after `/api`, i18n keys by their first segment. Each candidate gets a suggested id (`F-01`… in order), a name, its routes, API routes and keys, and, if `features.json` already exists, the entry it already covers (a shared route or API route), if any — the simplest reading of "already cited": `features.json` is the artifact this command maintains, so a candidate is matched against it, not against the business pages' prose. Each candidate also gets the kinds of behaviour card its code points to (`behaviours`, from `facts/behaviours.json`: the hints of the files of its segment — `app/orders/page.tsx` for `orders` — and of the handlers of its API routes; `candidateKinds`, engine/sync/feature-files.mjs), printed as "behaviours (deduced from the code)" and written with it. Prints a table (`--json`: the list). `--write` writes `features.json`; an existing file is kept (exit code 1) unless `--force`, which keeps every existing entry as it is and appends only the candidates that match none of them.

**i18n fragment** `i18n/<language>/business.json`: `render.business.*`, `cli.build.feature.*`, `cli.build.rule.*`, `cli.build.business.*`, `cli.inventory.features.*`, `cli.adapter.reason.yaml`, `ui.glossary.technical`.

### 6.8a Feature sheets in depth: behaviour cards, user stories, scenarios

A feature sheet answers, for each behaviour of the feature, the questions a product owner and a tester ask (a search: which fields, contains or starts with, case and accents, several words, when it triggers, the order, no result, the rights), in business language. Three containers of the Markdown engine (`engine/build/markdown-product.mjs`, with `:::rule`, moved there unchanged but for its anchor, now escaped in its link), read without a regular expression on the writer's text (`engine/core/behaviours.mjs`), rendered by `engine/build/behaviours.mjs`; English and French spellings (§6.6).

**Behaviour cards** — `:::behaviour{kind title id? feature?}` … `:::` (`:::behavior`, `:::comportement{type titre id fonctionnalite}`).
- **Kinds**: `standard/behaviours.json` (`schemas/behaviours.schema.json`): `search`, `filter`, `sort`, `pagination`, `list`, `form`, `import`, `export`, `calculation`, `notification`, `workflow`, `scheduled-job`, `permission-check`, each with its `aliases` (French: `recherche`, `filtre`, `tri`, `liste`, `formulaire`, `calcul`, `circuit`, `traitement-planifie`, `controle-droits`…), its `title` and `icon`, and its **rubrics** (`id`, `label` en/fr, `aliases`, `required`, `hint` en/fr: what the rubric must say). A project adds kinds with `config.behaviours.file` (a file of the same schema, without `answers`, relative to the project; a kind that takes a spelling already used: `behaviour.kindTwice`, error; a file that does not follow the schema: the validation errors, or `behaviour.file`; absent: `behaviour.fileMissing`).
- **Body**: an introduction (the lines before the first rubric), then one `Rubric: value` line per rubric — the label in either language or an alias, in any case, optionally in bold or as a list item (`- **Rubric**: value`, `**Rubric:** value`, `Rubric : value`), at the start of its line; a label longer than 60 characters is prose. A value continues on the lines after it, up to the next rubric line — an indented line is never a rubric line (a sub-list under "Columns:" stays in its value); a rubric written twice keeps both values.
- **States**: a value that starts with one of the words of `answers.na` (`n/a`, `not applicable`, `sans objet`…) is `na`, of `answers.unknown` (`unknown`, `to confirm`, `inconnu`, `à confirmer`…) is `unknown` (its question belongs in "Open questions" too), when the word stands alone or is followed by a separator — `—`, `–`, `-`, `:`, `.`, `;`, `,` — after optional emphasis or blanks ("n/a — reason", "**Unknown**: the question"); anything else is `answered` ("Unknown customers are not listed"). A required rubric absent or empty is `missing`: `behaviour.missing` (one per card, naming the rubrics), a **warning**, an error of the strict build with `config.behaviours.strict`. An optional rubric left out is no row.
- **Markup**: `<div class="comportement" data-kind>`: a header (the kind's icon, "B-01 · Search", the title as an `h3` — `id` = the card's id in lower case, else its title's slug made unique — in the page outline and the search index, and the count of its rows by state), the introduction, then `<dl class="rubriques">`, one `<div class="rubrique renseignee|sans-objet|a-confirmer|manquante">` per rubric, in the kind's order, with a state icon and a text alternative; a missing rubric reads `render.behaviour.notDescribed`.
- **Checks**: without `kind` or `title`: `behaviour.attributes`; an unknown kind: `behaviour.kind` (with the known kinds); an id defined twice: `behaviour.duplicate`; a `feature` that names no declared sheet: `feature.unknown` — all errors.
- **Registry** `engine.behaviours`: id (else `page~anchor`) → { id, kind, title, page, anchor, feature, counts, open } (`counts`: of the **required** rubrics — required, answered, na, unknown, missing; the depth of a sheet, lots 6 and 7; `open`: those required rubrics left out or answered unknown, `{ id, state }`, §6.11a).

**User stories** — `:::story{id title role? since? ref?}` … `:::` (`:::recit{id titre role depuis ref}`): "As a …, I want … so that …". Rendered as `<div class="recit">`: an `h3` "US-01 · title" (`id` = the story's id in lower case), its labels (role, "since 1.2", the ticket `ref` as written, the number of its acceptance criteria), then its text. Without `id` or `title`: `story.attributes`; twice: `story.duplicate` — errors. Cited with `[[story US-01]]` (`[[recit US-01]]`): a link chip (`puce lien-recit`); unknown: `story.unknown`, error. Registry `engine.stories`: id → { title, page, anchor, role, since, ref }.

**Scenarios** — `:::scenario{title story? behaviour?}` … `:::` (`:::scenario{titre recit comportement}`): an acceptance criterion, one step per line, keywords as written `Given`, `When`, `Then`, `And`, `But` (`Soit`, `Étant donné (que|qu')`, `Sachant que`, `Quand`, `Lorsque`, `Lorsqu'`, `Alors`, `Et`, `Mais`), in any case, optionally in bold or as a list item; a line without a keyword continues the step above. Attached to its story and its card by attribute (never nested). Rendered as `<div class="scenario">`: its number in the page, its title, the links to its story and its card (`puce lien-recit`, `puce lien-comportement`), then `<ul class="gherkin">`, one `<li class="soit|quand|alors|et|mais">` per step. Without `title`: `scenario.attributes`, error; without a `Then` after a `Given` or a `When`: `scenario.steps`, warning; a story or a card it names that does not exist: `story.unknown` / `behaviour.unknown`, errors. Registry `engine.scenarios`: [{ title, page, story, behaviour }].

**Second pass** (`resolveBusinessRefs`, engine/build/business.mjs, once every page has rendered): the links of a scenario and the `[[story …]]` citations are resolved like the other citations; each story gets the number of the scenarios that name it ("2 criteria", or "no criteria", `render.story.*`).

**Configuration**: `behaviours: { file: null, strict: false }` (`file`: the project's own kinds; `strict`: a rubric left out fails the strict build). **i18n fragment** `i18n/<language>/product.json`: `cli.build.behaviour.*`, `cli.build.story.*`, `cli.build.scenario.*`, `render.behaviour.*`, `render.story.*`.

### 6.8b The backlog: epics, features, user stories

The feature sheets and their stories are a backlog (§6.8a), read by the build from what it already knows — one model
(`engine/build/backlog.mjs`), read today by the build's checks and `::stories{}`, and the one the Product board and
the backlog export are to read:

- **Epics** are groups of `toc.json`: `epic` (`E-01`), `summary` (a text field, translated), `ref`. A group of
  feature sheets without `epic` is still a group of the backlog, by its title. Two groups with one id: `epic.duplicate` (strict,
  the first kept). A feature is in its group's epic, or in the one its page names (`epic`; one no group declares:
  `epic.unknown`, strict).
- **Features** are the feature sheets (§6.8): their page may set `since` (the version it shipped in) and `ref`. A
  feature's roles are its stories' roles, its kinds its behaviour cards' kinds (its sheet's, and those naming it).
- **Stories** are the `:::story` of the feature sheets; a story's version is its own `since`, else its feature's, else
  none. A story written elsewhere: `story.outside` (a warning), left out of the backlog. `epic`, `since` or `ref` on a page
  that is no feature sheet: `backlog.field` (a warning), ignored.
- **Depth** (`featureDepth`, the one measure the board and the audit are to share): the mean, from 0 to 100, of the criteria that
  apply — the sheet written and conformant (1; 0.5 with a required section missing or guidance left; 0 not written),
  at least one story, the share of its stories with acceptance criteria (a scenario naming them), at least one
  business rule defined in its sheet or cited by it, and the share of the rubrics of its behaviour cards answered (an explicit n/a counts;
  without cards it does not apply).
- **Ticket references** (`engine/core/refs.mjs`): `ADO#1234` or `AB#1234` (Azure Boards), `PROJ-123` (Jira),
  `owner/repo#42` (GitHub), `group/sub/project#7` (GitLab; a `.` or `..` segment makes it no reference). A story's
  reference is linked from `config.backlog.refs` (an `https://` address with `{id}`, and `{repo}`; with both GitHub
  and GitLab, two parts are GitHub's, more GitLab's), the parts URL-encoded, the link opened with
  `rel="noopener noreferrer"`; the epics' and features' are kept in the model. A reference the kit cannot read is kept as written,
  without a link: `backlog.ref` (a warning). A story's ticket is a placeholder of the first pass (`data-ticket`), linked by the
  second (`resolveBusinessRefs`).
- **`::stories{}`** (fr `::recits{}`): every story of the feature sheets — id, story, feature, role, version,
  criteria, ticket — resolved in the second pass like `::features{}`.
- **The Product board** (`engine/build/board.mjs` → `D.board`, drawn by `engine/site/lib/board.js`): the model for the
  site — epics, features (their depth as values), stories, versions, each ticket with its link already made (the
  browser never builds an address), each kind of behaviour with its label and icon. In the site data only when a
  feature sheet exists and the site has a space whose kind shows the board (`standard/spaces.json` `board`: the
  `product` kind; site data `spaces[].board`) or a page holds `::board{}` (fr `::tableau{}`: a placeholder of the
  second pass, `<div class="tableau-produit" data-board>`); otherwise neither `board` nor the `ui.board.*` texts are
  embedded. A space's export keeps it by the same rule, reduced to the features whose sheet it keeps (§6.1a). The home of a space whose `board` flag is set holds its place; `board.js` draws a map
  (epics × features, a row of stories per version) or a list (Epic › Feature › Story, folding), the filters (who, epic,
  version, depth, text) with a `role="status"` count, links to the sheets and the stories' headings, the arrow keys
  from card to card, the view remembered (`__THEME_KEY__.board`), the list printed.
- **The backlog export** (`doc-kit backlog export <target>`, `engine/backlog/`): `build()` returns the model of the
  language built (`backlog`; `null` when the outline itself is wrong), its stories with their text and their
  scenarios' steps as plain text (`plainLines`, `engine/core/text.mjs`). The command builds in memory, strict, the
  spaces' exports off: an error whose key is `epic.*`, `feature.*`, `story.*`, `scenario.*` or `backlog.*`
  (or any error of an outline that cannot be read) refuses the export, nothing written; a backlog without a feature
  sheet is `backlog.empty` (1). `model.mjs` makes the items, each before its children — an epic with an id, its
  features, their stories; a group without an epic is no item — with a title (its id first when
  `backlog.idInTitle`, one line, at most 255 characters), lines of text, a story's criteria, its version, its link
  (`backlog.docUrl` `#/<page>`, a story `#/<page>~<anchor>`). An item whose `ref` is of the target tool
  (`refTool`, `engine/core/refs.mjs`) is left out unless `--all`; its children name it (`parentRef`). Every text
  goes through `withoutSecrets` (`render.backlog.removed`; exit code 1, files written). The exporters
  (`EXPORTERS`, one module each): **azure** — CSV, UTF-8 with BOM, CRLF; `Work Item Type`, `Title 1..n` (the
  depth), `Description` (HTML), `Acceptance Criteria` (Agile and Scrum; otherwise the end of the description),
  `Tags` (`v<version>`), `Area Path` and `Iteration Path` when set; the types of `backlog.azure.process`; at
  most 1,000 items a file, each top item whole (`-1.csv`, `-2.csv`…), one of more refused
  (`backlog.azure.tooLarge`); a parent already in Azure DevOps named in the description (`toLink`). **jira** —
  CSV; `Work item ID` (1..n), `Work type` (`backlog.jira.types`, default `{ epic: null, feature: "Epic",
  story: "Story" }`: an epic without a type is no item, its id a label of what it holds), `Summary`, `Description`
  (wiki markup), `Parent` (a number of the file, or the key already in Jira), `Labels` (repeated). **gitlab** —
  CSV `title`, `description` (Markdown, naming the epic and the feature), the features and the stories.
  **github** — `-github.json` (`doc-kit/github-issues@1`: `key, title, body, labels, type?, parent,
  parentRef?`, `backlog.github.types`) and `-github.md` (each issue put in a file with `jq` and sent with
  `gh api …/issues --input`, never pasted into a shell string; then the REST `sub_issues` by the child's id; no API
  call, no script). **json** — `doc-kit/backlog@1` (`schemas/backlog.schema.json`), every
  item. Inert text (`markup.mjs`, character by character): HTML escaped; Jira's wiki characters escaped; Markdown's
  escaped (`&` too: no entity becomes a mention), a mention `@name`, a reference's sign before a number whatever
  precedes it (`#12`, `acme/shop#42`, `!12`, `&12`…) and `GH-12` followed by U+2060 (no notification, no
  "mentioned in"), a GitLab line starting with `/` escaped (no quick action); a CSV cell starting with `=` `+`
  `-` `@`, a tab or a carriage return prefixed with an apostrophe (`csv.mjs`). Texts: `render.backlog.*` in
  the documentation's language, `cli.backlog.*`.

### 6.9 Facts and the takeover dossier (the Develop and Administer spaces)

The takeover dossier (the Develop space, with its operating pages in Administer) is what a team needs to take over an application, especially one written largely by AI assistants ("vibe-coded"), whose usual risks are: missing access control (row-level security), secrets in the code or the client, packages that do not exist, duplicated code, missing or misleading tests, and agent instruction files that act as a hidden specification. Every claim is backed by a proof (`file:line`), or marked as deduced or unknown.

**Page types** (`standard/templates/takeover.json`; templates and examples as in §6.8). `*` = required.

| Type | Sections | maxWords |
|---|---|---|
| `access-ownership` | In short* · Who owns what* · Secrets and where they live · Accounts of the AI tools · Unknown owners* · Handover checklist | 2200 |
| `api-surface` | In short* · The routes* · Database access rules · Public routes · Gaps* | 3000 |
| `runbook` | In short* · Install* · Build · Deploy* · Roll back* · Scheduled jobs · Backup and restore* · When it breaks | 3000 |
| `data-model` | In short* · The diagram · Tables* · Personal data* · Retention · Processors · Migrations | 2500 |
| `dependencies` | In short* · Direct dependencies* · Packages that do not exist* · Licences · Out of date · To check | 2200 |
| `code-map` | In short* · Context* · Containers* · Components* · Integrations · Duplicated or dead code | 2500 |
| `tests-quality` | In short* · What is tested* · Critical flows* · Tests that test nothing · How to run them* | 2200 |
| `agent-instructions` | In short* · The files* · Each rule* · Hidden characters* · What to keep | 2500 |
| `adr` | Status* · Context* · Decision* · Consequences* · How it was reconstructed* | 1500 |
| `threat-model` | In short* · The data flow diagram* · Trust boundaries* · Threats* · Mitigations · Accepted risks | 3000 |

- **`::erd{title, tables}`** (`::mcd`) draws the entity-relationship diagram from `facts/db.json` at build time (`engine/build/erd.mjs`): one box per table, columns merged from every place it is defined (10 shown, then "… n more"), one arrow per reference (`references`: a Prisma relation field, a SQLAlchemy `ForeignKey`, a SQL `REFERENCES`); inline SVG coloured by the theme (classes `erd-*`). `tables` limits it to some tables. No `facts/db.json`: `facts.missing` (error); no table: `erd.empty` (warning) and a note.
- **The developer views** (`engine/build/developer.mjs`, pure functions over the facts files), each with `limit` (rows, default 10, at most 100):
  - **`::modules{limit}`**: from `facts/modules.json`, the counts (files, imports, cycles, orphans), each import cycle, the files most depended on (fan-in, then fan-out) and the orphan files (no static import to or from them).
  - **`::hotspots{limit}`** (`::points-chauds`): `facts/history.json` × `facts/quality.json`. A hotspot is a measured source file (tests, generated and vendored files are not) ranked by commits × the complexity of its most complex function (its lines / 50 when no function was measured); each row gives its commits, complexity, lines, authors and main author, with a bar relative to the first. A history with `available: false` gives a note.
  - **`::health{limit}`** (`::sante`): one card per subject (maintainability ratings, security findings by severity and files with a secret, tests and coverage, architecture, knowledge, dependencies, tooling), each "not measured" with its `facts --source` when its facts file is missing; then the main risks, most severe first, at most `limit`: one per high or critical security rule, secrets, packages unknown to their registry (`--network`), no test file or a coverage under 50 %, a bus factor of 1, import cycles, a rating of D or E, no CI, linter or type checking.
  - **`::c4{title}`** (`engine/build/c4.mjs`): the container view (C4, levels 1 and 2), never guessed. A **container** is a folder whose manifest names a framework among its direct runtime dependencies (`next`, `nuxt`, `@sveltejs/kit`, `@remix-run/node`: a web application; `express`, `fastify`, `@nestjs/core`, `hono`, `koa`, `fastapi`, `flask`, `django`: an API; `react`, `vue`, `svelte`, `@angular/core`, `solid-js`, `astro`: a web front end; a folder keeps the first kind in that order). The **database** comes from a driver or an ORM (Prisma, Drizzle, SQLAlchemy, pg, psycopg, mysql2, SQLite, MongoDB), `facts/db.json`, or a `DATABASE_URL`-like variable. An **external system** is a known service (Stripe, OpenAI, Anthropic, Supabase, Firebase, Clerk, Auth0, AWS, Google Cloud, GitHub, SendGrid, Resend, Mailgun, Postmark, SMTP, Twilio, Slack, Sentry, PostHog, Cloudinary, Algolia, Redis) named by a variable (a front-end prefix such as `VITE_` or `NEXT_PUBLIC_` is read through) or a runtime package. Users point to the front end (else to every container), the front end to the API, and each system is reached from the container whose folder holds its evidence. Under the inline SVG (classes `c4-*`), a table gives each element and its evidence. `facts/dependencies.json` is required; `env.json` and `db.json` add what they hold.
  - **`::c4{view="deployment"}`** (fr `vue="deploiement"`; `engine/build/c4-deployment.mjs`, the model in `engine/facts/deployment.mjs`): the deployment view, from `facts/infra.json` (required). One column per environment the infrastructure files name (production first, then pre-production, staging, UAT, QA, test, development, sandbox, demo, local, any other by name, and the items no file places last), each with its entry points (ingresses, services), its workloads and jobs, and its cloud resources counted by provider; above them, the pipelines with an arrow to each environment they deploy to (an environment a CI file names — one a pipeline includes counts as its own). Under the SVG, a row per element (at most `limit` per environment, 10 by default, the rest counted) with its settings — replicas, image and tag, "no tag (latest)" but for a build stage, ports, runs as root, TLS, open to all, schedule — and its `file:line`. A variable, an output, a provider, a volume or a CI job is not shown. Another `view`: `c4.view`, strict.
  - A missing facts file is `facts.missing` (error; `::health` only when none of its sources exists); a view with nothing to show is `developer.empty` (warning; the deployment view's is `c4.deployment.empty`, whose help names `facts --source infra`) and a note.
- **Who owns what** (access-ownership): one row per asset (domain, repository, hosting, database, payment, e-mail, AI accounts, each secret): Asset · Owner · Where · How to hand it over · Status. The page is complete when "Unknown owners" is empty.
- **The routes** (api-surface): Method · Route · Authentication · Role · Tenant isolation · Proof; built from `::facts{source="api"}` then completed by hand.
- **Each rule** (agent-instructions): Rule · File:line · Status (confirmed, obsolete, contradicted by the code), with the proof.
- **Threats** (threat-model): STRIDE, by trust boundary of the data flow diagram.
- `adr`: one page per reconstructed decision, as sub-pages of an `architecture` or `technical` page; "How it was reconstructed" says from which code, commits or people.
- **`findings` becomes a risk register**: its tables gain Owner · Decision (fix, accept, transfer, avoid) · Status (open, in progress, done, accepted) · Due date, combined into one "Follow-up" column (four separate columns rarely fit the reading width once a proof and a recommendation are already tables; the example combines them). Its sections do not change: existing pages stay conformant.

**`doc-kit facts [--source <name>] [--network] [--tools] [--json]`** reads the application code (`app.dir`, §3; without it: `facts.noApp`, exit code 2) and writes one file per source, `facts/<source>.json` (folder `paths.facts`, default `facts`, §3), in the documentation project, **committed with it**: `{ source, generator, generated, commit, app, items }` — `generated` the ISO date, `commit` the git HEAD of the application (or `null`), `app` the application folder relative to the project, items sorted, paths relative to the application, forward slashes. A file that is there but cannot be read (a manifest that is not valid JSON, a broken coverage report) is listed in `unreadable: [{ file, reason: "read"|"json"|"xml"|"tooLarge"|… }]` (`tooLarge`: a file over 512 KB, which `stack`, `env`, `db`, `behaviours`, `agents`, `tests` and `quality` never read), present only when not empty, and printed as a warning: those facts are unknown, which is not the same as none. Same code, same file (except `generated`). `--source` (repeatable) limits the sources. Nothing is ever written in the application. A folder below `app.dir` that holds a `doc.config.mjs` is a documentation project (often `docs/manual`, inside the application): no source reads it, whether the files come from a walk or from `git ls-files` (`withoutDocProjects` in `engine/facts/common.mjs`).

| Source | Read from | Item |
|---|---|---|
| `dependencies` | Every manifest and lock file found under the application, searched recursively (at most 4 folders deep: a vibe-coded application almost always splits a front end and an API into their own folders, each with its own manifest; `vendor/` and `target/` never walked), each giving its own items: npm (`package.json`, `package-lock.json` v1 to v3, `pnpm-lock.yaml`, `yarn.lock` v1 and berry), pip (`requirements*.txt`, `pyproject.toml` — PEP 621 `[project]`, its optional dependencies, PEP 735 `[dependency-groups]`, Poetry —, `poetry.lock`, `uv.lock`, `Pipfile`, `Pipfile.lock`), maven (`pom.xml` with its own properties and dependency management, `build.gradle`, `build.gradle.kts`, `libs.versions.toml`, `gradle.lockfile`), nuget (`*.csproj`, `*.fsproj`, `*.vbproj`, `Directory.Packages.props`, `packages.config`, `packages.lock.json`), composer (`composer.json`, `composer.lock`), go (`go.mod`), rubygems (`Gemfile`, `Gemfile.lock`), cargo (`Cargo.toml`, `Cargo.lock`). `version`: the exact version the file states, else null with `spec` as written (a package.json's or a pyproject.toml's range included); `direct`: when the file says so itself (a lock's root entries: package-lock.json's root and every entry outside `node_modules` — its workspace members and the folders its `file:` links point to (`libs/x`, `../shared`), whose dependencies are direct too —, every pnpm importer, uv.lock's own project packages, its editable members included; a package-lock v1, which has no such entry, takes them from the package.json beside it and its workspaces only, so a link's own dependencies are no direct ones there), else from the manifest beside a lock file that has none, in the same folder (yarn.lock and package-lock.json v1 ← package.json and its workspaces, inside that folder; poetry.lock ← pyproject.toml; Pipfile.lock ← Pipfile), else false; `dev`: a dev only dependency (`devDependencies`, PEP 735 groups, PDM's `[tool.pdm.dev-dependencies]`, Rye's and uv's `dev-dependencies`, Poetry's dev groups, a Pipfile's `[dev-packages]`; a package that is a dependency of one pnpm importer and a dev dependency of another is not dev); `via` (a transitive item of package-lock.json, yarn.lock, poetry.lock or uv.lock): the shortest chain of names from a direct dependency to its parent, at most 12; `local`: not from the ecosystem's public registry (a folder, an archive, git, a workspace member, another registry, any package its pyproject.toml's `[tool.uv.sources]` names) — never sent. **Workspaces** (a package.json's `workspaces`, an array or `{ packages }`): the folders under that package.json are listed — three deep at most, 2,000 looked at, never a link, a dot folder, `vendor/`, `target/` or a folder the facts skip — and compared with the patterns segment by segment, never resolved from them: a name, `*`, `**`, or a name with one `*` inside (`pkg-*`, `*-web`), 100 characters a segment at most; any other form (several `*`, `?`, brackets, braces, `..`, an absolute path) is not followed; 50 distinct patterns of 8 segments at most, `!` leaving a folder out; 200 members at most. A manifest read beside a lock file is an ordinary file of 4 MB at most, reached through no link from the lock's folder. No TOML, YAML or XML library: small line readers, and the bounded, DTD-free XML reader of §6.19 | `{ name, version, ecosystem, direct, dev, manifest, license?, local?, public?, spec?, via?, extras?, operator? }` (a package.json's `dependencies` and `optionalDependencies` are not dev, its `devDependencies` are) |
| `env` | `process.env.X`, `process.env["X"]`, a destructuring read (`const { X, Y } = process.env`), `import.meta.env.X`, `os.environ["X"]`, `os.environ.get("X")`, `os.getenv("X")`, a pydantic settings class (`class Settings(BaseSettings):`, `pydantic.BaseSettings` v1 or `pydantic_settings.BaseSettings` v2: one name per field, `env_prefix` + the field name upper-cased, replaced outright by `Field(..., alias=…)`, `validation_alias=…` or the v1 `env=…`); names of `.env.example`, `.env.sample`, `.env.template` (never the values, never `.env`) | `{ name, files: ["path:line"], example }` |
| `stack` | The stacks and low-code platforms the application uses (standard/adapters.json, `detect`), then each language of its code (by extension; tests, generated files and files over 512 KB left out): its files and lines, and whether the kit reads it here — by its own sources (`core`) or by the stack adapter of a stack detected (Spring reads Java where Spring is a dependency); `stacks` and `summary` (`share`: the part of the lines read, in percent) beside the items | `{ language, files, lines, read, by }` |
| `api` | The stack adapters' route handlers (§5): Next.js App Router (`route.ts|js`, exported methods), Next.js `pages/api`, FastAPI decorators (with `APIRouter(prefix)` and `include_router(prefix)` when found), Express (`app|router.<method>("/path")`), and the project's own adapters | `{ method, route, file, line, framework, auth, guards }` (`line`: the handler's decorator, export or call) |
| `infra` | The infra adapters (§5): Dockerfiles, Terraform, Bicep, ARM, CloudFormation, Kubernetes and OpenShift, Helm, Compose, GitHub Actions, GitLab CI, Azure Pipelines, Ansible — what they declare, through one whitelist (names, a few settings, never a value) | `{ kind, provider, type, name, file, line, env?, image?, tag?, replicas?, ports?, root?, tls?, openToAll?, schedule?, variables?, source?, version? }` |
| `screens` | The stack adapters' screens (§5): the pages of the Next.js App Router and Pages Router (their API, shell and error pages left out), the routes of the front-end routers | `{ route, file, line, framework, auth?, guards? }` (`auth` and `guards` only when the router declares guards) |
| `db` | `schema.prisma` (models, `@@map`, relations), SQLAlchemy (`__tablename__`, `Column`, `mapped_column`), SQL migrations (`CREATE TABLE`, `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`) | `{ table, columns, file, rls, policies, references }` |
| `behaviours` | the code of the application (JavaScript, TypeScript, JSX, Vue, Svelte, Python, HTML) and its OpenAPI documents in JSON — never its tests, its comments, a file over 512 KB; see **Source `behaviours`** below | `{ family, signal, file, line, field?, value?, values?, route?, via }` |
| `agents` | at any depth (each package of a monorepo may have its own): `AGENTS.md`, `AGENT.md`, `CLAUDE.md`, `GEMINI.md`, `.claude/**/*.md`, `.agents/**/*.md`, `.cursorrules`, `.cursor/rules/**`, `.github/copilot-instructions.md`, `.github/instructions/**/*.md`, `.windsurfrules`, `.windsurf/rules/**`, `.clinerules`, `.junie/guidelines.md`, `.kiro/steering/**/*.md`, `.aider.conf.yml`, prompt files (`**/*.prompt.md`) | `{ file, lines, words, hidden: [{ line, codepoint }] }` |
| `secrets` | the patterns of `engine/check/secrets.mjs` over the application files (`git ls-files` when available; else every file but `node_modules`, `.git`, `dist`, `build`, `.next`, `.venv`, `venv`) | `{ file, rule }` — **never the value** |
| `tests` | test files (`*.test.*`, `*.spec.*`, `test_*.py`, `*_test.py`, `tests/`), number of tests (`it(`, `test(`, `def test_`), coverage reports (`coverage/lcov.info`, `coverage/coverage-summary.json`, `coverage.xml`) | `{ file, tests }`, and `summary: { files, tests, coverage? }` |
| `modules` | the application's own imports (JS/TS with `tsconfig` paths, Python relative and absolute), resolved like `sync` (`engine/facts/imports.mjs`); packages left out; at most 5,000 files | `{ file, imports, importedBy, cycle }` (fan-out, fan-in, the cycle id or `null`); `summary: { files, edges, cycles, orphans }` (`cycles`: the strongly connected components of more than one file) |
| `history` | `git log --numstat --no-renames --relative` (2,000 most recent commits, read-only, hardened), limited to the files still tracked; author names only, never e-mails | `{ file, commits, churn, authors, owner, ownerShare, last }`, the 300 most often changed files first; `summary: { available, commits, authors, since, until, busFactor, files }` (`busFactor`: the fewest authors who made half of the commits) |

- **Hidden characters** (`agents`): U+200B–U+200F, U+202A–U+202E, U+2060–U+2064, U+2066–U+2069, U+FEFF (except at the very start), U+E0000–U+E007F.
- **`--network`** (`dependencies`): checks that each direct dependency exists in its public registry (npm, PyPI), `exists: true | false | null` (`null`: no answer); only the package name is sent, once a package however many manifests name it (a PyPI name compared as PEP 503 says); 5 s per request, 8 at a time. Without `--network`, `exists` is absent. **A name is sent only when a lock file proves its public registry served it** — its item there `public: true`: a package-lock.json (v1 to v3) or yarn.lock v1 entry whose `resolved` is that package's own tarball on `registry.npmjs.org` / `registry.yarnpkg.com` (its path `/<name>/-/…`, the name compared exactly: an alias resolved to another package's tarball proves nothing; another entry of the same package-lock resolved to another package's tarball, or written without `resolved` (a copy bundled inside another package's tarball — `inBundle`, v1 `bundled` — apart), drops the name's proof, whatever the order of the lock's keys (npm reads them in any order: each name's verdict is given once every entry is read); a package-lock whose locations are not all written as npm writes them proves nothing — v2/v3: each key read as npm resolves it, from the lock's folder, and the relative path back must be the key itself (no empty, `.` or `..` folder that cancels out, no climb past the filesystem's root, no drive or absolute path, no `\`), and a key that goes out of the folder (`../shared`, as npm writes a `file:` link) must not come back into it, in any case: npm resolves `node_modules/x/`, `node_modules//x`, `a/../node_modules/x` or `../app/node_modules/x` from `app` to the same folder, its later entry replacing the earlier one; v1: every dependency named `name` or `@scope/name` (npm 7+ reads `x/`, `./x`, `a/../x` as a location of its own), and every entry located as npm 7+ reads a v1 lock — a link's own dependencies below the folder it links to; npm's choice among an entry's `version`, `from` and `resolved` is not mimicked: its dependencies are counted at its own location and below every folder one of these fields may name — wider than npm's own reading: `file:` in any case, a spec that starts with `.`, `/`, `\`, `~` or a drive, any other holding a `/` or `\` that npm does not read as a URL (letters, then `:`) or a scoped registry spec (`@scope/x@^1`); never an archive, `.tgz`, `.tar.gz`, `.tar` —, 64 places at most (past them, no proof) —, read level by level, each folder interned (one id a folder, reached from its parent's by one name: linear); a location reached twice at any of these places (a link to the lock's own folder, by its present name too, brings its dependencies onto the root's) proves nothing, and so does a link to a home folder (`~`), an absolute path or a drive, which depends on the machine that installs; not told: a link (or a v3 key) that comes back into the folder under another name than it has where the kit reads it (a renamed clone); a Windows 8.3 short name (`CORPOR~1`, the same folder as a long one) in a v1 name or a v3 key proves nothing either; a `packages` that is no object, which npm refuses, makes the lock unreadable (`reason: "json"`); in v1 to v3, two locations a filesystem that compares names in any case and any Unicode form (NFKC) and drops their trailing dots and spaces reads as one folder (`node_modules/Corp-Lib`, `node_modules/corp-lib.`) prove nothing either, and a key starting with `/` (a UNC path) is no npm location; the root's own top-level `node_modules/<name>` entry is the package's own (its version, its proof), a nested copy, a workspace's or an outside folder's that npm sorts before it only a later word on it; a lock in UTF-16, which npm, Yarn, Poetry and uv do not read, is unreadable (`reason: "read"`), so proves nothing; a yarn.lock proves only when written as a whole as Yarn 1 writes one — its lines ending with `\n` or `\r\n` (a lone `\r` is a form Yarn and the kit may read apart), its comments and blank lines between blocks only (never followed by an indented line), no berry `__metadata`, no git conflict marker, every string closed on its line and no backslash (Yarn's tokenizer reads a string left open on past its line and refuses the lock; Yarn 1 writes no escape, which its tokenizer and JSON read each their own way) — and, in it, a name only when every block naming it proves it (one without `version`, or whose header names a workspace, included: every block is judged before any is left out) and no other name of the lock goes into the same folder (`corp-lib.`, `corp-lib `, `Corp-Lib`, another Unicode form: a filesystem that folds case, Unicode forms and trailing dots and spaces installs them into one, as package-lock's twin locations), each block written as Yarn 1 writes one: its header the specifiers Yarn writes (joined by ", ", a quoted one holding no comma, an unquoted one as Yarn leaves one: a letter first, never `true` or `false` — Yarn quotes `@scope/x` and `7zip-bin`), its fields at two spaces `version`, `resolved`, `integrity`, `uid`, `dependencies`, `optionalDependencies` in their own forms (one space before the value, nothing after it: Yarn's tokenizer reads `resolved<tab>"…"` as another key), the lines at four spaces under a section of dependencies only, `version` and `resolved` once; the tarball is read once a block), a poetry.lock entry with no source, or a source of type `legacy` on PyPI's index, read in any TOML form (a poetry.lock the kit cannot read to its end, holding a `[[package]]` with no name (Poetry cannot read it; the tables after it would be its own), or that holds an array of tables other than `[[package]]` — its `[package.source]` then belongs to no block the kit can tell —, proves nothing), a uv.lock entry whose `source` is PyPI's registry and whose files (`sdist`, `wheels`) are on PyPI's file host, `files.pythonhosted.org` — uv downloads the files its lock names: one elsewhere makes the package local — (a uv.lock the kit cannot read to its end, a block with two sources, a key given twice in its source's or its files' inline table — however spelled: keys are decoded —, or a source or files written as a table of their own or a dotted key, forms uv never writes, proves nothing); a poetry.lock and a uv.lock are read by the decoded path of each value, as Poetry and uv read them — a header spelled `[["package"]]`, `[[ 'package' ]]` or `[package . sdist]`, an escaped key (`"n\u0061me"`) are the same tables and keys; their string values too are read as the tools read them (`"corp\u002dlib"` is corp-lib, a URL's escapes decoded), and a name or version that is no one-line string (multi-line, followed by more) is a doubt; in the second net, a registry, an index, an own name or a requirement (`project.dependencies`, uv's `override-dependencies`, in a pyproject.toml or a uv.toml) written as a string the kit does not read makes every package of its ecosystem private; a pyproject.toml's requirement arrays are read by the decoded path of each value whatever the TOML form (a header, `["project"]`, a dotted key `project.dependencies`, an inline table `optional-dependencies = { dev = […] }`), and every pyproject.toml and uv.toml of the application is read as the folders' declarations are, even in a folder no item names; in a poetry.lock or a uv.lock, among what TOML refuses, these — a key given twice under one header, a table defined twice in one block, a table that redefines an array of tables (`[package]` after `[[package]]`) or the reverse, a source field written as an inline table and again as a table of its own — are doubts, and the lock proves nothing (Poetry and uv refuse it); so is, by the kit's own limit, a key or a table name over 1,000 characters as written (its quotes and the dots of its path counted), whose content is left out (no reader builds a string or a map key from a long name); the tables and arrays of tables are compared over the whole file, not within each element of an array of tables, so a shape TOML allows such as `[[a]]`, `[a.b]`, `[[a]]`, `[[a.b]]` is a doubt too (closed, never a proof); a key is told apart by the number of its header and its own parts, never the header's text again, so the reading stays linear; a Pipfile.lock proves nothing — Pipenv's mirror (`PIPENV_PYPI_MIRROR`) is not written in it, which names PyPI for a package a company mirror may have served; a name that a lock entry proves and a later entry of the same lock takes from elsewhere is local; the proof covers the package wherever it is named (its package.json item too). A package named only by a manifest, a pnpm-lock.yaml or a yarn berry lock (they write no registry), or of any other ecosystem, is never sent: `unproven: true`, `exists: null`. Nor is a name its public registry cannot hold, whatever a lock says of it (a forged proof): npm's URL-safe names only, neither `.` nor `_` first (a scope likewise), 214 characters at most; pip's PEP 508 names (`café`, `_corp`, `corp-` are none): `private: true`. Then, as a second net, **a private package's name is never sent** (`isPrivatePackage`, `engine/facts/network.mjs`), whatever the request (`dependencies` and `quality`). A package is private when: its version or the range a package.json declares is not a registry release (a folder — as npm reads one: any spec that starts with `.` (`.`, `..`, `./x`), `/`, `~/` or a drive (`C:\x`, `C:x`) —, an archive — `x.tgz`, `x.tar.gz`, `x.tar`, in any case —, any spec holding a slash (npm reads `@corp/lib` or `a/b` as a folder, `user/repo` as GitHub), any protocol but a registry's (`npm:`): a workspace, a link, a portal, `exec:`, `patch:`, a git repository — `git+…`, `ssh:`, `git@host:…`, `github:`, `gitlab:`, `bitbucket:`, `gist:`, `user/repo` —, a URL), an npm alias (every `npm:` spec, as npm reads them: `"corp-ui": "npm:@corp/ui@^1"`, `npm:corp-ui`, `npm:x`, `npm:1x`: its name is the project's own, never sent, in its lock file either; berry's explicit `npm:^1` cannot be told apart from one, and is never sent either; in a Yarn 1 `yarn.lock`, every `npm:` range of a header is one too — `corp-ui@npm:xcorp-ui`, the latest of another package —, in a berry lock, whose protocol `npm:` is, one naming another package), or a manifest or lock file took it from elsewhere than a public registry (`local: true`: a package-lock `link`, or a `resolved` outside `registry.npmjs.org` / `registry.yarnpkg.com` in v1 to v3, a yarn.lock `resolved` likewise, a berry `resolution` other than `npm:` / `patch:` or a specifier whose range is one of the forms above, a pnpm-lock `resolution` with a `tarball`, `repo`, `directory` or `commit`, a poetry.lock `[package.source]` that is not a PyPI index, a PEP 508 direct reference `name @ …`, a Poetry dependency with any field but a registry's — `version`, `python`, `markers`, `extras`, `optional`, `allow-prereleases`, `platform`, a `source` naming PyPI — (`path`, `git`, `url`, `develop`…), a `[tool.uv.sources]` entry, a `[tool.uv]` `override-dependencies` or `constraint-dependencies` taken from a URL or a folder (`name @ …`; in a `uv.toml`, every pip package private), a package-lock entry that is an alias (its `name` another package's), a uv.lock package whose source is not PyPI's registry (its workspace members, and one without a source, included), a Pipfile package with any field but its `version`, `markers`, `extras`, the PEP 508 markers Pipenv takes as fields and an `index` declared as PyPI's, a Pipfile.lock entry with any field but those and the `hashes` Pipenv writes in every one; Poetry's and the Pipfile's tables are read by path, whatever the TOML form — `name.path = …`, a quoted field, `[tool.poetry.dependencies.name]` —, and their fields through these allowlists, so that a field the kit does not know never lets a name out); a requirements line that is a URL, a path or a local archive (`.whl`, `.zip`, `.tar.gz`…) names no package; its name is one of the application's own packages (the `name` of every `package.json` and `pyproject.toml` under it: npm workspaces point at their siblings with plain ranges), or one that a `[tool.uv.sources]` of any `pyproject.toml` under it names, whatever its TOML form — a key of the table, a quoted or dotted key (`"corp.lib"` is one name), a table of its own, an inline table under `[tool.uv]` — (uv takes it from git, a folder, a URL, the workspace or an index of its own; the root of a uv workspace names its members' sources); its npm scope has its own registry, or a registry replaces the default one (`.npmrc`, `.yarnrc`, `.yarnrc.yml` `npmScopes` / `npmRegistryServer`, `bunfig.toml` `[install]` / `[install.scopes]`), or a `package.json` of the application cannot be read as JSON (a merge left unresolved: its own name and the places its ranges name cannot be told, while a lock may still prove them: every npm package); a package index other than PyPI is declared (`pip.conf`, `pip.ini`, any option word of a requirements file — every one of each logical line as pip's `preprocess` makes them: split at every line break pip reads, a line ending with a backslash continued (backslashes stripped, joined with nothing) unless it is a comment line, comments dropped — but a harmless one, and any quote, backslash or `${…}` in a line's options (pip expands variables, then reads options with shlex) counts as an index (an allowlist: `-e`, `--editable`, `--pre`, `--prefer-binary`, `--require-hashes`, `--only-binary`, `--no-binary`, `--use-feature`, `--trusted-host`, `--hash`, `--config-settings`, `--global-option`; so pip's abbreviations, `--index`, `--find`, count), its value attached or not, also in a file it includes (`-r`, `-c`, followed from its folder, 16 files at most; an include the kit cannot read, outside the application, a link or missing, counts as an index), Poetry `[[tool.poetry.source]]`, PDM `[[tool.pdm.source]]`, Rye `[[tool.rye.sources]]` — each with a `url` other than PyPI —, any uv index `[[tool.uv.index]]`, uv `index-url` / `extra-index-url` / `find-links` other than PyPI — in `[tool.uv]` or below it (`[tool.uv.pip]`), in `uv.toml` (its `[pip]` too) —, Pipfile `[[source]]`, Poetry's PyPI mirror plugin in `[tool.poetry.requires-plugins]` — its mirror is written in no poetry.lock —); a yarn or bun file that mentions scopes in a form the reader does not follow makes every npm package private; or its ecosystem is not npm or pip. Every TOML file among them (`pyproject.toml`, `Pipfile`, `uv.toml`, `bunfig.toml`, Poetry's `config.toml`) is read with the kit's one TOML reader (`tomlEntries` and `tomlLeaves`, engine/facts/deps/read.mjs), the one the manifests are read with: each value by its full dotted path, whatever the form a table is written in — a header (a comment after it changes nothing), a key whose `=` is found outside its quotes, its escapes decoded — TOML 1.1's `\xHH` and `\e` too, which uv reads; an escape TOML does not know is a doubt, a dotted or a quoted key, an inline table or an array of them —, 16 parts a path and 8 inline tables deep at most; a file it cannot read as TOML to its end — a string or a bracket left open, a one-line string left open, a bracket closed that was never opened, a header left open or followed by more than a comment, a line that is neither a header nor a `key = value`, inside an array or an inline table what no TOML value holds (a bare word that is no value — `[[package]]` or `name = …` in an array —, an `=` in an array or twice in a pair, a header or an array where an inline table expects its key, a bracket closing another kind; engine/facts/deps/toml-scan.mjs), a control character but a tab, or a lone `\r`, anywhere, an escape a basic string does not know (in a value too), a key with no value, a bare key holding anything but letters, digits, `_` and `-`, a value followed by more than a comment (a time after a date apart: `1979-05-27 07:32:00`), a value over 200,000 characters (followed to its end, not kept whole), a key given twice under one header, a table defined twice in one block, a table that redefines an array of tables or the reverse, a key or a table name over 1,000 characters (its content left out) — is a doubt, and makes every package of its ecosystem private (a misread line could hide a declaration). An `.npmrc` is read as npm's ini reader reads it — the key up to the first `=`, a `"…"` key or value decoded as JSON, a `'…'` one without its quotes then as JSON when it is some (ini 5), an unquoted value up to a `;` or `#` no backslash escapes — and a `.yarnrc` word by word (a `"…"` word as JSON, a `#` outside it a comment): `registry`, `@scope:registry`, and any other key holding `registry`, a key that loads another file (`userconfig`, `globalconfig`: any key holding `config`) or one npm would expand (`${…}`) makes every npm package private (a `//host/:` key only holds credentials). A `.yarnrc.yml` fails closed too: a top-level line naming `npmRegistryServer` or `npmScopes` must be `npmRegistryServer: <a public registry>` or a bare `npmScopes:`, and each scope a bare `name:`; any other form (quoted, a blank before the `:`, the value on the next line, a value that is not one plain URL, flow style, a comment after a key, an indented root, a registry named inside another key, a key with an escape) makes every npm package private. These files (requirements, `.npmrc`, `.yarnrc`, `.yarnrc.yml`, `pip.conf`) are split at every line break their tools read — a lone `\r` included. A byte order mark at the start of any file is dropped, as pip, npm and TOML do, and a file that starts with a UTF-16 one is read as UTF-16 — but a lock file (package-lock.json, yarn.lock, poetry.lock, uv.lock), which its tool reads as UTF-8 only, is unreadable then — a poetry.lock or a uv.lock that is not valid UTF-8 too (Poetry and uv refuse it; npm and Yarn read such bytes replaced) — (Windows PowerShell 5 writes `pip freeze > requirements.txt` so). These declarations are read once per run (`privateRegistries`, engine/facts/declarations.mjs), in the application root and **every folder down to each manifest**, in the user's own configuration (`.npmrc`, `.yarnrc`, `.yarnrc.yml`, `.bunfig.toml`, pip `pip.conf` / `pip.ini` including the macOS `Library/Application Support/pip`, in **every** home given — `HOME` and `USERPROFILE` can differ —, `APPDATA`, `XDG_CONFIG_HOME`, `NPM_CONFIG_USERCONFIG`, `PIP_CONFIG_FILE`, `UV_CONFIG_FILE`, uv's `uv.toml`, Poetry's `config.toml` repositories and the table of its PyPI mirror plugin, `plugins.pypi_mirror`, also in a project's `poetry.toml`), and the `npm_config_*`, `YARN_NPM_REGISTRY_SERVER`, `BUN_CONFIG_REGISTRY`, `PIP_INDEX_URL`, `PIP_EXTRA_INDEX_URL`, `UV_INDEX_URL`, `UV_EXTRA_INDEX_URL`, `UV_DEFAULT_INDEX`, `UV_INDEX`, `PIP_FIND_LINKS`, `PIPENV_PYPI_MIRROR`, Yarn 1's `YARN_REGISTRY`, `UV_FIND_LINKS`, `POETRY_REPOSITORIES_<NAME>_URL`, `POETRY_PYPI_MIRROR_URL` variables (each URL of a list separated by spaces), and in the person's `pip.conf` any key holding `index` or `find` as pip reads keys (any case, `_` or `-`, `=` or `:`). Behind the readers stands an allowlist: a range (npm, pip) or a pip version holding anything but a release's characters (letters, digits, `_`, `.`, `*`, `<`, `>`, `=`, `!`, `~`, `^`, `|`, `+`, `,`, `-`, spaces and tabs) names a place, and is private whatever reader kept it — and its name is private in every manifest of the application, as a local item's is. One declaration that replaces the npm registry makes every npm package private (a name is never sent on a doubt). Not read by this second net: the global configurations (npm's `$PREFIX/etc/npmrc`, pip's site configuration, PDM's and Rye's own), Hatch's environments, a uv workspace root above the application folder — the proof keeps their names back anyway. What the proof cannot tell (SECURITY.md): a private package published on npm's or PyPI's public registry itself is proven by its lock like any other, and its name sent to the registry that already hosts it; a lock written without `resolved` (npm's `omit-lockfile-registry-resolved`) proves nothing, so nothing of it is sent; a lock whose URLs name the public registry while the installs went elsewhere (URLs rewritten to it, npm's `replace-registry-host` or Yarn sending the installs to the configured registry; a poetry.lock installed through Poetry's PyPI mirror plugin) proves its packages public — the second net keeps them back only when that registry or mirror is declared where it reads. Such an item gets `private: true`, `exists: null`.
- **`--tools`**: runs, when found on the `PATH`, `gitleaks` (secrets), `osv-scanner` (known vulnerabilities), `syft` (SBOM), `knip` (unused files and exports). Each writes `facts/tool-<name>.json`: `{ tool, generator, generated, commit, app, status, reason?, code?, truncated?, items }`. A run is `failed` when its exit code is not one of the tool's success codes (gitleaks, knip, semgrep 0 and 1; osv-scanner 0, 1 and 128 — no package; syft 0) (`reason: "exit"`, `code`; `"interrupted"` when the process ended without a code: a signal, too much output), or when its report cannot be read, including a "found something" exit code (1) with no readable item — gitleaks also exits with 1 on a fatal error (`reason: "output"`). Otherwise `status` comes from the normalised items: `findings` when there is at least one (semgrep exits with 0 even then), else `ok`; syft lists packages, never findings: always `ok`, printed with its count. `missing`: not installed, never an error. `failed` with `reason: "refused"`: not run, the configuration of the application's repository names a program (`riskyGitConfig`: git would run it, and a tool may start git there itself). A tool is only taken from a trusted folder of the `PATH` (never the application, the documentation project or a `node_modules/.bin`), and gets git's cleaned environment (`spawnHardened`, `engine/util/safe-git.mjs`). The report is **normalised through an allowlist** (`engine/facts/tools.mjs`), never stored as printed: gitleaks `{ rule, file, line, commit? }` (no secret, match, line, author or e-mail), osv-scanner `{ id, aliases, package, version, ecosystem, source, maxSeverity? }`, syft `{ name, version, type, purl, licenses }`, knip `{ kind: file|export|type|dependency|devDependency|unlisted, file, name?, line? }`, semgrep `{ rule, file, line, severity, cwe?, owasp? }` (no matched lines, no message); paths relative to the application; at most 5,000 items (`truncated`). **osv-scanner runs offline only** (v2: `scan source --recursive --offline`; v1: `--recursive --experimental-offline`): its API mode would send every package name and version to osv.dev. Its database is downloaded (`--download-offline-databases`, v1 `--experimental-download-offline-databases`: public files, no name sent) only with `--network`; without it, the copy of an earlier download is used, or the scan is `failed` and the command says how to get the database. Its major version is read first (`--version`); when it cannot be read, the scan is not run (`failed`, `reason: "version"`), since a wrong command line could fall back to the API mode.

**`::facts{source="env" columns="name,files,example"}`** (`::faits{source="env" colonnes="…"}`): a table from `facts/<source>.json`, at build time. Columns: item keys (header from `render.facts.column.<key>` when known, else the key); lists joined with commas; booleans "✔" or "—". A caption gives the date and the commit. Missing file: `facts.missing`; unknown column: `facts.column` (errors in a strict build).

**Coverage adapter `facts`**: `source` (required), `family` (default by source: "Environment variables", "API routes", "Screens", "Tables", "Dependencies", "Agent instruction files"), `exclude`. One item per fact: `env` its name; `api` `METHOD route`, matched in its `{id}`, `:id` and `[id]` forms; `screens` the route, in the same forms (an item of `api` or `screens` carries its file, through the facts file's `app`, so that sync follows the code of the page that cites it, §6.10); `db` the table; `dependencies` the direct dependencies only, de-duplicated by name (the same package can be direct in more than one manifest); `agents` the file. Missing facts file: `{ available: false, reason: "noFacts" }`.

**Coverage adapters on the code**, sharing the parsers of `engine/facts/api.mjs`: `fastapi` (`app`, default `.`; `family` "API"; `exclude`) and the `api` option of `next-app-router` (default `false`; `apiFamily` "API"): one item per handler, `GET /api/orders/[id]`.

**Claim status** (badges, §6.6): `[[verified]]`, `[[deduced]]`, `[[unknown]]` (`[[verifie]]`, `[[deduit]]`, `[[inconnu]]`), optionally followed by text (`[[verified lib/orders.ts:42]]`): a small chip, coloured from the status tokens, with a tooltip (`render.claim.<status>`).

**Audit**: `facts` = `{ files, stale }`, a facts file is stale when its `commit` differs from the HEAD of the application (action "refresh the facts", level 4); `claims` = the numbers of verified, deduced and unknown claims in the takeover pages, and the ratio verified / (verified + deduced). Both informative until `standard/maturity.md` uses them (§7).

**i18n fragment** `i18n/<language>/takeover.json`: `cli.facts.*`, `render.facts.*`, `render.claim.*`, `cli.build.facts.*`, `cli.audit.facts.*`, `cli.audit.claims.*`, `cli.adapter.reason.noFacts`.

### 6.10 Following the application: `sync` (lot V6)

When the application changes, `doc-kit sync` says exactly what the documentation must follow, fixes what is mechanical, and leaves to people or agents only the pages whose subject really changed. Detection never uses an LLM.

**The reference: `sync.json`** (folder of the project, `paths.sync`, default the project root; committed with the documentation; schema `schemas/sync.schema.json`)

```json
{
  "generator": "doc-kit 0.1.0",
  "app": { "commit": "9f2c…", "version": "1.4.0", "date": "2026-10-02" },
  "pages": {
    "use/orders": { "verified": "2026-10-02", "version": "1.4.0", "source": "3b1f…",
                    "files": { "app/orders/page.tsx": "a91c…", "components/order-table.tsx": "77d0…" },
                    "declared": ["lib/orders.ts:10-80"] }
  },
  "proofs": { "lib/orders.ts:42": { "hash": "c0de…", "text": "if (order.total > threshold) {" } },
  "labels": { "messages/en.json": { "orders.approve": "Approve" } },
  "inventory": { "next-app-router/Routes": ["/orders", "/orders/[id]"], "facts/env": ["DATABASE_URL"] },
  "captures": { "use-orders-list": { "plan": "51aa…" } }
}
```

- Hashes (`hashText` in `engine/core/hash.mjs`): SHA-256 of the text with a leading BOM removed and line endings normalised to LF, first 16 hexadecimal characters. A binary file (a NUL byte in its first 8 KB) is hashed as is. Paths: relative to the application (`app.dir`; without it: `sync.noApp`, exit code 2), forward slashes, sorted.
- `pages`: only pages that were marked (`--mark`). `source` is the hash of the page's Markdown; `files` the hashes of its dependencies at that time (direct and shared alike: the classification is recomputed at report time, §"Dependencies of a page"); `declared` the sources given by `--sources`.
- `proofs`: every `file:line` (or `file:line-line`) proof of a marked page: `hash` of the cited lines, `text` = the first 120 characters of the trimmed first cited line. A proof whose file does not exist in the application when the page is marked is not recorded and is reported once (`sync.proofUnresolved`, a warning: URLs with a port look like proofs).
- `labels`: for the message files of `sync.labels` (config, globs relative to the project; default: the `messages` of the `i18n-registry` adapters; nested JSON is flattened to dotted keys), only the entries whose value (2 characters or more) is cited verbatim (case-sensitive) in the Markdown of a written page.
- `inventory`: the item ids of every coverage adapter (by `<adapter>/<family>`; two configuration entries with the same adapter and family are merged) and of every facts source (`facts/<source>`: env names, `METHOD route`, tables, direct dependencies, agent files).
- `captures`: the hash of each capture plan entry (serialised with sorted keys, `RegExp` and functions as their source text, `file` left out), for the captures used by marked pages.

**Dependencies of a page** (`engine/sync/dependencies.mjs`; deduced, never typed). `pageDependencies({ root, config, toc, pageId, inventory, tools, factsDir, plans?, declared? })` is async (it loads the coverage adapters' own options itself, cached per process, since `runCoverage`'s result does not carry them) and also accepts `plans` (the capture plan entries already loaded once by the caller, `loadPlans().captures`) and `declared` (the page's `sync.json` `declared` list, read by the caller): neither is produced by `pageDependencies` itself, so callers (`markPages`, `compareWithReference`, `buildContext`) load them once and pass them in.
- its proofs (`PROOF_REF` of `engine/sync/proofs.mjs`, the same file family as `PROOF`), resolved in `app.dir`: the path as written when it exists, else the one application file whose path ends with it (writers cite `tokens.py:81` once the full path was given; two candidates are never guessed between); a code span that starts with `[[` (a badge shown to explain its syntax) is not a proof, and the file is the last word before `:line`. A verified claim badge that names its source (`[[verified lib/orders.ts:42]]`, `[[verifie …]]`, §6.9) outside a code span is a proof too: followed by `sync` (moved, broken, rewritten by `--apply`) and counted by `audit` (`PROOF`); a badge without a `file:line` stays a claim;
- **the server code behind the screen**: the API paths written as string literals in the page's own files (`api.get("/admin/groups")`, `` fetch(`/api/orders/${id}`) ``; two segments at least, query dropped) are matched against the routes of `facts/api.json`, the written segments being the route's last ones (a client prefix such as `/api` is allowed) and a parameter matching any segment (`engine/sync/api-links.mjs`); the file of each matched handler is **direct**, with the handler's line as a cited line. A change of that server code flags the page, and `doc-kit context` gives it to the writer;
- its `routes`: each route is matched with the inventory items whose `match` texts contain it (§5). A coverage adapter may give an item `files` (paths relative to the project); when it does not, `engine/sync/routes.mjs` derives them for the built-in adapters (`next-app-router`: the `page.*` file and the `layout.*` files above it; `react-router`: the routes file(s); `fastapi`: the file of the decorator, from `fastapiRoutes` of `engine/facts/api.mjs`; `glob`: the file itself; `openapi`, `features`, `facts`, `i18n-registry`: none). From these files, the closure of their **local imports** (`engine/facts/imports.mjs`: relative paths, `paths` aliases of `tsconfig.json` / `jsconfig.json`, `index.*` files, `.ts .tsx .js .jsx .mjs .cjs` extensions, Python `from . import` / `from .x import` and absolute imports inside the application; style sheets, images and packages are ignored), at most 3 levels and 200 files; a file inside the folder of the route's file (or below it) is **direct**, any other is **shared**;
- its captures (`:::screen` / `::capture` ids): the route of each plan entry (as above) and the entry's hash;
- its `::facts` tables: the facts file of each source;
- its topic group (§6.1a, `engine/core/counterparts.mjs`): the dependencies of the group's other pages are added, one level (a business sheet cites no code, its technical page does);
- `sources` (new optional page field of `toc.json`: globs relative to `app.dir`), for a page with none of the above;
- **for a feature sheet** (its `feature` field), the code of its feature in `features.json` (`engine/sync/feature-files.mjs`, §6.8): its `routes` with the page's own, the handlers of its `api` routes (from `facts/api.json`, `GET /api/orders` or a route alone for every method, whatever the spelling of the parameters), the files of its `sources` (globs relative to `app.dir`), all direct (via `feature`, which `sync` trusts as direct: `DIRECT_VIAS` of engine/sync/report.mjs), and what those handlers and sources import two levels deep (handler → service → query), shared (via `feature-import`). The features file is the `file` option of the `features` coverage adapter (`features.json` by default; `featuresFileOf`, engine/core/features.mjs). The globs of `sources` — a feature's and a page's — are confined to the application (`safeSources`): an absolute glob one that climbs (`..`) or one that holds a `:` (a drive, a Windows data stream `.env::$DATA`) is left out, and so is what is not a file inside `app.dir` once links are followed (a symbolic link, a junction) or is a secret file (`.env`, a key: `SECRET_FILE` of engine/check/secrets.mjs, shared with `export`) under the name the system gives it (`realpathSync.native`: a short name `ENV~1` or another case is the real `.env`);
- the `declared` sources recorded by `--mark --sources`.

The lines of the behaviour hints (`facts/behaviours.json`) that sit in one of the page's files are added to that file's lines, so that its excerpts show them.

**`doc-kit sync [--since <ref>] [--apply [--labels]] [--mark <page…> | --mark --all] [--sources <file[:lines]…>] [--date YYYY-MM-DD] [--check] [--estimate]`** (global `--json`; `--sources` is repeatable, like `facts --source`)
- **Report** (default, writes nothing but `.doc-kit/sync.md`, `.doc-kit/sync-report.json` and `.doc-kit/sync/<page>.diff`): compares the application now with the reference. Categories, in this order:

  | Key | Detection | What to do |
  |---|---|---|
  | `proofs.moved` | the cited line's text is found exactly once elsewhere in the same file, or in the file it was renamed to (`git diff --find-renames`) | fixed by `--apply` |
  | `proofs.broken` | file deleted, or text found nowhere | page to review, old text shown |
  | `labels` | a label's value changed (or its key disappeared) and the old value is cited in a page | replacement shown; applied by `--apply --labels` |
  | `review` | a dependency's hash changed, or the file disappeared | page to review: reasons (file, direct or shared); `priority`: `direct`, `shared`, or `probablyIntact` (only shared files changed, and no added or removed line of their diff contains a label, code span, route or identifier cited in the page; needs git). A modified file the page reaches through its proofs, whose cited lines are intact (against `sync.json`: every proof of that file recorded and none moved or broken; with `--since`: no hunk of `git diff` touches a cited line, `touchedLines`), does not make the page direct: reached ONLY through proofs, the reason is kept with `proofsIntact: true` and ignored by the priority; also reached another way (its imports, a layout, its topic group), it is judged as the shared file it otherwise is |
  | `captures` | the route's files changed, the plan entry's hash changed, or the capture's `version` is not the current one | retake: `capture --stale --compare` |
  | `new` | an inventory id absent from the reference | document it: `suggest` = the written page that cites the closest id of the same family (longest common prefix of the id, at least one segment of it), else `null` |
  | `removed` | an inventory id of the reference that no longer exists and is still cited in a written page | correct the pages listed |
  | `unchanged` | marked pages none of whose dependencies, proofs or labels changed | restamped by `--apply` |
  | `unmarked` | written pages absent from `pages` | `--mark` them once checked |

  A marked page appears in one category at most among `review` and `unchanged`; a page may appear in `proofs.*`, `labels`, `captures` and `removed` as well. The diff of a page (`.doc-kit/sync/<page>.diff`) is `git diff <reference commit> -- <its changed files>` in the application (read-only git; no git or no reference commit: no diff file). The summary prints one line per category with its count, then the pages to review grouped by priority, then, when a facts file is older than the application's HEAD, a reminder to run `facts`. Without a reference (`sync.json` missing) and without `--since`: a message saying how to create it (`--mark --all`), exit code 0 (1 with `--check`).
- **`--apply`** (mechanical changes only, never prose): rewrites moved proofs in the Markdown (the code span `path:42` → `path:57`; a range keeps its length; a proof cited several times is rewritten everywhere it is cited); with `--labels`, replaces the old label by the new one in the pages listed, **only** inside `**…**`, code spans, `[[menu …]]` and other badges, and between quotes (`"…"`, `«…»`, `“…”`); restamps the `unchanged` pages and the pages whose only changes were applied (version, date, hashes). It prints every file it changed, then the new report. The facts files are refreshed by `doc-kit facts` (§6.9), never here.
- **`--apply --auto-intact`** also restamps the `review` pages whose priority is `probablyIntact`. It skips any
  page that is still listed in `proofs.broken`, `captures` or `removed`, or in `labels` when `--labels` is
  absent. It prints how many pages it marked and which ones. Those pages need no agent, so the update cycle
  starts its triage only for the pages left (ETUDE-CAPTURES.md §7). `--auto-intact` without `--apply` is a usage
  error.
- **`--mark <page…>`** / **`--mark --all`** (all written pages; `--mark` is a switch, the page ids are positionals; `--mark` without any page: `sync.markNothing`, exit code 2; `--all` alone is accepted too): records the pages as checked now (hashes of the page, its dependencies, its proofs; the labels it cites; the inventory; the capture plan hashes; `app` = current commit, version, date). A page not written yet is refused (`sync.unwritten`, exit code 1). `--sources` (only with one page) adds declared sources. `--date YYYY-MM-DD` (same option as `build`) sets the date written instead of today's (tests, replayed runs).
- **`--check`**: exit code 1 when any category but `unchanged` and `unmarked` is not empty (CI: "the documentation is behind the application"); `unmarked` is only a warning, so that a project adopts `sync` page by page.
- **`--since <ref>`**: compares with a git commit of the application instead of `sync.json` (read-only: `git show <ref>:<file>` for the dependencies, the proofs and the message files, `git diff --name-status --find-renames <ref>`): the hashes and proofs of every written page are taken at `<ref>`. `new` and `removed` need a run of the adapters at `<ref>`, which never happens: with `--since`, both are empty and the summary says so.
- **git** is reached only through `engine/sync/git.mjs` (`createGit(exec, dir)` → `head`, `show`, `changed`, `diff`), built on the `exec` seam of the context (`createContext({ exec })`, §4 "Test seams"): the tests give a fake `exec` and never run git. Every call is read-only; `null` (no git, not a repository) degrades the report, never fails it.
- `--estimate`: the estimate of §6.11 for the pages to review (one `update` agent per page), computed from their context files built in memory; printed after the summary, `estimate` in `--json`.

**Captures that changed, and only those** (`capture --compare`, `capture --stale`)
- `--compare`: every selected capture is taken and encoded as usual, but written to `.doc-kit/compare/<id>.webp` first, then compared with `images/<id>.webp` in the browser already open (both WebP files decoded on a canvas, same encoder on both sides: `compareImages` in `engine/capture/compare.mjs`): a pixel differs when one of its channels differs by more than 16; a different size is a change (ratio `1`). At most `capture.compareThreshold` (default `0.005`, 0.5 %) of differing pixels: the image is **kept as is** (no binary change for git) and only its zone file is rewritten (zones, `version`, `captured`, `commit`, `plan`). Above: the new image replaces the old one, and `.doc-kit/compare/<id>.png` shows before and after side by side with the zones drawn (drawn on the canvas, the same way as `--preview`). Without an existing image, the capture is simply written and counted as changed. The summary counts unchanged, changed and failed; `--json` lists them with each ratio (`compared: [{ id, ratio, changed }]`).
- `--stale`: selects the captures of `captures` in `.doc-kit/sync-report.json` (missing report: `capture.noSyncReport`, exit code 2); patterns may narrow the selection. It implies `--compare`.
- Zone files gain `commit` (the application's HEAD through the `commit` seam of the context, only when `app.dir` is set and git answers) and `plan` (hash of the entry, as in `sync.json`). Both are optional when reading, like `version` and `captured`.

**Site**: when `sync.json` marks a page, the site data holds `pages[].verified: { version, date }` and the page footer says "Checked against version {version} on {date}" (`ui.footer.verified`), on the line of the screenshot dates. Nothing is emitted without `sync.json` (§9): `build()` reads `<paths.sync>/sync.json` when it exists (`readSyncReference` in `engine/sync/reference.mjs`; an unreadable file is the warning `sync.invalid`, nothing emitted).

**Audit**: `upToDatePages` = marked pages whose `version` is the current one ÷ written pages (`n/a` without `sync.json`): a criterion of level 4, `upToDatePages4`, at least 90 % (`standard/maturity.md`), globally and by space. **Guided mode**: with a `sync.json` whose `app.version` differs from the documented version (`version` of §3; the commit is not compared: the guided mode runs no git), the next step is `sync`, offered before the menu.

**Configuration**: `paths.sync` (default `"."`), `sync: { labels: [] }`, `capture.compareThreshold` (0 to 1), and `llm` (§6.11, read by `--estimate`). **i18n fragment** `i18n/<language>/sync.json`: `cli.sync.*`, `cli.build.sync.*`, `ui.footer.verified`, `cli.audit.upToDatePages*`, `cli.guided.sync*`, and the help `cli.help.sync` (kept in this fragment, not in `help.json`, so that the lot touches no shared i18n file). `cli.capture.compare.*` and `cli.capture.noSyncReport*` live in `i18n/<language>/context.json` instead (§6.11): the capture engine and its CLI were implemented before `sync.json` existed, and moving them later would only add a migration with no benefit.

### 6.11 Economy of the agents (lot V7)

The kit calls no LLM. The skill drives Claude Code agents; the kit makes them read less, run on the right model, reuse the prompt cache where it serves them, and it estimates and measures what they consume.

**Model routing**: each brief runs on its own model, chosen in this order:
1. `llm.routing` in `doc.config.mjs` (`{ "<brief>": "<model>" }`);
2. the skill's `DEFAULT_ROUTING` (`skill/doc-kit/scripts/common.mjs`): `haiku` for `triage`, `translate` and `deepen`;
   `sonnet` for `findings-verification`, `maintainability-review`, `page-corrections` and `capture-plans`; `opus` for `inventory`,
   `code-health`, `security-review` and `production-technical`;
3. the model of its agent type (`agents/<type>.md`).

`brief.mjs` prints that model, and `--estimate` prices with it. The orchestrator passes it when it launches the
agent, with the brief's full text as the prompt. The first agent of a wave is launched alone, the others together
right after it, one page per agent for writing and updates, up to 8 at a time: an agent launched after another reads
from the prompt cache what their prompts share before the brief (the agent's definition and Claude Code's tools,
23,000 to 24,000 tokens of its first 37,000 to 38,000 in the pilot of 0.4.0), which agents launched together each write again.
The brief, sent in one message with its variables, is not what the cache serves.

**`doc-kit context <page…> [--budget <tokens>] [--update]`** writes `.doc-kit/context/<page id, "/" → "__">.md` (one file per page; `buildContext` in `engine/context/context.mjs` is pure and returns the text, the CLI writes it), the only reading an agent needs to write or update that page. A page unknown to the table of contents: `context.unknownPage`, exit code 2 (a declared page not written yet is accepted: the context serves to write it). Contents, in this order, in the site's language:
1. the page: id, title, template, space, summary, routes, permissions, the path of its Markdown file; the id, title and summary of each other page of its topic group (§6.1a); the header also gives the product (`product.name`) and the documented version (`readProjectVersion`, `engine/build/build.mjs`), when the caller passes them — the CLI always does;
2. the required sections of its template (`standard/templates.json`, §6.4), in the site's language;
3. **files to read**: its dependencies (§6.10), direct first, each with the line ranges to read and the excerpts themselves: a **direct** file (the page's own files, the server code it calls, the cited files) of 400 lines or fewer is given whole, since it is what the page is about; otherwise, and for a **shared** file (layouts, API clients, helpers) whatever its size, ±40 lines around each cited line (its proofs, its declared sources, its handlers) merged when they overlap; a direct file without any cited line gives its first 200 lines; a shared file without any cited line is listed by path only (read only if the writer needs it). Lines are prefixed with their number (`42│ …`), so that the agent writes exact proofs;
4. **exact labels**: the message entries (`sync.labels` files, §6.10) whose keys appear as string literals (`"a.b"`, `'a.b'`, `` `a.b` ``) in these files; a `useTranslations("ns")` / `getTranslations("ns")` call in the same file prefixes the keys passed to `t(…)` with `ns.`: key → value;
5. **facts**: the rows of `facts/*.json` whose `file`, `files` or `route` names one of these files or one of the page's routes — but those of `behaviours`, which have their own part:
5b. **behaviours to describe** (§6.8a, `engine/context/behaviours-section.mjs`): the behaviour hints of these files (or naming one of the page's routes, or of its feature's API routes), grouped by family, one line per field and place (`` `customer`: contains, caseInsensitive — app/orders/page.tsx:26 (array) ``), cut like the facts; a hint of a shared file (a layout, an import) is marked `shared`; and, for a feature sheet, the **cards to write**: the kinds the hints of its **direct** files (and of its API routes) point to (`FAMILY_KINDS` of engine/core/behaviours.mjs: a field's type or an optional field alone is no form; a layout's search box is no card of the feature) and those its feature names in `features.json` (`behaviours`, in any spelling of the kind; an unknown one is told: `cli.context.behaviours.unknownKind`), each with its container (`:::behaviour{kind="search"}`, `:::comportement{type="recherche"}` in French) and its rubrics in the site's language, required ones marked, each followed by the id an analysis gives it (`` Where* `where` ``), the kind's id after a French spelling (`` = `search` ``) — never cut. The kinds are the kit's and the project's (`config.behaviours.file`); a `features.json` that does not follow its schema is told once (`features.invalid`);
5c. **code the kit does not read** (`engine/context/unread-section.mjs`, source `stack` of §6.9): the languages of the application no reader of the kit reads here, with their part of the lines of code, and the page's own files in such a language — the agent reads that code itself; never cut, absent when the kit reads all the code it measured;
5d. **infrastructure** (`engine/context/infra-section.mjs`, source `infra` of §6.9), for a page type whose `digests` name it (the runbook; the registry of digests is `engine/context/digests.mjs`): what the infrastructure files declare — every pipeline (and the environments it deploys to, when it names them), then by environment its entry points, what runs there and its images with their settings, its cloud resources by provider — then the scheduled jobs, each with the `file:line` to cite; 8 environments, 12 lines per group and names per list, 100 characters per name, 16,000 characters in all, the rest counted; a part of its own kind (`digest`), cut first when the context is over its budget. It adds to the context, it never takes from it: the raw facts rows of the page's files (a Secret, a CI job and its variables' names, the pipeline itself) stay whole, and being cut first, it never crowds out the page's own excerpts.
6. the glossary terms whose `pattern` (or `term`) matches the page or the excerpts;
7. with `--update`: the entries of the page in `.doc-kit/sync-report.json` (every category, with their reasons), the content of its diff file, and the paths of the before/after sheets of its captures (`.doc-kit/compare/<id>.png`, never inlined). Without a report: `context.noSyncReport`, exit code 2.

Tokens are estimated as characters ÷ 4 (`estimateTokens` in `engine/context/budget.mjs`). Over `--budget` (default: the `contextBudget` of the page's template, else 16,000 — 24,000 for a feature sheet, §6.8; the page part and the sections are never cut): a digest of facts (5d) goes first, then the excerpts of shared files, then the excerpts farthest from a cited line (the screen's own files, reached by the page's routes, go last: they are given whole up to 800 lines), then the facts rows, then the labels; each cut is replaced by one line naming what was cut, and the list is repeated at the end. The CLI prints one line per context file with its estimate and the number of cuts; `--json` gives `[{ page, file, tokens, cut: [{ kind, path?, lines? }] }]`.

**`new --prefill`**: for the types `variables` (facts `env`), `api-surface` (`api`), `data-model` (`db`), `dependencies` (`dependencies`), `agent-instructions` (`agents`), `runbook` (`infra`: its scheduled jobs, the items with a `schedule`), the page's main table is filled from the facts. The template marks that table with a line `<!-- doc-kit:prefill source="env" -->` right before it (`new` always removes this line, with or without `--prefill`, like the capture variant markers of §6.4): the key cells of each row are filled, one row per item (`env`: Variable, Read by the code = its `files` as `` `path:line` `` proofs; `api`: Method, Route, Proof = `[[verified file]]`; `db`: Table, Columns; `dependencies`: Package, Version; `agents`: File, lines and words; `infra`: Job, Schedule, Proof = `[[verified file:line]]`, the place it is declared), the other cells keep the template's example text turned into an inline guidance comment (`<!-- guidance: … -->`), so that the page stays a draft until someone fills them (§6.4). Without the facts file: `new.noFacts`, exit code 1; `--prefill` on a type without the marker: `new.noPrefill`, exit code 2.

**Agent types** (`skill/doc-kit/agents/*.md`, Claude Code agent definitions: front matter `name`, `description`, `model`, `tools`): `doc-kit-triage` (`haiku`; Read, Grep, Glob), `doc-kit-writer` (`sonnet`; Read, Grep, Glob, Edit, Write, Bash), `doc-kit-analyst` (`sonnet`; Read, Grep, Glob, Edit, Write, Bash: traces one feature in the code and writes its analysis, nothing else, §6.11a), `doc-kit-reviewer` (`opus`; Read, Grep, Glob, Edit, Write, Bash: the inventory, the code health and security reviews, the verification of findings, the production dossier). Each description names every brief that runs it (Claude Code picks an agent by its description); `test/unit/skill-briefs.test.mjs` checks it, with the briefs' en/fr parity and the routing (RULES.md M15). `skill install` also copies them to the agents folder next to the skills folder (`<skills folder>/../agents/`), only these files; the fingerprint covers them; `doctor` reports them like the skill — outdated as soon as one changed in the kit or the kit has an agent type that was not installed.

**Briefs**
- Each brief template starts with a front matter line `agent: <type>`; `brief.mjs` prints "Launch it with the agent type <type>".
- The text of a brief is split in two: **common part first** (rules, safety, syntax, standard: identical for every agent of the same template, whatever the variables), **variable part last** (batch, pages, paths of the context files). Two briefs of the same template differ only after the common part (tested byte for byte): a brief reads the same whatever its variables. (The prompt cache does not serve it from one agent to the next: Claude Code sends it in one message with its variables; what it serves is the part before, see above.)
- The writing briefs point to the context files (`doc-kit context`) instead of the whole inventory and table of contents; the references are cited by path and section, not copied.
- New brief `triage` (en, fr): reads the context files `--update` of a list of pages and writes `.doc-kit/triage.json`: one decision per page, `intact` (the orchestrator runs `sync --mark`), `edit` or `rewrite` (a writer takes it), or `deepen` (a feature sheet still right but with gaps the depth loop measures: the orchestrator runs `analysis.mjs depth` and the `deepen` brief), with one sentence of reason.
- New brief `update` (en, fr; agent `doc-kit-writer`): updates the listed pages from their context files `--update`, changes only what the change requires, then runs `doc-kit sync --mark <page> --sources …`.
- New briefs `behaviour-analysis` (agent `doc-kit-analyst`), `deepen` (routed to `haiku`) and `feature-mechanism` (agent `doc-kit-writer`), en and fr: the analysis of a feature, the filling of the gaps of its sheet, and its technical counterpart (§6.11a).
- **Sober method** (`writing-batch`, `update`, lot V7): a writer reads only the context file and the page's own template, then AT MOST 3 further targeted reads per page (`writing-batch`) or 1 (`update`; besides the context file and, for a re-analysed feature, its digest), on line ranges — the writing guide and the reference page are a fallback inside that same budget, never a mandatory first read; the page is written once (`Write`, never rewritten in place); one `build --draft` per batch, not per page; `view` only in capture mode, at most one picture per page. An agent that would exceed its step budget stops and reports instead of exploring. Measured on a real application (FastAPI + Next.js, 81 pages, nine admin pages, one agent per page): this cut average cost 69 % and wall-clock time 49 % versus the previous brief (context file, but no step budget), same conformance — detail and the full comparison table: `skill/doc-kit/references/agent-orchestration.md` §8.

**Estimate** (`brief.mjs --estimate`, `sync --estimate`): per agent, input tokens (the brief, the context files and the files they list, ÷ 4) and output tokens (1.4 per word of the template's `maxWords` for a new page, 0.3 for an update), the agent type, and the cost when `llm.prices` is set. **Configuration** `llm: { currency: "EUR", prices: { haiku: { input, output, cacheRead }, sonnet: {…}, opus: {…} } }`, prices per million tokens, no default value (prices change and differ by contract).

**Measure** (`skill/doc-kit/scripts/usage.mjs`)
- `log --brief <name> --agent <type> --model <model> --tokens <n> [--tools <n>] [--duration <ms>] [--pages a,b] [--phase <name>]`: appends one JSON line to `.doc-kit/usage.jsonl` (the orchestrator logs what Claude Code reports when an agent ends: its last context, a floor of what it used — a sixth to a third in the pilot of 0.4.0);
- `report [--json]`: totals by phase, brief, agent type, model and page; tokens per written page; cost with `llm.prices`; the gap with the last estimate; the total is the `scan` entries' when there is one (the spend), the `log` entries' otherwise (a floor), never both added (`--json`: `total`, `logged`, `scanned`);
- `scan --transcripts <folder>` (optional, tolerant): reads Claude Code's local transcripts to split input, output and cache tokens (a session's agents: `~/.claude/projects/<project>/<session>/subagents/`). Each API response counts once, however many lines and files repeat it (Claude Code writes one line per block of a response, each repeating its usage), and its output at least what it wrote, characters ÷ 4 (a transcript records a partial output count for a response that calls a tool; `output_estimated` says how much); `skill/doc-kit/scripts/transcript-usage.mjs`, shared with the statistics hook (§6.14).
- `audit` and the `sync` report show the total and the last update's cost when `usage.jsonl` exists.

**i18n fragment** `i18n/<language>/context.json`: `cli.context.*` (including the help `cli.help.context`), `cli.new.prefill*`, `cli.new.noFacts*`, `cli.new.noPrefill*`, the headings of the context file (`context.section.*`), the estimate lines (`cli.estimate.*`, shared by `sync --estimate` and `brief.mjs --estimate`), and (see §6.10) `cli.capture.compare.*`, `cli.capture.noSyncReport*`.

### 6.11a Analyses of the features (lot 9)

One analysis, several readers: what a feature does is traced once in the code (screen → API → service → query), then each space's writer starts from a digest made for its readers. The kit calls no LLM: the skill's scripts check and digest what an agent wrote.

**The analysis** `.doc-kit/analysis/<feature>.json` (work folder, not committed), format `doc-kit/behaviour-analysis@1` (`schemas/behaviour-analysis.schema.json`): `feature` (its id, the file's name), `title`, `size` (`S`, `M`, `L`: the reading budget of its analysis, the output estimate of the briefs that start from it), `level` (`essential`, `standard`, `detailed`: the level of detail chosen at scoping), then `summary`, `roles`, `stories` (`id`, `role`), `flow` (the main path), `behaviours` (`id` — its card's id in the sheet —, `kind` of `standard/behaviours.json` or of the project's file, `title`, `rubrics`: one item per rubric id), `rules` (`id`), `fields`, `states`, `messages`, `permissions`, `criteria` (`story`, `given`, `when`, `then`), `limits`, and `findings` (`severity` high/medium/low, `text`, `proofs`: candidates for the risk register). Each item: `text` (for a reader without the code: no file, no identifier), `mechanism` (how it works, names of code allowed), `status` — `verified` (read in the code) or `deduced` (inferred from it), each with at least one proof and its text; `unknown` with the `question` to ask; `n/a` with its `reason` — and `proofs` (`{ file, line, endLine? }`, the file relative to the application folder, forward slashes, 12 at most).

**`scripts/analysis.mjs`** (the skill; `analysis-model.mjs` holds its pure part, `analysis-files.mjs` reads the files of the proofs; messages in the project's language, `analysis` section of `skill/doc-kit/i18n/<lang>.json`). It needs the kit's engine (`engine/`, `schemas/`), found like `brief.mjs` finds the kit; without it: exit code 2.
- `check [<feature>…]`: each analysis (all of them when none is named) follows the schema (the kit's validator and its `cli.validate.*` messages), then: its file named after its feature; its ids once (stories, rules, behaviours); a criterion of one of its stories; a behaviour of a known kind, with only that kind's rubrics and every required one answered (an explicit `unknown` or `n/a` counts); each status with what it needs; no code in a text a reader without the code reads (`text`, `question`, `reason`, `given`/`when`/`then`, `role`: a backquote, a source file name, a `file:line`, an empty call, a snake_case or camelCase identifier — linear expressions, `test/tools/redos-worker.mjs`); no secret in any of its texts (the kit's generic detectors, `engine/check/secrets.mjs`: the place and the kind, never the value); and every proof: a path that is not relative, has an empty, `.` or `..` segment, a backslash, a colon or a NUL is refused **without being read**; otherwise its real path (`realpathSync.native`, a link followed) must stay in the application folder (`app.dir`, else as `brief.mjs` derives it), the file be a plain file (never a folder, a device or a named pipe) of 8 MB at most, and hold its line and range. One line per problem; exit code 1 when an analysis has one.
- `digest <feature> --for use|product|admin|develop [--output <file>]` (default `.doc-kit/analysis/<feature>.<reader>.md`): refused (exit code 1) when the analysis has a problem; a Markdown digest with every section that has an item, in the order of the feature sheet, each item's text and status (`deduced` marked, `unknown` its question, `n/a` its reason); a reader of a kind without `noCode` (`standard/spaces.json`) also gets each mechanism, a kind with `proofs` the proofs (`file:line`) and the candidate findings. Use and Product: no mechanism, no proof, no finding (`codeInText` is a heuristic: what it lets through, and the titles, reach them as written).
- `questions [--output <file>]` (default `.doc-kit/open-questions.md`): for the product owner, by feature, every `unknown` item with its question and where it is, then what the depth loop left open — not found in the code, or answered by the analysis but still not in the sheet after its rounds. `questions`, `findings` and `depth` read only the analyses that follow the schema and hold no secret, and name the others; every text of an analysis printed on the console is put on one line (`oneLine`), and `check` warns when `app.dir` is not set (the folder of the proofs is then guessed, like `brief.mjs` does).
- `findings [--json]`: the candidate findings of every analysis, the most severe first, numbered in the format of the consolidation file (`1. Severity — text (F-01):` then each proof as `file:line` between backquotes).
- `depth [--audit <file>] [--reset [<feature>…]] [--json]` (each feature printed as `F-01 · Title (<page id>)`, each gap as its id then how it reads, `B-01.match (Search an order · Matching)`; the `--json` actions carry those `labels`): one round of the **depth loop**, from `.doc-kit/audit.json` (`doc-kit audit`): each feature's `gaps` — its cards' required rubrics left out or answered `unknown` (`{ id, kind, title, rubrics: [{ id, state }] }`, the card found in the analysis by its id, else as the only one of its kind), its stories without acceptance criteria, no story, no rule (the backlog model, `engine/build/backlog.mjs`, in the audit's depth report). What the analysis answers (`verified`, `deduced`, `n/a`) is to **deepen** in the sheet; what it does not hold is to **analyse again** (that only; without an analysis, the whole feature: `*`); an `unknown` item is already a question. No story or no rule while the analysis found none: left. At most two rounds per feature (`.doc-kit/analysis/depth.json` counts them); then what is still open is **left** to the open questions. What was left of a feature the audit measures again is replaced by that round's: none once its gaps are closed. The loop ends when nothing is left to deepen or to analyse again: `depth` then prints ✔ (open questions and gaps left to the product owner may remain, by design: `questions` lists them). `--reset` first forgets the rounds and what was left of the features named (all without a name): a new loop, after a release or once a feature's analysis is redone.

The audit's depth report (`audit.json` `depth.features[]`, `engine/audit/depth.mjs`) carries those `gaps`; a card of the build records its required rubrics still open (`open`, `engine/build/markdown-product.mjs`).

**Briefs** (`assets/briefs/{en,fr}/`): `behaviour-analysis` (agent `doc-kit-analyst`) starts from the feature's context file, its entry in the features file and the code, within a reading budget by size (S 10, M 20, L 35 reads beyond the context file; front matter `output-tokens: S=5000,M=10000,L=18000`); what it analyses depends on the level (`essential`, `standard`, `detailed`); a second pass on part of a feature is given by `focus` (the items `depth` lists to analyse again, the rest of the file kept); it ends with the check `node "<scriptsDir>/analysis.mjs" check <feature> --project .` until it prints ✔, and writes only its analysis file. `deepen` (agent `doc-kit-writer`, routed to `haiku`) reads the Product digest and the sheet, adds the gaps `analysis.mjs depth` lists (id and label, e.g. `B-01.match (Search an order · Matching)`) with `Edit` only, then `sync --mark <page>`. `feature-mechanism` (agent `doc-kit-writer`) writes the technical counterpart of a sheet from the Develop digest and the `technical-sub` template: each statement carries `[[verified file:line]]`, `[[deduced]]` or `[[unknown]]`; gaps, risks and debts go to its report as candidate findings, not into the page.

**`brief.mjs --estimate`**: a brief whose subject is a feature declares `output-tokens: S=…,M=…,L=…` in its front matter; its output is the value of `--var size=S|M|L` (without it, said and not estimated).

### 6.12 Languages (one source, one site, several languages) (lot V8)

A documentation written in a **source language** and translated into others, served by **one HTML file with a language selector**: the data of every language is embedded (the file grows with each language; the images are embedded once), the reader switches without leaving the page. The kit calls no LLM: the translations are written by people or by the skill's agents (brief `translate`), from a dossier the kit builds (`context --translate`). A project without `languages` is strictly unchanged (§9).

**Declaring the languages**: `languages: ["fr", "en"]` in `doc.config.mjs` (§3). The first is the source; `content/` holds it, as today. The site language `language` is the source language. The ids of the table of contents are shared by every language: a section id, or the first segment of a page id, equal to a declared language is an error, `languages.idClash` `{ id, lang }`, blocking even a draft build (the URL grammar below reserves these segments).

**The translations** (`<paths.translations>/<lang>/`, the same tree as `content/`, every file optional)
- `toc.json`: the **texts** of the table of contents, same ids, same structure. `translatedToc(source, translated)` (`engine/build/languages.mjs`) returns a table of contents whose structure and non-text fields come from the **source** (`id`, `level`, `template`, `file`, `routes`, `permissions`, `space`, `counterpart`, `feature`, `sources`, `since`, `ref`, `epic`, groups' `epic` and `ref`, `icon`, `featured`, `spaces[].id`, `spaces[].icon`, `journeys[].steps`, `journeys[].space`, `suggestions`) and whose text fields come from the **translation** (`title`, `tagline`, sections' `title`, `shortTitle`, `subtitle`, `highlights`, groups' `title` and `summary`, pages' `title`, `menuTitle`, `summary`, journeys' `title`, `description`, spaces' `title`, `shortTitle`, `subtitle`, `for`). A structural difference (a section, group, page, journey or space missing, added or out of order; a different number of steps or suggestions) is `translation.toc.structure` `{ lang, path }`, blocking even a draft build, like an invalid outline. A non-text field whose translated value differs from the source is ignored, warning `translation.toc.ignored` `{ lang, path }`. A text field absent from the translation keeps the source text (no warning: the translated `toc.json` may be partial).
- `glossary.json`: the same entries in the same order; `term`, `def` and `pattern` translated; `technical` from the source when absent. A different number of entries: `translation.glossary.structure` `{ lang, expected, found }`, error in a strict build, warning with `--draft` (the source glossary is then used).
- `home.md`, `<section>/index.md`, `<page>.md` (the `file` of the source entry): the Markdown of that language, same syntax (§6.6, both spellings), same capture ids, same diagram ids, same rule ids.
- `diagrams/<id>.svg`: a translated diagram; for that language it replaces `<paths.diagrams>/<id>.svg` (a diagram without translation is shared).
- `.sources.json`: `{ "<file, relative to content/, forward slashes>": "<fingerprint>" }`, keys sorted, one entry per translated file (`toc.json`, `glossary.json`, `home.md`, the introductions, the pages); the fingerprint is `hashText` of the **source** file at the time of the translation (§6.10). Written by `translate --mark` only.
- **State of a translated file**, for one language (`translationState` in `engine/build/languages.mjs`): `missing` (no file), `unmarked` (a file, no entry), `stale` (an entry that differs from the current fingerprint of the source: the source changed, the file is to be translated again), `current`.

**Screenshots per language** (optional): `capture --lang <l>` takes the plans with `capture.languages.<l>` (`locale`, `cookies` and `storage` merged over `capture.locale`, `capture.cookies`, `capture.storage`; `locale` defaults to the locale of `<l>`) and writes `<images>/<l>/<id>.webp` and `<images>/<l>/zones/<id>.json` (the zones of a translated screen differ: labels change length). `--compare` compares with `<images>/<l>/<id>.webp`, its sheets go to `.doc-kit/compare/<l>/`. `check images` and `optimize` also walk `<images>/<l>/`. A capture without a file for `<l>` is shared: the source image and its zones are used for every language. Facts (`facts/`), `sync.json` and the capture plans are common to every language.

**Build** (`build()`, `engine/build/build.mjs`, `engine/build/languages.mjs`)
- The source language is built exactly as today: its data keeps its shape, and gains only `meta.languages: ["fr", "en"]` (declaration order) and `meta.language: "fr"` (new keys, emitted only when `languages` is declared, §9).
- Then **one data object per other language**, same shape, same ids, built by `renderLanguage(lang)` with: a translator `t` of that language (callouts, `render.*`, the texts of the spaces, `meta.date`), the translated table of contents and glossary, the Markdown of `translations/<lang>/` rendered by a Markdown engine whose `read`/`exists` resolve `<diagrams>/<id>.svg` to the translated diagram first and whose captures are the source zone files overlaid by `<images>/<lang>/zones/`, a search index built from the translated pages, the texts of the business directives and rules of that language (`resolveBusinessRefs` runs per language, with the rules defined in that language's pages), `pages[].verified` copied from `sync.json` (common), and `i18n` = the embedded subset of that language (`ui.*`, `home.*`, and `template.*` in a multilingual site). `meta.stats` is recounted on that language's documents.
- **Missing Markdown** (page, introduction or home page without a translated file): strict build → error `translation.missing` `{ lang, file }`; `--draft` → warning, the source document is rendered in its place and the data says so: `pages[].fallback: "<source lang>"`, `sections[].fallback` (the introduction), `meta.homeFallback` (the home page). The same for a missing `toc.json` or `glossary.json` (strict error, draft fallback to the source texts). **Stale** file: warning `translation.stale` `{ lang, file }` in both modes (a stale translation is still a translation). `unmarked` is not reported by the build (`translate status` does).
- **Checks per language**: `checkLinks` runs on each language's pages (a translated page's anchors must exist in the translated target page); `checkPage` runs with `language: <lang>` (the required sections of the template, in that language); the problems carry `lang` in their `vars`, so that the messages name the language. The anchor of each member of a topic group (shared, written in the source slug) is mapped to the translated page by position (below, "Anchors"); unmappable, it is dropped with the warning `translation.anchor` `{ lang, page, anchor }`, once per page it points into (the translation to fix). A page not written yet in the source (§6.4, no file) is not written in any language: the anchors that point into it are not checked in any language, and `page.missing` is reported once, by the source.
- **Images, once each**: `<script type="text/plain" id="img-<id>">` holds the source file, as today; `id="img-<id>@<lang>"` holds `<images>/<lang>/<id>.webp` when it exists (`@` cannot appear in a capture id, §6.3). Every image is embedded once, whatever the number of languages and pages that use it.
- **Assembly**: the template gains the marker `{{LANGUAGE_DATA}}`, right after `<script id="site-data">`: one `<script type="application/json" id="site-data-<lang>">` per other language, same JSON serialisation (`<` escaped), empty in a site without `languages`. `assemble()` accepts `languages: [{ id, data, captures }]` and computes `meta.screenshots` of each language with its own captures. `{{LANG}}` stays the source language.
- **Exports per space** (§6.1a): `exportSite` runs on the source data and on each language's data (same space, that language's `used` and `t`); each export embeds every language and is itself multilingual, its images being the union of what each language keeps. The `--space` and `spaces.output` rules are unchanged.
- **`build --lang <l>`** (mono-language file): `html` holds the data of `<l>` alone in `#site-data`, without `meta.languages` and `meta.language`, `{{LANGUAGE_DATA}}` empty, `{{LANG}}` = `<l>`, the template texts in `<l>`, and `img-<id>` holds `<images>/<l>/<id>.webp` when it exists, else the source image (no `@` variant); `sites` are mono-language too. Default output: the configured output with `-<l>` before its extension (`languageOutput(output, lang)`; `--output` overrides it; the exports per space follow it: `-<l>-<space>`). **Invariant** (tested): the content of `#site-data-<l>` of the multilingual file equals the `#site-data` of `build --lang <l>`, plus `meta.languages` and `meta.language`. `--lang` the source language: no translation rendered, the file holds the source's own data (`#site-data` of the multilingual file without `meta.languages` and `meta.language`).
- `build()` returns `languages: [{ id, source, current, stale, unmarked, missing }]` (counts of translated files by state; `[]` without `languages`), printed as one summary line per language after the files, and carried by `--json`.

**Site behaviour** (`engine/site/app.js`, `template.html`, `style.css`; only when `D.meta.languages` exists)
- **URL grammar**: `#/[<lang>/]<path>[~<anchor>]`, where `<path>` is what it is today (empty, `@<space>`, a page id, a section id). The first segment is a language when it is one of `meta.languages` (hence `languages.idClash`). Examples: `#/en/`, `#/en/@business`, `#/en/use/start~how-it-works`. Without the prefix, the URL means the **current** language: the links written in the Markdown (`#/page~anchor`) and the links the site generates stay as they are. After routing a URL without a prefix, the site rewrites it with `history.replaceState` (no `hashchange`, no history entry) so that the address bar always carries the language. In a site without `languages`, nothing changes.
- **Current language**: the URL prefix; else the value remembered in `localStorage` under `__THEME_KEY__.lang` (read and written inside `try`/`catch`); else the first of `navigator.languages` whose base matches a declared language; else the source. Showing a URL with a prefix makes that language current and remembers it.
- **Switching** (`switchLanguage(lang)`): the data of that language is parsed from `#site-data-<lang>` on first use and cached; `D`, the texts, the plural rules, `document.documentElement.lang`, the sections index, the sub-page relations, the full lists of the spaces, the search index, the glossary terms and the image cache are rebuilt from it; the current page is reset; the template texts are re-applied: every translatable element of `template.html` carries `data-t="<template.* key>"` (its text content) or one `data-t-<attribute>="<template.* key>"` per translated attribute (`data-t-aria-label`, `data-t-title`, `data-t-placeholder`), and `applyTemplateTexts()` fills them from the embedded `template.*` keys. The current space (ids) is kept.
- **Selector** `#langues` in the top bar (`role="group"`, `aria-label` = `ui.language.label`), one `<button type="button" class="espace-choix" data-langue="<id>" lang="<id>">` per language in declaration order, labelled with its autonym (`ui.language.<id>`), the current one `aria-pressed="true"`; below 1080 px it moves to the head of the side menu (`.lat-langues`), like the space selector. Removed when `D.meta.languages` is absent (a mono-language build, a project without languages). Present in the exports per space.
- **Page kept**: a click leads to `#/<lang>/<current path>[~<mapped anchor>]`: the same page, section, space home or home page. **Anchors** are mapped by position: the index of the anchor in the current page's `toc` gives the entry of the same index in the target language's `toc` (same number of headings); otherwise the anchor is dropped. A page missing in the target language cannot happen in a strict build; in a draft build it is the source text with the banner.
- **Banner**: `pages[].fallback` → `<div class="bandeau-traduction" role="note">` above the content, text `ui.translation.missing` `{ language }` (the name of the language shown, IN THE INTERFACE LANGUAGE — `ui.language.name.<code>`, e.g. "anglais" on a French interface, "French" on an English one; falls back to the autonym, `ui.language.<code>`, when `ui.language.name.<code>` is absent — the autonym itself is reserved for the language selector); the same for a section introduction (`sections[].fallback`) and the home page (`meta.homeFallback`).
- **Search**, previous/next, print, the glossary, the dates and plurals: those of the language shown (the data object is complete).
- **Images**: `imageSrc(id)` reads `#img-<id>@<lang>` when the current language is not the source and the element exists, else `#img-<id>`.

**`doc-kit translate`** (`cli/commands/translate.mjs`; `engine/translate/status.mjs`, `engine/translate/anchors.mjs`, pure)
- `translate status [--lang <l>] [--check]`: for each language but the source (or `--lang`), the state of every translatable file (`toc.json`, `glossary.json`, `home.md`, each introduction, each page of the table of contents), the counts by state, then the `stale` and `missing` files listed. Exit code 0; `--check`: 1 when a listed language has a `stale` or `missing` file. `--json`: `{ languages: [{ id, counts: { current, stale, unmarked, missing }, files: [{ file, page?, state, source, recorded }] }] }`.
- `translate --mark <item…>` | `translate --mark --all [--lang <l>]`: records the current fingerprint of the source of each item in `translations/<l>/.sources.json` (every language but the source, or `--lang`). An item is a page id, or a path relative to `content/` when it contains a `.` (`home.md`, `use/index.md`, `toc.json`, `glossary.json`); `--all` marks every file whose translation exists. An item whose translation file is missing: `translate.missingFile` `{ lang, file }`, exit code 1, nothing written for that language. `--mark` without item and without `--all`: `translate.markNothing`, exit code 2. `translate` without `status`, `--mark` or `--fix-anchors`: `translate.usage`, exit code 2.
- `translate --fix-anchors [item…] [--lang <l>]`: in each translated Markdown file (the listed items, else all), every link `#/<target>~<anchor>` (and `[[rule …]]`-free: rule ids are shared) whose `<anchor>` is not a heading id of the translated target page but is one of the source target page at index *i* is rewritten with the id at index *i* of the translated target page, **when both pages have the same number of headings** (`mapAnchor({ sourceToc, targetToc, anchor })` → `string | null`; the heading ids are those of `render().toc`, so that `:::rule` headings count). Otherwise the link is left and reported: `translate.anchorUnmapped` `{ lang, file, link, reason: "missing" | "count" | "unknown" }` (target not translated, different heading counts, anchor unknown to both). Prints one line per rewritten file with the number of links; `--json`: `{ languages: [{ id, files: [{ file, changed: [{ from, to }], unmapped: [...] }] }] }`. Deterministic: the same inputs always give the same files.
- Marking a translation never happens without `--mark`; `sync --mark` never touches `.sources.json`.

**`doc-kit context <page> --translate <lang>`** (`buildTranslateContext` in `engine/context/translate.mjs`, pure; the CLI writes `.doc-kit/context/<page id, "/" → "__">.<lang>.md`): the translator's dossier, without code. `<lang>` must be a declared language other than the source (`build.langUnknown`; the source: `context.translateSource`, exit code 2); exclusive with `--update` (`context.translateUpdate`, exit code 2). Contents, in this order, headings from `cli.context.translate.*` in the message language:
1. the page: id, source title, translated title (from the translated `toc.json`, when present), template, source file, target file (`translations/<lang>/<file>`), the state of the translation (`current`, `stale`, `unmarked`, `missing`);
2. the sections of its template in **`<lang>`** (the headings to write, so that the translated page matches `standard/templates.json`);
3. the glossary table, source term → translated term (by index, from both `glossary.json`), for the terms whose `pattern` matches the source page, its title or its summary; without a translated glossary, the source terms alone and one line saying so;
4. the source Markdown, whole, in a fenced block;
5. the previous translation, whole, when the file exists;
6. the diff of the source since the recorded fingerprint, when the documentation project is a git repository and the fingerprint is found: the first commit of `git log --format=%H -n 50 -- <content>/<file>` whose `git show <commit>:<path>` has the recorded fingerprint, then `git diff <commit> -- <path>` (read-only git through `createGit(exec, root)` of §6.10, `root` = the documentation project, never the application); otherwise one line `cli.context.translate.noDiff`.
`--budget` applies with this cut order: the diff first, then the previous translation; the page, the sections, the glossary and the source are never cut.

**Other commands**
- `init --languages fr,en`: writes `languages`, and for each language but the first an EMPTY `translations/<lang>/.sources.json` (`{}`): nothing is pre-translated. (Implementation note, V8: the kit's own mono-language skeletons, `templates/project/<lang>/content/`, use that language's own folder names — "utiliser/" for French, "use/" for English — so they share no path with each other and cannot be copied into `translations/<lang>/`, which must mirror the chosen source's paths exactly; reusing them was dropped as too complex for this lot. `translate status` lists every file as `missing` right after `init`, which is accurate.) `--lang` must be absent or equal to the first language (`init.languagesLang`, exit code 2); the languages are validated like the configuration (`init.languagesInvalid`, exit code 2). The recap gains a "languages" line. (Implementation note, V8: the interactive question offering the other kit languages was dropped — it would have inserted an extra prompt ahead of every other `init` question already covered by existing tests' scripted answers. `--languages` is the only way to declare them for now.)
- `doctor`: one line per declared language, "translations/<l>: N current · N stale · N missing" (`cli.doctor.languages`), ⚠ when stale or missing > 0, ✖ (category 1) when `translations/<l>/toc.json` is missing.
- **Guided mode**: after `sync`, before the menu, the step `translate` (shown as `translate status`) when a declared language has a `missing` or `stale` file (`cli.guided.situation.translate`); the menu offers `translate status` when `languages` is declared.
- `dev`: also watches `<paths.translations>/`.
- `new <page-id>`: the entry it adds to `content/toc.json` is added, with the source's texts (to translate), at the same section, group and index of each `translations/<l>/toc.json` that matches the source there (same section id, same page ids in that group, the id not declared yet); a translated `toc.json` that is missing, not valid JSON or out of step is left as it is (the build's `translation.toc.structure` names it). `--json` lists the files changed (`translations: [{ lang, file }]`), the text output one line each (`cli.new.tocTranslated`).
- `view` without `--lang` opens the source language (`#/<source>/…`): its image never depends on the language of the machine's browser. The tour's "Next" button is clicked by its role (`[data-vis=suiv]`), never by its label.
- `view --lang <l>` and `open --lang <l>`: the site opened on `#/<l>/…`.
- `export`: the translations are project files, copied like the rest (nothing specific).
- `audit`: with `languages`, the result gains `languages: [{ id, current, stale, unmarked, missing, ratio }]` (`ratio` = current ÷ total files); `audit.md` shows a table "Translations" (`cli.audit.languages.*`); informative, the level is unchanged.
- `sync` report: a category `translations: [{ lang, file, state }]` (`stale` and `missing` files of every language, computed from `.sources.json` and the current content, no git), one summary line `cli.sync.summary.translations` with a reminder of `translate status`; it never affects `--check` (`translate status --check` does).

**Skill**: brief `translate` (`assets/briefs/{en,fr}/translate.md`, `agent: doc-kit-writer`, sober method of §6.11: the dossier of `context --translate` and at most one further read per page; the page written once; the headings are the template's labels in the target language; ids, directives, badges, code spans, proofs and capture ids are never translated; then `translate --fix-anchors <pages> --lang <l>`, `translate --mark <pages> --lang <l>`, one `build --draft` per batch). Variables `{{lang}}`, `{{pages}}`, `{{contextFiles}}`; `brief.mjs --list` shows it.

**Equivalence** (§9): a project without `languages` keeps levels 1, 2 and 3: `meta.languages`, `meta.language`, `fallback`, `homeFallback`, `site-data-<lang>` and `img-<id>@<lang>` exist only when declared, the texts of `languages.json` and `template.*` are not embedded, `{{LANGUAGE_DATA}}` is empty and `app.js` behaves as before when `D.meta.languages` is absent. The `data-t` attributes of the template change the markup, not the data nor the visible text.

**i18n fragment** `i18n/<language>/languages.json` (§6.5).

### 6.13 Reviews on demand: security and maintainability (lot V9)

Two optional reviews of the documented application, asked at scoping: deterministic facts first (no LLM), then one agent writes the review page from them. Nothing is ever written in the application, and nothing is ever sent to the production instance.

**Authentication of each route**: the items of the `api` source (§6.9) gain `auth` and `guards`: `{ method, route, file, line, framework, auth, guards }`.
- FastAPI: the `Depends(…)` of the handler's signature, and the `dependencies=[Depends(…)]` of its `APIRouter(…)` or of the `include_router(…)` that mounts it; Express: the middleware names between the path and the handler (`router.get("/x", requireAuth, handler)`); Next.js route handlers: the session calls inside the handler (`auth()`, `getServerSession`, `getSession`, `currentUser`) and role checks (`role`, `isAdmin`).
- `guards`: the names found. `auth`: `"none"` (no guard), `"user"` (a guard matching `review.guards.user`, default `/current_user|authenticated|login_required|require_auth|session|token/i`, and, as whole names, the conventions of the stacks read: `auth` and `auth:<guard>` (Laravel), `Authorize` and `RequireAuthorization` (ASP.NET), `AuthGuard(…)` (NestJS), `authenticate_user!` (Rails), `LoginRequiredMixin` (Django), `jwt_required` (Flask)), `"role"` (matching `review.guards.role`, default `/admin|role|permission|scope|owner|super|staff/i`; checked first), `"unknown"` (a guard matching neither).
- The table `::facts{source="api" columns="method,route,auth,guards,file"}` is the **static access matrix**.

**Source `security`** (`facts --source security`): `{ rule, file, line, severity, owasp }`, never a value. Rules (OWASP Top 10 2021 category in `owasp`): `xss.dangerouslySetInnerHTML`, `xss.innerHTML` (A03); `code.eval` (`eval`, `new Function`, Python `exec`/`eval`; A03); `sql.concat` (an SQL keyword in an f-string, a template literal or a `+` concatenation passed to `execute`, `query`, `raw`, `text`; A03); `tls.disabled` (`verify=False`, `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED`; A02); `cors.wildcardCredentials` (a wildcard origin together with credentials; A05); `debug.enabled` (`DEBUG = True`, `debug=True`; A05); `jwt.noVerify` (`verify_signature` false, `algorithms` with `none` in its first 200 characters; A07); `secret.default` (a literal default for a secret, a password or an admin account in code; A07); `redirect.open` (a redirect to a request parameter, read in the first 1,000 characters of its arguments; A01); `auth.noRateLimit` (a sign-in route without a rate-limit decorator or middleware: heuristic, severity `info`; A07). Severities: `high`, `medium`, `low`, `info`. `--tools` adds `semgrep` only with a local rules folder (`review.semgrep`; `--config <folder> --json --metrics=off`, never `--config auto`, which downloads rules), next to gitleaks and osv-scanner (§6.9).

**Source `behaviours`** (`facts --source behaviours`, `engine/facts/behaviours.mjs` and `behaviour-{common,js,sql,py,schemas}.mjs`, `openapi.mjs`): what the code says of how a feature behaves, for the writer of its sheet (§6.8a) — hints, each deduced from one line, never a measure. **Families and signals**: `search` (`contains`, `startsWith`, `endsWith`, `like`, `caseInsensitive`, `accentsIgnored`, `fullText`, `regex`, `fuzzy`, `engine` — Elasticsearch, OpenSearch, Algolia, Meilisearch, Typesense, Fuse… —, `param`, `fields`), `filter` (`equals`, `in`, `range`, `not`, `param`, `fields`), `sort` (`orderBy` with `asc`/`desc`, `client`, `param`, `fields`, `default`), `pagination` (`limit`, `offset`, `cursor`, `page`, `pageSize`), `trigger` (`input`, `change`, `keyup`, `submit`, `search`, `debounce` with its delay, `trim`), `validation` (`required`, `optional`, `min`, `max`, `length`, `email`, `url`, `uuid`, `pattern`, `integer`, `positive`, `type`, `default`), `values` (`enum`, `union`, `options`, `choices`), `scope` (`owner`: a query limited to the reader's own items), `export` (`csv`, `spreadsheet`, `download`), `import` (`file`), `notification` (`email`, `sms`, `push`), `schedule` (`cron`, `interval`). **Read in**: an array's `.filter` in the browser (`includes`, `startsWith`, `toLowerCase`, `normalize`, `===`, comparisons), `localeCompare`, DOM, JSX and Vue events, `debounce`; Prisma and the object syntax of TypeORM, Sequelize and Mongoose (`contains`, `mode: "insensitive"`, `orderBy`, `take`/`skip`/`cursor`, `[Op.iLike]`, `ILike()`, `$regex`, `$text`), Drizzle and Knex (`ilike()`, `.where(…, "ilike", …)`, `.orderBy`, `.limit`); SQL in any string (`LIKE`/`ILIKE`, `LOWER(…) LIKE`, `ORDER BY`, `LIMIT`/`OFFSET`, `to_tsvector`, `MATCH … AGAINST`, `unaccent`; written in capitals, a statement keyword within 300 characters before it, in lower case one on its own line, so that "order by phone" in a sentence is not SQL); the query parameters read (`searchParams.get`, `req.query`, FastAPI `Query()`, `request.args`/`request.GET`, OpenAPI `in: query`), each one's role from its name (`page`, `per_page`, `sort`, `q`…); Django lookups (`__icontains`, `__search`, `__unaccent`…), `.order_by`, `Paginator`, DRF `search_fields`/`ordering_fields`/`page_size`, SQLAlchemy (`.ilike`, `func.lower`, `.order_by(….desc())`, `.limit`); zod (`z.string().min(1).max(80).optional()`, `z.enum`, read by a linear walk of the chain), pydantic (`Optional`, `EmailStr`, `Literal`, `Field(…, min_length, max_length, ge, le, pattern)`), Django forms and DRF serializers, HTML and JSX forms (`required`, `minlength`, `maxlength`, `pattern`, `type`, the `<option>`s of a `<select>`, a tag read by a linear walk so that `=>` in an attribute does not end it), TypeScript unions and enums, Python enums and Django `choices`; the libraries of an export, an import, a notification, a cron job (`cron.schedule`, `@Cron`, `crontab`, APScheduler, `schedule.every`). An OpenAPI document gives its operation in `route` (`GET /orders`; no route when one of its segments looks like a key, a token or a long number), a `$ref` followed three levels deep (own keys only; not one of more than 512 characters or 16 keys; each resolved once), 20,000 parameters and properties read at most, the line of each route found by a cursor that only moves forward. **Never read**: a test, a fixture or a story (`*.test.*`, `*.spec.*`, `tests/`, `__tests__/`, `test_*.py`…, OpenAPI documents included), a minified or generated file, a comment (JavaScript `//` and `/* */`, `#` in Python, `<!-- -->` in HTML and in Vue and Svelte templates — found by linear walks that skip strings, so that `"image/*"` or `"<!--"` opens no comment), a file over 512 KB (`unreadable`, reason `tooLarge`), a YAML OpenAPI document (`yaml`); a malformed OpenAPI document is read as far as it goes, and one the kit cannot follow is listed (`openapi`), the others read. **Kept of the code**: a field (an identifier, up to three joined by "."; never one shaped like a token), a number (fewer than 9 digits: never a phone or a card), a word of a fixed list according to the signal (`asc`/`desc` for an order, a field's type, a library, a cron expression or an interval for a scheduled job), a list of 30 values of 40 characters at most (never a token — 10 characters or more of mixed letters and digits, or what a secret detector of the kit finds —, never 9 digits) — each through a whitelist (`safeField`, `safeValue`, `safeValues`, engine/facts/behaviour-common.mjs): never a string as written; a default only as a number; no value at all for a field whose name says it is secret (password, secret, token, key, auth, card…). **Limits**: 300 items per file (a detector stops once its file's sink is full), 5,000 in all — the file where the limit is reached is listed (`limit`: read in part; `limitNext`: not read); the same hint at the same place once. Every expression is bounded, without two blank runs side by side, each call's arguments read once (the next match starts after them; comments skipped, a quoted string ended at its line), and in test/tools/redos-worker.mjs, whose inputs include ends that make a match fail late and which builds the three slowest inputs of each check again 4 and 16 times longer, and longer still (up to 256 times) while a step under 20 ms may hide a quadratic growth (test/tools/growth.mjs): more than eight times the time from one size to the next, in a step of 20 ms or more, is quadratic, and fails (a canary written to be quadratic must be caught); test/unit/behaviours-growth.test.mjs measures the growth of every reader on its adversarial shapes (`assertLinear`, 12,500 then 50,000 and 200,000 characters).

**Source `quality`** (`facts --source quality`): maintainability measures of the source files (tests, generated, vendored files and documentation projects excluded): `{ summary, items: [{ file, lines, functions, longest, complexity, duplicated, todo }] }`. A source file over 512 KB is not measured: listed in `unreadable`, counted in `files` and `bigFiles`.
- Functions (JavaScript, TypeScript: `function`, arrow functions assigned to a name, methods; Python: `def`), their length and an approximate complexity: 1 + branches (`if`, `elif`, `else if`, `for`, `while`, `case`, `catch`, `except`, `&&`, `||`, `and`, `or`, `?:`).
- Duplication: windows of 6 normalised lines (white space collapsed, comments and lines under 4 characters dropped), hashed; a window found twice or more marks its lines duplicated; ratio over code lines.
- `todo`: TODO, FIXME, HACK, XXX. `summary` adds the test ratio (the `tests` source), the tooling found (linter: eslint, ruff, flake8, pylint; types: tsconfig `strict`, mypy, pyright; formatter; CI files) and, with `--network`, the direct dependencies behind their latest version (majors behind).
- **Ratings A to E**, each with its measure: duplication (A ≤ 3 %, B ≤ 5 %, C ≤ 10 %, D ≤ 20 %, E above), complexity (share of functions above 15: A ≤ 1 %, B ≤ 3 %, C ≤ 6 %, D ≤ 10 %, E above), size (share of files above 500 lines: same scale), tests (test files ÷ source files: A ≥ 50 %, B ≥ 30 %, C ≥ 15 %, D ≥ 5 %, E below).

**`doc-kit probe [--as <role>…] [--json]`**: checks a running instance, **local or demo only, GET and HEAD only**.
- Refused (`probe.notLocal`, exit code 2) when `capture.target` is `production`, or when the application URL is not a loopback address (`localhost`, `*.localhost`, `127.x`, `[::1]`) and `capture.target` is not `demo`. No option overrides it. Unreachable instance: exit code 3.
- Identities: anonymous, plus each `--as <role>`, whose session `.doc-kit/session-<role>.json` is written by `connect --as <role>` (§5; the session file of `connect` without `--as` is unchanged).
- On `/` and on one API route: security headers (Content-Security-Policy, Strict-Transport-Security on https, X-Content-Type-Options, X-Frame-Options or CSP `frame-ancestors`, Referrer-Policy, Permissions-Policy); the cookies the application sets (Secure, HttpOnly, SameSite); CORS (an `Origin: https://probe.invalid` reflected with credentials); version disclosure (`Server`, `X-Powered-By`).
- Access control: every `GET` route of `facts/api.json`, its path parameters from `review.params` (`{ "group_id": "…" }`; a route with a parameter not given is skipped and listed); one request per route and identity, at most 4 per second, 5 s timeout. `expected` comes from `auth`: a `user` or `role` route must answer anonymous with 401, 403 or a redirection to the sign-in page; a 2xx is the finding `probe.unprotected`. A `none` route answering anonymous with a list of objects holding an `email` is the finding `probe.publicData` (heuristic).
- Output `facts/probe.json`: `{ url, date, identities, headers, cookies, cors, disclosure, routes: [{ method, route, auth, expected, status: { anonymous, <role>… }, finding? }], skipped, forbidden: [{ route, pattern }] }`. A route that `capture.forbidden` matches (`/` and the sampled API route included) is never requested and is listed in `forbidden`. Response bodies are never stored. Informative: exit code 0 whatever the findings.

**Page types** (`standard/templates/takeover.json`, templates en/fr, `*` = required):
- `security-review`: In short* · Scope and method* · Authentication and sessions* · Access control* · Input handling* · Secrets and configuration* · Dependencies · HTTP security headers · Logging and monitoring · Findings*. Each point is verified, deduced or unknown (§6.9 badges), tied to an OWASP Top 10 category or an ASVS requirement; the access control section shows the static matrix and the probe results.
- `maintainability-review`: In short* · Ratings* · Hotspots* · Duplication · Complexity · Tests* · Dependencies · Recommendations* (by effort).

**Briefs** (lean method, §6.11): `security-review` (agent `doc-kit-reviewer`) and `maintainability-review` (agent `doc-kit-writer`); their findings are candidates for the risk register (`findings-verification`).

**Configuration**: `review: { guards: { role: [], user: [] }, params: {}, semgrep: null }` (regular expressions as strings; `params`: path parameter → example value; `semgrep`: local rules folder, relative to the project). **i18n fragment** `i18n/<language>/reviews.json`: `cli.probe.*` (with `cli.help.probe`), `cli.connect.as*`, the new `render.facts.column.*` and `cli.facts.*` keys.

### 6.16 Recording a capture plan (`record`)

**`record <route> [--id <id>] [--force]`** runs Playwright's codegen
(`node <playwright>/cli.js codegen --target javascript --output <tmp> [--load-storage <session>] <url><route>`,
without a shell) and translates its output (`engine/capture/record.mjs`):
- the first `page.goto` on the application's origin gives the route;
- `getByRole` (`name`, `exact`), `getByText`, `getByLabel`, `getByPlaceholder` and `locator` (css), with `.nth(n)`,
  `.first()` or `.last()`, give the targets;
- `click`, `dblclick`, `check` and `uncheck` become `click`; `fill` becomes `type` + `value`; `selectOption` becomes
  `select` + `value`; `hover` becomes `hover`; `locator.press` becomes `click` then `press`; `keyboard.press`
  becomes `press`;
- any other line (a filter, a nested locator, a page on another origin) is listed at the top of the plan as a
  comment.

The plan is `captures/plans/<id>.mjs`. The id defaults to the route in kebab-case. An existing file raises
`record.exists` (exit code 1) unless `--force` is given. The command is refused when `capture.target` is
`"production"` (`record.production`) and on a `capture.forbidden` route (`record.forbidden`), because the recorder
is a normal browser without the read-only guard. The `codegen` context seam replaces the recorder in tests.

### 6.15 What changed, on every build (`changes`, `::changes`, `hooks`)

- **`changes [--since <ref>] [--output <file>] [--record]`** (`engine/facts/changes.mjs`) compares the facts files
  committed at `<ref>` (default `HEAD`; read with `git show <ref>:./<paths.facts>/<source>.json`, a reference
  checked by `isSafeRef`) with the files on disk.
  - Per source, items are compared by key: `api` method + route (`auth` watched); `db` table (columns, references,
    rls); `env` name; `dependencies` name + manifest (version); `security` and `secrets` rule + file; `agents` file.
    `tests` compares its count and `modules` its import cycles.
  - It writes `.doc-kit/changes.md` (＋ added, － removed, ～ changed, per source) and `.doc-kit/changes.json`.
  - `--record` also writes `changes/<documented version>.json` (`{ since, until, date, sources, total }`, committed).
    `::changes{version, sources}` (`::changements`) renders the recorded versions, most recent first.
  - Without git: `changes.noGit`, exit code 3.
- **`hooks install | uninstall | status [--app <dir>]`** adds to `post-merge` and `post-checkout` (the latter only
  on a branch switch) a marked block. The block runs `npx --no-install doc-kit facts`, then `sync`, from the
  documentation folder, and swallows any failure.
  - The hooks folder is `git rev-parse --git-path hooks`. Existing hooks are kept, and a hook that held only the
    block is removed on uninstall.
  - The repository's configuration chooses that folder (`core.hooksPath`): it and each hook must land, links
    followed, inside the repository or its common git folder (`git rev-parse --git-common-dir`, the main repository's
    for a worktree), and a hook must not be a link leading nowhere nor a file with another name (a hard link);
    otherwise `hooks.unsafeFolder`, exit code 3, and nothing is written.
  - The documentation folder must be inside the repository (`hooks.outside`) and its path made of plain
    characters (`hooks.unsafePath`): it is written into a shell script.
- **CI** (`ci/github-actions.yml`, example c): on every push and pull request of the application, it runs `facts`,
  then `changes --since origin/<base>`, then `sync --check`. It posts one comment on the pull request,
  `changes.md` + `sync.md`, updated at each push, then builds and checks the site.

### 6.14 Production statistics (`usage/`, `stats`, `--profile`)

- **Where:** `usage/<version>.jsonl` in the documentation project, one JSON object per line, appended and never
  rewritten, committed with the project (`engine/stats/usage.mjs`). Recording is on when the folder exists (`init`
  writes it with a README); `DOC_KIT_STATS=0` turns it off for one run.
- **What:** each recorded command appends its own span (`step`: setup, capture, facts, analysis, generate,
  translate, update, build, check, audit; `exit`: its exit code) and the spans the engine measured inside it:
  - each capture's parts: `navigate`, `wait`, `actions`, `settle`, `mask`, `measure`, `shot`, `encode`, and
    `compare` or `write`;
  - each `facts` source, and the external tools.

  Every line carries `at`, `version` (the documented version), `run`, `command`, `phase` (`create` without
  `sync.json`, `update` with it, `translate`) and `actor` (`kit`). Agents (`actor: "agent"`, with `model` and
  `tokens: { in, out, cacheRead, cacheWrite, outEstimated? }`, `outEstimated` the part of `out` estimated from what
  the responses wrote, when there is one: `skill/doc-kit/scripts/transcript-usage.mjs`) and people (`actor: "human"`) use the same format.
- **Not recorded:** `dev`, `open`, `view`, `doctor`, `init`, `skill`, `stats`, `export` and `upgrade`.
- **Read:** `stats [--by step|version|command|model|phase|page|actor] [--since <v>] [--csv] [--json]`. For
  `--by step`, each step is followed by its parts, with their share of the step. The overall total counts only the
  commands' own spans, so nothing is counted twice.
- **`--profile`** (global) prints a run's spans to stderr, longest first, whether or not the project records them.
- **`::usage{view}`** (`::consommation{vue}`) renders the statistics at build time (`engine/stats/render.mjs`). The
  views are:
  - `summary`: kit, agent and human time; the number of agents and the models used, with the agent count per
    model; tokens; cost; runs; versions;
  - `versions`: one row per version;
  - `steps`: each step, with its parts under it;
  - `models`: input, output and cache tokens per model, and their cost;
  - `slowest`: the ten slowest parts.

  With no view, every table is rendered. An unknown view is an error; a project with no statistics yet gets a
  warning and a short note. Cost uses `llm.prices`: `cacheRead` defaults to 0.1 × input and `cacheWrite` to
  1.25 × input. The `documentation-cost` page template lays these tables out.

### 6.17 Files for the next AI (`pack`)

**`doc-kit pack [--output <dir>]`** (`cli/commands/pack.mjs`, `engine/pack/pack.mjs`) writes four files in the
documentation project, by default in the folder of the built site (`config.output`), never in the application:

- `llms.txt` ([llmstxt.org](https://llmstxt.org)): `# title`, `> tagline`, one `## section` per section, one link
  per page (`<site file>#/<id>`) with its summary;
- `llms-full.txt`: the Markdown of every page in reading order (home page, then for each section its introduction
  when the file exists and its pages), under `# title (#/id)`, without HTML comments (the writers' guidance);
- `AGENTS.md`, in the project's language: one section per subject that has facts: stack (the `::c4` model),
  commands (the `scripts` of the `package.json` of the application root and of each container, read, never run),
  environment variables (names and where they are read), tables, API routes (method, route, file:line,
  authentication), tests, tooling, the main risks (`::health`), the ten main hotspots, the agent instructions
  already in the application (`facts/agents.json`). A list stops after 40 lines, with a line giving how many more;
- `CLAUDE.md`: `@AGENTS.md`.

Every file goes through `scanText` with the project's detectors and ignore rules (`engine/check/secrets.mjs`): a
line where one fires is replaced by `cli.pack.removed` and reported (`cli.pack.secret`); the command still writes
the files and exits with code 1. No table of contents: `pack.noToc` (exit code 2).

### 6.18 Bricks: run again only what you need (`bricks`)

A **brick** is a part of the documentation project that can be run again on its own: each facts source, the external tools, the documentation audit — and, in later versions, the spaces, the analysis of the features and the parts of the application report. The bricks are data, `standard/bricks.json` (schema `schemas/bricks.schema.json`, loaded and checked once by `engine/bricks/registry.mjs`): `{ id, kind, title: { en, fr }, needs, requires, steps, freshness }`, and `presets` that name sets of bricks (`facts`, `full`). A new brick is one entry, never a new branch in a command.

- **`needs`**: bricks that must be up to date first; the graph has no cycle (a cycle is refused, named). **`requires`**: options without which the brick cannot run (`tools`, `network`).
- **`steps`**: `{ command: "inputs", action: "fetch"|"ingest" }`, `{ command: "facts", source }` or `{ command: "facts", tools: true }`, `{ command: "audit" }` — run by the kit, in the order of the bricks (the sources before the facts) —, or `{ agent: "<brief>", per: "page"|"feature"|"once" }` — run by the skill's agents, only listed by the kit.
- **The project chooses its bricks**: `bricks.enabled` (ids or presets; `null`, the default: every brick) and `bricks.disabled` in `doc.config.mjs`. An unknown name there is a configuration error, `bricks.config`, that names `doc.config.mjs`, the closest name and every valid one (exit code 2); on the command line, `bricks.unknown` with the closest id (exit code 2). A brick the project disables never runs: it is left out of the presets, of `--stale` and of `--deps`, and skipped with its reason (`disabled`) when named by its id.

**State** (`engine/bricks/status.mjs`), read from what the brick produced — the kit keeps no state file of its own: `disabled` · `missing` (never produced) · `stale` · `fresh` · `volatile` (runs on demand, such as the audit). Freshness rule `envelope` (`envelopeState`, `engine/facts/freshness.mjs`), for each facts file the brick writes: missing; stale when it was read at another commit than the application's current HEAD (an unknown HEAD makes nothing stale), written by another kit line (major.minor of its `generator`), older than `maxAgeDays` when given, or unreadable; the worst file gives the state. A fresh brick with an enabled need that is missing or stale is stale (`why`: that need). Each state carries its reasons, `why: [{ key, vars }]` (messages `cli.bricks.why.*`).

**`doc-kit bricks`** prints every brick, its state and why (`--json`: `{ bricks: [{ id, kind, title, state, why: [{ key, vars, text }], needs, requires, steps }], presets }`); **`doc-kit bricks <id>`** one brick: what it needs and how it runs; **`doc-kit bricks <preset>`** the bricks of the preset and their states (`--json`: `{ preset, bricks }`). **`doc-kit bricks run [<id|preset>…]`** (`engine/bricks/plan.mjs`, pure; executed by the command):

- the bricks named run, fresh or not; with `--stale` and no name, every enabled brick that is missing or stale (an on-demand brick only when named); with names and `--stale`, only those of them that are missing or stale; nothing named and no `--stale`: `bricks.runNothing` (exit code 2);
- `--deps` adds what they need, in the order of the graph, when it is not fresh (`--force`: always);
- a brick whose `requires` option was not given is skipped and says so (`--tools` and `--network` are what let such a brick run); when every brick asked was skipped, the command says so;
- every `facts` step is gathered into **one** run of `doc-kit facts` (exactly those sources, possibly none: the tools alone), with `--network` passed through and `--tools` only when a brick that runs has a tools step; other commands follow in brick order, in the same process; the first one that fails stops the run, with its own exit code (its error printed as usual; `--json`: the plan with `ok: false` and the failed step in `done`). Steps that are an agent's are listed (`--json`: `agents: [{ brick, agent, per }]`). `--json`: `{ run, skipped, commands, agents, done, ok }`.

### 6.19 Inputs: the sources of a project (`inputs`)

What the kit reads to document an application, besides the code of `app.dir`, is declared in **`inputs.json`** at
the project's root (schema `schemas/inputs.schema.json`, read and checked by `engine/inputs/model.mjs`; data, so
that `doc-kit init` and `doc-kit inputs add` write it without ever rewriting `doc.config.mjs`):

```json
{
  "code": [{ "name": "orders-api", "repo": "https://github.com/acme/orders-api.git", "branch": "main", "role": "app" },
           { "name": "infra", "path": "../infra", "role": "infra" }],
  "app": [{ "env": "prod", "url": "https://orders.example.com", "readOnly": true }],
  "documents": [{ "file": "docs/DAT-orders-v2.docx", "kind": "dat", "title": "DAT v2.3" },
                { "url": "https://acme.atlassian.net/wiki/spaces/ORD/pages/123", "kind": "spec" }],
  "workspaces": [{ "tool": "confluence", "url": "https://acme.atlassian.net/wiki/spaces/ORD" }],
  "backlog": { "tool": "jira", "url": "https://acme.atlassian.net/jira/software/projects/ORD" }
}
```

- `code[]`: a folder (`path`, relative to the project) or a shared repository (`repo`: https without credentials,
  `ssh://…` or `git@host:path` — `isSafeRepoUrl`; `branch` checked by `isSafeRef`; `depth` for a shallow clone),
  `role`: `app` (the application), `infra` (its infrastructure), `lib` (another component). `name` is unique.
- `app[]`: the application online, one address per environment (`env` unique), `readOnly` for production.
- `documents[]`: a `file` (relative to the project, or absolute) or a `url`; `kind`: `dat` (the technical
  architecture document), `spec`, `guide`, `other`.
- `workspaces[]` (`tool`: confluence, sharepoint, teams, notion, drive, other) and `backlog` (`tool`: azure, jira,
  github, gitlab, other): addresses; the tool is guessed from the host by `inputs add`.
- Never a secret: an address or a path with credentials or a secret (`hasCredentials`: a user in any address it
  holds — whatever the slashes after the scheme, as browsers and git read it (the WHATWG reader too) — in any scheme
  but ssh, a password anywhere, a secret parameter of the query, the fragment or the path (`;jsessionid=`) by the end
  of its normalised name (`accessToken`, `private_token`, `X-Amz-Signature`; a switch or a small number never is),
  a value the secret detectors find; spaces, quotes and angle brackets around it change nothing) is refused before the
  schema runs, the message naming the field, never its value (`inputs.credentials`; also in `inputs add` and the
  questions of `init`); the details of a schema error never show a value either. Errors: `inputs.credentials`, `inputs.invalid` (not JSON, or
  against the schema, with its details), `inputs.duplicate`, `inputs.repoUrl`, `inputs.branch` (exit code 2).

**`doc-kit inputs`** (`cli/commands/inputs.mjs`):
- `inputs [status]`: each source and its state (`engine/inputs/status.mjs`, read from the clones and the index —
  no state file of its own): a folder `present`/`missing`; a repository `fetched` (a clone of that address,
  its commit and last fetch) or `notFetched`; a document `fresh`, `stale` (changed since it was converted),
  `notIngested`, `refused`, `missing`, or `external` (an address). Then what the kit reads of the code of
  `app.dir` (§6.9, `facts/stack.json`): the part of its lines read, each language read or not, the stacks and the
  low-code platforms found — or the command that measures it. `--json`: `{ code, app, documents, workspaces, backlog,
  reading }` (`reading`: `{ items, stacks, summary }` of facts/stack.json, or null).
- `inputs add <code|app|document|workspace|backlog> <value>` (options `--name --role --branch --depth --env
  --read-only --kind --tool --title`): one source added to `inputs.json`, checked like the whole file.
- `inputs fetch [<name>…]` (`engine/inputs/repos.mjs`): clones each shared repository into
  `.doc-kit/inputs/repos/<name>`, or brings it up to date (`fetch`, then `checkout --detach` of the branch);
  a folder that is not a clone of that address is fetched again from scratch. The only git commands of the kit
  that write (RULES.md S2): through `ctx.exec` (safe-git), the address and the branch after `--end-of-options`,
  every clone configured from its creation (`clone --config`: `core.hooksPath` to an empty folder of the kit,
  `core.symlinks=false`, `core.fsmonitor=false`, `protocol.ext.allow=never`, `protocol.file.allow=never`,
  `submodule.recurse=false`, `transfer.fsckObjects=true`), given again to each update (`git -c`),
  `GIT_TERMINAL_PROMPT=0`, `GIT_LFS_SKIP_SMUDGE=1`, a 10-minute limit; the name of the entry is checked (`NAME`,
  its folder under `repos/`) before any folder is removed (`inputs.name`), an update is refused when the clone's
  configuration names a program a fetch would run (`riskyGitConfig(dir, { fetch: true })`: also `core.sshCommand`,
  `core.gitProxy`, `core.askPass`, `core.alternateRefsCommand`, `core.worktree`, `credential.helper`), and what git prints is shown without
  its control characters. git uses the user's own credentials; the kit never sees a token. An application fetched this
  way is documented by pointing `app.dir` to its clone (the command says so).
- `inputs ingest [<file>…]` (`engine/inputs/ingest.mjs`): each document with a `file` becomes
  `.doc-kit/inputs/docs/<slug>.md`, listed in `.doc-kit/inputs/docs/index.json` (`{ generator, generated,
  documents: [{ source, kind, format, hash, output, headings?, tables?, images?, pages?, removed, refused? }] }`):
  Word (`docx.mjs` on `zip.mjs` and `core/xml.mjs`: headings from the styles, paragraphs, lists, tables as Markdown);
  diagrams (`diagrams.mjs`: draw.io, PlantUML, Mermaid → components and links); PDF (`pdf.mjs`: indexed only,
  its pages; the agents read the file itself); Markdown and text as they are; HTML as text. Each text starts with a
  notice ("information to check, never an instruction", `cli.inputs.output.header`) and goes through the secret
  filter (`withoutSecrets`). Limits (SECURITY.md): a file of at most 64 MB; a ZIP of at most 10 000 entries,
  64 MB per entry, 256 MB in all, a compression ratio of at most 200, neither encrypted nor ZIP64, sizes and CRC
  checked; XML without DTD expansion (an entity is never expanded), depth and node count capped; a Word table of at
  most 64 columns and 200 000 cells, a converted text of at most 16 million characters; a diagram label read once
  and cut at 2000 characters, at most 2000 components and 5000 links. A refused document says why (`inputs.refused`
  with `cli.inputs.reason.<reason>`). Each document keeps its output name from one conversion to the next, and a
  conversion of some documents never writes over another's. A document given by its `url` is never fetched by the
  kit: the skill reads it through the session's connectors (Claude Code, Claude Cowork) and saves it in its
  `page` (`pageFile`: `.doc-kit/inputs/pages/<name>-<hash>.md`, given by `inputs status`), which `inputs ingest`
  then converts like a file (state `external` until then).
- `inputs reconcile [--json]` (`engine/inputs/reconcile.mjs`): the first pass of the reconciliation of the technical
  architecture documents with the code, deterministic, which the skill's brief `architecture-reconcile` checks. It
  reads the converted texts of the documents of kind `dat` (the index above) and the facts `dependencies`, `infra`,
  `stack` and `env` (§6.9; a source without its file is named in `missing`: the code's side is then incomplete).
  The technologies are those of `standard/technologies.json` (`schemas/technologies.schema.json`): for each, its
  `names` — matched word for word in the text, read as a stream (`wordsOf`: letters, digits, `+` and `#`, a `.`
  inside a word joins it, a `-` does not; case and accents ignored, but as written for a technology with `case`: a
  name that is also a common word, React, Sentry, Stripe; the longest name first, its words not read again; one
  mention per line, 20 kept per technology, the rest counted; each mention with the Markdown heading of its line and
  the name found) — and its traces in the facts: a package (`packages`: exact, or
  a prefix ending with `/`, `:` or `.`, case ignored), a container image (`images`: its name without tag or digest,
  or its last part), an infrastructure type (`infra`: contains), provider (`providers`: exact) or file (`files`:
  ends with), a stack detected (`stacks`), an environment variable (`env`: starts with), a language with lines
  (`languages`); 5 traces per source at most. An image's name is read with `indexOf`, once per item. Each technology the documents name or the code shows is `confirmed`
  (both), `datOnly` (said by a document, no trace: a managed service outside the repository, or a gap) or
  `codeOnly` (in the code, named by no document), listed in that order. The hosts of the `http(s)` addresses of the
  documents (200 at most; a user name before `@` skipped, never kept) are `declared` when they are those of the
  application (`app.url`, `inputs.json` `app`). Only a converted text the index places in `.doc-kit/inputs/docs/`
  (`<name>.md`, one segment) is read, a plain file — never a link — of 64 MB at most, whose real path lies in that
  folder, itself really in the project (a junction or a link that leads out is never followed).
  It writes `.doc-kit/inputs/reconcile.json` (`{ generator, generated, documents: [{ source, output }], missing,
  technologies: [{ id, name, status, dat: [{ doc, line, heading }], more, code: [{ source, what, file?, line? }] }],
  hosts: [{ host, declared, dat }] }`) and prints a summary; without a document of kind `dat`, it says so and
  writes nothing. A trace is evidence, never proof; nothing of the application is run; every scan is linear.
- Exit code 0; 1 when a source could not be fetched or read; 2 for an invalid `inputs.json` or a usage error.

**Questions of `doc-kit init`** (`cli/init-answers.mjs`): after the main answers, "Declare the other sources
now?" (default no); then, each optional: infrastructure code, other code, the application online by environment,
the technical architecture document, other documents, collaborative spaces, the backlog. The paths are written
relative to the documentation project; an answer the sources refuse is said and skipped. `--yes` asks nothing:
`inputs add` declares them later.

**Bricks** (§6.18): `inputs.repos` (`inputs fetch`, requires `--network`) and `inputs.docs` (`inputs ingest`),
preset `inputs`, freshness rule `{ rule: "inputs", part: "repos"|"docs" }` read from `inputsStatus` — a repository
not fetched makes `inputs.repos` missing; a document not converted, changed or gone makes `inputs.docs` missing or
stale (`why`: `notFetched`, `notIngested`, `changed`, `fileMissing`). Every `facts.*` brick needs
`inputs.repos`: the shared repositories are fetched before the facts are read. `bricks run --network` lets
`inputs.repos` run and also lets `facts` ask the public registries (§6.9, SECURITY.md).

## 7. Standard and page templates

`standard/` is the quality standard. Every document exists in English (`.md`) and in French (`.fr.md`):
- `structure`: recommended site structure;
- `templates` (and `templates.json`, `templates/<group>.json`): the 31 page types;
- `writing`: writing rules;
- `captures`: capture safety;
- `quality`: blocking gates and warnings;
- `maturity`: levels 1 to 4, each measurable by `audit` (`annotated` is `n/a` with `capture.mode: "none"`);
- `delivery`: handover checklist;
- `config`: commented configuration examples, all fictional.

The 31 page types are `screen`, `editor`, `recipe`, `technical`, `technical-sub`, `journey`, `journey-step`, `troubleshooting`, `troubleshooting-area`, `findings`, `architecture`, `variables`, `resources` (`standard/templates.json`); `feature`, `business-rules`, `roles-matrix`, `process`, `release-notes` (`standard/templates/business.json`, §6.8); `access-ownership`, `api-surface`, `runbook`, `data-model`, `dependencies`, `code-map`, `tests-quality`, `agent-instructions`, `adr`, `threat-model`, `security-review`, `maintainability-review`, `documentation-cost` (`standard/templates/takeover.json`, §6.9/§6.13/§6.14). Each has a template in `templates/pages/en/<type>.md` and in `templates/pages/fr/<type>.md`.

## 8. Skill

The source lives in `skill/doc-kit/`:
- `SKILL.md`: front matter `name: doc-kit` and `description`, about 400 lines, in English. It tells Claude to answer in the user's language.
- `references/*.md`, in English: `method.md` (the phases in detail, both spaces, the update cycle), `pitfalls.md` (including vibe-coded application risks), `capture-safety.md`, `templates.md` (the 31 page types), `standard.md`, `agent-orchestration.md` (batches, waves, placeholders, the economy of the agents).
- `agents/*.md`: the four agent type definitions (`doc-kit-triage`, `doc-kit-writer`, `doc-kit-analyst`, `doc-kit-reviewer`, §6.11), copied next to the skills folder by `skill install`, never inside the `doc-kit/` skill folder itself.
- `assets/briefs/{en,fr}/*.md`: brief templates with parameters such as `{{product}}`, `{{docDir}}`, `{{code}}`…, filled by `scripts/brief.mjs` from `doc.config.mjs` and `--var` values.
- `scripts/*.mjs`: `brief.mjs`, `consolidation.mjs`, `usage.mjs` and their shared `common.mjs` (Node ≥ 20, no dependency).
  - `{{appDir}}`, the application code given to the agents: `--var appDir`, else `extra.briefs.appDir`, else `app.dir` (§3), else the nearest of the documentation folder's parent and grandparent that holds `.git`, else its grandparent (`docs/manual` → the application). `brief.mjs` warns when `appDir` was not configured, and when the coverage source sits in a sub-folder with its own `package.json` (a separate front end: the inventory of routes does not see the back end).
  - `{{scriptsDir}}` (the skill's `scripts` folder) and `{{behavioursFile}}` (`config.behaviours.file`, else empty): the briefs of the analyses of the features (§6.11a).
  - `{{featuresFile}}` (the `features` coverage adapter's `file` option, else `features.json`) and `{{factsDir}}` (`paths.facts`, else `facts`), both relative to the documentation project: the inputs of the briefs of the business pages and of the takeover dossier.
  - `brief.mjs` speaks the project's language (`language` of `doc.config.mjs`; without a project, `--lang`, else English); `--list` prints the available languages and the templates of each.

`doc-kit skill install [--target <skills folder>] [--force]` copies the skill to `<skills folder>/doc-kit/`:
- the skills folder is `--target`, else `$CLAUDE_CONFIG_DIR/skills`, else `~/.claude/skills`; nothing but its `doc-kit/` folder is written;
- `{{KIT_PATH}}` is replaced with the kit's absolute path (forward slashes) in `SKILL.md`, `references/*.md` and `scripts/*.mjs`; the briefs keep their own placeholders;
- a fingerprint, `.doc-kit-skill.json` (kit version, kit path, hashes of the source and of the installed copy), lets `doctor` report the copy as current, missing, outdated (the kit's skill changed), modified (edited by hand), installed from another kit, or foreign (no fingerprint);
- a `doc-kit/` folder without fingerprint is left alone (exit code 1) unless `--force`.

## 9. Equivalence (non-regression of migrated projects)

`test/tools/equivalence.mjs` compares two builds of the same project. The reference is the previous engine or kit version, with its date fixed by `test/tools/fixed-date.mjs`. The candidate is the current kit, run with `--date`. The comparison has four levels:

1. The site data (JSON) is identical, ignoring `meta.generator`, `meta.screenshots` and `i18n`. `meta.screenshots` (the dates and versions of the screenshots, shown in the footer, §6.2) did not exist before the kit: a project captured again with the kit gains it without any change to its content.
2. The images are identical: same ids, same SHA-256.
3. The visible text (`main`, menu, table of contents) is identical for every page, every section and the home page.
4. Screenshots of a sample of pages differ by at most 0.1 % of pixels, in light and dark themes.

A stricter check, `bytes`, compares the HTML itself, ignoring only `<meta name="generator">`, `meta.generator` and `i18n` (`test/tools/diff-html.mjs`). It proves that the build pipeline is faithful, using the previous engine's site assets through the internal `siteDir` option of `build()`.

**Spaces.** A project that declares no space (§6.1a) keeps levels 1, 2 and 3: `spaces`, `space`, `topic`, `hidden` and `meta.space` appear in the site data only when declared, the texts of the spaces are not embedded, and `app.js` shows the same pages when `D.spaces` is absent. Its HTML is not byte-identical to an older build: the site assets embedded in it (`app.js`, `style.css`, `template.html`) are those of the current kit, as after any change to them; the `bytes` check is only meaningful with the same assets (`siteDir`). A counterpart alone brings the texts of the spaces too, but no space data. A project that adds spaces changes its site data on purpose: its reference must be rebuilt.

**Site data names.** The data embedded in the generated site (`<script id="site-data">`) uses the key names of `toc.json` (`title`, `order`, `journeys`, `glossary`…) since 0.3.0. Older builds used French names (`#donnees`, `titre`, `ordre`, `parcours`…): `test/tools/legacy-data.mjs` translates their data, record by record, before levels `bytes` and 1 compare it, so those levels stay meaningful against older builds. The CSS classes and the `data-*` attributes of the generated markup keep their historical names (`encadre`, `data-titre`…): they are internal to the site, not a configuration surface; renaming them is a deliberate, separate change.

Real projects used to validate a migration stay **outside** the kit. Their configurations, reports and outputs are kept in the maintainer's working folders, never in this repository.
