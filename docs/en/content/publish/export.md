## The goal

Hand a documentation project over to another team, which can rebuild it **without the kit's repository**: the
content, the captures, the built site, and a copy of the engine, in one folder or one archive.

> [!RECIPE] What you need
> - A project whose strict build passes (`doc-kit build`) and whose checks are green (`doc-kit check all`).
> - The production session deleted, if there was one (`doc-kit connect --forget`).
> - A new or empty target folder.

## Who does what

| Step | Who | Result |
|---|---|---|
| 1. Final checks | The writer | Strict build, checks, audit at the target level |
| 2. Export | The writer | A self-contained folder, and an archive |
| 3. Rebuild | The receiving team | The same site, built from the copy |
| 4. Distribute | The owner | The HTML file where the readers can open it |

## Step 1 — Run the final checks

```bash
doc-kit build
doc-kit check all
doc-kit audit
doc-kit connect --forget
```

Look at one page per section in both themes and at one guided tour: `doc-kit view <page> --theme dark`,
`doc-kit view <page> --tour 2`.

## Step 2 — Export the project

```bash
doc-kit export ../acme-orders-docs --with-dist --zip
```

```text
⚠ version.file points outside the project (../../package.json): the copy shows the frozen version (version.fallback)
· not exported: package-lock.json
✔ ../acme-orders-docs: 26 project files + engine 0.1.0 vendored (172 files) · documented version 2.4.0
✔ archive ../acme-orders-docs.zip (0.5 MB)
```

| What | In the copy |
|---|---|
| The project's files | Everything but `node_modules/`, `.doc-kit/` (the session!), `.git/`, `.env` files, `package-lock.json`, logs, and `dist/` unless `--with-dist` |
| The engine | `vendor/doc-kit/`: engine, CLI, adapters, texts, schemas, templates, standard; no tests, examples, skill or documentation |
| `package.json` | Depends on `"doc-kit": "file:./vendor/doc-kit"` |
| `doc.config.mjs` | `version.fallback` set to the documented version, comments kept |
| `EXPORT.json` | Kit version, date, source folder, product, version, and the git commit when there is one |
| `README.md` | A "Standalone copy" section: how to rebuild, what needs the application |

Every configuration path that points outside the project (`version.file`, `masking.env`, coverage sources) is
reported: it will be missing in the copy.

## Step 3 — Rebuild the copy elsewhere

```bash
cd acme-orders-docs
npm install
npm run site
```

`npm run site` is `doc-kit build`, with the vendored engine. Node.js 20 or later is enough; Chromium is needed only
for the captures, `view` and the table check (`npx playwright install chromium`).

## Step 4 — Distribute the site

The deliverable is the HTML file of `dist/`. Above about 10 MB, do not attach it to an e-mail: share a link to a
document space, a repository or a static host. If the site shows real data, restrict its access to the people the
owner allows.

## How to check it works

- **The copy builds**: `npm install` then `npm run site` in the copy exit with code 0.
- **No secret travelled**: the copy has no `.doc-kit/` folder and no `.env` file.
- **The version is frozen**: `doc.config.mjs` of the copy has `fallback: "2.4.0"`; the site shows `v2.4.0`.
- **The archive opens**: `acme-orders-docs.zip` holds the same files as the folder.

## Common errors and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| "the folder … already exists and is not empty" | The target was used before | A new folder, or empty it |
| "the target is the project itself" | `doc-kit export .` | Export to another folder |
| "--with-dist: the site is not built" | No `dist/` file yet | `doc-kit build`, then export again |
| The copy shows an old version | `version.file` stayed behind | Update `version.fallback` in the copy when the application changes |

## Pitfalls and limits

> [!WARNING] What the copy cannot do alone
> The coverage check needs the application's code, and new captures need a running application. In the copy,
> both are documented as such in the README section; remove `coverage` there if the code is not available.

> [!NOTE] Updating the engine of a copy
> Replace `vendor/doc-kit/` with a newer kit, then run `npx doc-kit upgrade` to see the changes and apply the
> migrations ([Upgrade to a newer kit](#/migrate/upgrade)).

> [!NOTE] A project with spaces
> `--with-dist` copies the per-space exports wherever `build` wrote them, alongside the full site: a takeover
> dossier handed to one team never needs the business pages removed by hand ([Two spaces, one source](#/spaces/overview~exporting-where-confidentiality-actually-starts)).

> [!NOTE] The handover checklist
> `standard/delivery.md` lists everything to check before a handover: checks, safety, takeover content, export and
> distribution, each with its proof.

## Required permissions

> [!PERMISSIONS] Who does what
> - **Export**: read access to the documentation project; write access to the target folder.
> - **Rebuild**: Node.js and npm on the receiving machine; no access to the application.
> - **Distribute**: the owner decides who may read a site that shows real data.
