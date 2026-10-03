## In short

<!-- guidance: the one or two commands that install and start the application locally, and who to call when the chain below does not apply. -->

Example: "`npm install && npm run dev` starts the whole stack locally; production deploys on every push to the main branch."

## Install

<!-- guidance: the exact commands, the versions they need (language runtime, database), and the files they read (an example env file → the real one). -->

:::steps
1. **Install the dependencies**: the package manager's install command.
2. **Copy the example env file**: fill in the values it names (never commit the real one).
:::

## Build

<!-- guidance: optional. The build command, what it produces, and how long it takes. -->

The build command produces the production bundle.

## Deploy

<!-- guidance: the real deployment path: a pipeline name, a manual command, a provider's dashboard, with the file:line of the pipeline definition. -->

:::steps
1. **Push to the main branch**: the pipeline [[verified path/file.yml:1]] builds and deploys automatically.
2. **Watch the deployment**: its dashboard, and what a healthy run looks like.
:::

## Roll back

<!-- guidance: how to undo a bad deploy: redeploy the previous version, a migration's own rollback, a feature flag. -->

- Redeploy the previous version from the provider's dashboard.

## Scheduled jobs

<!-- guidance: optional. Every cron job or scheduled task, what it does, and what happens when it fails silently. -->

| Job | Schedule | What it does | Proof |
|---|---|---|---|
| Example job | Daily | What it does | [[deduced path/file.ts]] |

## Backup and restore

<!-- guidance: where backups are taken, how often, and the actual restore procedure (tested or not). -->

:::steps
1. **Backups**: how often, and where they are kept.
2. **Restore**: the actual procedure, to a new instance, never in place.
:::

## When it breaks

<!-- guidance: optional. The first checks for the most frequent incidents, each with its fix. -->

> [!NOTE] First reflexes
> - Check the error tracker before anything else.
> - Confirm the database is reachable from the application's network.
