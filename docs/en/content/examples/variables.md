> [!NOTE] About this example
> This page is the example of the `variables` template, written for Acme Orders, the kit's fictional product. Its `file:line` proofs point to a fictional code base.

## In short

The variables of Acme Orders are declared on the container app `acme-orders-prd-app`, in its environment settings. This page gives their names, sources and expected values; it never copies a value.

- **22** variables are declared, **6** of them references to the key vault `acme-orders-prd-kv`.
- **19** are read by the code of version 2.4.0. `NODE_ENV` and `PORT` serve the framework and the platform; `LOG_LEVEL` is read by nothing ([N2](#/examples/findings~findings-with-no-effect)).
- One value is wrong: `APP_URL` points to staging ([P1](#/examples/findings~production-findings)). One has no effect: `REMINDER_DELAY_HOURS` is read by a job that never runs ([C1](#/examples/findings~c1-the-reminder-job-never-runs-in-production)).
- Two variables read by the code are missing: `SESSION_MAX_AGE`, so sessions last 8 hours ([I3](#/examples/findings~important-findings)), and `STORAGE_CONTAINER`, whose default is right.

> [!NOTE] The sources of this page
> - **Cloud console**: names and sources of the variables of `acme-orders-prd-app`, observed read-only on 30 September 2026. Values were not copied.
> - **Code**: every read cited with its file and line, version 2.4.0.
> - **Infrastructure as code**: `infra/app.tf:40-96`, the planned values, which are not observed values.

## The variables, one by one

### Authentication (6)

| Variable | Source | Read by the code | Role and expected value | Remark |
|---|---|---|---|---|
| `AUTH_URL` | Service | `lib/auth/index.ts:18` | Public address: `https://orders.example.org` | Must match the callback registered at the provider |
| `AUTH_SECRET` | Vault | `lib/auth/index.ts:21` | Encrypts the session cookie; 32 bytes or more | Renewing it signs everybody out |
| `AUTH_OIDC_ISSUER` | Service | `lib/auth/index.ts:27` | Address of the provider's tenant | — |
| `AUTH_OIDC_CLIENT_ID` | Service | `lib/auth/index.ts:28` | Identifier of the registration, a GUID | Not copied here |
| `AUTH_OIDC_CLIENT_SECRET` | Vault | `lib/auth/index.ts:29` | Secret of the registration | Expires at the provider: date to be confirmed |
| `AUTH_GROUPS_CLAIM` | Service | `lib/auth/roles.ts:12` | Claim that holds the groups; default `groups` | Set to its default |

### Database (2)

| Variable | Source | Read by the code | Role and expected value | Remark |
|---|---|---|---|---|
| `DATABASE_URL` | Vault | `db/client.ts:9` | PostgreSQL connection string, with `sslmode=require` | Holds the password: never paste it in a ticket |
| `DATABASE_POOL_MAX` | Service | `db/client.ts:14` | Connections per replica; default 10 | Set to 20: 2 replicas use 40 of the server's 50 |

### Storage (1)

| Variable | Source | Read by the code | Role and expected value | Remark |
|---|---|---|---|---|
| `STORAGE_ACCOUNT_URL` | Service | `lib/storage/invoices.ts:8` | Address of `acmeordersprdst` | Access by the managed identity, no key |

### Mail (5)

| Variable | Source | Read by the code | Role and expected value | Remark |
|---|---|---|---|---|
| `SMTP_HOST` | Service | `lib/mail/send.ts:14` | The organisation's mail relay | — |
| `SMTP_PORT` | Service | `lib/mail/send.ts:15` | `587`; default 587 | STARTTLS required (`send.ts:18`) |
| `SMTP_USER` | Service | `lib/mail/send.ts:16` | Account of Acme Orders on the relay | — |
| `SMTP_PASSWORD` | Vault | `lib/mail/send.ts:17` | Password of that account | — |
| `MAIL_FROM` | Service | `lib/mail/send.ts:22` | Sender: `orders@example.org` | Replies go there: mailbox to be confirmed |

### Jobs and links (4)

| Variable | Source | Read by the code | Role and expected value | Remark |
|---|---|---|---|---|
| `JOBS_SECRET` | Vault | `app/api/jobs/[job]/route.ts:11` | Shared with the 3 scheduled jobs | Renew both sides together |
| `REMINDER_DELAY_HOURS` | Service | `jobs/reminderJob.ts:12` | Hours before a reminder; default 24 | No effect: the job never runs ([C1](#/examples/findings~c1-the-reminder-job-never-runs-in-production)) |
| `APP_URL` | Service | `lib/mail/links.ts:6` | Base of the links in e-mails: `https://orders.example.org` | Points to staging ([P1](#/examples/findings~production-findings)) |
| `PUBLIC_API_URL` | Service | `app/(app)/settings/page.tsx:27` | Shown as **Integration** in **Settings** | `https://orders.example.org/api/v1` |

### Platform and monitoring (4)

| Variable | Source | Read by the code | Role and expected value | Remark |
|---|---|---|---|---|
| `NODE_ENV` | Service | The framework | `production` | — |
| `PORT` | Service | The platform | `3000`, the port of the container | Must match the ingress |
| `LOG_LEVEL` | Service | Nothing | — | No effect ([N2](#/examples/findings~findings-with-no-effect)) |
| `TELEMETRY_CONNECTION_STRING` | Vault | `instrumentation.ts:6` | Destination of the traces | If missing: no telemetry, and no error |

## Missing or ineffective

| Variable | Finding | Consequence |
|---|---|---|
| `SESSION_MAX_AGE` | Missing; read at `lib/auth/index.ts:71` | Default 28,800 seconds: sessions last 8 hours, and a removed group keeps working that long ([I3](#/examples/findings~important-findings)) |
| `STORAGE_CONTAINER` | Missing; read at `lib/storage/invoices.ts:9` | Default `invoices`, the real name of the container: no effect today |
| `LOG_LEVEL` | Declared, read by nothing | Raising the level during an incident changes nothing ([N2](#/examples/findings~findings-with-no-effect)) |
| `REMINDER_DELAY_HOURS` | Declared, read by a job that never runs | No reminder, whatever the value ([C1](#/examples/findings~c1-the-reminder-job-never-runs-in-production)) |
| `APP_URL` | Declared with a wrong value | The links of every e-mail open staging ([P1](#/examples/findings~production-findings)) |

## To check

:::steps
1. **`APP_URL`**: its value must be `https://orders.example.org` ([P1](#/examples/findings~production-findings)).
2. **Vault references**: each of the 6 must show as resolved. Note the date of the latest version of each secret, above all `AUTH_OIDC_CLIENT_SECRET`, whose expiry is set at the provider.
3. **`DATABASE_POOL_MAX` × replicas**: the product must stay under the connection limit of the PostgreSQL server, 50 today.
4. **Missing variables**: decide on `SESSION_MAX_AGE` with the security owner ([I3](#/examples/findings~important-findings)).
5. **Infrastructure as code**: compare the list with `infra/app.tf:40-96`; a variable added in the console only is lost at the next deployment.
:::
