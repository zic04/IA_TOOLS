## doc-kit init

```text
doc-kit init [app-dir] [--dir <folder>] [--name "…"] [--lang en|fr] [--url <url>] [--framework next|react-router|none] [--auth <adapter>] [--capture app|none] [--target local|demo|production] [--yes]
```

Creates the documentation project of the application in `app-dir` (default: the current folder), in
`<app-dir>/docs/manual/`. `app-dir` is the **root** of the application, even when its front end sits in a sub-folder
(`frontend/`, `web/`…): it becomes `app.dir`, the code the writers read.

| Option | Default | Effect |
|---|---|---|
| `--dir <folder>` | `docs/manual` | The project folder, relative to the application |
| `--name "…"` | detected | Product name: the `title` of the `metadata` of the Next.js root layout, else `package.json` (`productName`, `displayName`, `name` without its scope and its `-frontend`, `-front`, `-web`, `-ui`, `-client` or `-app` suffix), else the folder name |
| `--lang en\|fr` | asked, or the system's | Language of the site, and of the messages of the command; with `--yes`, it is the only way to choose it |
| `--url <url>` | detected | Application URL; the port comes from the `dev`, `start` or `serve` script, Vite's configuration, or the framework |
| `--framework <name>` | detected | `next` (App Router), `react-router` or `none`: the coverage adapter written in the configuration |
| `--auth <adapter>` | `manual` | `manual`, `none`, `nextauth`, `api-me` or `local:<file>` |
| `--capture app\|none` | `app` | `app`: screenshots of the running application; `none`: no screenshot at all (`capture.mode: "none"`), each screen described by a table |
| `--target <where>` | `local`, or `demo` for a URL that is not local | `local`, `demo` or `production` (`capture.target`); `production` writes `capture.readOnly: true` and, with `--yes`, needs `--url`; refused with `--capture none` |
| `--yes`, `-y` | | No question: the detected values and the options as they are |

- **Detection**: `package.json` in the folder or in `frontend`, `front`, `web`, `client`, `ui`, `app`, `apps/web`;
  Next.js with `app/` or `src/app/`, React Router, Vite, NextAuth; a Python back end (`pyproject.toml`,
  `requirements.txt`).
- **Version** (`version.file`): `version.txt` or `VERSION` at the root of the application, else the root
  `package.json` when it has a `version`, else the front end's, else the `pyproject.toml` of a Python-only application.
- **Masking** (`masking.env`): `.env` and `.env.local` at the root and in the front-end folder, only the files that
  exist; never `*.example`.
- **Questions** (without `--yes`): name, language, URL, where the screenshots are taken, sign-in method (only with
  screenshots). Without a terminal and without `--yes`, it stops with exit code 2.
- **Where the screenshots are taken**: "1) local or demo application, 2) production, read-only, 3) no screenshots".
  Choice 1 writes `capture.target: "local"` for a `localhost` or `127.x` URL, `"demo"` otherwise. Choice 2 asks the
  **production URL** (never the local one detected from the dev script), then prints three safety reminders:
  read-only blocks the browser's writes, **not** a write made by the server while it renders a page (list such routes
  in `capture.forbidden`); the session file is a secret; the screenshots show real data, which is the owner's written
  decision. It writes `capture.target: "production"` and `capture.readOnly: true`.
- **Then**, in a terminal and with screenshots: "Open the browser now to sign in? (Y/n)" runs `npm install` in the new
  project when needed, then `doc-kit connect`; "Take a first test
  screenshot with --preview? (Y/n)" runs `doc-kit capture --preview --yes` on the example plan. With `--yes`, nothing
  opens: the next steps are printed. A step that fails stops there with its exit code; the project stays written.
- **Recap**: before writing anything, even with `--yes`, the folder, the name and where it was found, the slug, the
  language, the URL, the version and its file, the capture mode and target, the sign-in, the coverage source, the masked `.env`
  files and the application folder. To rename the product afterwards: `product.name` in `doc.config.mjs`, then the
  title, tagline and section titles of `content/toc.json`.
- **Writes** the skeleton of `templates/project/common` and `templates/project/<language>`: configuration,
  `package.json`, `.gitignore`, `README.md`, `WRITING-GUIDE.md`, a table of contents with sample pages in four
  sections (Use, Configure, Administer, Take over), a glossary, an example capture plan, a logo. 22 files. The
  comments of `doc.config.mjs` are in the language of the project; the example routes are fictional (`/example/…`).
- **Without screenshots** (`--capture none`): no example plan (21 files), sample pages that describe each screen with a
  table `| Element | What it shows |`, a home page without the "interactive screens" box, and next steps without
  `connect` and `capture`.
