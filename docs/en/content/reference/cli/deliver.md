## doc-kit export

```text
doc-kit export <target> [--with-dist] [--zip]
```

Writes a self-contained copy of the project into `<target>`, which must be new or empty (exit code 1 otherwise).

| Option | Effect |
|---|---|
| `--with-dist` | Includes the built site and the file of each space (a warning when it is not built) |
| `--zip` | Also writes `<target>.zip` |

The copy holds the project's files (without `node_modules/`, `.doc-kit/`, `.git/`, `.env` files,
`package-lock.json`, logs, and `dist/` unless `--with-dist`), the engine in `vendor/doc-kit/`, a `package.json` that
depends on it, `EXPORT.json`, a "Standalone copy" section in `README.md`, and the documented version frozen as
`version.fallback`. Every configuration path that points outside the project is reported. See
[Export and hand over](#/publish/export).

## doc-kit upgrade

```text
doc-kit upgrade [--apply]
```

Brings a project to the installed kit version, even when its `kit` range refuses that version.

:::steps
1. Shows the entries of the kit's `CHANGELOG.md` between the project's range and the installed version.
2. Runs the migrations of the kit (`engine/migrations/<version>.mjs`) newer than the range's base version, **in
   memory**, and shows the diff of every file they change, including `kit` set to `^<installed version>`.
3. With `--apply`, writes the changes: `1 file updated; the project now requires kit ^0.2.0.`
:::

Without `--apply`, nothing is written: `Nothing written (dry run). To apply: doc-kit upgrade --apply`. Exit code 1
when a migration fails (nothing is written). See [Upgrade to a newer kit](#/migrate/upgrade).

## doc-kit migrate

```text
doc-kit migrate
```

Rewrites the legacy French-keyed files of a project in the current format:

| Legacy file | Becomes |
|---|---|
| `<content>/sommaire.json` | `<content>/toc.json` |
| `<content>/glossaire.json` | `<content>/glossary.json` |
| `<content>/accueil.md` | `<content>/home.md` (renamed) |
| `<images>/zones/*.json` with French keys | the same files, rewritten in place |

Folder names are kept (declare them in `paths`); capture plans are JavaScript and are never rewritten; the Markdown
keeps both spellings. Nothing is written when the normalised table of contents is invalid (exit code 1). See
[Migrate a legacy project](#/migrate/legacy-project).

## doc-kit skill install

```text
doc-kit skill install [--target <skills folder>] [--force]
```

Installs the Claude Code skill of the kit into `<skills folder>/doc-kit`, where the skills folder is `--target`,
otherwise `$CLAUDE_CONFIG_DIR/skills`, otherwise `~/.claude/skills`.

| Option | Effect |
|---|---|
| `--target <folder>` | Another skills folder |
| `--force` | Replaces a `doc-kit` folder that was not installed by this command |

A fingerprint file lets `doc-kit doctor` report an outdated, edited or foreign copy. Only the `doc-kit` folder is
ever written. See [Install the skill](#/skill/install).

## doc-kit translate

```text
doc-kit translate status [--lang <l>] [--check]
doc-kit translate --mark <page…> [--lang <l>]
doc-kit translate --mark --all [--lang <l>]
doc-kit translate --fix-anchors [page…] [--lang <l>]
```

The state of the translations declared by `languages` in `doc.config.mjs`; without `languages`, exit code 2
(`translate.noLanguages`). Without the global `--lang`, every language but the source; `--lang <l>` limits to one
and refuses the source itself (exit code 2, `translate.sourceLang`).

| Form | Effect |
|---|---|
| `status [--check]` | Lists every translatable file's state (`current`, `stale`, `unmarked`, `missing`), the counts, then the files that are not `current` |
| `--mark <page…>` | Records the current fingerprint of each item's source into `translations/<l>/.sources.json`; an item is a page id, or a path relative to `content/` when it contains a `.` (`home.md`, `use/index.md`, `toc.json`, `glossary.json`) |
| `--mark --all` | Marks every file whose translation already exists |
| `--fix-anchors [page…]` | Rewrites a link `#/<target>~<anchor>` whose anchor is a heading of the source target page but not of the translated one, to the translated heading at the same position; without `page…`, every page and section introduction |

Exit codes: `status` is 0, or 1 with `--check` when a listed language has a `stale` or `missing` file. `--mark`
is 1 when an item's translation file is missing (nothing written for that language,
`translate.missingFile`), 2 with neither an item nor `--all` (`translate.markNothing`). `--fix-anchors` is 1 when
a link could not be mapped — reported, never guessed — 0 otherwise. Calling `translate` with none of `status`,
`--mark` or `--fix-anchors` is also a usage error (exit code 2, `translate.usage`). See
[Documenting in multiple languages](#/spaces/languages).

## Further reading

- [Command line](#/reference/cli): global options and exit codes.
- [Commands: start and capture](#/reference/cli/start-capture).
- [Commands: write and check](#/reference/cli/write-check).
