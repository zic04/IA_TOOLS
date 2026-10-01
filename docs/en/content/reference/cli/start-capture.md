## doc-kit init

```text
doc-kit init [app-dir] [--dir <folder>] [--name "…"] [--url <url>] [--framework next|react-router|none] [--auth <adapter>] [--yes]
```

Creates the documentation project of the application in `app-dir` (default: the current folder), in
`<app-dir>/docs/manual/`.

| Option | Default | Effect |
|---|---|---|
| `--dir <folder>` | `docs/manual` | The project folder, relative to the application |
| `--name "…"` | detected | Product name; detected from `package.json` (`productName`, `displayName`, `name`) or the folder name |
| `--url <url>` | detected | Application URL; the port comes from the `dev`, `start` or `serve` script, Vite's configuration, or the framework |
| `--framework <name>` | detected | `next` (App Router), `react-router` or `none`: the coverage adapter written in the configuration |
| `--auth <adapter>` | `manual` | `manual`, `none`, `nextauth`, `api-me` or `local:<file>` |
| `--yes`, `-y` | | No question: the detected values and the options as they are |

- **Detection**: `package.json` in the folder or in `frontend`, `front`, `web`, `client`, `ui`, `app`, `apps/web`;
  Next.js with `app/` or `src/app/`, React Router, Vite, NextAuth; a Python back end (`pyproject.toml`,
  `requirements.txt`), whose version is then read in `pyproject.toml`.
- **Questions** (without `--yes`): name, language, URL, sign-in method, then a summary to confirm. Without a terminal
  and without `--yes`, it stops with exit code 2.
- **Writes** the skeleton of `templates/project/common` and `templates/project/<language>`: configuration,
  `package.json`, `.gitignore`, `README.md`, `WRITING-GUIDE.md`, a table of contents with sample pages in four
  sections (Use, Configure, Administer, Take over), a glossary, an example capture plan, a logo. 22 files.
- **Refuses** a folder that exists and is not empty (exit code 1).

## doc-kit doctor

```text
doc-kit doctor [--network]
```

One line per check, `✔` OK, `⚠` to look at, `✖` to fix, each problem followed by its fix.

| Group | Checks |
|---|---|
| Environment | Node version; kit dependencies; Chromium; the project's dependency on the kit; the installed Claude Code skill; the kit's version against the project's `kit` range |
| Project | Configuration; table of contents; version file; coverage sources; masking files; capture plans folder; `.gitignore` of `.doc-kit/` and `dist/`; session (present, age, tracked by git); theme contrasts |
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
closed; 2 without a terminal (with the `manual` adapter). With `auth.adapter: "none"`, there is nothing to do.
[Connect and sessions](#/capture/sessions) explains the rest.

## doc-kit demo

```text
doc-kit demo
```

Runs the script of `capture.setup` in its own Node process, from the project folder. A default export is called with
`{ config, root, url }`. Exit code 0 when the script succeeds, 1 otherwise, 2 without `capture.setup`.

## doc-kit capture

```text
doc-kit capture [patterns…] [--plans <folder>] [--preview] [--no-session]
```

Takes the captures of the plans in a headless Chromium and writes `images/<id>.webp` and `images/zones/<id>.json`.

| Option | Effect |
|---|---|
| `patterns…` | Only the ids matching one of the patterns (`*` any characters, `?` one) |
| `--plans <folder>` | Another plans folder, relative to the project |
| `--preview` | Also writes `.doc-kit/<id>.zones.png`, the zones drawn in red |
| `--no-session` | Without the saved session |

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
for a table of contents. Exit code 2 when `coverage` is empty.

## Further reading

- [Command line](#/reference/cli): global options and exit codes.
- [Commands: write and check](#/reference/cli/write-check).
- [Commands: deliver and maintain](#/reference/cli/deliver).
