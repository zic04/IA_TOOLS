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
│  │                     page-templates.mjs (required sections of §6.4, shared with audit)
│  ├─ capture/           capture.mjs, targets.mjs, actions.mjs, masking.mjs, webp.mjs, plans.mjs, session.mjs (adapters)
│  ├─ check/             coverage.mjs, links.mjs, tables.mjs, images.mjs, secrets.mjs
│  ├─ audit/             audit.mjs (indicators, maturity level, actions), report.mjs (audit.md, audit.json),
│  │                     optional.mjs (measures that may be "not measured")
│  ├─ dev/               server.mjs (watch, rebuild, live reload via SSE), client.js, environment.mjs (shared by dev,
│  │                     doctor, init and the guided mode), zip.mjs (export --zip)
│  ├─ site/              template.html, app.js, style.css, icons.mjs, default-logo.svg
│  ├─ theme/             default-tokens.json, tokens.mjs, contrast.mjs
│  ├─ i18n.mjs           dictionary loading and merging, t(key, vars), plurals
│  └─ migrations/        runner.mjs, <version>.mjs (used by upgrade)
├─ i18n/                 en.json, fr.json, and fragments <language>/{capture,audit,ux}.json (§6.5)
├─ adapters/coverage/    next-app-router.mjs, react-router.mjs, i18n-registry.mjs, glob.mjs
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
- It detects the framework (`next` with `app/` or `src/app/` → `next-app-router`; `react-router`), a Python back end, the dev script's port, the product name, the version file and the `.env` files, then asks for the product name, the language, the application URL, the capture mode and the sign-in method, shows the recap and confirms.
- `--name`, `--lang`, `--url`, `--framework next|react-router|none`, `--auth` and `--capture app|none` answer in advance; `--yes` takes the detected values and the options without any question (required without a terminal). With `--yes`, the site language is `--lang`, else the system language (`LC_ALL`, `LC_MESSAGES`, `LANG`), else English.
- **Product name**: `--name`; else the `title` of the `metadata` exported by the Next.js root layout of the front end (`app/layout.*` or `src/app/layout.*`, a string or `{ default }`); else `productName`, `displayName` or `name` of the front end's `package.json`, without its scope and without a `-frontend`, `-front`, `-web`, `-ui`, `-client` or `-app` suffix; a generic name (`frontend`, `web`, `app`…) gives way to the root `package.json`, then to the folder name. Renaming afterwards: `product.name` in `doc.config.mjs` (the slug and the output follow unless they are set) and the `title`, `tagline` and section titles of `content/toc.json`.
- **Version** (`version.file`, `version.pattern`): `version.txt` or `VERSION` at the application root, else the root `package.json` when it has a `version`, else the front end's `package.json`, else the `pyproject.toml` of a Python-only application.
- **Masking files** (`masking.env`): `.env` and `.env.local` at the application root and in the front-end folder, only the files that exist (never `*.example`).
- **Application folder** (`app.dir`): the application root, relative to the documentation project.
- **Recap.** Before writing anything, with or without `--yes`, `init` prints what it is about to write: folder, product name (and where it was found), slug, language, URL, version (and the file it is read in), sign-in, capture mode, coverage adapter and source, masking files, application folder, and where to rename the product afterwards. Without `--yes`, a confirmation follows.
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
doc-kit init ../my-app          detects the framework, asks for the product name, language, app URL and sign-in method
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
  output: "dist/Acme-Orders-Documentation.html",   // default: dist/<name>-Documentation.html
  paths: { content: "content", images: "images", diagrams: "diagrams" },
  version: { file: "../../package.json", pattern: "\"version\"\\s*:\\s*\"([^\"]+)\"", fallback: "0.0.0" },
  env: { prefix: "ACME" },                          // also reads ACME_URL, ACME_SESSION, ACME_PLANS, ACME_READONLY, ACME_VERSION
                                                    // default prefix: the slug in upper case (ACME_ORDERS)
  app: { url: "http://localhost:3000", dir: "../.." },   // dir: the application root (code), relative to the project
  auth: { adapter: "manual" },                      // manual | none | nextauth | api-me | local:adapters/x.mjs (+ adapter options)
  capture: {
    mode: "app",                                    // "app": the screens are captured · "none": no screenshot at all
    plans: "captures/plans",
    setup: null,                                    // demo data preparation script (doc-kit demo)
    locale: null,                                   // default: derived from language (en-US, fr-FR)
    timezone: "UTC",
    viewports: { desktop: { width: 1600, height: 1000 }, mobile: { width: 390, height: 844 } },
    webpQuality: 0.82,
    geolocation: null,                              // { latitude, longitude } for the mobile context
    storage: {},                                    // localStorage set before each capture; "{version}" is substituted
    cookies: [],                                    // e.g. [{ name: "NEXT_LOCALE", value: "en" }]
    selectors: { block: null, frame: null },        // CSS selectors used by the { block } and { framed } targets
    map: null,                                      // { x, y, z }: URL parameters used to frame a map (plan field `view`)
    forbidden: [],                                  // JS regular expressions on the route path: never opened
    readOnly: "auto",                               // "auto" (on whenever a session is used) | true | false
  },
  masking: { env: [], exclude: "localhost|127\\.0\\.0\\.1", guid: true, patterns: [], allow: [] },   // §3, masking
  coverage: [],                                     // e.g. [{ adapter: "next-app-router", app: "../../app" }]
  theme: { key: null, logo: null, colors: {}, dark: {}, icons: {} },   // key default: <slug>-doc-theme
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

