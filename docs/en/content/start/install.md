## The goal

At the end of this page, the `doc-kit` command answers on your machine, its browser is installed, and
`doc-kit doctor` reports no problem. It takes about five minutes, most of them spent downloading Chromium.

> [!RECIPE] What you need
> - **Node.js 20 or later**, with npm. Check with `node --version`.
> - About 300 MB of disk space for Chromium, the browser that takes the screenshots.
> - Network access to the npm registry and to the Playwright browser downloads, once.
> - A copy of the kit's repository (the kit is not published on the npm registry yet).

## Who does what

| Step | Where | Result |
|---|---|---|
| 1. Get the kit | A folder of your choice | The kit's files, with its two dependencies installed |
| 2. Install Chromium | The kit's folder | The headless browser used by `capture`, `view`, `audit` and `check tables` |
| 3. Put the command on your path | Your machine, or nothing at all | `doc-kit` answers from any folder |
| 4. Check | Any folder | `doc-kit doctor` lists what is in place |

## Step 1 — Get the kit and its dependencies

Clone the repository (or unpack an archive of it), then install its dependencies. The kit has only two:
`marked` (the Markdown engine) and `playwright` (the browser automation).

```bash
git clone <repository URL> doc-kit
cd doc-kit
npm ci
```

The kit does not depend on where it sits on disk: a path with spaces works.

## Step 2 — Install Chromium

```bash
npx playwright install chromium
```

On a Linux machine without a desktop (a CI agent, a container), install the system libraries too:
`npx playwright install --with-deps chromium`.

## Step 3 — Put the command on your path

Choose one of the three ways. They run the same code.

| Way | Command | When |
|---|---|---|
| A global link | `npm link` (in the kit's folder) | Your own machine: `doc-kit` answers everywhere and follows the kit's folder |
| Without installing anything | `npx --prefix <kit folder> doc-kit <command>` | A shared machine, or to try the kit |
| Plain Node | `node <kit folder>/cli/doc-kit.mjs <command>` | Scripts, and before a project exists |

Each documentation project also declares the kit in its own `package.json`
(`"doc-kit": "file:<relative path to the kit>"`, written by `doc-kit init`). After `npm install` in the project,
`npx doc-kit <command>` runs the kit of the project, even without a global link.

## Step 4 — Check the installation

```bash
doc-kit --version
doc-kit doctor
```

`doc-kit doctor` prints one line per check: ✔ OK, ⚠ to look at, ✖ to fix, each problem followed by `→` and the fix.
Outside a documentation project, it checks the environment only and reports the missing project.

## How to check it works

- **Version**: `doc-kit --version` prints `doc-kit 0.1.0` (or the version of your copy).
- **Node**: the first line of `doctor` is ✔ with your Node version and the required range (`>=20`).
- **Dependencies**: `doctor` shows ✔ for `marked 18.0.14, playwright 1.60.0`.
- **Browser**: `doctor` shows ✔ with the path of the Chromium executable.
- **Help**: `doc-kit --help` lists every command, and `doc-kit --help --lang fr` lists them in French.

## Common errors and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| "Chromium for Playwright is not installed" | Step 2 skipped, or another Playwright version | Run the exact command printed after `→` by `doctor` |
| "kit dependencies not installed: marked, playwright" | `npm ci` was not run in the kit | `npm install --prefix "<kit folder>"` |
| `doc-kit: command not found` | No global link | Use `npx --prefix <kit folder> doc-kit` or `npm link` |
| Node refuses the syntax, or `doctor` shows ✖ Node | Node older than 20 | Install a current Node LTS |

## Pitfalls and limits

> [!WARNING] One Chromium per Playwright version
> Playwright downloads the browser that matches its own version. Updating the kit can require
> `npx playwright install chromium` again: `doctor` tells you when.

> [!NOTE] Private networks
> Behind a proxy, set the usual `HTTPS_PROXY` variable before `npm ci` and `npx playwright install`. The kit itself
> makes no network call except to the application you capture.

## Required permissions

> [!PERMISSIONS] What you need on the machine
> - Write access to the kit's folder (for `npm ci`) and to your user's Playwright cache.
> - `npm link` writes in the global npm folder: on a managed machine, prefer `npx --prefix`.
> - No administrator right is needed otherwise.
