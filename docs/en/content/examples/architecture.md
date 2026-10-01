> [!NOTE] About this example
> This page is the example of the `architecture` template, written for Acme Orders, the kit's fictional product. Its `file:line` proofs point to a fictional code base.

## In short

This document describes the production setup of Acme Orders: what runs, where, how it is reached, and what it talks to. It is rebuilt from the cloud console, viewed read-only on 30 September 2026, from the infrastructure as code of the repository (`infra/`) and from the code of version 2.4.0. It does not replace an architecture document validated by the infrastructure team.

- **What runs**: one container app, `acme-orders-prd-app`, 2 replicas of the image `acme-orders:2.4.0` taken from the shared registry.
- **Scheduled work**: three scheduled jobs call the application at night: invoices, overdue, archive. The reminder job has no trigger ([C1](#/examples/findings~c1-the-reminder-job-never-runs-in-production)).
- **The data**: a managed PostgreSQL server and a storage account for the invoice PDFs, both reached through private endpoints.
- **The secrets**: one key vault, read by the platform at start-up with the managed identity; 6 references.
- **The network**: public HTTPS inbound on the container app only; outbound to the identity provider, the mail relay and the registry.
- **Outside the group**: the identity provider, the mail relay, the image registry, the partner systems.
- **Monitoring and backup**: one log workspace, one alert rule that notifies nobody ([P4](#/examples/findings~production-findings)); database backups kept 7 days ([P2](#/examples/findings~production-findings)).
- **12 numbered flows**, 2 of which are missing or do not work.

> [!NOTE] How to read this document
> - "**From the console**": observed on 30 September 2026.
> - "**Infrastructure as code**": planned by `infra/`; production may have drifted.
> - "**Inferred**": a conclusion drawn from these sources, not observed directly.
> - "**To be confirmed**": unknown; ask the infrastructure team.

## In this part

The detail of the deployment lives in two pages, which play the role of sub-pages of this document:

| Sub-page | What you will find there |
|---|---|
| [Environment variables](#/examples/variables) | The 22 variables of the container app, compared with the code; the vault references. |
| [Deployment resources](#/examples/resources) | The 19 resources of the group, by family, what uses each one, and the backups. |

## The diagram

::diagram{id="ex-architecture" title="Acme Orders in production. In the centre, the resource group: the container app, the scheduled jobs, and on the right the data reached through private endpoints. Outside: the users and partners on the left, the shared services at the top. The numbers point to the table of flows; dotted: a flow that is missing or does not work."}

## Numbered flows

| No. | From → to | Protocol | Authentication | Data and code |
|---|---|---|---|---|
| **#1** | Users → app | HTTPS 443 | Session cookie | Pages and server actions (`middleware.ts`) |
| **#2** | App → identity provider | HTTPS, OIDC | Client secret | Code and ID token (`lib/auth/index.ts:52`) |
| **#3** | App → mail relay | SMTP 587, STARTTLS | User and password | Approval and invoice e-mails (`lib/mail/send.ts:30`) |
| **#4** | Registry → platform | HTTPS | Managed identity | The image, at each deployment (from the console) |
| **#5** | App → PostgreSQL | TLS 5432, private endpoint | Password from the vault | All business data (`db/client.ts:9`) |
| **#6** | App → invoice storage | HTTPS, private endpoint | Managed identity | Invoice PDFs (`lib/storage/invoices.ts:8`) |
| **#7** | Platform → key vault | HTTPS, private endpoint | Managed identity | 6 references, at start-up (`infra/app.tf:58-71`) |
| **#8** | App → logs, telemetry | HTTPS | Connection string | Requests, traces, errors (`instrumentation.ts:6`) |
| **#9** | Scheduler → app | HTTPS, `/api/jobs/*` | Shared secret header | Invoices, overdue, archive (`infra/jobs.tf:8-40`) |
| **#10** | Scheduler → app, reminders | — | — | **Missing**: no trigger declared ([C1](#/examples/findings~c1-the-reminder-job-never-runs-in-production)) |
| **#11** | Partner systems → app | HTTPS, `/api/v1/*` | API key | Shipments and payments (`app/api/v1/`) |
| **#12** | Alert rule → operations | E-mail | — | **Not working**: a disabled mailbox, to be confirmed ([P4](#/examples/findings~production-findings)) |

> [!NOTE] What the table leaves open
> - **#1**: whether a gateway or a firewall sits in front of the container app (to be confirmed).
> - **#3**: whether the mail relay is reached on a public address or through the private network (to be confirmed).
> - **#4**: the console shows the tag of the image, not its digest; that the tag `2.4.0` matches the code read here is inferred.
> - **#11**: which partners still call; the database holds three active API keys (from a read-only query).

## Components

| Component | Production name | Role | Further reading |
|---|---|---|---|
| Container app | `acme-orders-prd-app` | Next.js server: pages, server actions, APIs | [Resources](#/examples/resources~compute) |
| Scheduled jobs | `acme-orders-prd-job-*` (3) | Call `/api/jobs/*` at night | [Journey](#/examples/journey) |
| PostgreSQL | `acme-orders-prd-pg` | Orders, approvals, invoices, users, audit log | [Resources](#/examples/resources~data) |
| Invoice storage | `acmeordersprdst` | Invoice PDFs | [Resources](#/examples/resources~data) |
| Key vault | `acme-orders-prd-kv` | 6 secrets | [Variables](#/examples/variables) |
| Log workspace | `acme-orders-prd-logs` | Logs, telemetry, the alert rule | [Troubleshooting](#/examples/troubleshooting~where-to-look) |

## What this document does not show

> [!NOTE] To confirm with the infrastructure team
> - **Access**: who holds which role on the group; this observation used a reader role only.
> - **Inbound**: a gateway or a firewall in front of the container app (flow #1).
> - **Outbound**: the path to the mail relay and to the identity provider, and whether a fixed outbound address exists for the partners.
> - **DNS and certificate**: who manages `orders.example.org`, and when its certificate is renewed.
> - **Registry**: how long old images are kept; a rollback depends on it.
> - **Backup**: the date of the last restore test, and whether the backups are copied to another region.
> - **Monitoring**: who should receive the alert on failed jobs (flow #12).

## Who manages what

> [!PERMISSIONS] Responsibilities
> - **Resources, network, variables, secrets, monitoring**: the infrastructure team, through the infrastructure as code (`infra/`) and its pipeline. A change made in the console only is lost at the next deployment, and P2 is such a drift.
> - **Application image**: the Acme Orders development team builds it in its pipeline and deploys it by changing the tag.
> - **Registration at the identity provider, groups**: the identity team.
> - **Mail relay, registry, private DNS zones**: the platform team.
> - **Settings stored in the database**: the application's administrators, in [[menu Administration › Roles]], [[menu Administration › Approval chains]] and [[menu Administration › Users]].
