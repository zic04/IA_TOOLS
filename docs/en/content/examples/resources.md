> [!NOTE] About this example
> This page is the example of the `resources` template, written for Acme Orders, the kit's fictional product. Its `file:line` proofs point to a fictional code base.

## In short

The production deployment of Acme Orders holds in one resource group, `rg-acme-orders-prd`, in one region of Western Europe, observed read-only in the cloud console on 30 September 2026. It counts 19 resources in five families. The whole application runs in a single container app; everything else holds its data, its secrets or its logs.

| Family | Count | Resources |
|---|---|---|
| Compute | 5 | The container environment, the container app, 3 scheduled jobs |
| Data | 4 | A PostgreSQL server, 3 storage accounts, one of them unused |
| Secrets and identity | 2 | A key vault, a managed identity |
| Network | 4 | A virtual network, 3 private endpoints |
| Monitoring | 4 | A log workspace, the telemetry, an alert rule, an action group |

> [!NOTE] Where these resources come from
> - **Created by the infrastructure as code** of the repository (`infra/`): all of them, except the one below.
> - **Created by hand**: `acmeordersprdold`, the storage account of version 1, which no code of version 2.4.0 uses ([P3](#/examples/findings~production-findings)).
> - **Provided by the platform team**, outside this group: the private DNS zones and the image registry.
> - **Created automatically by the cloud provider**: the network interfaces of the private endpoints, not counted here.

## Compute

| Resource | Type | Role | Used by |
|---|---|---|---|
| `acme-orders-prd-env` | Container environment | Hosts the app and the jobs; attached to the virtual network | `infra/app.tf:5-18` |
| `acme-orders-prd-app` | Container app | Next.js server, 2 replicas, image `acme-orders:2.4.0` | Users, partners and jobs (flows #1, #9, #11) |
| `acme-orders-prd-job-invoices` | Scheduled job | Calls `/api/jobs/invoices` at 02:00 UTC | `infra/jobs.tf:8-19` |
| `acme-orders-prd-job-overdue` | Scheduled job | Calls `/api/jobs/overdue` at 03:00 UTC | `infra/jobs.tf:20-29` |
| `acme-orders-prd-job-archive` | Scheduled job | Calls `/api/jobs/archive` at 04:00 UTC | `infra/jobs.tf:30-40` |

No scheduled job calls `/api/jobs/reminders`: the reminders never run ([C1](#/examples/findings~c1-the-reminder-job-never-runs-in-production)).

## Data

| Resource | Type | Role | Used by |
|---|---|---|---|
| `acme-orders-prd-pg` | Managed PostgreSQL | Orders, approvals, invoices, users, audit log; public access off | `DATABASE_URL` (`db/client.ts:9`) |
| `acmeordersprdst` | Storage account | Invoice PDFs in the container `invoices`; locally redundant; public access off | `lib/storage/invoices.ts:8`, with the managed identity |
| `acmeorderstfstate` | Storage account | State of the infrastructure as code; versioning on | The infrastructure pipeline only |
| `acmeordersprdold` | Storage account | Files of version 1, read by nothing since version 2.0 | Nothing; the managed identity can still write to it ([P3](#/examples/findings~production-findings)) |

## Secrets and identity

| Resource | Type | Role | Used by |
|---|---|---|---|
| `acme-orders-prd-kv` | Key vault | Six secrets, by name: `auth-secret`, `oidc-client-secret`, `database-url`, `smtp-password`, `jobs-secret`, `telemetry-connection` | The 6 references of the container app ([variables](#/examples/variables)) |
| `id-acme-orders-prd` | Managed identity | Reads the vault, pulls the image, writes the invoice storage | The container app and the jobs |

The OIDC client secret expires at the identity provider, and the identity team renews it. The other secrets have no expiry date (to be confirmed); nothing renews them.

## Network

| Resource | Type | Role | Used by |
|---|---|---|---|
| `acme-orders-prd-vnet` | Virtual network | Two subnets: the container environment, the private endpoints | `infra/network.tf:4-31` |
| `pe-acme-orders-pg` | Private endpoint | Private address of the PostgreSQL server | Flow #5 |
| `pe-acme-orders-st` | Private endpoint | Private address of the invoice storage | Flow #6 |
| `pe-acme-orders-kv` | Private endpoint | Private address of the key vault | Flow #7 |

Inbound, the container app has a public HTTPS address; whether a gateway sits in front of it is to be confirmed. Outbound traffic goes to the identity provider, the mail relay and the registry; its path and its address are to be confirmed.

## Monitoring

| Resource | Type | Role | Used by |
|---|---|---|---|
| `acme-orders-prd-logs` | Log workspace | Console logs of the app and the jobs, kept 30 days | The platform; the [ready-to-use queries](#/examples/troubleshooting~ready-to-use-queries) |
| `acme-orders-prd-telemetry` | Application telemetry | Requests, dependencies, errors | `TELEMETRY_CONNECTION_STRING` (`instrumentation.ts:6`) |
| `alert-jobs-failed` | Alert rule | Fires on a `[jobs] failed` line, checked every 15 minutes | Reads the log workspace |
| `ag-acme-orders-ops` | Action group | E-mails the operations team | A disabled mailbox, to be confirmed ([P4](#/examples/findings~production-findings)) |

## Backup

| Data | What backs it up | What it does not protect |
|---|---|---|
| Database | Automatic backups, point-in-time restore, kept **7 days** ([P2](#/examples/findings~production-findings)) | A mistake found after 7 days; the loss of the region (no copy elsewhere, to be confirmed) |
| Invoice PDFs | Soft delete, 7 days; no versioning | An overwritten PDF. It can be rebuilt from the database, but with today's template (`lib/invoices/pdf.ts:20`) |
| Secrets | Soft delete, 90 days, purge protection | — |
| Infrastructure state | Versioning of the blobs | — |
| Logs | Nothing; 30-day retention | Anything older than 30 days |

## Comparison with the documentation

`docs/DEPLOYMENT.md`, last changed for version 2.0, differs from production on four points:

| The documentation says | Observed |
|---|---|
| Backups kept 35 days | 7 days ([P2](#/examples/findings~production-findings)) |
| A cache server | None in the group |
| One storage account | Three, one of them unused ([P3](#/examples/findings~production-findings)) |
| Reminders every hour | No reminder job ([C1](#/examples/findings~c1-the-reminder-job-never-runs-in-production)) |

## What the application uses outside this group

- **The identity provider**: the registration of Acme Orders and its groups, owned by the identity team (see [Sign-in](#/examples/technical-sub)).
- **The mail relay**: the organisation's SMTP relay; Acme Orders sends with a single account.
- **The image registry**: the shared registry of the platform team, `registry.example.org/acme-orders`.
- **The private DNS zones**: managed by the platform team; without them, the private endpoints do not resolve.
- **The partner systems**: the warehouse and the bank import, which call `/api/v1/*` with an API key.
- **The operations mailbox**: the target of the alert rule ([P4](#/examples/findings~production-findings)).
