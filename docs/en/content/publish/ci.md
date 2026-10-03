## The goal

Every change to the documentation is built and checked by a pipeline: a missing page, a broken link, a legend that
no longer matches its capture or a secret in a page fails the job, and the built site and the audit report are kept
as artifacts.

> [!RECIPE] What you need
> - The documentation project in the application's repository (`docs/manual/`), with its captures **committed**.
> - Access, from the pipeline, to the kit's repository at a version the project's `kit` range accepts.
> - A Linux agent with Node.js 20 or later.
> - The two ready-made examples of the kit: `ci/github-actions.yml` and `ci/azure-pipelines.yml`. Each holds the
>   kit's own tests first, then the commented example for a documentation project.

## Who does what

| Step | Where | Result |
|---|---|---|
| 1. Make the kit available | The pipeline | The kit checked out next to the application, at the path of the `file:` dependency |
| 2. Install | The kit, then the documentation project | The kit's dependencies, Chromium, the project linked to the kit |
| 3. Build and check | The documentation project | Strict build, every check, the audit |
| 4. Publish | The pipeline | The site and `audit.md` as artifacts |

## Step 1 — Make the kit available

The project depends on the kit through `"doc-kit": "file:<path>"` in `docs/manual/package.json`. Check the kit out
at that path, relative to `docs/manual`. With the application in `app/` and the kit in `doc-kit/` of the workspace,
the path is `file:../../../doc-kit`.

```yaml
- uses: actions/checkout@v4
  with: { path: app }
- uses: actions/checkout@v4
  with: { repository: <owner>/doc-kit, ref: v0.3.0, path: doc-kit }
```

## Step 2 — Install the kit, Chromium and the project

```bash
cd doc-kit && npm ci && npx playwright install --with-deps chromium
cd ../app/docs/manual && npm install
```

Chromium is needed by `doc-kit check tables` and by the table measure of `doc-kit audit`; without it, run the other
checks one by one and the audit marks the tables "not measured".

## Step 3 — Build, check and audit

```bash
npx doc-kit build          # exit 1 on any error: nothing is written
npx doc-kit check all      # coverage, links, tables, images, secrets
npx doc-kit audit          # informative: exit 0, writes .doc-kit/audit.md
```

To require a maturity level, fail the job yourself:

```bash
npx doc-kit audit --json > audit.json
node -e "process.exit(require('./audit.json').level >= 3 ? 0 : 1)"
```

## Step 4 — Publish the artifacts

Keep `dist/` (the site) and `.doc-kit/audit.md` (the report) as artifacts of the job, even when a check fails: the
report says what to fix. The examples use `actions/upload-artifact` and `PublishPipelineArtifact`.

## How to check it works

- **A broken link fails the job**: change a link to `#/use/nothing` in a branch; the build step exits with code 1.
- **The artifact opens**: the `documentation` artifact holds `<Product>-Documentation.html`, which opens offline.
- **The report is there**: `audit.md` gives the level and the next actions.
- **No secret in the logs**: the job has no session file, no application address and no credentials.

## Common errors and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| "the project's dependencies are not installed" | `npm install` not run in `docs/manual`, or the `file:` path does not reach the kit | Check out the kit at the path of `package.json` |
| "the project requires kit ^1.0.0, but the installed kit is version 0.1.0" | The pipeline checks out another version of the kit | Check out a tag the `kit` range accepts, or run `doc-kit upgrade` |
| "Chromium browser not found for Playwright" | Step 2 skipped | `npx playwright install --with-deps chromium` in the kit |
| "coverage source not found" (skipped) | The application's code is not checked out | Check out the application next to its documentation |

## Pitfalls and limits

> [!WARNING] Never capture in a pipeline
> A capture needs a person who signs in, and the session is a secret: it does not belong in a pipeline, nor in its
> variables. Captures are taken on a workstation, reviewed, and committed with the content. The pipeline only
> builds and checks.

> [!NOTE] The kit's own CI
> The first part of each example file is the kit's CI: `npm ci`, `npx playwright install --with-deps chromium`,
> `npm test` and `npm run test:e2e`, on Linux, Windows and macOS.

## Required permissions

> [!PERMISSIONS] What the pipeline needs
> - Read access to the application's repository and to the kit's repository.
> - Write access to the pipeline's artifacts.
> - **No** access to the application itself: no URL, no account, no session.
