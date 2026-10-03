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
- **Few dependencies.** Only two runtime dependencies: `marked` 18.0.14 and `playwright` 1.60.0.
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
│  ├─ project/           find.mjs, load.mjs, validate.mjs, defaults.mjs, env.mjs, legacy.mjs (§6.7), semver.mjs, browser.mjs
│  ├─ build/             build.mjs (pure functions), markdown.mjs (extensions), search.mjs, assemble.mjs, text.mjs,
│  │                     page-templates.mjs (required sections of §6.4, shared with audit), spaces.mjs (§6.1a)
│  ├─ capture/           capture.mjs, targets.mjs, actions.mjs, masking.mjs, webp.mjs, plans.mjs, session.mjs (adapters)
│  ├─ check/             coverage.mjs, links.mjs, tables.mjs, images.mjs, secrets.mjs
│  ├─ facts/             one module per source of `doc-kit facts` (§6.9), api.mjs shared with the coverage adapters
│  ├─ audit/             audit.mjs (indicators, maturity level, actions), report.mjs (audit.md, audit.json),
│  │                     optional.mjs (measures that may be "not measured")
│  ├─ dev/               server.mjs (watch, rebuild, live reload via SSE), client.js, environment.mjs (shared by dev,
│  │                     doctor, init and the guided mode), zip.mjs (export --zip)
│  ├─ site/              template.html, app.js, style.css, icons.mjs, default-logo.svg
│  ├─ theme/             default-tokens.json, tokens.mjs, contrast.mjs
│  ├─ i18n.mjs           dictionary loading and merging, t(key, vars), plurals
│  └─ migrations/        runner.mjs, <version>.mjs (used by upgrade)
├─ i18n/                 en.json, fr.json, and fragments <language>/{capture,audit,ux,help,spaces}.json (§6.5)
├─ adapters/coverage/    next-app-router.mjs, react-router.mjs, i18n-registry.mjs, glob.mjs, openapi.mjs, features.mjs (§6.8),
│                        fastapi.mjs, facts.mjs (§6.9)
├─ adapters/auth/        manual.mjs (default), none.mjs, nextauth.mjs, api-me.mjs
├─ schemas/              config, toc, glossary, zones, capture-plan (.schema.json)
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
- It detects the framework (`next` with `app/` or `src/app/` → `next-app-router`; `react-router`), a Python back end, the dev script's port, the product name, the version file and the `.env` files, then asks for the product name, the language, the application URL, where the screenshots are taken (the capture target) and the sign-in method, shows the recap and confirms.
- `--name`, `--lang`, `--url`, `--framework next|react-router|none`, `--auth`, `--capture app|none` and `--target local|demo|production` answer in advance; `--yes` takes the detected values and the options without any question (required without a terminal). With `--yes`, the site language is `--lang`, else the system language (`LC_ALL`, `LC_MESSAGES`, `LANG`), else English.
- **Capture target** (`capture.target`, §3). The question "Where will the screenshots be taken?" offers 1. local or demo application, 2. production, read-only, 3. no screenshots (`capture.mode: "none"`).
  - Choice 1 writes `local` when the URL is a loopback address (`localhost`, `*.localhost`, `127.x`, `[::1]`), else `demo`. `--capture app` removes choice 3; `--target` or `--capture none` skip the question; `--target` together with `--capture none` is a usage error (exit code 2).
  - **Production**: the production URL is asked (default: the URL already answered, unless it is a loopback address; with `--target production`, it replaces the URL question), then the safety reminders are printed: read-only blocks the browser's writes but **not** a write made by the server while it renders a page (list such routes in `capture.forbidden`); the session file is a secret; the screenshots show real data (the owner's written decision). `capture.target: "production"` and `capture.readOnly: true` are written.
  - With `--yes`, `--target production` requires `--url` (exit code 2 otherwise) and the reminders are printed too.
- **Follow-up**, only in interactive mode with screenshots (never with `--yes`, `--json` or without a terminal): once the files are written,
  - "Open the browser now to sign in? (Y/n)" (not asked with `auth: none`): `npm install` in the project when the kit is not linked yet, then `connect` (visible browser: the person signs in, then presses Enter);
  - then "Take a first test screenshot with --preview? (Y/n)" (the question names production when it is the target): `capture --preview --yes` on the example plan;
  - a step that fails stops the follow-up, its message is printed and its exit code becomes `init`'s; closing the input at these questions counts as "no" (the project is written);
  - the next steps printed at the end leave out what was done. The tests replace these steps through the context (`steps` of `createContext`, §4): no npm, no browser.
- **Product name**: `--name`; else the `title` of the `metadata` exported by the Next.js root layout of the front end (`app/layout.*` or `src/app/layout.*`, a string or `{ default }`); else `productName`, `displayName` or `name` of the front end's `package.json`, without its scope and without a `-frontend`, `-front`, `-web`, `-ui`, `-client` or `-app` suffix; a generic name (`frontend`, `web`, `app`…) gives way to the root `package.json`, then to the folder name. Renaming afterwards: `product.name` in `doc.config.mjs` (the slug and the output follow unless they are set) and the `title`, `tagline` and section titles of `content/toc.json`.
- **Version** (`version.file`, `version.pattern`): `version.txt` or `VERSION` at the application root, else the root `package.json` when it has a `version`, else the front end's `package.json`, else the `pyproject.toml` of a Python-only application.
- **Masking files** (`masking.env`): `.env` and `.env.local` at the application root and in the front-end folder, only the files that exist (never `*.example`).
- **Application folder** (`app.dir`): the application root, relative to the documentation project.
- **Recap.** Before writing anything, with or without `--yes`, `init` prints what it is about to write: folder, product name (and where it was found), slug, language, URL, version (and the file it is read in), capture mode, capture target (with screenshots), sign-in, coverage adapter and source, masking files, application folder, and where to rename the product afterwards. Without `--yes`, a confirmation follows.
- It writes `templates/project/common/` then `templates/project/<language>/`, variables filled; every `.md` file goes through the capture variants (§6.4), and `captures/plans/example.mjs` is only written in capture mode `app`. The skeleton's `kit` range is set to accept the installed kit. A non-empty target folder is refused (exit code 1).
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
  kit: "^0.1.0",                                    // accepted kit version range (otherwise exit code 3)
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
| `new <page-id>` | `--template <type> --title --parent --prefill` | page from a template, declared in the table of contents |
| `check [coverage\|links\|tables\|images\|secrets\|all]` | `--width` (tables, default 1440 px) `--threshold` (images, default 200 KB) | the checks; `all` by default, coverage skipped when no adapter is configured |
| `audit` | (global `--json`) | maturity level and actions (standard/maturity.md); writes `.doc-kit/audit.md` and `.doc-kit/audit.json` |
| `inventory` | `--features --write --force` (global `--json`) | what the coverage adapters see, and what is already cited; `--features`: candidate features (§6.8) |
| `sync` | `--since --apply --labels --mark --all --sources --date --check --estimate` (global `--json`) | what the documentation must follow after a change of the application; mechanical fixes; marks checked pages (§6.10) |
| `context <page…>` | `--budget --update --translate <lang>` (global `--json`) | the context file of a page for an agent (§6.11); `--translate <lang>`: the translator's dossier of that page instead (§6.12), exclusive with `--update` |
| `translate status` · `translate --mark <page…> \| --mark --all` · `translate --fix-anchors [page…]` | `--check` (status) (global `--lang <l>`, `--json`) | the state of the translations (§6.12): `status` lists, per language, the files `current`, `stale`, `unmarked` and `missing` (`--check`: exit code 1 when a file is stale or missing); `--mark` records the source fingerprint of the listed pages (or content paths such as `home.md`, `toc.json`) in `translations/<l>/.sources.json`; `--fix-anchors` rewrites, deterministically, the `#/page~anchor` links of the translated pages whose anchor is a heading of the source page, from the position of that heading in the translated page. `--lang` limits to one language; without it, every language but the source |
| `facts` | `--source <name> --network --tools` (global `--json`) | facts read in the application code, written to `facts/<source>.json` (§6.9) |
| `view <page[~anchor]>` · `open [page]` | `--theme light\|dark --height --full --tour N --output --space <id>` | screenshot of a page of the built site (`--full`: the whole page in one image) · the site in the default browser; `--space <id>`: the export of that space instead of the full site (same usage errors as `build`) |
| `optimize` | `--threshold` (200 KB) `--quality` (0.68) | re-encodes the heavy screenshots, kept when 20 % lighter |
| `migrate` | | rewrites legacy French-keyed files into the current format (§6.7) |
| `export <target>` | `--with-dist --zip` | self-contained copy, engine vendored in `vendor/doc-kit/`; `--with-dist` includes the exports per space too |
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

