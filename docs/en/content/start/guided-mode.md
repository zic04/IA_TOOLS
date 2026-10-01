## In short

Run `doc-kit` **without a command**: it looks at where you are, says what is missing, and offers to run the next
step. You never need to remember the order of the commands.

1. **It finds the project**: the folder given by `--project`, otherwise the nearest `doc.config.mjs` in the current
   folder or one of its parents.
2. **It checks, in order**: a project exists, its dependencies are installed, its configuration is valid, a session
   exists when the application needs a sign-in, at least one capture was taken.
3. **It stops at the first gap** and offers the command that fills it. Once everything is in place, it offers a menu:
   `dev`, `audit`, `build`, `doctor`.
4. **It asks before running anything.** Without a terminal (a pipe, a CI job), it only prints the suggestion and
   exits with code 0.

## The diagram

::diagram{id="guided" title="The guided mode checks the project from left to right and stops at the first gap: the command under each box is the one it offers. When every check passes, it shows the menu."}

## The steps it detects

| Situation | What it prints | Command offered |
|---|---|---|
| No `doc.config.mjs` here or above | "No documentation project in …" | `doc-kit init <folder>` |
| The project's dependencies are missing | "… but its dependencies are not installed." | `npm install` |
| The configuration cannot be used | "… but it cannot be used as it is:" and the errors | `doc-kit doctor` |
| No session, and `auth.adapter` is not `none` | "the project is ready, but there is no session…" | `doc-kit connect` |
| No capture yet | "no screenshot yet." | `doc-kit capture` |
| Everything is in place | "the project is in place." | A menu: `dev`, `audit`, `build`, `doctor` |

When you accept `init`, the guided mode goes on with the questions of `init` (name, language, URL, sign-in) in the
same terminal. For any other step, it hands the terminal over to the command: `connect` reads your Enter key,
`dev` runs until [[key Ctrl+C]].

## In a script

The guided mode never runs anything without a person at the terminal. `--json` gives the situation as data:

```bash
doc-kit --json
```

```json
{
  "step": "connect",
  "folder": "/home/robin/acme-orders/docs/manual",
  "next": ["doc-kit connect"]
}
```

`step` is one of `init`, `install`, `doctor`, `connect`, `capture` or `menu`. In the `menu` case, `next` lists the
four commands of the menu.

## Messages and language

The messages are in the project's language (`language` in `doc.config.mjs`), or in the language given by
`--lang en|fr`. Outside a project, they are in English unless the variable `DOC_KIT_LANG` says `fr`.

## Pitfalls and observed gaps

> [!NOTE] What the guided mode does not check
> It does not check that the session is still valid, that the captures are up to date or that the strict build
> passes. `doc-kit doctor` checks the session's age, `doc-kit audit` the rest.

## Further reading

- [The first five minutes](#/start/first-five-minutes): the same steps, one by one, on the demo application.
- [Command line](#/reference/cli): every command and its exit codes.
- [Commands: start and capture](#/reference/cli/start-capture): `init`, `doctor` and `connect` in detail.
