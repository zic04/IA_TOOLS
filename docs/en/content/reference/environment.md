## In short

The kit reads a few environment variables. None is required: they adapt one run, one machine or one pipeline
without editing `doc.config.mjs`.

- **Five project variables** exist in two spellings: `DOC_KIT_<NAME>`, for any project, and `<PREFIX>_<NAME>`, for one
  project (`env.prefix`, by default the product slug in capitals). `DOC_KIT_*` wins. An empty value counts as unset.
- **Four variables change the behaviour of the kit itself**: `DOC_KIT_LANG`, `DOC_KIT_NO_OPEN`,
  `DOC_KIT_NO_BROWSER` and `CLAUDE_CONFIG_DIR`.
- A command-line option always wins over a variable, and a variable over the configuration file.

> [!NOTE] The sources of this page
> - **Code of the kit**: `engine/project/env.mjs` (the mapped variables), `engine/capture/session.mjs` (the session),
>   `cli/common.mjs` (language and colours), `cli/commands/*.mjs`.
> - Version checked: the kit's version shown in the top bar of this site.

## The variables, one by one

### Project variables (5)

| Variable | Sets | Values | Example |
|---|---|---|---|
| `DOC_KIT_URL`, `<PREFIX>_URL` | `app.url` | A URL; trailing slashes removed | `ACME_URL=https://staging.example.org` |
| `DOC_KIT_PLANS`, `<PREFIX>_PLANS` | `capture.plans` | A folder, relative to the project | `ACME_PLANS=captures/plans-prod` |
| `DOC_KIT_READONLY`, `<PREFIX>_READONLY` | `capture.readOnly` | `1`, `true`, `yes`, `oui` · `0`, `false`, `no`, `non` · `auto` | `ACME_READONLY=1` |
| `DOC_KIT_VERSION`, `<PREFIX>_VERSION` | `version.fallback` | A version | `ACME_VERSION=2.4.0` |
| `DOC_KIT_SESSION`, `<PREFIX>_SESSION` | The session file | A path, relative to the project | `ACME_SESSION=.doc-kit/prod.json` |

### Behaviour of the kit (4)

| Variable | Read by | Effect |
|---|---|---|
| `DOC_KIT_LANG` | Every command | Language of the messages (`en` or `fr`) outside a project; inside one, the project's `language` wins, and `--lang` wins over both |
| `DOC_KIT_NO_OPEN` | `dev`, `open` | Any value: the browser is not opened; the address is printed |
| `DOC_KIT_NO_BROWSER` | `audit` | `1`, `true` or `yes`: the table widths are not measured (no Chromium started) |
| `CLAUDE_CONFIG_DIR` | `skill install`, `doctor` | The skill goes to `<CLAUDE_CONFIG_DIR>/skills/doc-kit` instead of `~/.claude/skills/doc-kit` |

### Read from the system (7)

| Variable | Read by | Effect |
|---|---|---|
| `NO_COLOR`, `TERM=dumb` | Every command | No colours in the terminal (there are none either when the output is not a terminal) |
| `LANG`, `LC_ALL`, `LC_MESSAGES` | `init` | A value starting with `fr` makes French the proposed language of the site |
| `HOME`, `USERPROFILE` | `skill install` | The home folder that holds `.claude/skills` |

### Set by the kit for the demo script (3)

`doc-kit demo` runs `capture.setup` with `DOC_KIT_PROJECT` (the project folder), `DOC_KIT_URL` (`app.url`) and
`DOC_KIT_CONFIG` (the configuration, as JSON) in its environment, so that a script that exports no function can
still read them.

## Missing or ineffective

| Variable | Situation | Consequence |
|---|---|---|
| `<PREFIX>_READONLY` | A value outside the list (`maybe`) | Exit code 2: `ACME_READONLY: value “maybe” not recognised` |
| `<PREFIX>_READONLY` | `0` while `capture.target` is `"production"` | Exit code 2: production is only captured read-only |
| `<PREFIX>_URL` | Set, but `--url` given to `connect` | The option wins |
| `<PREFIX>_SESSION` | Points to a file that does not exist | `capture` stops: `no session: …` (exit code 3) |
| `DOC_KIT_LANG` | Set inside a project | No effect: the project's `language` wins; use `--lang` |
| `DOC_KIT_FORBIDDEN_TERMS` | Outside the kit's own tests | No effect: it only feeds the kit's neutrality test |

## To check

:::steps
1. **In a pipeline**: no `<PREFIX>_SESSION` and no application address; a pipeline builds and checks, it never
   captures.
2. **On a workstation with several environments**: one session file per environment (`<PREFIX>_SESSION`), and
   `<PREFIX>_URL` set in the same terminal as the capture.
3. **Before a production run**: `capture.target` is `"production"`, so `doc-kit capture` shows the production banner
   and asks before it starts; its next line says `read-only: on`.
:::
