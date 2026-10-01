# Contributing to doc-kit

Thank you for helping. doc-kit is meant to change hands easily and to be used in many companies: every change keeps
it **neutral**, **bilingual**, **tested** and **documented**. This page says how.

By taking part, you agree to follow the [code of conduct](CODE_OF_CONDUCT.md). To report a vulnerability, do not
open a public issue: see [SECURITY.md](SECURITY.md).

## Development setup

```bash
git clone <repository URL> doc-kit
cd doc-kit
npm ci
npx playwright install chromium        # --with-deps on a Linux machine without a desktop
node cli/doc-kit.mjs doctor
```

Node.js 20 or later. The kit has two runtime dependencies (`marked`, `playwright`) and no development dependency:
tests use `node:test`, validation is home-made. Keep it that way; a new dependency needs a strong reason, discussed
in an issue first.

## Tests

| Command | What it runs | Time |
|---|---|---|
| `npm test` | Unit and snapshot tests (`test/unit`, `test/snapshot`) | seconds |
| `npm run test:unit` | Unit tests only | seconds |
| `npm run test:snapshot` | The demo project built in English and French, compared with `test/snapshot/__snapshots__/` | seconds |
| `npm run test:e2e` | End-to-end tests in a headless Chromium: the site, accessibility, the dev server, captures of the demo app (started on a free port) | about a minute |

- After an **intended** change of the generated site, update the snapshots: `UPDATE=1 npm run test:snapshot`, and
  explain the change in the pull request.
- Tests never open a visible window, never touch a real application, never use a real secret and never run a git
  command that changes anything.
- Run both `npm test` and `npm run test:e2e` before a pull request; the CI examples of `ci/` run them on Linux,
  Windows and macOS.

## The contract comes first

[ARCHITECTURE.md](ARCHITECTURE.md) is the contract shared by everyone who works on the kit, people or agents. Any
change to an interface it describes (a command, an option, a configuration key, a file format, an adapter, the
Markdown syntax, the exit codes) goes, in this order:

1. into `ARCHITECTURE.md`;
2. into the code, with its tests;
3. into both languages of the documentation (`docs/en`, `docs/fr`) and, when it applies, of the standard;
4. into `CHANGELOG.md`, under `[Unreleased]`.

The data embedded in the generated site, its CSS classes and its `data-*` attributes keep their historical names on
purpose (ARCHITECTURE.md §9): renaming them is a separate, deliberate change.

## Neutrality

The kit contains nothing about any particular application, company or customer: no product or company name, no
person, no internal URL, no brand colour. Examples, fixtures and documentation use **Acme Orders**, a fictional
product, and `example.org` addresses.

A test enforces it with a **private** list of terms: `test/.forbidden-terms`, one regular expression per line (`#`
starts a comment), git-ignored; or the `DOC_KIT_FORBIDDEN_TERMS` variable (alternatives separated by `|`), for
instance from a secret of the CI. Without the list, the test is skipped.

- Keep your own list in `test/.forbidden-terms` with the names of the projects you work on.
- **Never publish the list**, and never put a real name in a file, an issue, a pull request or a commit message.
- Anything specific to one application belongs in that application's documentation project, never in the kit.

## One name, two languages

- The product name and the command name are defined once, in `engine/brand.mjs` and `package.json`. Do not write
  them in code or messages; only the README files and the documentation may.
- Code, identifiers, comments, configuration keys and options are in **English**.
- Every user-facing text (the site, the CLI messages, the templates) goes through i18n, in `i18n/en.json` and
  `i18n/fr.json`, or in a fragment `i18n/<language>/<feature>.json`. Both languages have **the same keys and the same
  variables**: a test checks it. An error message is a `cli.<key>` text saying what is wrong, with a `cli.<key>.help`
  text saying what to do.
- The documentation, the standard and the page templates exist in both languages, and move together.

## Adding a command

1. Write `cli/commands/<name>.mjs`. It exports `options` (Node's `util.parseArgs` format) and
   `run({ ctx, values, positionals })`, which returns an exit code (0 OK, 1 a check failed, 2 usage or
   configuration, 3 environment). The dispatcher finds it by itself. An option name used by another command must
   have the same type there.
2. Raise errors as `KitError(code, key, vars)`; print with `ctx.print`, `ctx.error`, `ctx.t`; support `--json` when
   the command has a result.
3. Add its texts (`cli.<name>.*`), in English and French, and its line in `cli.usage`.
4. Test it in `test/unit/` (and `test/e2e/` if it opens a browser).
5. Document it: ARCHITECTURE.md §4, the CLI reference pages of `docs/en` and `docs/fr` (the coverage check of the
   documentation fails until every command and option is cited), `CHANGELOG.md`.

## Adding an adapter

1. Write `adapters/coverage/<name>.mjs` or `adapters/auth/<name>.mjs`: a default export with `name`, `options` (each
   option a small schema, `required: true` when mandatory) and `inventory()` or `session()` (ARCHITECTURE.md §5).
2. Register it in `BUILT_IN` of `engine/capture/session.mjs`.
3. Test it in `test/unit/adapters.test.mjs`, without any real application.
4. Document its options in the reference page of adapters, in both languages.

A project-specific adapter does not belong in the kit: it lives in the project and is declared as
`local:adapters/<name>.mjs`.

## Adding or changing a page template

1. `standard/templates.json`: the `en` and `fr` section lists have the same length and order; `required` holds
   indexes; set `maxWords` and the `example` (`docs/{language}/content/examples/<type>.md`).
2. `templates/pages/en/<type>.md` and `templates/pages/fr/<type>.md`: every section of the type, with guidance
   comments in their own language only (a test checks both).
3. `standard/templates.md` and `standard/templates.fr.md`.
4. An example page in `docs/en/content/examples/` and `docs/fr/content/examples/`, declared in both tables of
   contents.
5. A migration in `engine/migrations/` if existing projects must change; `CHANGELOG.md`.

## Working on the documentation

`docs/en` and `docs/fr` are two doc-kit projects that document the kit with the kit. They must keep passing the
strict build and reach maturity level 3 or more.

```bash
node cli/doc-kit.mjs build --project docs/en
node cli/doc-kit.mjs check all --project docs/en
node cli/doc-kit.mjs audit --project docs/en
```

Their coverage check (`docs/shared/kit-reference.mjs`) fails when a configuration key, a CLI option, a built-in
adapter or a command is not cited: document new ones in both languages.

**Retaking the captures** (only when a screen of the demo app or of the site changed):

1. Start the demo app: `node examples/demo-app/serve.mjs` (port 4173).
2. Sign in once from the project folder: `doc-kit connect` (any e-mail and password), then `doc-kit demo` to reset
   the demo data, and `doc-kit capture --preview`. Look at `.doc-kit/<id>.zones.png`.
3. For the screens of the site itself, serve the project in a second terminal with `DOC_KIT_NO_OPEN=1 doc-kit dev
   --port 4401`, then `KIT_DOCS_URL=http://127.0.0.1:4401 doc-kit capture --plans captures/plans-site --no-session`.
4. Delete the session: `doc-kit connect --forget`.

The screenshots of the README files (`docs/assets/`) come from `doc-kit view` of the built English documentation.

## Pull requests

- One topic per pull request, with its tests and its documentation in both languages.
- `npm test` and `npm run test:e2e` green; the documentation projects build in strict mode.
- An entry in `CHANGELOG.md` under `[Unreleased]` ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/)).
- Plain, short sentences in the documentation: what it does, how it really works, what can go wrong.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