**Test seams.** `createContext(globals, io)` (`cli/common.mjs`) also accepts `steps` (the follow-up steps of `init`: `install`, `connect`, `capture`) and `launch` (the browser launcher given by `capture` and `connect` to the engine), so that the tests run these paths without npm and without a browser.

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
```

- **Options.** `options` maps each option to a schema (validator of §3; `required: true` marks a mandatory option); the configuration entry is validated against it, defaults applied, and an error is reported with its path (`coverage[0].ap`, `auth.loginPatern`), exit code 2.
- **Coverage.** The kit does the search in the content (normalised text of `content/**/*.md|json`), the report and the exit code.
  - An item is `{ id, label?, match: [texts] }`; it is covered when one of its `match` texts appears (case and white space ignored).
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
- **Project adapters.** An adapter specific to a project is declared as `adapter: "local:adapters/x.mjs"`.

## 6. File formats

### 6.1 `content/toc.json`

```json
{
  "title": "…", "tagline": "…",
  "spaces": ["business", { "id": "takeover", "subtitle": "…" }],
  "sections": [{ "id": "use", "space": "business", "title": "…", "shortTitle": "…", "icon": "…", "subtitle": "…", "highlights": ["…"], "featured": false,
                 "groups": [{ "title": "…", "pages": [{ "id": "use/start", "title": "…", "menuTitle": "…", "summary": "…",
                                                       "level": 1, "template": "screen", "routes": ["/"], "permissions": ["…"],
                                                       "space": "business", "counterpart": "take-over/orders-api" }] }] }],
  "journeys": [{ "title": "…", "description": "…", "space": "business", "steps": ["use/start"] }],
  "suggestions": ["use/start"]
}
```

- `level: 2` marks a sub-page. It is attached to the last level-1 page above it in the same group.
- `template` is optional. When it is present, the build checks the required sections of that page type (§6.4).
- `file` is optional: the page source, relative to `content/` (default `<id>.md`).
- The home page is `content/home.md`; each section may have an introduction, `content/<section>/index.md`.
- `spaces`, `space` and `counterpart` are optional (§6.1a). Without them, the site is exactly what it was before spaces existed.

### 6.1a Spaces (one source, one site per audience)

A **space** is the part of the documentation written for one audience. The standard defines two (`standard/structure.md`):
- `business` ("For the business"): what each feature does, for whom, its rules; read by users, key users, product owners and support;
- `takeover` ("For the takeover team"): how the application is built, run and secured, and what to fix first; read by the developers, operators and security people who take the application over.

One source, two kinds of output (DITA's single-sourcing): **one HTML file with a space selector**, where the filter only changes what is shown, and **one HTML file per space**, an export from which the other spaces' content is **physically removed**. Only the export is fit to hand to an audience that must not see the rest (the takeover space lists variables, hosts, risks).

**Declaring the spaces** (`content/toc.json`)
- `spaces`: a list. Each item is a space id (string) or an object `{ id, title, shortTitle, subtitle, icon, for }`.
  - `id`: `^[a-z][a-z0-9-]*$`, unique (`space.duplicate`, error).
  - `business` and `takeover` have default texts in the site language (`ui.spaces.<id>.title|shortTitle|subtitle|for`) and a default icon (`SPACE_DEFAULTS` in `engine/build/spaces.mjs`, icons of the existing set); a field of the object overrides its default. Any other id must have a `title` (`space.title`, error); its `shortTitle` defaults to its `title`.
  - `for`: one line naming the readers ("Users, key users, product owners, support"). Shown on the home page's space doors and as the tooltip of the selector.
  - Order: the order of the selector and of the home page doors.
- `space` on a **section**: required for every section as soon as `spaces` is declared (`space.missing`, error); it must name a declared space (`space.unknown`, error).
- `space` on a **page**: optional, overrides its section's space. A section then appears in every space where it has pages, with only those pages; its overview page (`#/<section>`) belongs to the section's own space.
- `space` on a **journey**: optional; default: the space of its first step.
- `space` anywhere while `spaces` is not declared: `space.undeclared`, error.
- These errors (`space.missing`, `space.unknown`, `space.undeclared`, `space.duplicate`, `space.title`) stop any build, even a draft one, like an invalid outline (`resolveSpaces` in `engine/build/spaces.mjs`).
- A declared space without any page: `space.empty`, warning.
- The **effective space** of a page is its own `space`, else its section's.