**Help.** `doc-kit --help` (or `doc-kit help`) prints the list of the commands. `doc-kit <command> --help` and `doc-kit help <command>` print the usage of that command and every one of its options, in the message language, then the global options (`cli.help.<command>` and `cli.help.globals`); exit code 0, nothing runs. An unknown command after `help` is a usage error (exit code 2). `help` is not a command module: the dispatcher handles it.

**Message language.** Unless `--lang` is given, every command speaks the project's language (`language` of `doc.config.mjs`, English when it is absent) from its first message: before running the command, the dispatcher locates the project (`--project`, or from the current folder upwards) and reads only that key (`ctx.useProjectLanguage()` in `cli/common.mjs`), so that `doctor`, which checks the configuration piece by piece, and the errors raised before the project is loaded are translated too. A configuration that cannot be imported, or an invalid language, leaves the language as it is (`DOC_KIT_LANG`, else English); the command reports the problem. `init` creates a project elsewhere: the project around it does not choose its language. The guided mode does the same.

| Command | Main options | What it does |
|---|---|---|
| *(none)* | | guided mode (§4.1) |
| `help [command]` | | the list of the commands, or the usage and options of one command |
| `init [app-dir]` | `--dir --name --lang --url --framework next\|react-router\|none --auth --capture app\|none --yes` | creates the documentation project (§2.1); `--lang` (global) is also the site language |
| `doctor` | `--network` | checks the environment and the project, one line per check with its fix; ⚠ "version never incremented?" when the documented version is `0.0.0` or `1.0.0` while a `version.txt`, `VERSION` or `CHANGELOG.md` of the application (`app.dir`, or the folder of `version.file`) gives another one |
| `connect` | `--url --forget` | visible browser: the person signs in, the session is saved (§5); `--forget` deletes it; refused (2) when `capture.mode` is `none`, except `--forget` |
| `demo` | | runs `capture.setup` in its own Node process (variables `DOC_KIT_PROJECT`, `DOC_KIT_URL`, `DOC_KIT_CONFIG`) |
| `capture [patterns…]` | `--plans --preview --no-session` | headless captures (§6.3); `--preview` also writes `.doc-kit/<id>.zones.png`, the zones drawn in red; refused (2) when `capture.mode` is `none` |
| `build` | `--draft --date YYYY-MM-DD --output` | the site; strict by default (exit code 1, nothing written), `--draft` turns the problems into warnings |
| `dev` | `--port` (default: first free port from 4400) | draft build served on `127.0.0.1`, rebuilt and reloaded on every change |
| `new <page-id>` | `--template <type> --title --parent` | page from a template, declared in the table of contents |
| `check [coverage\|links\|tables\|images\|secrets\|all]` | `--width` (tables, default 1440 px) `--threshold` (images, default 200 KB) | the checks; `all` by default, coverage skipped when no adapter is configured |
| `audit` | (global `--json`) | maturity level and actions (standard/maturity.md); writes `.doc-kit/audit.md` and `.doc-kit/audit.json` |
| `inventory` | (global `--json`) | what the coverage adapters see, and what is already cited |
| `view <page[~anchor]>` · `open [page]` | `--theme light\|dark --height --tour N --output` | screenshot of a page of the built site · the site in the default browser |
| `optimize` | `--threshold` (200 KB) `--quality` (0.68) | re-encodes the heavy screenshots, kept when 20 % lighter |
| `migrate` | | rewrites legacy French-keyed files into the current format (§6.7) |
| `export <target>` | `--with-dist --zip` | self-contained copy, engine vendored in `vendor/doc-kit/` |
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
  - A page that still contains template guidance (§6.4) is not written yet: neither its text nor its entry in the table of contents (id, titles, `routes`, its id in `journeys` and `suggestions`) count. A skeleton never covers a route by its examples.
  - `{ available: false, reason, vars }`: the check of that adapter is skipped (not failed); `reason` is translated through `cli.adapter.reason.<reason>` (`notFound`, `blockNotFound`, `error`), else shown as is.
  - The adapters receive `tools`: `resolve`, `exists`, `read`, `json`, `walk`, `glob`, `i18nKey`; paths are relative to the documentation project.
  - Built-in: `next-app-router` (`app`, `family`, `exclude`), `react-router` (`file`, `pattern`, `prefix`, `family`, `exclude`), `i18n-registry` (`source`, `block`, `pattern`, `flags`, `messages`, `key`, `aliases`, `fallback`, `exclude`, `family`), `glob` (`base`, `pattern`, `match`, `family`, `exclude`). Routes are covered as is, with `:id`, `{id}` or `[id]`, or by their static prefix (`/orders/` for `/orders/[id]`).
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
  "sections": [{ "id": "use", "title": "…", "shortTitle": "…", "icon": "…", "subtitle": "…", "highlights": ["…"], "featured": false,
                 "groups": [{ "title": "…", "pages": [{ "id": "use/start", "title": "…", "menuTitle": "…", "summary": "…",
                                                       "level": 1, "template": "screen", "routes": ["/"], "permissions": ["…"] }] }] }],
  "journeys": [{ "title": "…", "description": "…", "steps": ["use/start"] }],
  "suggestions": ["use/start"]
}
```

- `level: 2` marks a sub-page. It is attached to the last level-1 page above it in the same group.
- `template` is optional. When it is present, the build checks the required sections of that page type (§6.4).
- `file` is optional: the page source, relative to `content/` (default `<id>.md`).
- The home page is `content/home.md`; each section may have an introduction, `content/<section>/index.md`.

### 6.2 `images/zones/<id>.json`

```json
{ "file": "<id>.webp", "title": "…", "route": "/…", "width": 1430, "height": 844,
  "version": "1.2.0", "captured": "2026-10-01",
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

- **Entry fields:** `id`, `title`, `route`, `context` (a key of `capture.viewports`: `desktop` by default, `mobile` is a touch screen), `viewport`, `view` (map framing: `{ lon, lat, zoom }` converted to Web Mercator metres, or `{ x, y, z }` passed as is, in the URL parameters of `capture.map`), `storage`, `delay` (wait after loading, default 2500 ms), `actions`, `settle` (wait after the actions, default 600 ms), `frame` (default margins: 34 px horizontally, 10 px vertically), `zones` (in the order of the markers; 3 to 12 recommended), `masks`.
- **Actions:** `click` (+ `options`, Playwright click options), `hover`, `type` + `value`, `select` + `value`, `press`, `scroll`, `wait`, `wheel`, `eval`.
- **Targets:** `{ role, name }`, `{ text }`, `{ field }`, `{ label }`, `{ placeholder }`, `{ css }`, `{ block }` (a container matching `capture.selectors.block` whose button or heading starts with the text). Exactly one kind per target.
- **Target options:** `exact`, `nth`, `last`, `has`, `within`, `up`, `framed` (closest ancestor matching `capture.selectors.frame`, or with a border on its four sides), `margin`, `marginY` (vertical margin of a `frame`), `side`.
- **Grouping zones:** a zone is either a target or `{ union: [target, …] }`. A union covers the bounding box of all its targets, for example several fields on the same row. Zone options: `caption` (written as `label` in the zone file), `side`, `margin`.
- **Masks:** every match of a `masks` target is masked, unless `nth` or `last` names one.
- **Duplicates:** an id that appears in two files is an error.
- **Validation:** entries are checked against `schemas/capture-plan.schema.json` after the legacy normalisation (§6.7). The schema accepts what the engine executes (`engine/capture/*.mjs`), no more: a negative `margin` / `marginY` tightens a zone or a frame; a negative `nth` counts from the last match; a `viewport` side is any whole number of pixels ≥ 1 (a 150 px strip); `wheel.steps` may be 0; `delay`, `settle` and a numeric `wait` are any number ≥ 0; `wheel.direction` stays `-1` or `1`.
- **Plan errors:** every entry of every file is checked before anything runs. The errors are listed together under one `capture.planInvalid` (`{ folder, n }`), one line each: `<file> › <id> (CAPTURES[<index>]) › <path>: <what is wrong>` (each detail carries `file`, `entry`, `path`, `key`, `vars`). One invalid entry still stops the command (exit code 2); a duplicate id is reported once the entries are valid.
- **Safety:** with a session, every request other than `GET`/`HEAD`/`OPTIONS` is aborted and counted (`capture.readOnly: "auto"`). A route matching `capture.forbidden` is refused before the run (exit code 1). During the run, a server renders a page for any `GET` of its route, so every request to a forbidden path is aborted in the browser, whatever its kind (`requestGuard` in `engine/capture/capture.mjs`):
  - a **prefetch or sub-resource** (fetch, XHR, framework payload such as a React Server Components request, `<link rel=prefetch>`, an iframe…) is aborted silently and counted: the capture goes on, and the last lines say "N prefetch request(s) to forbidden routes aborted — list" (`prefetched` and `prefetchedRequests` in `--json`). Aborting it is exactly what prevents the server-side render;
  - a **navigation of a top-level frame** (the plan's own route, a click on a link, a pop-up, a redirect, or a client-side navigation whose URL ends on a forbidden path) fails the capture (`cli.capture.error.forbiddenHit`, exit code 1) and is listed as refused;
  - service workers are blocked whenever the guard is active, so that no request escapes it.

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
- **Template guidance.** Guidance left in a page is marked `<!-- guidance:` (en) or `<!-- consigne :` (fr). `audit` reports it, and the build warns about it (a missing required section is an error in a strict build, a warning with `--draft`).
- **Capture variants.** A template (page templates and the `.md` files of the project skeleton) may hold the two variants of a passage, one per capture mode (§3, `capture.mode`), each on its own lines:

  ```
  <!-- doc-kit:capture=app -->
  …with a :::screen block or a screenshot callout…
  <!-- doc-kit:capture=none -->
  …the same passage without screenshot: a table | Element | What it shows |, in reading order…
  <!-- doc-kit:end -->
  ```

  `init` and `new` keep the lines of the project's mode and remove the markers (`captureVariant(text, mode)` in `engine/build/page-templates.mjs`); text outside the markers is common to both modes. The `screen` and `editor` templates use them for "The screen" (and "What it changes").

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
  - `help.json`: `cli.help.*`, the help of each command (`cli.help.<command>`) and of the global options (`cli.help.globals`).
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
| page fields `fichier`, `gabarit` | `file`, `template` |
| zone files (`fichier`, `titre`, `largeur`, `hauteur`, `l`, `libelle`, `cote`) | `file`, `title`, `width`, `height`, `w`, `label`, `side` (`coin` → `corner`, `droit` → `right`, `bas` → `bottom`, `droit-bas` → `bottom-right`) |
| capture plans (`titre`, `contexte`, `vue`, `stockage`, `delai`, `stabiliser`, `cadre`, `masques`) | `title`, `context` (`bureau` → `desktop`), `view`, `storage`, `delay`, `settle`, `frame`, `masks` |
| plan actions (`clic`, `survol`, `saisir`, `choisir`, `touche`, `defiler`, `attendre`, `molette` { `crans`, `sens` }, `valeur`) | the English actions of §6.3 (`wheel` { `steps`, `direction` }, `value`) |
| plan targets, wherever they sit: zones, union members, frame, masks, actions (`nom`, `texte`, `champ`, `bloc`, `dans`, `parent`, `encadre`, `dernier`, `filtre`, `cote`, `marge`, `margeV`, `libelle`) | `name`, `text`, `field`, `block`, `within`, `up`, `framed`, `last`, `has`, `side`, `margin`, `marginY`, `caption` |

- The legacy folder names (`contenu/`, `schemas/`) are declared through `paths`.
- `doc-kit migrate` rewrites the JSON files in the current format (`sommaire.json` → `toc.json`, `glossaire.json` → `glossary.json`, zone files in place) and renames `accueil.md` to `home.md`. Capture plans are JavaScript modules: they are only normalised when read.
- The Markdown keeps both spellings (§6.6): it is never rewritten.

## 7. Standard and page templates

`standard/` is the quality standard. Every document exists in English (`.md`) and in French (`.fr.md`):
- `structure`: recommended site structure;
- `templates` (and `templates.json`): the 13 page types;
- `writing`: writing rules;
- `captures`: capture safety;
- `quality`: blocking gates and warnings;
- `maturity`: levels 1 to 4, each measurable by `audit` (`annotated` is `n/a` with `capture.mode: "none"`);
- `delivery`: handover checklist;
- `config`: commented configuration examples, all fictional.

The 13 page types are `screen`, `editor`, `recipe`, `technical`, `technical-sub`, `journey`, `journey-step`, `troubleshooting`, `troubleshooting-area`, `findings`, `architecture`, `variables`, `resources`. Each has a template in `templates/pages/en/<type>.md` and in `templates/pages/fr/<type>.md`.

## 8. Skill

The source lives in `skill/doc-kit/`:
- `SKILL.md`: front matter `name: doc-kit` and `description`, about 170 lines, in English. It tells Claude to answer in the user's language.
- `references/*.md`, in English.
- `assets/briefs/{en,fr}/*.md`: brief templates with parameters such as `{{product}}`, `{{docDir}}`, `{{code}}`…, filled by `scripts/brief.mjs` from `doc.config.mjs` and `--var` values.
- `scripts/*.mjs`: `brief.mjs`, `consolidation.mjs` and their shared `common.mjs` (Node ≥ 20, no dependency).
  - `{{appDir}}`, the application code given to the agents: `--var appDir`, else `extra.briefs.appDir`, else `app.dir` (§3), else the nearest of the documentation folder's parent and grandparent that holds `.git`, else its grandparent (`docs/manual` → the application). `brief.mjs` warns when `appDir` was not configured, and when the coverage source sits in a sub-folder with its own `package.json` (a separate front end: the inventory of routes does not see the back end).
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

**Frozen site data.** The data embedded in the generated site (`<script id="donnees">`), the CSS classes and the `data-*` attributes of the generated markup keep their historical names (`titre`, `pages`, `ordre`, `encadre`, `data-titre`…), so that level 1 stays meaningful against older builds. They are internal to the site, not a configuration surface; renaming them is a deliberate, separate change that needs new references.

Real projects used to validate a migration stay **outside** the kit. Their configurations, reports and outputs are kept in the maintainer's working folders, never in this repository.
