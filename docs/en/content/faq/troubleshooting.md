## In short

Start from what you see: a message, a missing page, a capture that fails. This part takes you in one minute to the
cause, the check that confirms it, the fix, and the page that explains the mechanism. Every message of the kit has
the same shape: `✖` what is wrong, then `→` what to do. Read the `→` line first: it is often the whole answer.

> [!HOW] Three reflexes before you search further
> - **Run `doc-kit doctor`.** It checks Node, the kit, Chromium, the project's dependencies, the configuration, the
>   session and `.gitignore`, and prints the fix of each problem.
> - **Build in draft mode.** `doc-kit build --draft` lists every problem of the content at once, without stopping at
>   the first; `doc-kit dev` shows them over the page as you save.
> - **Look at the exit code.** 1: a check of your content failed; 2: a usage or configuration error; 3: the
>   environment (kit version, browser, application, session).

## The diagram

::diagram{id="troubleshooting" title="Where to start: the exit code says which family the problem belongs to, and each family has its first check and its sub-page."}

## First of all: the checks that explain half the symptoms

| Check | Where to look | What is misleading |
|---|---|---|
| Are you in the right folder? | The first line of `doc-kit doctor` names the project | The CLI looks for `doc.config.mjs` upwards: a parent project may answer |
| Are the project's dependencies installed? | `doctor`: "project dependencies installed" | `doc-kit` works globally, but the configuration imports `doc-kit/config` from the project |
| Does the kit accept the project? | `doctor`: "kit … accepted by the project" | Every command stops with exit code 3 when the range refuses the kit |
| Is Chromium installed? | `doctor`: "Chromium for Playwright" | `build` works without it; `capture`, `view` and `check tables` do not |
| Is the session still valid? | `doctor`: the session's age | A session file can exist and be expired |
| Is the application running, at `app.url`? | `doc-kit doctor --network` | `<PREFIX>_URL` or `DOC_KIT_URL` may point elsewhere |
| Did the strict build fail? | The last line: "N errors — site NOT generated" | The previous `dist/` file is still there, unchanged |

## Where to look

### The commands that tell

| Command | What it tells |
|---|---|
| `doc-kit doctor` | The environment and the project, with a fix per problem |
| `doc-kit build --draft` | Every content problem, as warnings |
| `doc-kit check all` | Coverage, links, tables, images, secrets |
| `doc-kit audit` | What separates the site from the next maturity level |
| `--verbose` | The fix of every warning; the stack of an internal error |
| `--json` | The full result, for a script or a ticket |

### The work folder

| File | What it holds |
|---|---|
| `.doc-kit/<id>.zones.png` | The zones of a capture, drawn in red (`capture --preview`) |
| `.doc-kit/audit.md`, `audit.json` | The last audit |
| `.doc-kit/page.png` | The last `doc-kit view` |
| `.doc-kit/session.json` | The session: never open it in a shared screen, never send it |

### The texts of the messages

Every message is a text of the kit (`cli.*` in `i18n/en.json` and `i18n/fr.json`): searching the exact message
there finds the code that raises it.

## In this part

| Sub-page | Symptoms covered |
|---|---|
| [1. Build and writing problems](#/faq/troubleshooting/build) | The site is not generated, a link, an anchor, a legend, a section, a configuration key, a page that cannot be created |
| [2. Capture and session problems](#/faq/troubleshooting/capture) | No session, an expired session, the application unreachable, a zone or an action not found, a forbidden route, a missing browser |

## Further reading

- [Frequently asked questions](#/faq/questions): before something goes wrong.
- [Command line](#/reference/cli): the exit codes, command by command.
- [Configuration](#/reference/configuration): the keys and their validation.
