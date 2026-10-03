## In short

```text
doc-kit [<command>] [options]
```

Without a command, `doc-kit` starts the [guided mode](#/start/guided-mode). `doc-kit --help` lists the commands,
`doc-kit --help --lang fr` lists them in French, and `doc-kit --version` prints the kit's version.
`doc-kit <command> --help`, or `doc-kit help <command>`, prints the usage of one command and every one of its
options, in the language of the messages: `doc-kit init --help` shows `--lang` and `--capture` among the others.

1. **The project** is the folder given by `--project`, otherwise the nearest folder that holds a `doc.config.mjs`,
   from the current folder upwards.
2. **The messages** are in the project's language from the first line, `doctor` included; `--lang` changes it for
   one run. `init`, which creates a project elsewhere, speaks `--lang`, `DOC_KIT_LANG` or English.
3. **Every error** says what is wrong (`✖`), then what to do (`→`).
4. **The exit code** tells a script what happened, the same way for every command.

## In this part

| Sub-page | Commands |
|---|---|
| [Commands: start and capture](#/reference/cli/start-capture) | `init`, `doctor`, `connect`, `probe`, `demo`, `record`, `capture`, `inventory` |
| [Commands: write and check](#/reference/cli/write-check) | `dev`, `new`, `build`, `view`, `open`, `check`, `audit`, `optimize`, `stats` |
| [Commands: deliver and maintain](#/reference/cli/deliver) | `export`, `upgrade`, `migrate`, `skill install`, `translate`, `changes` |

## Global options

| Option | Effect |
|---|---|
| `--project <dir>` | The documentation project to work on, instead of looking for `doc.config.mjs` |
| `--json` | Prints the result as JSON on the standard output (commands that have a result) |
| `--verbose` | Also prints the fix of each warning, and the stack of an internal error |
| `--lang en\|fr` | Language of the messages for this run |
| `--help`, `-h` | The list of commands; after a command (or `doc-kit help <command>`), its usage and its options |
| `--profile` | Prints the time of each step of the run, longest first |
| `--version`, `-v` | The kit's version |

An option of another command is refused: `doc-kit build --tour 2` stops with `✖ invalid option: --tour (build)` and
exit code 2.

## Exit codes

| Code | Meaning | Examples |
|---|---|---|
| **0** | OK | The site is built; the checks pass; the audit ran (whatever the level) |
| **1** | A check failed | A build error, a broken link, an uncovered route, a secret, a capture that failed, a non-empty target folder |
| **2** | Invalid usage or configuration | An unknown command or option, an invalid `doc.config.mjs`, a plan error, no project found |
| **3** | Environment problem | The installed kit outside the project's `kit` range, Chromium missing, the application unreachable, the session expired |

## Messages

```text
✖ the session has expired (sign-in page: http://127.0.0.1:4173/login?next=%2Forders)
  → run doc-kit connect, then capture again
```

- `✖` an error, `⚠` a warning, `✔` a success; colours only on a terminal, and never with `NO_COLOR`.
- Warnings of the build show their fix with `--verbose`.
- Every message comes from the kit's texts (`cli.*` keys), in English and in French.

## All the commands

| Command | What it does |
|---|---|
| `doc-kit init [app-dir]` | Creates the documentation project of an application |
| `doc-kit doctor` | Checks the environment and the project, with the fix of each problem |
| `doc-kit connect` | Opens the application so that you sign in, then saves the session |
| `doc-kit probe` | Checks a running local or demo instance, read-only: headers, cookies, CORS, access control |
| `doc-kit demo` | Runs the demo data script (`capture.setup`) |
| `doc-kit record <route>` | Writes a capture plan entry from what you do in the browser |
| `doc-kit capture [patterns…]` | Takes the captures of the plans, read-only with a session |
| `doc-kit inventory` | Lists what the coverage adapters see |
| `doc-kit dev` | Builds, serves and reloads the site while you write |
| `doc-kit new <page-id>` | Creates a page from a template and declares it |
| `doc-kit build` | Builds the site (strict by default) |
| `doc-kit view <page[~anchor]>` | Screenshots a page of the built site |
| `doc-kit open [page]` | Opens the built site in the default browser |
| `doc-kit check [name]` | Runs the checks |
| `doc-kit audit` | Measures the maturity level |
| `doc-kit optimize` | Recompresses heavy captures |
| `doc-kit stats` | Time, tokens and models per block and per version (`usage/`) |
| `doc-kit changes` | What changed in the application since a git reference: routes, tables, variables, dependencies, findings (`--record`: kept for `::changes`) |
| `doc-kit hooks install` | Git hooks: facts and sync after each pull and branch switch |
| `doc-kit export <target>` | Writes a self-contained copy of the project |
| `doc-kit upgrade` | Shows the changes since the project's kit version, applies the migrations |
| `doc-kit migrate` | Rewrites legacy French-keyed files in the current format |
| `doc-kit skill install` | Installs the Claude Code skill |
| `doc-kit translate status \| --mark <page…> \| --mark --all \| --fix-anchors [page…]` | The state of the translations, or marks or fixes them |

## Adding a command

A command is a file `cli/commands/<name>.mjs` of the kit, found by the dispatcher at start-up. It exports `options`,
in the format of Node's `util.parseArgs`, and `run({ ctx, values, positionals })`, which returns an exit code. The
options of every command are merged into one parser: an option name used by two commands must have the same type
in both. Its messages go into `i18n/en.json` and `i18n/fr.json` (or a fragment of `i18n/<language>/`), under `cli.*`.

## Pitfalls and observed gaps

> [!WARNING] Page ids in Git Bash
> Git Bash turns an argument that starts with `/` into a Windows path. Write `doc-kit view use/orders`, not
> `doc-kit view /use/orders`.

## Further reading

- [Guided mode](#/start/guided-mode): `doc-kit` without a command.
- [Environment variables](#/reference/environment): what can be set without an option.
- [Configuration](#/reference/configuration): what the options override.
