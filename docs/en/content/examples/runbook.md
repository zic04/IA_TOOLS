> [!NOTE] About this example
> This page is the example of the `runbook` template, written for Acme Orders, the kit's fictional product. Its `file:line` proofs point to a fictional code base.

## In short

`npm install && npm run dev` starts the whole stack locally, against a local Postgres. Production deploys automatically on every push to `main`; nothing is deployed by hand.

## Install

:::steps
1. **Install Node 20 and the dependencies**: `npm install`.
2. **Start a local Postgres**: `docker compose up -d db`, then `npx prisma migrate deploy`.
3. **Copy `.env.example` to `.env.local`**: fill in `DATABASE_URL`, `SESSION_SECRET` and `PAYMENT_KEY` (ask the Platform team for a sandbox key; never commit the file).
:::

## Build

`npm run build` produces the production bundle in `.next/`; it takes about 90 seconds and fails the pipeline if the type check fails.

## Deploy

:::steps
1. **Push to `main`**: the pipeline [[verified .github/workflows/deploy.yml:1]] builds the image, runs the database migrations, then updates the container app.
2. **Watch the rollout**: the cloud console shows the new revision at 100% traffic once its health check passes twice in a row.
:::

## Roll back

- Set traffic back to the previous revision from the cloud console (kept for 7 days). Migrations are additive (new tables and columns only): rolling back the code never needs a matching database rollback, but a migration that drops a column would — none has, so far ([[deduced prisma/migrations]]).

## Scheduled jobs

| Job | Schedule | What it does | Proof |
|---|---|---|---|
| Invoice job | Every 15 minutes | Generates invoices for shipped orders | [[verified jobs/invoiceJob.ts:1]] |
| Reminder job | Declared, never scheduled | Should e-mail approvers after 48 hours; see C1 of the findings | [[verified jobs/reminderJob.ts:38]] |
| Archive job | Nightly at 02:00 | Moves orders older than 2 years to cold storage | [[deduced infra/jobs.tf:30]] |

## Backup and restore

:::steps
1. **Backups**: the managed database takes a daily snapshot, kept 7 days (`infra/db.tf:22`); the deployment guide claims 35 days, which does not match (P2 of the findings).
2. **Restore**: from the cloud console, to a new instance; no restore has been tested since go-live ([[unknown]]) — schedule one before the handover is complete.
:::

## When it breaks

> [!NOTE] First reflexes
> - Check `/api/v1/health` first: it only checks that the process answers, not the database.
> - If orders stop getting invoiced, check the invoice job's run history before anything else (I5 of the findings: a failed run is silently skipped).
