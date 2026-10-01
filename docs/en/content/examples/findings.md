> [!NOTE] About this example
> This page is the example of the `findings` template, written for Acme Orders, the kit's fictional product. Its `file:line` proofs point to a fictional code base.

## How to read this page

This page is the work list of whoever takes Acme Orders over: the gaps, risks and debts found at takeover, each one re-checked in the code of version 2.4.0 on 30 September 2026. The production findings come from the cloud console, viewed read-only the same day, and from a read-only export of the production audit log.

| Severity | Definition | Count |
|---|---|---|
| **Critical** | A current risk for data security, confidentiality or the product's core promise; to address before any other change | 2 |
| **Important** | A real defect, a possible bypass, a broken or misleading feature; to schedule quickly | 5 |
| **Minor** | Debt, inconsistency, display or hygiene; to address along the way | 3 |

Findings are numbered **C** (critical), **I** (important) and **M** (minor). Two families are added, with their severity in a column: **P**, specific to production (the real configuration differs from what the code expects), 4 findings, and **N**, settings and screens with no effect, 2 findings. A number never changes: a new finding takes the next free number of its family.

## The essentials in one minute

:::steps
1. **Declare the reminder trigger**: approvers have never received a reminder in production (C1).
2. **Check the scope in approval decisions**: an approver can decide on an order of another region (C2).
3. **Correct `APP_URL` and the alert**: the links of the e-mails open staging, and failed jobs alert nobody (P1, P4).
4. **Make invoices and data recoverable**: retry the failed invoices and restore a 35-day backup retention (I5, P2).
5. **Stop writing on a GET**: create the approval chain at submission only (I1).
:::

## In this part

At about 1,300 words, the findings stay on one page. Beyond about 2,000 words, move each family to its own sub-page, and turn the links of this table into links to those sub-pages.

