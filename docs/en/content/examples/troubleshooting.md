> [!NOTE] About this example
> This page is the example of the `troubleshooting` template, written for Acme Orders, the kit's fictional product. Its `file:line` proofs point to a fictional code base.

## In short

This part starts from a symptom, in the words of the person who reports it, and leads in one minute to its likely cause, the check that settles it, the fix, and the page that explains the mechanism. It follows the code of version 2.4.0 and the production observed on 30 September 2026.

> [!HOW] Three reflexes before you search further
> - **A role changes at the next sign-in.** After a group change, ask the person to sign out and in again before anything else ([I3](#/examples/findings~important-findings)).
> - **"Not found" often means "not yours".** An order outside your region is answered "Order not found", never "forbidden" (`lib/services/orderService.ts:61-66`).
> - **A scheduled task may not have run.** Invoices are made at night only, and reminders never ([C1](#/examples/findings~c1-the-reminder-job-never-runs-in-production)). Check the `[jobs]` lines before you suspect the code.

## The diagram

::diagram{id="ex-troubleshooting" title="Where to start: the three preliminary questions, then the four families of symptoms, each with its typical symptoms. The highlighted family has its own page in these examples."}

## First of all: the checks that explain half the symptoms

| Check | Where to look | What is misleading |
|---|---|---|
| Is it the right account? | The name in the header; [[menu Administration › Users]] | The name comes from **Settings** and can be changed: two people can show the same name |
| Has the person signed in since the last role change? | **Last sign-in** in Users; the `auth.signin` entry | **Role** in Users is the configured role, not the one held by the session ([I3](#/examples/findings~important-findings)) |
| Is the order in the person's scope? | **Region** of the order and of the account | "Order not found" says nothing about the scope ([scope filtering](#/examples/technical~scope-filtering)) |
| Is the order archived? | The search, [[key Ctrl+K]] | An archived order leaves the list without notice |
| Has the scheduled job run? | The `[jobs] done` lines, query 2 below | The scheduler's history does not even list the reminders, which never run ([C1](#/examples/findings~c1-the-reminder-job-never-runs-in-production)) |
| Did the e-mail leave? | The `[mail]` lines, query 1 below | The audit log records the decision, not the e-mail |
| Which environment opened? | The address bar | The links of the e-mails open staging ([P1](#/examples/findings~production-findings)) |

## Where to look

### The administration screens

| Screen | What it tells |
|---|---|
| [[menu Administration › Users]] | **Last sign-in**, **Region**, **Role** and **Active** of each account |
| [[menu Administration › Roles]] | The identity provider groups mapped to each role |
| [[menu Administration › Approval chains]] | The active chain of each order type; **Test the rule** |
| [[menu Administration › Audit log]] | Every write, filtered by code, person or date |

### The audit log

| Code | What it proves |
|---|---|
| `auth.signin` | The person signed in, and the role they obtained |
| `auth.signin.denied` | A refused sign-in, with its reason: `no_role` or `no_groups_claim` |
| `order.submit` | The order left the draft |
| `approval.chain.create` | A chain was created: at submission, or by a visit to **Approval chain** ([I1](#/examples/findings~important-findings)) |
| `approval.decide` | A decision, with the step and the approver |
| `role.mapping.update` | A group was mapped to a role, or unmapped |
| `reminder.sent` | Never present in production ([C1](#/examples/findings~c1-the-reminder-job-never-runs-in-production)) |

### The server logs

| Prefix | Written by | When |
|---|---|---|
| `[auth]` | `lib/auth/index.ts:102` | A sign-in is refused, with `reason=`, or the callback fails |
| `[scope]` | `lib/scope.ts:41` | Someone asks for an object outside their scope |
| `[approval]` | `lib/services/approvalService.ts:75` | A chain is resolved, a step is decided |
| `[mail]` | `lib/mail/send.ts:48` | An e-mail is sent, or fails |
| `[jobs]` | `app/api/jobs/[job]/route.ts:30` | A job starts, ends (`done`) or fails |
| `[invoice]` | `jobs/invoiceJob.ts:57` | An invoice cannot be created |

### Ready-to-use queries

The server logs reach the log workspace of the deployment. These queries are written in the Kusto Query Language (KQL) of that workspace; the table `AppLogs` and its columns were checked, and each query was run, on 30 September 2026.

Query 1, the e-mails that failed in the last 24 hours:

```kusto
AppLogs
| where TimeGenerated > ago(24h)
| where Message has "[mail] send failed"
| project TimeGenerated, Replica, Message
| order by TimeGenerated desc
```

Query 2, the runs of each scheduled job, per day, over 7 days. `reminders` never appears ([C1](#/examples/findings~c1-the-reminder-job-never-runs-in-production)):

```kusto
AppLogs
| where TimeGenerated > ago(7d) and Message has "[jobs] done"
| extend Job = extract(@"job=(\w+)", 1, Message)
| summarize Runs = count() by Job, bin(TimeGenerated, 1d)
```

Query 3, the out-of-scope requests per person, over 24 hours:

```kusto
AppLogs
| where TimeGenerated > ago(24h) and Message has "[scope] denied"
| extend User = extract(@"user=(\S+)", 1, Message)
| summarize Denied = count() by User
| order by Denied desc
```

Query 4, the refused sign-ins and their reason, over 7 days:

```kusto
AppLogs
| where TimeGenerated > ago(7d) and Message has "[auth] denied"
| extend Reason = extract(@"reason=(\w+)", 1, Message)
| summarize Count = count() by Reason
```

## In this part

In these examples, only the first area has its own page; on a real site, every row links to its sub-page.

| Sub-page | Symptoms covered | Main findings |
|---|---|---|
| [1. Access](#/examples/troubleshooting-area) | "Access denied", a sign-in that loops, "Order not found", an empty list, a missing button, rights that do not change | C2, I3 |
| 2. Approvals | "No approver found", an order stuck pending, the wrong chain | C1, I1, I4 |
| 3. Invoices | Shipped but not invoiced, a missing PDF | I5, P4 |
| 4. E-mails | No e-mail, a link that opens another environment, e-mails in English | C1, P1, N1 |

## Further reading

- [Findings](#/examples/findings): every number cited on this page, with its proof and its recommendation.
- [End-to-end journey: an order](#/examples/journey): at which step an order waits, and for whom.
- [Journey step: approval](#/examples/journey-step): the messages of the approval, with their origin.
- [Technical architecture document](#/examples/architecture): where the log workspace and the scheduled jobs sit.