**`counterpart`** (page field, with or without spaces): `"<page id>"` or `"<page id>~<anchor>"`, the same subject seen by another audience. A feature sheet and the technical page of the same feature point to each other, and share their `F-xx` identifier (§7).
- Rendered at the top of the page, under its badges, as one line: "Same topic, for {space}: {title} →" (`ui.counterpart`; `{space}` is the `shortTitle` of the target's space), or "Related: {title} →" (`ui.counterpart.plain`) when the project has no spaces or both pages share a space.
- Checked like an internal link (`engine/check/links.mjs`, the build and `check links`): unknown page or the page itself → `link.counterpart`, unknown anchor → `link.anchor` (not checked while the target page is not written yet, §6.4).
- Not required to be reciprocal.

**Site data** (§9: new keys are in English, and are emitted **only** when they are declared, so that a project without spaces keeps identical site data):
- the texts of `i18n/<language>/spaces.json` are embedded only in a site that declares spaces or a counterpart;
- `spaces: [{ id, title, shortTitle, subtitle, icon, for, pages }]`: texts resolved at build time, `icon` resolved like a section icon, `pages` = number of pages of the space;
- `sections[].space`, `pages[].space` (effective space), `parcours[].space`;
- `pages[].counterpart: { id, anchor? }` when the page declares one;
- in an export only: `meta.space` (the id of the exported space), `spaces` holding that space alone, and `parcours[].hidden` (number of steps removed, when > 0).

**Site behaviour** (`engine/site/app.js`, `template.html`, `style.css`; only when `D.spaces` exists)
- **Current space**: a space id, or `null` for "everything". It comes from, in this order: the URL `#/@<id>` (`#/@` = everything; an unknown id = everything); the effective space of the page shown (a section overview: the section's own space); the value remembered in `localStorage` under `__THEME_KEY__.space` (read and written inside `try`/`catch`, like the theme; `""` for everything); else `null`. Showing a page, a section overview or `#/@<id>` makes that space current and remembers it; the plain home page `#/` keeps the current one. `#/@<id>` shows the home page of that space.
- **Selector** in the top bar (`#espaces`, `role="group"`, `aria-label="{{t:template.spaces}}"`): one "Everything" button (`ui.spaces.all`, tooltip `ui.spaces.allFor`) then one button per space (`shortTitle`, tooltip `for`), the current one `aria-pressed="true"`. They are `<button>` elements that lead to `#/@<id>`. Below 1080 px it moves to the head of the side menu (`.lat-espaces`, `aria-label` `ui.spaces.label`). In an export there is no selector: the top bar shows the space's `shortTitle` as a label (`.espace-unique`).
- **Filter** (a space is current): the top navigation, the side menu, previous/next (the neighbours within the space, in `ordre`), the home page doors and journeys, the search suggestions, and "print everything" (the space only). `app.js` replaces `D.sections`, `D.ordre`, `D.parcours` and `D.suggestions` with their part of the space. A section shown for some of its pages (its own space is another one) loses its "featured" mark, its subtitle and its highlights, the side menu does not offer its overview, and its links in the top navigation and on its home page door lead to its first page of the space. In "everything" mode the side menu shows the title of each space above its sections, and nothing is filtered.
- **Home page**: in "everything" mode, one door per space (icon, title, `for` as "Readers: {for}" (`home.spaces.for`), `subtitle`, number of pages) leading to `#/@<id>`, then the home page Markdown and every journey. With a space current, a strip "You are reading: {title} · Show everything" (`home.spaces.current`, `home.spaces.showAll`; not in an export, which holds nothing else), then the doors of that space's sections, the home page Markdown and the space's journeys; the primary action targets the first featured section of the space, else its first own section. The door grid is no longer fixed at 4 columns: `repeat(auto-fit, minmax(240px, 1fr))`, one column on a phone, a single door keeping the width of a door.
- **Page**: a space badge (`puce espace`, the space's icon and `shortTitle`) among the page badges; the breadcrumb starts with the space (Home › {space} › section…).
- **Search**: with a space current, the results of that space first, then, under a heading "In {space} ({n})" (`ui.search.inSpace`, `n`: the results of that space shown), those of each other space, in declaration order; the limit of 24 results applies to the whole list. In "everything" mode the order is unchanged and each result's path starts with its space's `shortTitle`.
- Texts: `ui.spaces.*`, `ui.search.inSpace`, `ui.counterpart*`, `ui.journey.hidden`, `home.spaces.*`, `template.spaces`, `render.spaces.*`, `cli.build.space*`, `cli.build.noSpaces`, `cli.build.link.counterpart`, `cli.validate.spaceOutput`, `cli.dev.space` and `cli.audit.spaces.*`, in the i18n fragment `i18n/<language>/spaces.json` (§6.5).

**Exports, one per space** (`build()`, `engine/build/spaces.mjs`)
- When `spaces` is declared and `config.spaces.export` is not `false`, `build()` returns, besides the full site (`html`, `data`, `output`, unchanged), `sites: [{ space, html, data, stats, output, excludedLinks }]`, one per declared space, in declaration order. Without spaces, `sites` is `[]`. `options.space` limits `sites` to that space (the full site is still computed), even with `export: false`; `options.spaceOutput` then overrides that export's output.
- The pages are rendered once. Each export **filters the site data**:
  - `sections`: the sections that have at least one page in the space, their groups reduced to those pages (an empty group is dropped);
  - `pages`, `ordre`, `recherche` (search index), `suggestions`: the pages of the space only;
  - `parcours`: the journeys of the space; their steps in another space are removed and counted in `hidden` (the site prints "+ {n} steps in another part of the documentation", `ui.journey.hidden`);
  - sections kept for some of their pages (their own space is another one) lose their introduction, subtitle, highlights and "featured" mark (they belong to that space, with the section overview);
  - images: only those used by the kept pages, the kept section introductions and the home page; `meta.stats` is recounted on what is kept (pages, screenshots, zones, diagrams), from what each rendered document uses (`render().used` of the Markdown engine);
  - **links**: in the kept pages, the kept section introductions and the home page, a link `#/<target>[~anchor]` whose target page or section is not in the export becomes its text in a `<span class="lien-exclu">`, followed by " (see the {space} documentation)" (`render.spaces.excludedLink`, `{space}` = the `shortTitle` of the target's space). Their number is `excludedLinks`, reported as a warning `space.excludedLinks` `{ space, n }` (never an error: it is what an export is for); a link whose target is unknown (a broken link, reported by the link check) is left as it is;
  - a `counterpart` whose target is not in the export is removed;
  - the glossary is kept whole (§7 removes the technical correspondence from the exports other than `takeover`).
- **Output**: `config.spaces.output`, a path containing `{space}`, relative to the project; default: the full site's output actually built (`--output` included) with `-{space}` inserted before its extension (`dist/Acme-Orders-Documentation.html` → `dist/Acme-Orders-Documentation-business.html`).
- The links of each export are valid by construction: no other check runs per export. `check images` keeps working on the full site, which holds every page.

**Audit** (`engine/audit/audit.mjs`, `standard/maturity.md`)
- **Takeover pages.** When a space `takeover` is declared, the takeover pages are the pages whose effective space is `takeover`, and `takeoverSection` (the prefix of the suggested page ids) is the first section of that space (else the section of its first page). Otherwise, as before: the section `take-over` or `reprendre`, else the last section.
- **Level by space.** With spaces, the result also holds `spaces: [{ id, title, pages, level, indicators, criteria }]`: the same criteria, the page indicators (`written`, `typed`, `conformant`, `completeness`, `annotated`, `proofs`, `tooLong`) measured on the pages of the space, the project-wide ones (configuration, build, home page, glossary, journeys, coverage, blocking problems, wide tables, screenshot versions) shared. A criterion that does not concern a space counts as met and is shown `n/a`: `written2` (outside takeover) in the `takeover` space; `takeover4` and `proofs4` outside it. The global level is unchanged (every page).
- `audit.md` shows a table "Level by space" (`cli.audit.spaces.*`) under the global level; `audit.json` carries `spaces`. Without spaces, both are unchanged.

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

- **Entry fields:** `id`, `title`, `route`, `context` (a key of `capture.viewports`: `desktop` by default, `mobile` is a touch screen), `viewport`, `view` (map framing: `{ lon, lat, zoom }` converted to Web Mercator metres, or `{ x, y, z }` passed as is, in the URL parameters of `capture.map`), `storage`, `delay` (minimum wait after loading, default 0: the kit waits until the page is stable — no request in flight and no DOM change for 150 ms, fonts and images ready, finite animations ended, capped at 10 s, `engine/capture/stable.mjs`), `actions`, `settle` (minimum wait after the actions, default 0: stable again), `frame` (default margins: 34 px horizontally, 10 px vertically), `zones` (in the order of the markers; 3 to 12 recommended), `masks`.
- **Actions:** `click` (+ `options`, Playwright click options), `hover`, `type` + `value`, `select` + `value`, `press`, `scroll`, `wait`, `wheel`, `eval`.
- **Targets:** `{ role, name }`, `{ text }`, `{ field }`, `{ label }`, `{ placeholder }`, `{ css }`, `{ block }` (a container matching `capture.selectors.block` whose button or heading starts with the text). Exactly one kind per target.
- **Target options:** `exact`, `nth`, `last`, `has`, `within`, `up`, `framed` (closest ancestor matching `capture.selectors.frame`, or with a border on its four sides), `margin`, `marginY` (vertical margin of a `frame`), `side`.
- **Grouping zones:** a zone is either a target or `{ union: [target, …] }`. A union covers the bounding box of all its targets, for example several fields on the same row. Zone options: `caption` (written as `label` in the zone file), `side`, `margin`.
- **Masks:** every match of a `masks` target is masked, unless `nth` or `last` names one.
- **Duplicates:** an id that appears in two files is an error.
- **Validation:** entries are checked against `schemas/capture-plan.schema.json` after the legacy normalisation (§6.7). The schema accepts what the engine executes (`engine/capture/*.mjs`), no more: a negative `margin` / `marginY` tightens a zone or a frame; a negative `nth` counts from the last match; a `viewport` side is any whole number of pixels ≥ 1 (a 150 px strip); `wheel.steps` may be 0; `delay`, `settle` and a numeric `wait` are any number ≥ 0; `wheel.direction` stays `-1` or `1`.
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

- **Source of truth.** The example above shows the `screen` entry. The sections, required indexes and word limits of every type are those of `standard/templates.json`.
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

  `init` and `new` keep the lines of the project's mode and remove the markers (`captureVariant(text, mode)` in `engine/build/page-templates.mjs`); text outside the markers is common to both modes. The `screen` and `editor` templates use them for "The screen" (and "What it changes").

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
  - `spaces.json`: the spaces and their exports (§6.1a): `ui.spaces.*`, `ui.search.inSpace`, `ui.counterpart*`, `ui.journey.hidden`, `home.spaces.*`, `template.spaces`, `render.spaces.*`, `cli.build.space*`, `cli.audit.spaces.*`;
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

`engine/project/legacy.mjs` normalises the earlier French-keyed formats **when they are read**:

| Legacy | Current |
|---|---|
| `contenu/sommaire.json` | `content/toc.json` |
| `titre` | `title` |
| `titre_menu` | `menuTitle` |
| `resume` | `summary` |
| `niveau` | `level` |
| `groupes` | `groups` |
| `droits` | `permissions` |
| `parcours` + `etapes` | `journeys` + `steps` |
| `accroche` | `tagline` |
| `sous_titre` | `subtitle` |
| `points` | `highlights` |
| `icone` | `icon` |
| `vedette` | `featured` |
| `glossaire.json` (`terme`, `motif`, `def`) | `glossary.json` (`term`, `pattern`, `def`) |
| `contenu/accueil.md` | `content/home.md` |
| `espaces`, `espace`, `pendant` (toc) | `spaces`, `space`, `counterpart` |
| page fields `fichier`, `gabarit` | `file`, `template` |
| zone files (`fichier`, `titre`, `largeur`, `hauteur`, `l`, `libelle`, `cote`) | `file`, `title`, `width`, `height`, `w`, `label`, `side` (`coin` → `corner`, `droit` → `right`, `bas` → `bottom`, `droit-bas` → `bottom-right`) |
| capture plans (`titre`, `contexte`, `vue`, `stockage`, `delai`, `stabiliser`, `cadre`, `masques`) | `title`, `context` (`bureau` → `desktop`), `view`, `storage`, `delay`, `settle`, `frame`, `masks` |
| plan actions (`clic`, `survol`, `saisir`, `choisir`, `touche`, `defiler`, `attendre`, `molette` { `crans`, `sens` }, `valeur`) | the English actions of §6.3 (`wheel` { `steps`, `direction` }, `value`) |
| plan targets, wherever they sit: zones, union members, frame, masks, actions (`nom`, `texte`, `champ`, `bloc`, `dans`, `parent`, `encadre`, `dernier`, `filtre`, `cote`, `marge`, `margeV`, `libelle`) | `name`, `text`, `field`, `block`, `within`, `up`, `framed`, `last`, `has`, `side`, `margin`, `marginY`, `caption` |

- The legacy folder names (`contenu/`, `schemas/`) are declared through `paths`.
- `doc-kit migrate` rewrites the JSON files in the current format (`sommaire.json` → `toc.json`, `glossaire.json` → `glossary.json`, zone files in place) and renames `accueil.md` to `home.md`. Capture plans are JavaScript modules: they are only normalised when read.
- The Markdown keeps both spellings (§6.6): it is never rewritten.

### 6.8 Business space: features, rules, roles

The business space describes **each feature** for the people who use it, decide about it or support it: no code, no `file:line`. The page types follow the use case of Cockburn (actors, trigger, main scenario, numbered variants), the business rules of RuleSpeak (one statement, one example "Given / When / Then"), and the feature sheet of product documentation (an access box first).

**Page types** (`standard/templates/business.json`; templates `templates/pages/{en,fr}/<type>.md`; examples `docs/{en,fr}/content/examples/<type>.md`). Labels below in English; the French labels are in the fragment. `*` = required.

| Type | Sections | maxWords |
|---|---|---|
| `feature` | Access* · What it is for* · Who uses it* · Trigger and preconditions · Main scenario* · Variants and exceptions · Business rules* · Data handled · Notifications and effects · Limits · Questions people ask | 2500 |
| `business-rules` | How to read this page* · The rules* · Rules by feature · Retired rules | 3000 |
| `roles-matrix` | In short* · The roles* · Who can do what* · Responsibilities · How to get a role | 2000 |
| `process` | In short* · Who takes part* · The steps* · The states · What happens on its own, and what waits for someone* · Deadlines and reminders · When it goes wrong · Features involved | 2200 |
| `release-notes` | In short* · Latest version* · Earlier versions | 3000 |

- **Access** (feature): a two-column table, first rows fixed: Module · Who can use it (`[[perm …]]`) · Prerequisites · Checked on (version and date).
- **Main scenario**: numbered steps (`:::steps`), optionally illustrated with a `:::screen` or a `::capture` when a screenshot makes a step clearer (neither is required: unlike "The screen" of `screen`/`editor`, §6.4, this section has no capture variant). **Variants and exceptions** are numbered after the step they branch from: "3a. If …".
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
- **Business pages cite no code**: a page of a business type (`feature`, `business-rules`, `roles-matrix`, `process`, `release-notes`) whose effective space is `business` (§6.1a) and that contains a `file:line` proof gets the warning `business.technical` (a `screen` or `editor` page keeps the proofs of its "How it works", whatever its space) ("move the technical detail to its counterpart").

**Glossary**: an entry may have `technical` (string): where the term lives in the code ("table `orders`, column `status`, enum `OrderStatus`"). Site data `glossaire[].tech`, emitted only when at least one entry has it. The term's bubble shows it under the definition, introduced by `ui.glossary.technical`, when the project has no spaces, or when the current space is `takeover` or "everything". The exports other than `takeover` drop it.

**Coverage adapters** (§5)
- `openapi`: `file` (required: an OpenAPI 3 or Swagger 2 document in **JSON**, relative to the project), `family` (default "API"), `prefix`, `exclude`. One item per operation: id `GET /orders/{id}`, `label` = `summary` or `operationId`, `match` = the path in its `{id}`, `:id` and `[id]` forms. A YAML file: `{ available: false, reason: "yaml" }` (no YAML parser in the kit; FastAPI serves its document as JSON at `/openapi.json`).
- `features`: `file` (default `features.json`, relative to the project), `family` (default "Features"). The file is a list `[{ id, title, routes?, api?, keys? }]`; one item per feature, `match: [id]`: a feature is covered when a written page cites its id, in practice its sheet (`feature` of `toc.json`).

**`inventory --features [--write] [--force]`**: groups what the configured adapters see into candidate features: screen routes by their first static segment (`/orders`, `/orders/[id]`, `/orders/new` → `orders`), API routes by their first segment after `/api`, i18n keys by their first segment. Each candidate gets a suggested id (`F-01`… in order), a name, its routes, API routes and keys, and, if `features.json` already exists, the entry it already covers (a shared route or API route), if any — the simplest reading of "already cited": `features.json` is the artifact this command maintains, so a candidate is matched against it, not against the business pages' prose. Prints a table (`--json`: the list). `--write` writes `features.json`; an existing file is kept (exit code 1) unless `--force`, which keeps every existing entry as it is and appends only the candidates that match none of them.

**i18n fragment** `i18n/<language>/business.json`: `render.business.*`, `cli.build.feature.*`, `cli.build.rule.*`, `cli.build.business.*`, `cli.inventory.features.*`, `cli.adapter.reason.yaml`, `ui.glossary.technical`.

### 6.9 Takeover space: facts and the takeover dossier

The takeover space is the dossier a team needs to take over an application, especially one written largely by AI assistants ("vibe-coded"), whose usual risks are: missing access control (row-level security), secrets in the code or the client, packages that do not exist, duplicated code, missing or misleading tests, and agent instruction files that act as a hidden specification. Every claim is backed by a proof (`file:line`), or marked as deduced or unknown.

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

- **Who owns what** (access-ownership): one row per asset (domain, repository, hosting, database, payment, e-mail, AI accounts, each secret): Asset · Owner · Where · How to hand it over · Status. The page is complete when "Unknown owners" is empty.
- **The routes** (api-surface): Method · Route · Authentication · Role · Tenant isolation · Proof; built from `::facts{source="api"}` then completed by hand.
- **Each rule** (agent-instructions): Rule · File:line · Status (confirmed, obsolete, contradicted by the code), with the proof.
- **Threats** (threat-model): STRIDE, by trust boundary of the data flow diagram.
- `adr`: one page per reconstructed decision, as sub-pages of an `architecture` or `technical` page; "How it was reconstructed" says from which code, commits or people.
- **`findings` becomes a risk register**: its tables gain Owner · Decision (fix, accept, transfer, avoid) · Status (open, in progress, done, accepted) · Due date, combined into one "Follow-up" column (four separate columns rarely fit the reading width once a proof and a recommendation are already tables; the example combines them). Its sections do not change: existing pages stay conformant.

**`doc-kit facts [--source <name>] [--network] [--tools] [--json]`** reads the application code (`app.dir`, §3; without it: `facts.noApp`, exit code 2) and writes one file per source, `facts/<source>.json` (folder `paths.facts`, default `facts`, §3), in the documentation project, **committed with it**: `{ source, generator, generated, commit, app, items }` — `generated` the ISO date, `commit` the git HEAD of the application (or `null`), `app` the application folder relative to the project, items sorted, paths relative to the application, forward slashes. Same code, same file (except `generated`). `--source` (repeatable) limits the sources. Nothing is ever written in the application. A folder below `app.dir` that holds a `doc.config.mjs` is a documentation project (often `docs/manual`, inside the application): no source reads it, whether the files come from a walk or from `git ls-files` (`withoutDocProjects` in `engine/facts/common.mjs`).

| Source | Read from | Item |
|---|---|---|
| `dependencies` | Every `package.json`, `package-lock.json` (v2, v3), `pnpm-lock.yaml`, `yarn.lock` (v1, berry), `requirements*.txt`, `poetry.lock` and `pyproject.toml` found under the application, searched recursively (at most 4 folders deep: a vibe-coded application almost always splits a front end and an API into their own folders, each with its own manifest) | `{ name, version, ecosystem, direct, dev, manifest, license? }` |
| `env` | `process.env.X`, `process.env["X"]`, a destructuring read (`const { X, Y } = process.env`), `import.meta.env.X`, `os.environ["X"]`, `os.environ.get("X")`, `os.getenv("X")`, a pydantic settings class (`class Settings(BaseSettings):`, `pydantic.BaseSettings` v1 or `pydantic_settings.BaseSettings` v2: one name per field, `env_prefix` + the field name upper-cased, replaced outright by `Field(..., alias=…)`, `validation_alias=…` or the v1 `env=…`); names of `.env.example`, `.env.sample`, `.env.template` (never the values, never `.env`) | `{ name, files: ["path:line"], example }` |
| `api` | Next.js App Router (`route.ts|js`, exported methods), Next.js `pages/api`, FastAPI decorators (with `APIRouter(prefix)` and `include_router(prefix)` when found), Express (`app|router.<method>("/path")`) | `{ method, route, file, line, framework }` (`line`: the handler's decorator, export or call) |
| `db` | `schema.prisma` (models, `@@map`, relations), SQLAlchemy (`__tablename__`, `Column`, `mapped_column`), SQL migrations (`CREATE TABLE`, `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`) | `{ table, columns, file, rls, policies }` |
| `agents` | at any depth (each package of a monorepo may have its own): `AGENTS.md`, `AGENT.md`, `CLAUDE.md`, `GEMINI.md`, `.claude/**/*.md`, `.agents/**/*.md`, `.cursorrules`, `.cursor/rules/**`, `.github/copilot-instructions.md`, `.github/instructions/**/*.md`, `.windsurfrules`, `.windsurf/rules/**`, `.clinerules`, `.junie/guidelines.md`, `.kiro/steering/**/*.md`, `.aider.conf.yml`, prompt files (`**/*.prompt.md`) | `{ file, lines, words, hidden: [{ line, codepoint }] }` |
| `secrets` | the patterns of `engine/check/secrets.mjs` over the application files (`git ls-files` when available; else every file but `node_modules`, `.git`, `dist`, `build`, `.next`, `.venv`, `venv`) | `{ file, rule }` — **never the value** |
| `tests` | test files (`*.test.*`, `*.spec.*`, `test_*.py`, `*_test.py`, `tests/`), number of tests (`it(`, `test(`, `def test_`), coverage reports (`coverage/lcov.info`, `coverage/coverage-summary.json`, `coverage.xml`) | `{ file, tests }`, and `summary: { files, tests, coverage? }` |

- **Hidden characters** (`agents`): U+200B–U+200F, U+202A–U+202E, U+2060–U+2064, U+2066–U+2069, U+FEFF (except at the very start), U+E0000–U+E007F.
- **`--network`** (`dependencies`): checks that each direct dependency exists in its public registry (npm, PyPI), `exists: true | false | null` (`null`: no answer); only the package name is sent; 5 s per request, 8 at a time. Without `--network`, `exists` is absent.
- **`--tools`**: runs, when found on the `PATH`, `gitleaks` (secrets; the matched values are removed from the report), `osv-scanner` (known vulnerabilities; it sends the package names and versions to osv.dev), `syft` (SBOM), `knip` (unused files and exports). Each writes `facts/tool-<name>.json`; a missing tool is listed as "not installed", never an error.

**`::facts{source="env" columns="name,files,example"}`** (`::faits{source="env" colonnes="…"}`): a table from `facts/<source>.json`, at build time. Columns: item keys (header from `render.facts.column.<key>` when known, else the key); lists joined with commas; booleans "✔" or "—". A caption gives the date and the commit. Missing file: `facts.missing`; unknown column: `facts.column` (errors in a strict build).

**Coverage adapter `facts`**: `source` (required), `family` (default by source: "Environment variables", "API routes", "Tables", "Dependencies", "Agent instruction files"), `exclude`. One item per fact: `env` its name; `api` `METHOD route`, matched in its `{id}`, `:id` and `[id]` forms; `db` the table; `dependencies` the direct dependencies only, de-duplicated by name (the same package can be direct in more than one manifest); `agents` the file. Missing facts file: `{ available: false, reason: "noFacts" }`.

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

- Hashes (`hashText` in `engine/sync/hash.mjs`): SHA-256 of the text with a leading BOM removed and line endings normalised to LF, first 16 hexadecimal characters. A binary file (a NUL byte in its first 8 KB) is hashed as is. Paths: relative to the application (`app.dir`; without it: `sync.noApp`, exit code 2), forward slashes, sorted.
- `pages`: only pages that were marked (`--mark`). `source` is the hash of the page's Markdown; `files` the hashes of its dependencies at that time (direct and shared alike: the classification is recomputed at report time, §"Dependencies of a page"); `declared` the sources given by `--sources`.
- `proofs`: every `file:line` (or `file:line-line`) proof of a marked page: `hash` of the cited lines, `text` = the first 120 characters of the trimmed first cited line. A proof whose file does not exist in the application when the page is marked is not recorded and is reported once (`sync.proofUnresolved`, a warning: URLs with a port look like proofs).
- `labels`: for the message files of `sync.labels` (config, globs relative to the project; default: the `messages` of the `i18n-registry` adapters; nested JSON is flattened to dotted keys), only the entries whose value (2 characters or more) is cited verbatim (case-sensitive) in the Markdown of a written page.
- `inventory`: the item ids of every coverage adapter (by `<adapter>/<family>`; two configuration entries with the same adapter and family are merged) and of every facts source (`facts/<source>`: env names, `METHOD route`, tables, direct dependencies, agent files).
- `captures`: the hash of each capture plan entry (normalised, after legacy normalisation, serialised with sorted keys, `RegExp` and functions as their source text, `file` left out), for the captures used by marked pages.

**Dependencies of a page** (`engine/sync/dependencies.mjs`; deduced, never typed). `pageDependencies({ root, config, toc, pageId, inventory, tools, factsDir, plans?, declared? })` is async (it loads the coverage adapters' own options itself, cached per process, since `runCoverage`'s result does not carry them) and also accepts `plans` (the capture plan entries already loaded once by the caller, `loadPlans().captures`) and `declared` (the page's `sync.json` `declared` list, read by the caller): neither is produced by `pageDependencies` itself, so callers (`markPages`, `compareWithReference`, `buildContext`) load them once and pass them in.
- its proofs (`PROOF_REF` of `engine/sync/proofs.mjs`, the same file family as `PROOF`), resolved in `app.dir`: the path as written when it exists, else the one application file whose path ends with it (writers cite `tokens.py:81` once the full path was given; two candidates are never guessed between); a code span that starts with `[[` (a badge shown to explain its syntax) is not a proof, and the file is the last word before `:line`. A verified claim badge that names its source (`[[verified lib/orders.ts:42]]`, `[[verifie …]]`, §6.9) outside a code span is a proof too: followed by `sync` (moved, broken, rewritten by `--apply`) and counted by `audit` (`PROOF`); a badge without a `file:line` stays a claim;
- **the server code behind the screen**: the API paths written as string literals in the page's own files (`api.get("/admin/groups")`, `` fetch(`/api/orders/${id}`) ``; two segments at least, query dropped) are matched against the routes of `facts/api.json`, the written segments being the route's last ones (a client prefix such as `/api` is allowed) and a parameter matching any segment (`engine/sync/api-links.mjs`); the file of each matched handler is **direct**, with the handler's line as a cited line. A change of that server code flags the page, and `doc-kit context` gives it to the writer;
- its `routes`: each route is matched with the inventory items whose `match` texts contain it (§5). A coverage adapter may give an item `files` (paths relative to the project); when it does not, `engine/sync/routes.mjs` derives them for the built-in adapters (`next-app-router`: the `page.*` file and the `layout.*` files above it; `react-router`: the routes file(s); `fastapi`: the file of the decorator, from `fastapiRoutes` of `engine/facts/api.mjs`; `glob`: the file itself; `openapi`, `features`, `facts`, `i18n-registry`: none). From these files, the closure of their **local imports** (`engine/sync/imports.mjs`: relative paths, `paths` aliases of `tsconfig.json` / `jsconfig.json`, `index.*` files, `.ts .tsx .js .jsx .mjs .cjs` extensions, Python `from . import` / `from .x import` and absolute imports inside the application; style sheets, images and packages are ignored), at most 3 levels and 200 files; a file inside the folder of the route's file (or below it) is **direct**, any other is **shared**;
- its captures (`:::screen` / `::capture` ids): the route of each plan entry (as above) and the entry's hash;
- its `::facts` tables: the facts file of each source;
- its `counterpart`: the dependencies of the target page are added (a business sheet cites no code, its technical page does);
- `sources` (new optional page field of `toc.json`: globs relative to `app.dir`), for a page with none of the above;
- the `declared` sources recorded by `--mark --sources`.

**`doc-kit sync [--since <ref>] [--apply [--labels]] [--mark <page…> | --mark --all] [--sources <file[:lines]…>] [--date YYYY-MM-DD] [--check] [--estimate]`** (global `--json`; `--sources` is repeatable, like `facts --source`)
- **Report** (default, writes nothing but `.doc-kit/sync.md`, `.doc-kit/sync-report.json` and `.doc-kit/sync/<page>.diff`): compares the application now with the reference. Categories, in this order:

  | Key | Detection | What to do |
  |---|---|---|
  | `proofs.moved` | the cited line's text is found exactly once elsewhere in the same file, or in the file it was renamed to (`git diff --find-renames`) | fixed by `--apply` |
  | `proofs.broken` | file deleted, or text found nowhere | page to review, old text shown |
  | `labels` | a label's value changed (or its key disappeared) and the old value is cited in a page | replacement shown; applied by `--apply --labels` |
  | `review` | a dependency's hash changed, or the file disappeared | page to review: reasons (file, direct or shared); `priority`: `direct`, `shared`, or `probablyIntact` (only shared files changed, and no added or removed line of their diff contains a label, code span, route or identifier cited in the page; needs git). A modified file the page reaches through its proofs, whose cited lines are intact (against `sync.json`: every proof of that file recorded and none moved or broken; with `--since`: no hunk of `git diff` touches a cited line, `touchedLines`), does not make the page direct: reached ONLY through proofs, the reason is kept with `proofsIntact: true` and ignored by the priority; also reached through imports or layouts, it is judged as the shared file it otherwise is |
  | `captures` | the route's files changed, the plan entry's hash changed, or the capture's `version` is not the current one | retake: `capture --stale --compare` |
  | `new` | an inventory id absent from the reference | document it: `suggest` = the written page that cites the closest id of the same family (longest common prefix of the id, at least one segment of it), else `null` |
  | `removed` | an inventory id of the reference that no longer exists and is still cited in a written page | correct the pages listed |
  | `unchanged` | marked pages none of whose dependencies, proofs or labels changed | restamped by `--apply` |
  | `unmarked` | written pages absent from `pages` | `--mark` them once checked |

  A marked page appears in one category at most among `review` and `unchanged`; a page may appear in `proofs.*`, `labels`, `captures` and `removed` as well. The diff of a page (`.doc-kit/sync/<page>.diff`) is `git diff <reference commit> -- <its changed files>` in the application (read-only git; no git or no reference commit: no diff file). The summary prints one line per category with its count, then the pages to review grouped by priority, then, when a facts file is older than the application's HEAD, a reminder to run `facts`. Without a reference (`sync.json` missing) and without `--since`: a message saying how to create it (`--mark --all`), exit code 0 (1 with `--check`).
- **`--apply`** (mechanical changes only, never prose): rewrites moved proofs in the Markdown (the code span `path:42` → `path:57`; a range keeps its length; a proof cited several times is rewritten everywhere it is cited); with `--labels`, replaces the old label by the new one in the pages listed, **only** inside `**…**`, code spans, `[[menu …]]` and other badges, and between quotes (`"…"`, `«…»`, `“…”`); restamps the `unchanged` pages and the pages whose only changes were applied (version, date, hashes). It prints every file it changed, then the new report. The facts files are refreshed by `doc-kit facts` (§6.9), never here.
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

The kit calls no LLM. The skill drives Claude Code agents; the kit makes them read less, run on the right model, share their prompt cache, and it estimates and measures what they consume.

**`doc-kit context <page…> [--budget <tokens>] [--update]`** writes `.doc-kit/context/<page id, "/" → "__">.md` (one file per page; `buildContext` in `engine/context/context.mjs` is pure and returns the text, the CLI writes it), the only reading an agent needs to write or update that page. A page unknown to the table of contents: `context.unknownPage`, exit code 2 (a declared page not written yet is accepted: the context serves to write it). Contents, in this order, in the site's language:
1. the page: id, title, template, space, summary, routes, permissions, the path of its Markdown file; the id, title and summary of its `counterpart`; the header also gives the product (`product.name`) and the documented version (`readProjectVersion`, `engine/build/build.mjs`), when the caller passes them — the CLI always does;
2. the required sections of its template (`standard/templates.json`, §6.4), in the site's language;
3. **files to read**: its dependencies (§6.10), direct first, each with the line ranges to read and the excerpts themselves: a **direct** file (the page's own files, the server code it calls, the cited files) of 400 lines or fewer is given whole, since it is what the page is about; otherwise, and for a **shared** file (layouts, API clients, helpers) whatever its size, ±40 lines around each cited line (its proofs, its declared sources, its handlers) merged when they overlap; a direct file without any cited line gives its first 200 lines; a shared file without any cited line is listed by path only (read only if the writer needs it). Lines are prefixed with their number (`42│ …`), so that the agent writes exact proofs;
4. **exact labels**: the message entries (`sync.labels` files, §6.10) whose keys appear as string literals (`"a.b"`, `'a.b'`, `` `a.b` ``) in these files; a `useTranslations("ns")` / `getTranslations("ns")` call in the same file prefixes the keys passed to `t(…)` with `ns.`: key → value;
5. **facts**: the rows of `facts/*.json` whose `file`, `files` or `route` names one of these files or one of the page's routes;
6. the glossary terms whose `pattern` (or `term`) matches the page or the excerpts;
7. with `--update`: the entries of the page in `.doc-kit/sync-report.json` (every category, with their reasons), the content of its diff file, and the paths of the before/after sheets of its captures (`.doc-kit/compare/<id>.png`, never inlined). Without a report: `context.noSyncReport`, exit code 2.

Tokens are estimated as characters ÷ 4 (`estimateTokens` in `engine/context/budget.mjs`). Over `--budget` (default 16,000; the page part and the sections are never cut): the excerpts of shared files go first, then the excerpts farthest from a cited line (the screen's own files, reached by the page's routes, go last: they are given whole up to 800 lines), then the facts rows, then the labels; each cut is replaced by one line naming what was cut, and the list is repeated at the end. The CLI prints one line per context file with its estimate and the number of cuts; `--json` gives `[{ page, file, tokens, cut: [{ kind, path?, lines? }] }]`.

**`new --prefill`**: for the types `variables` (facts `env`), `api-surface` (`api`), `data-model` (`db`), `dependencies` (`dependencies`), `agent-instructions` (`agents`), the page's main table is filled from the facts. The template marks that table with a line `<!-- doc-kit:prefill source="env" -->` right before it (`new` always removes this line, with or without `--prefill`, like the capture variant markers of §6.4): the key cells of each row are filled, one row per item (`env`: Variable, Read by the code = its `files` as `` `path:line` `` proofs; `api`: Method, Route, Proof = `[[verified file]]`; `db`: Table, Columns; `dependencies`: Package, Version; `agents`: File, lines and words), the other cells keep the template's example text turned into an inline guidance comment (`<!-- guidance: … -->`), so that the page stays a draft until someone fills them (§6.4). Without the facts file: `new.noFacts`, exit code 1; `--prefill` on a type without the marker: `new.noPrefill`, exit code 2.

**Agent types** (`skill/doc-kit/agents/*.md`, Claude Code agent definitions: front matter `name`, `description`, `model`, `tools`): `doc-kit-triage` (`haiku`; Read, Grep, Glob), `doc-kit-writer` (`sonnet`; Read, Grep, Glob, Edit, Write, Bash), `doc-kit-reviewer` (`opus`; Read, Grep, Glob, Edit, Write, Bash: the inventory, the verification of findings, the production dossier). `skill install` also copies them to the agents folder next to the skills folder (`<skills folder>/../agents/`), only these files; the fingerprint covers them; `doctor` reports them like the skill.

**Briefs**
- Each brief template starts with a front matter line `agent: <type>`; `brief.mjs` prints "Launch it with the agent type <type>".
- The text of a brief is split in two: **common part first** (rules, safety, syntax, standard: identical for every agent of the same template, whatever the variables), **variable part last** (batch, pages, paths of the context files). Two briefs of the same template differ only after the common part (tested byte for byte), so the agents of one wave share their prompt cache.
- The writing briefs point to the context files (`doc-kit context`) instead of the whole inventory and table of contents; the references are cited by path and section, not copied.
- New brief `triage` (en, fr): reads the context files `--update` of a list of pages and writes `.doc-kit/triage.json`: one decision per page, `intact` (the orchestrator runs `sync --mark`), `edit` or `rewrite` (a writer takes it), with one sentence of reason.
- New brief `update` (en, fr; agent `doc-kit-writer`): updates the listed pages from their context files `--update`, changes only what the change requires, then runs `doc-kit sync --mark <page> --sources …`.
- **Sober method** (`writing-batch`, `update`, lot V7): a writer reads only the context file and the page's own template, then AT MOST 3 further targeted reads per page (`writing-batch`) or 1 (`update`), on line ranges — the writing guide and the reference page are a fallback inside that same budget, never a mandatory first read; the page is written once (`Write`, never rewritten in place); one `build --draft` per batch, not per page; `view` only in capture mode, at most one picture per page. An agent that would exceed its step budget stops and reports instead of exploring. Measured on a real application (FastAPI + Next.js, 81 pages, nine admin pages, one agent per page): this cut average cost 69 % and wall-clock time 49 % versus the previous brief (context file, but no step budget), same conformance — detail and the full comparison table: `skill/doc-kit/references/agent-orchestration.md` §8.

**Estimate** (`brief.mjs --estimate`, `sync --estimate`): per agent, input tokens (the brief, the context files and the files they list, ÷ 4) and output tokens (1.4 per word of the template's `maxWords` for a new page, 0.3 for an update), the agent type, and the cost when `llm.prices` is set. **Configuration** `llm: { currency: "EUR", prices: { haiku: { input, output, cacheRead }, sonnet: {…}, opus: {…} } }`, prices per million tokens, no default value (prices change and differ by contract).

**Measure** (`skill/doc-kit/scripts/usage.mjs`)
- `log --brief <name> --agent <type> --model <model> --tokens <n> [--tools <n>] [--duration <ms>] [--pages a,b] [--phase <name>]`: appends one JSON line to `.doc-kit/usage.jsonl` (the orchestrator logs what Claude Code reports when an agent ends);
- `report [--json]`: totals by phase, brief, agent type, model and page; tokens per written page; cost with `llm.prices`; the gap with the last estimate;
- `scan --transcripts <folder>` (optional, tolerant): reads Claude Code's local transcripts to split input, output and cache tokens.
- `audit` and the `sync` report show the total and the last update's cost when `usage.jsonl` exists.

**i18n fragment** `i18n/<language>/context.json`: `cli.context.*` (including the help `cli.help.context`), `cli.new.prefill*`, `cli.new.noFacts*`, `cli.new.noPrefill*`, the headings of the context file (`context.section.*`), the estimate lines (`cli.estimate.*`, shared by `sync --estimate` and `brief.mjs --estimate`), and (see §6.10) `cli.capture.compare.*`, `cli.capture.noSyncReport*`.

### 6.12 Languages (one source, one site, several languages) (lot V8)

A documentation written in a **source language** and translated into others, served by **one HTML file with a language selector**: the data of every language is embedded (the file grows with each language; the images are embedded once), the reader switches without leaving the page. The kit calls no LLM: the translations are written by people or by the skill's agents (brief `translate`), from a dossier the kit builds (`context --translate`). A project without `languages` is strictly unchanged (§9).

**Declaring the languages**: `languages: ["fr", "en"]` in `doc.config.mjs` (§3). The first is the source; `content/` holds it, as today. The site language `language` is the source language. The ids of the table of contents are shared by every language: a section id, or the first segment of a page id, equal to a declared language is an error, `languages.idClash` `{ id, lang }`, blocking even a draft build (the URL grammar below reserves these segments).

**The translations** (`<paths.translations>/<lang>/`, the same tree as `content/`, every file optional)
- `toc.json`: the **texts** of the table of contents, same ids, same structure. `translatedToc(source, translated)` (`engine/build/languages.mjs`) returns a table of contents whose structure and non-text fields come from the **source** (`id`, `level`, `template`, `file`, `routes`, `permissions`, `space`, `counterpart`, `feature`, `sources`, `icon`, `featured`, `spaces[].id`, `spaces[].icon`, `journeys[].steps`, `journeys[].space`, `suggestions`) and whose text fields come from the **translation** (`title`, `tagline`, sections' `title`, `shortTitle`, `subtitle`, `highlights`, groups' `title`, pages' `title`, `menuTitle`, `summary`, journeys' `title`, `description`, spaces' `title`, `shortTitle`, `subtitle`, `for`). A structural difference (a section, group, page, journey or space missing, added or out of order; a different number of steps or suggestions) is `translation.toc.structure` `{ lang, path }`, blocking even a draft build, like an invalid outline. A non-text field whose translated value differs from the source is ignored, warning `translation.toc.ignored` `{ lang, path }`. A text field absent from the translation keeps the source text (no warning: the translated `toc.json` may be partial).
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
- **Checks per language**: `checkLinks` runs on each language's pages (a translated page's anchors must exist in the translated target page); `checkPage` runs with `language: <lang>` (the required sections of the template, in that language); the problems carry `lang` in their `vars`, so that the messages name the language. The `counterpart` anchor of a page (shared, written in the source slug) is mapped to the translated target by position (below, "Anchors"); unmappable, it is dropped with the warning `translation.anchor` `{ lang, page }`.
- **Images, once each**: `<script type="text/plain" id="img-<id>">` holds the source file, as today; `id="img-<id>@<lang>"` holds `<images>/<lang>/<id>.webp` when it exists (`@` cannot appear in a capture id, §6.3). Every image is embedded once, whatever the number of languages and pages that use it.
- **Assembly**: the template gains the marker `{{LANGUAGE_DATA}}`, right after `<script id="donnees">`: one `<script type="application/json" id="donnees-<lang>">` per other language, same JSON serialisation (`<` escaped), empty in a site without `languages`. `assemble()` accepts `languages: [{ id, data, captures }]` and computes `meta.screenshots` of each language with its own captures. `{{LANG}}` stays the source language.
- **Exports per space** (§6.1a): `exportSite` runs on the source data and on each language's data (same space, that language's `used` and `t`); each export embeds every language and is itself multilingual, its images being the union of what each language keeps. The `--space` and `spaces.output` rules are unchanged.
- **`build --lang <l>`** (mono-language file): `html` holds the data of `<l>` alone in `#donnees`, without `meta.languages` and `meta.language`, `{{LANGUAGE_DATA}}` empty, `{{LANG}}` = `<l>`, the template texts in `<l>`, and `img-<id>` holds `<images>/<l>/<id>.webp` when it exists, else the source image (no `@` variant); `sites` are mono-language too. Default output: the configured output with `-<l>` before its extension (`languageOutput(output, lang)`; `--output` overrides it; the exports per space follow it: `-<l>-<space>`). **Invariant** (tested): the content of `#donnees-<l>` of the multilingual file equals the `#donnees` of `build --lang <l>`, plus `meta.languages` and `meta.language`.
- `build()` returns `languages: [{ id, source, current, stale, unmarked, missing }]` (counts of translated files by state; `[]` without `languages`), printed as one summary line per language after the files, and carried by `--json`.

**Site behaviour** (`engine/site/app.js`, `template.html`, `style.css`; only when `D.meta.languages` exists)
- **URL grammar**: `#/[<lang>/]<path>[~<anchor>]`, where `<path>` is what it is today (empty, `@<space>`, a page id, a section id). The first segment is a language when it is one of `meta.languages` (hence `languages.idClash`). Examples: `#/en/`, `#/en/@business`, `#/en/use/start~how-it-works`. Without the prefix, the URL means the **current** language: the links written in the Markdown (`#/page~anchor`) and the links the site generates stay as they are. After routing a URL without a prefix, the site rewrites it with `history.replaceState` (no `hashchange`, no history entry) so that the address bar always carries the language. In a site without `languages`, nothing changes.
- **Current language**: the URL prefix; else the value remembered in `localStorage` under `__THEME_KEY__.lang` (read and written inside `try`/`catch`); else the first of `navigator.languages` whose base matches a declared language; else the source. Showing a URL with a prefix makes that language current and remembers it.
- **Switching** (`switchLanguage(lang)`): the data of that language is parsed from `#donnees-<lang>` on first use and cached; `D`, the texts, the plural rules, `document.documentElement.lang`, the sections index, the sub-page relations, the full lists of the spaces, the search index, the glossary terms and the image cache are rebuilt from it; the current page is reset; the template texts are re-applied: every translatable element of `template.html` carries `data-t="<template.* key>"` (its text content) or one `data-t-<attribute>="<template.* key>"` per translated attribute (`data-t-aria-label`, `data-t-title`, `data-t-placeholder`), and `applyTemplateTexts()` fills them from the embedded `template.*` keys. The current space (ids) is kept.
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
- `view --lang <l>` and `open --lang <l>`: the site opened on `#/<l>/…`.
- `export`: the translations are project files, copied like the rest (nothing specific).
- `audit`: with `languages`, the result gains `languages: [{ id, current, stale, unmarked, missing, ratio }]` (`ratio` = current ÷ total files); `audit.md` shows a table "Translations" (`cli.audit.languages.*`); informative, the level is unchanged.
- `sync` report: a category `translations: [{ lang, file, state }]` (`stale` and `missing` files of every language, computed from `.sources.json` and the current content, no git), one summary line `cli.sync.summary.translations` with a reminder of `translate status`; it never affects `--check` (`translate status --check` does).

**Skill**: brief `translate` (`assets/briefs/{en,fr}/translate.md`, `agent: doc-kit-writer`, sober method of §6.11: the dossier of `context --translate` and at most one further read per page; the page written once; the headings are the template's labels in the target language; ids, directives, badges, code spans, proofs and capture ids are never translated; then `translate --fix-anchors <pages> --lang <l>`, `translate --mark <pages> --lang <l>`, one `build --draft` per batch). Variables `{{lang}}`, `{{pages}}`, `{{contextFiles}}`; `brief.mjs --list` shows it.

**Equivalence** (§9): a project without `languages` keeps levels 1, 2 and 3: `meta.languages`, `meta.language`, `fallback`, `homeFallback`, `donnees-<lang>` and `img-<id>@<lang>` exist only when declared, the texts of `languages.json` and `template.*` are not embedded, `{{LANGUAGE_DATA}}` is empty and `app.js` behaves as before when `D.meta.languages` is absent. The `data-t` attributes of the template change the markup, not the data nor the visible text.

**i18n fragment** `i18n/<language>/languages.json` (§6.5).

### 6.13 Reviews on demand: security and maintainability (lot V9)

Two optional reviews of the documented application, asked at scoping: deterministic facts first (no LLM), then one agent writes the review page from them. Nothing is ever written in the application, and nothing is ever sent to the production instance.

**Authentication of each route**: the items of the `api` source (§6.9) gain `auth` and `guards`: `{ method, route, file, line, framework, auth, guards }`.
- FastAPI: the `Depends(…)` of the handler's signature, and the `dependencies=[Depends(…)]` of its `APIRouter(…)` or of the `include_router(…)` that mounts it; Express: the middleware names between the path and the handler (`router.get("/x", requireAuth, handler)`); Next.js route handlers: the session calls inside the handler (`auth()`, `getServerSession`, `getSession`, `currentUser`) and role checks (`role`, `isAdmin`).
- `guards`: the names found. `auth`: `"none"` (no guard), `"user"` (a guard matching `review.guards.user`, default `/current_user|authenticated|login_required|require_auth|session|token/i`), `"role"` (matching `review.guards.role`, default `/admin|role|permission|scope|owner|super|staff/i`; checked first), `"unknown"` (a guard matching neither).
- The table `::facts{source="api" columns="method,route,auth,guards,file"}` is the **static access matrix**.

**Source `security`** (`facts --source security`): `{ rule, file, line, severity, owasp }`, never a value. Rules (OWASP Top 10 2021 category in `owasp`): `xss.dangerouslySetInnerHTML`, `xss.innerHTML` (A03); `code.eval` (`eval`, `new Function`, Python `exec`/`eval`; A03); `sql.concat` (an SQL keyword in an f-string, a template literal or a `+` concatenation passed to `execute`, `query`, `raw`, `text`; A03); `tls.disabled` (`verify=False`, `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED`; A02); `cors.wildcardCredentials` (a wildcard origin together with credentials; A05); `debug.enabled` (`DEBUG = True`, `debug=True`; A05); `jwt.noVerify` (`verify_signature` false, `algorithms` with `none`; A07); `secret.default` (a literal default for a secret, a password or an admin account in code; A07); `redirect.open` (a redirect to a request parameter; A01); `auth.noRateLimit` (a sign-in route without a rate-limit decorator or middleware: heuristic, severity `info`; A07). Severities: `high`, `medium`, `low`, `info`. `--tools` adds `semgrep` only with a local rules folder (`review.semgrep`; `--config <folder> --json --metrics=off`, never `--config auto`, which downloads rules), next to gitleaks and osv-scanner (§6.9).

**Source `quality`** (`facts --source quality`): maintainability measures of the source files (tests, generated, vendored files and documentation projects excluded): `{ summary, items: [{ file, lines, functions, longest, complexity, duplicated, todo }] }`.
- Functions (JavaScript, TypeScript: `function`, arrow functions assigned to a name, methods; Python: `def`), their length and an approximate complexity: 1 + branches (`if`, `elif`, `else if`, `for`, `while`, `case`, `catch`, `except`, `&&`, `||`, `and`, `or`, `?:`).
- Duplication: windows of 6 normalised lines (white space collapsed, comments and lines under 4 characters dropped), hashed; a window found twice or more marks its lines duplicated; ratio over code lines.
- `todo`: TODO, FIXME, HACK, XXX. `summary` adds the test ratio (the `tests` source), the tooling found (linter: eslint, ruff, flake8, pylint; types: tsconfig `strict`, mypy, pyright; formatter; CI files) and, with `--network`, the direct dependencies behind their latest version (majors behind).
- **Ratings A to E**, each with its measure: duplication (A ≤ 3 %, B ≤ 5 %, C ≤ 10 %, D ≤ 20 %, E above), complexity (share of functions above 15: A ≤ 1 %, B ≤ 3 %, C ≤ 6 %, D ≤ 10 %, E above), size (share of files above 500 lines: same scale), tests (test files ÷ source files: A ≥ 50 %, B ≥ 30 %, C ≥ 15 %, D ≥ 5 %, E below).

**`doc-kit probe [--as <role>…] [--json]`**: checks a running instance, **local or demo only, GET and HEAD only**.
- Refused (`probe.notLocal`, exit code 2) when `capture.target` is `production`, or when the application URL is not a loopback address (`localhost`, `*.localhost`, `127.x`, `[::1]`) and `capture.target` is not `demo`. No option overrides it. Unreachable instance: exit code 3.
- Identities: anonymous, plus each `--as <role>`, whose session `.doc-kit/session-<role>.json` is written by `connect --as <role>` (§5; the session file of `connect` without `--as` is unchanged).
- On `/` and on one API route: security headers (Content-Security-Policy, Strict-Transport-Security on https, X-Content-Type-Options, X-Frame-Options or CSP `frame-ancestors`, Referrer-Policy, Permissions-Policy); the cookies the application sets (Secure, HttpOnly, SameSite); CORS (an `Origin: https://probe.invalid` reflected with credentials); version disclosure (`Server`, `X-Powered-By`).
- Access control: every `GET` route of `facts/api.json`, its path parameters from `review.params` (`{ "group_id": "…" }`; a route with a parameter not given is skipped and listed); one request per route and identity, at most 4 per second, 5 s timeout. `expected` comes from `auth`: a `user` or `role` route must answer anonymous with 401, 403 or a redirection to the sign-in page; a 2xx is the finding `probe.unprotected`. A `none` route answering anonymous with a list of objects holding an `email` is the finding `probe.publicData` (heuristic).
- Output `facts/probe.json`: `{ url, date, identities, headers, cookies, cors, disclosure, routes: [{ method, route, auth, expected, status: { anonymous, <role>… }, finding? }], skipped }`. Response bodies are never stored. Informative: exit code 0 whatever the findings.

**Page types** (`standard/templates/takeover.json`, templates en/fr, `*` = required):
- `security-review`: In short* · Scope and method* · Authentication and sessions* · Access control* · Input handling* · Secrets and configuration* · Dependencies · HTTP security headers · Logging and monitoring · Findings*. Each point is verified, deduced or unknown (§6.9 badges), tied to an OWASP Top 10 category or an ASVS requirement; the access control section shows the static matrix and the probe results.
- `maintainability-review`: In short* · Ratings* · Hotspots* · Duplication · Complexity · Tests* · Dependencies · Recommendations* (by effort).

**Briefs** (lean method, §6.11): `security-review` (agent `doc-kit-reviewer`) and `maintainability-review` (agent `doc-kit-writer`); their findings are candidates for the risk register (`findings-verification`).

**Configuration**: `review: { guards: { role: [], user: [] }, params: {}, semgrep: null }` (regular expressions as strings; `params`: path parameter → example value; `semgrep`: local rules folder, relative to the project). **i18n fragment** `i18n/<language>/reviews.json`: `cli.probe.*` (with `cli.help.probe`), `cli.connect.as*`, the new `render.facts.column.*` and `cli.facts.*` keys.

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
  `tokens: { in, out, cacheRead, cacheWrite }`) and people (`actor: "human"`) use the same format.
- **Not recorded:** `dev`, `open`, `view`, `doctor`, `init`, `skill`, `stats`, `export`, `upgrade` and `migrate`.
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
- `SKILL.md`: front matter `name: doc-kit` and `description`, about 250 lines, in English. It tells Claude to answer in the user's language.
- `references/*.md`, in English: `method.md` (the phases in detail, both spaces, the update cycle), `pitfalls.md` (including vibe-coded application risks), `capture-safety.md`, `templates.md` (the 31 page types), `standard.md`, `agent-orchestration.md` (batches, waves, placeholders, the economy of the agents).
- `agents/*.md`: the three agent type definitions (`doc-kit-triage`, `doc-kit-writer`, `doc-kit-reviewer`, §6.11), copied next to the skills folder by `skill install`, never inside the `doc-kit/` skill folder itself.
- `assets/briefs/{en,fr}/*.md`: brief templates with parameters such as `{{product}}`, `{{docDir}}`, `{{code}}`…, filled by `scripts/brief.mjs` from `doc.config.mjs` and `--var` values.
- `scripts/*.mjs`: `brief.mjs`, `consolidation.mjs`, `usage.mjs` and their shared `common.mjs` (Node ≥ 20, no dependency).
  - `{{appDir}}`, the application code given to the agents: `--var appDir`, else `extra.briefs.appDir`, else `app.dir` (§3), else the nearest of the documentation folder's parent and grandparent that holds `.git`, else its grandparent (`docs/manual` → the application). `brief.mjs` warns when `appDir` was not configured, and when the coverage source sits in a sub-folder with its own `package.json` (a separate front end: the inventory of routes does not see the back end).
  - `{{featuresFile}}` (the `features` coverage adapter's `file` option, else `features.json`) and `{{factsDir}}` (`paths.facts`, else `facts`), both relative to the documentation project: the inputs of the business and takeover spaces' briefs.
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

**Spaces.** A project that declares no space (§6.1a) keeps levels 1, 2 and 3: `spaces`, `space`, `counterpart`, `hidden` and `meta.space` appear in the site data only when declared, the texts of the spaces are not embedded, and `app.js` shows the same pages when `D.spaces` is absent. Its HTML is not byte-identical to an older build: the site assets embedded in it (`app.js`, `style.css`, `template.html`) are those of the current kit, as after any change to them; the `bytes` check is only meaningful with the same assets (`siteDir`). A counterpart alone brings the texts of the spaces too, but no space data. A project that adds spaces changes its site data on purpose: its reference must be rebuilt.

**Frozen site data.** The data embedded in the generated site (`<script id="donnees">`), the CSS classes and the `data-*` attributes of the generated markup keep their historical names (`titre`, `pages`, `ordre`, `encadre`, `data-titre`…), so that level 1 stays meaningful against older builds. They are internal to the site, not a configuration surface; renaming them is a deliberate, separate change that needs new references.

Real projects used to validate a migration stay **outside** the kit. Their configurations, reports and outputs are kept in the maintainer's working folders, never in this repository.