| Family | What you will find there |
|---|---|
| [Critical findings](#/examples/findings~critical-findings) | C1 and C2, each in detail: finding, impact, recommendation. |
| [Important findings](#/examples/findings~important-findings) | I1 to I5, one row each. |
| [Minor findings](#/examples/findings~minor-findings) | M1 to M3. |
| [Production findings](#/examples/findings~production-findings) | P1 to P4, with their severity. |
| [Findings with no effect](#/examples/findings~findings-with-no-effect) | N1 and N2, with their severity. |

## Critical findings

### C1 — The reminder job never runs in production

**Finding**: the reminder job exists (`jobs/reminderJob.ts:38-44`) and the jobs endpoint knows it (`app/api/jobs/[job]/route.ts:12-16`). But the infrastructure as code declares only three scheduled jobs: invoices, overdue and archive (`infra/jobs.tf:8-40`). Nothing ever calls `/api/jobs/reminders`, and the production audit log holds no `reminder.sent` entry since go-live.

**Impact**: approvers are e-mailed once, when their step opens. A missed or lost e-mail leaves the order pending with nobody warned. The approval workflow is the core promise of the product.

**Recommendation**: declare a fourth scheduled job, hourly, in `infra/jobs.tf`; check the first `reminder.sent` entries; add the job to the alert rule (P4).

### C2 — Approval decisions ignore the scope

**Finding**: for a step given to a role, `decide` (`lib/services/approvalService.ts:88-97`) accepts any holder of the role, from any region. It checks [[perm orders:approve]] but never calls `scopeWhere`, unlike every other read. Step ids are sequential integers.

**Impact**: a sales manager can approve or reject an order of another region, without seeing it, by calling the server action with a guessed step id. The decision is recorded as legitimate in the audit log.

**Recommendation**: load the step through `scopeWhere`, as every other read does, and add one test per role.

## Important findings

| No. | Point | Where | Finding and impact | Recommendation |
|---|---|---|---|---|
| **I1** | Opening the approval chain writes | `app/(app)/orders/[id]/approval/page.tsx:22-31` | A GET request creates the chain of an order that has none, with the rules of the day, and e-mails its approvers. A link preview or a capture tool can do it. | Create the chain at submission only; make the page read-only |
| **I2** | **Today** is not about today | `app/(app)/orders/TodayPanel.tsx:14-22` | The panel sums the rows shown, any date, cancelled orders included. Managers read it as the day's figures. | Rename it, or compute the day's figures on the server |
| **I3** | A role change waits for the next sign-in | `lib/auth/index.ts:64-71` | The role is frozen in the session for 8 hours. A person removed from a group keeps their rights until then. | Re-read the role at each request, or shorten the session |
| **I4** | A resubmitted order keeps its old chain | `lib/services/approvalService.ts:141-150` | After a rejection, the order reuses its chain and its copy of the rules. A threshold added in between does not apply. | Build a new chain at each submission |
| **I5** | A failed invoice is never retried | `jobs/invoiceJob.ts:52-60` | An error is logged and skipped, and the next run takes only the orders shipped the day before. The order stays shipped without invoice. | Select every shipped order without invoice |

## Minor findings

| No. | Point | Where | Finding and impact | Recommendation |
|---|---|---|---|---|
| **M1** | The filters are lost | `app/(app)/orders/OrdersFilters.tsx:18` | The filters live in the page state, not in the address: coming back from an order resets them. | Keep them in the query string |
| **M2** | A name of spaces is accepted | `lib/validation/profile.ts:6` | The length is checked before trimming; the header then shows no name. | Trim first, then check |
| **M3** | **System** theme read once | `app/ThemeScript.tsx:12` | The device's mode is read when a page loads; a change during the visit is ignored. | Listen to the change of colour scheme |

## Production findings

| No. | Point | Severity | Finding and impact | Recommendation |
|---|---|---|---|---|
| **P1** | `APP_URL` points to staging | Important | Set to the staging address on the container app; every link of every e-mail opens staging (`lib/mail/links.ts:6`). | Set it to `https://orders.example.org` |
| **P2** | Backups kept 7 days | Important | The database keeps 7 days of backups; `infra/db.tf:22` and `docs/DEPLOYMENT.md` say 35. A mistake found after a week cannot be undone. | Apply the infrastructure as code again |
| **P3** | An unused storage account | Minor | `acmeordersprdold` holds the files of version 1, read by nothing, but the application's identity can still write to it. | Remove the role, then the account |
| **P4** | The alert on failed jobs notifies nobody | Important | `alert-jobs-failed` sends to an action group whose only address is a disabled mailbox (to be confirmed). Failures such as I5 go unnoticed. | Point it to a monitored address, then test it |

## Findings with no effect

| No. | Point | Severity | Finding and impact | Recommendation |
|---|---|---|---|---|
| **N1** | **Language** does not reach the e-mails | Minor | **Settings › Language** changes the interface only; every e-mail is sent in English (`lib/mail/send.ts:22`). | Pass the recipient's language to the templates |
| **N2** | `LOG_LEVEL` is never read | Minor | Declared on the container app, but the logger has a fixed level (`lib/log.ts:5`). Raising it during an incident does nothing. | Read it, or remove it |

## Findings already fixed

| Original finding | Proof |
|---|---|
| Orders of another region found by the search (audit of March 2025) | `scopeWhere` called in `lib/services/searchService.ts:31`, since version 2.2.0 |
| Session cookie without the `Secure` flag (audit of March 2025) | `lib/auth/index.ts:80` |
| Invoice PDFs readable by their address without a session (audit of March 2025) | The route checks the session, `invoices:read` and the scope (`app/api/invoices/[id]/pdf/route.ts:14-22`) |

## What could not be checked

- The registration of Acme Orders at the identity provider: the groups sent, the redirect addresses, the expiry of its secret. Ask the identity team.
- Whether the mailbox of the alert is really disabled (P4). Ask the operations team.
- A restore of the database: none was observed. Ask the infrastructure team for the date of the last restore test.
- The partner systems: the database holds three active API keys, but nobody could say which partner holds each one. Ask the head of sales operations.

## Existing documentation to stop following

| Document | State | Replaced by |
|---|---|---|
| `docs/DEPLOYMENT.md` | Describes a cache server that does not exist and a 35-day backup that is not applied | [Deployment resources](#/examples/resources) |
| `docs/SECURITY.md` | Gives a one-hour session; it lasts 8 hours | [Sign-in](#/examples/technical-sub~the-session) |
| `docs/APPROVALS.md` | Says that a rejection cancels the order; it goes back to draft | [Journey step: approval](#/examples/journey-step) |