- **Refuses** a folder that exists and is not empty (exit code 1).

## doc-kit doctor

```text
doc-kit doctor [--network]
```

One line per check, `✔` OK, `⚠` to look at, `✖` to fix, each problem followed by its fix.

| Group | Checks |
|---|---|
| Environment | Node version; kit dependencies; Chromium; the project's dependency on the kit; the installed Claude Code skill; the kit's version against the project's `kit` range |
| Project | Configuration; table of contents; version file (⚠ "version never incremented?" when it says `0.0.0` or `1.0.0` while a `version.txt`, `VERSION` or `CHANGELOG.md` of the application says otherwise); application folder (`app.dir`); coverage sources; masking files; capture plans folder; the capture target (⚠ "no forbidden route declared" for a production with an empty `capture.forbidden`); `.gitignore` of `.doc-kit/` and `dist/`; session (present, age, tracked by git); theme contrasts. With `capture.mode: "none"`, neither the session, the plans folder nor the target is checked |
| `--network` | The application answers at `app.url` |

Exit code: 3 when the environment fails, 2 when the configuration is invalid, 1 when a project check fails, 0
otherwise. Warnings never fail.

## doc-kit connect

```text
doc-kit connect [--url <url>] [--forget]
```

Opens the application in a visible Chromium window; you sign in, then press Enter (or the adapter detects the
session). The session is saved in `.doc-kit/session.json` (or `<PREFIX>_SESSION`).

| Option | Effect |
|---|---|
| `--url <url>` | Another address than `app.url` |
| `--forget` | Deletes the session file |

Exit code 3 when the application cannot be reached, after 15 minutes without a sign-in, or when the window is
closed; 2 without a terminal (with the `manual` adapter). With `auth.adapter: "none"`, there is nothing to do. With
`capture.mode: "none"`, it explains the mode and stops with exit code 2; `--forget` still deletes a session. With
`capture.target: "production"`, a first line says so: sign in with your own account, the session gives access to
production.
[Connect and sessions](#/capture/sessions) explains the rest.

## doc-kit demo

```text
doc-kit demo
```

Runs the script of `capture.setup` in its own Node process, from the project folder. A default export is called with
`{ config, root, url }`. Exit code 0 when the script succeeds, 1 otherwise, 2 without `capture.setup`, and 2 with
`capture.target: "production"`: a demo data script never runs against production.

## doc-kit capture

```text
doc-kit capture [patterns…] [--plans <folder>] [--preview] [--no-session] [--yes]
```

Takes the captures of the plans in a headless Chromium and writes `images/<id>.webp` and `images/zones/<id>.json`.
With `capture.mode: "none"`, it explains the mode and stops with exit code 2.

| Option | Effect |
|---|---|
| `patterns…` | Only the ids matching one of the patterns (`*` any characters, `?` one) |
| `--plans <folder>` | Another plans folder, relative to the project |
| `--preview` | Also writes `.doc-kit/<id>.zones.png`, the zones drawn in red |
| `--no-session` | Without the saved session |
| `--yes`, `-y` | Confirms a production capture in advance; required without a terminal |

With `capture.target: "production"`, the run is always read-only, even without a session, and starts with a banner,
then a question whose default is **No**: a reflexive Enter never starts a production run.

```text
PRODUCTION — read-only · 2 screenshots · https://orders.acme.example
? Capture 2 screens on production now? (y/N) ›
```

Without a terminal, or with `--json`, `--yes` is required: otherwise "capture on production not confirmed", exit
code 2. Answering no captures nothing (exit code 0).

With a session, the session is checked first and the run is read-only (`capture.readOnly: "auto"`). Exit code 1
when a route is forbidden or a capture failed, 3 when the application cannot be reached or the session expired, 2
for a plan error. `--json` prints `ok`, `failed`, `readOnly`, `blocked`, `blockedRequests`, `refused` and `expired`.
[Capture plans](#/capture/plans) explains the plans.

## doc-kit inventory

```text
doc-kit inventory [--json]
```

Lists what the coverage adapters see in the application, family by family, with `✔` for the elements already cited
in the documentation and `·` for the others. `doc-kit inventory --json > .doc-kit/inventory.json` is a good start
for a table of contents. A page that still holds template guidance cites nothing yet: neither its text nor its
entry in the table of contents count. Exit code 2 when `coverage` is empty.

## Further reading

- [Command line](#/reference/cli): global options and exit codes.
- [Commands: write and check](#/reference/cli/write-check).
- [Commands: deliver and maintain](#/reference/cli/deliver).
