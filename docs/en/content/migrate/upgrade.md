## The goal

Move a documentation project to a newer version of the kit: read what changed, see exactly what the kit would change
in the project, then apply it. The project's `kit` range then accepts the new version.

> [!RECIPE] What you need
> - The new kit installed (a newer copy of the repository, `npm ci`, and Chromium if Playwright changed).
> - The documentation project committed, so that the changes of the upgrade are easy to review.

## Who does what

| Step | Command | Result |
|---|---|---|
| 1. See | `doc-kit upgrade` | The changes since your version, the migrations, the diff; nothing written |
| 2. Apply | `doc-kit upgrade --apply` | The files changed, and `kit` set to `^<new version>` |
| 3. Check | `doc-kit doctor`, `doc-kit build`, `doc-kit audit` | The project works with the new kit |

## Step 1 — See what changes

```bash
doc-kit upgrade
```

```text
Project range ^0.0.1 (doc.config.mjs) · installed kit 0.1.0
⚠ the project requires ^0.0.1: kit 0.1.0 is refused until the upgrade is applied

Changes:
  [0.1.0] - 2026-10-01
    First public release.
    …

Migrations:
  ✔ 0.1.0 — baseline of the project format (no change)

1 file to change:
--- a/doc.config.mjs
+++ b/doc.config.mjs
@@ -2,7 +2,7 @@
 export default {
-  kit: "^0.0.1",
+  kit: "^0.1.0",
   product: { name: "Acme Orders", slug: "acme-orders" },

Nothing written (dry run). To apply: doc-kit upgrade --apply
```

- **Changes** are the entries of the kit's `CHANGELOG.md` newer than the base version of your range (`^0.0.1` →
  0.0.1) and not newer than the installed kit, newest first.
- **Migrations** are the scripts of the kit (`engine/migrations/<version>.mjs`) for the same versions, run **in
  memory**: the diff shows every file they would change.
- `doc-kit upgrade` works even when the range refuses the installed kit: it is precisely when it is needed.

## Step 2 — Apply

```bash
doc-kit upgrade --apply
```

`✔ 1 file updated; the project now requires kit ^0.1.0.` When a migration fails, nothing is written and the command
exits with code 1, naming the migration.

## Step 3 — Check the project

```bash
doc-kit doctor
doc-kit build
doc-kit audit
```

A newer kit may require new sections or report new warnings: the audit lists them, page by page.

## How to check it works

- **Range**: `doc.config.mjs` says `kit: "^<new version>"`; `doc-kit doctor` shows ✔ for the kit.
- **Idempotent**: `doc-kit upgrade` again says `the project is up to date`.
- **Build**: `doc-kit build` passes; captures taken with the old kit still work (the zone format is stable).
- **Skill**: `doc-kit doctor` reports an outdated Claude Code skill: `doc-kit skill install`.

## Common errors and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| "no CHANGELOG.md in the kit" | A copy of the engine without its changelog | The changes cannot be listed; the migrations still run |
| "migration 0.2.0 failed: …" | The project differs from what the migration expects | Nothing was written; report it with the project's `doc.config.mjs` |
| "Chromium for Playwright is not installed" | The new kit uses a newer Playwright | `npx playwright install chromium` in the kit |

## Pitfalls and limits

> [!WARNING] An exported copy
> A project exported with `doc-kit export` has its own engine in `vendor/doc-kit/`. Replace that folder with the
> new kit first, then run `npx doc-kit upgrade` in the copy.

> [!NOTE] Writing a migration
> A migration is `engine/migrations/<version>.mjs` in the kit: it exports `version` and
> `migrate({ files, config, root })`, reads and writes only through `files` (`read`, `write`, `exists`, `list`,
> `remove`, paths relative to the project), and is idempotent. Its title is the text `cli.migration.<version>`.
> `0.1.0.mjs` is the model: it changes nothing.

## Required permissions

> [!PERMISSIONS] What the upgrade needs
> - Write access to the documentation project (only with `--apply`).
> - Read access to the new kit.
