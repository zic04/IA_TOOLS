> [!NOTE] About this example
> This page is the example of the `journey` template, written for Acme Orders, the kit's fictional product. Its `file:line` proofs point to a fictional code base.

## In short

This journey follows an order of Acme Orders from its creation to its archiving, in six steps, according to the code of version 2.4.0 and the production observed on 30 September 2026. Four steps wait for a person: the sales rep, the approvers, the warehouse, the customer. Three scheduled tasks do the rest at night, and a fourth one, the reminder, was never scheduled.

> [!HOW] What happens when a sales rep submits an order?
> Less than you think. In the same request, the server resolves the approval chain, writes it, and e-mails the approvers of the first step (`lib/services/orderService.ts:139-142`). Then nothing moves until an approver opens their inbox. No reminder ever follows in production ([C1](#/examples/findings~c1-the-reminder-job-never-runs-in-production)).

## The diagram

::diagram{id="ex-journey-order" title="The six steps of an order, left to right. Solid line: chained by the code; dotted line: waits for a person; in orange, what depends on a scheduled task; in red, a scheduled task that never runs."}

## In this part

In these examples, only step 3 has its own page; on a real site, every row links to the page of its step.

| Step | Trigger | Automatic or human | What changes |
|---|---|---|---|
| 1. Creation | **Save** on a new order | Human | Order `DRAFT`; `order.create` |
| 2. Submission | **Submit for approval** | Human, then automatic | `PENDING_APPROVAL`; chain written; e-mail |
| [3. Approval](#/examples/journey-step) | **Approve** or **Reject** | Human | Steps decided; `APPROVED`, or back to `DRAFT` |
| 4. Invoicing | Shipment from the warehouse, then the invoice job | Automatic, scheduled task | `SHIPPED`; invoice `ISSUED`, with its PDF |
| 5. Payment | Bank import, or **Mark as paid** | Automatic or human | Invoice `PAID`, or `OVERDUE` after 30 days |
| 6. Archiving | The archive job | Scheduled task | `archived_at`; the order leaves the lists |

## The states

| Step | Order | Approval chain | Invoice |
|---|---|---|---|
| 1. Creation | `DRAFT` (**Open**) | — | — |
| 2. Submission | `PENDING_APPROVAL` (**Open**) | Created; first step `WAITING` (**Waiting**) | — |
| 3. Approval | `APPROVED` (**Open**), or `DRAFT` after a rejection | Steps `APPROVED` or `REJECTED` | — |
| 4. Invoicing | `SHIPPED` (**Shipped**) | — | `ISSUED` (**Issued**) |
| 5. Payment | `SHIPPED` (**Shipped**) | — | `PAID` (**Paid**), or `OVERDUE` (**Overdue**) |
| 6. Archiving | Unchanged, `archived_at` set | — | Unchanged |

An order can also be cancelled from any step before shipping: `CANCELLED` (**Cancelled**).

## What happens on its own, and what waits for someone

### On its own

- At submission, in the same request: the chain is resolved and written, and the approvers of the first step are e-mailed (`lib/services/approvalService.ts:63-80`).
- After each approval: the next step opens, and its approvers are e-mailed (`approvalService.ts:102-110`).
- At 02:00 UTC, scheduled: the invoice job invoices the orders shipped the day before (`jobs/invoiceJob.ts:20-35`).
- At 03:00 UTC, scheduled: the overdue job marks `OVERDUE` the invoices still unpaid 30 days after their issue (`jobs/overdueJob.ts:15`).
- At 04:00 UTC, scheduled: the archive job archives the orders paid more than 90 days ago (`jobs/archiveJob.ts:12`).
- Never: the reminders to approvers. The job exists in the code, but no scheduled task calls it ([C1](#/examples/findings~c1-the-reminder-job-never-runs-in-production)).

### Waits for a person

- **The sales rep**: **Save**, then **Submit for approval**.
- **Each approver**: **Approve** or **Reject** in [[menu Orders › Approvals]]; nobody reminds them.
- **The warehouse**: the shipment, sent by its system through `/api/v1/shipments`.
- **The customer, then Finance**: the payment, imported from the bank or entered with **Mark as paid**.

## Surprises to know about

1. **The list says Open during three different states.** A draft, an order pending approval and an approved order all show [[status open]]; see [the orders list](#/examples/screen~how-it-works).
2. **Submission e-mails the first approvers only.** In a sequential chain, Finance hears about the order only after the sales manager's decision; see [the approval step](#/examples/journey-step).
3. **No reminder ever leaves in production.** An order can wait for weeks without anybody being told ([C1](#/examples/findings~c1-the-reminder-job-never-runs-in-production)).
4. **Opening the approval chain can create it.** On an order that has none, the page writes the chain with the rules of the day of the visit ([I1](#/examples/findings~important-findings)).
5. **A resubmitted order keeps its old chain.** After a rejection, a new threshold does not apply to it ([I4](#/examples/findings~important-findings)).
6. **A role step accepts approvers from any region.** The decision does not check the scope ([C2](#/examples/findings~c2-approval-decisions-ignore-the-scope)).
7. **A failed invoice is never retried.** The order stays shipped, without invoice, and no alert reaches anybody ([I5](#/examples/findings~important-findings), [P4](#/examples/findings~production-findings)).
8. **The links of the e-mails open staging.** In production, `APP_URL` points to the wrong environment ([P1](#/examples/findings~production-findings)).

## Further reading

- [Journey step: approval](#/examples/journey-step): step 3 at code level, with its eleven lines of execution.
- [The orders list](#/examples/screen): where the order appears, with its grouped statuses.
- [Technical architecture document](#/examples/architecture): where the scheduled jobs, the database and the mail relay run.
- [Troubleshooting by symptom](#/examples/troubleshooting): when an order is stuck at one of these steps.
- [Findings](#/examples/findings): every finding cited on this page.
