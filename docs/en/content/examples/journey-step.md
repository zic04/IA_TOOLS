> [!NOTE] About this example
> This page is the example of the `journey-step` template, written for Acme Orders, the kit's fictional product. Its `file:line` proofs point to a fictional code base.

## In short

- **Trigger**: a click on **Submit for approval** on the order record, never the save of a draft (`app/(app)/orders/[id]/SubmitButton.tsx:21`). Each decision of an approver then moves the step on.
- **Actors**: the sales rep who submits, with [[perm orders:write]]; then each approver, with [[perm orders:approve]].
- **Synchronous**: the resolution of the chain and every write run in one transaction of the submit request. The e-mail leaves after the commit, with no retry (`lib/services/approvalService.ts:74-80`).
- **Duration**: the request takes under a second. The step lasts until the last approver decides, and nothing reminds them in production ([C1](#/examples/findings~c1-the-reminder-job-never-runs-in-production)).
- **Result**: the order is `APPROVED`, or back to `DRAFT` after a rejection; every decision is in the audit log.

## What happens, step by step

According to the code of version 2.4.0:

:::steps
1. **The click.** `SubmitButton` calls the server action `submitOrder(orderId)` (`app/(app)/orders/[id]/actions.ts:14`).
2. **The guards.** The server checks [[perm orders:write]], loads the order through `scopeWhere`, and requires a `DRAFT` with at least one line (`lib/services/orderService.ts:121-133`).
3. **The chain.** `resolveChain(order)` takes the active chain of the order type. With none, it applies the built-in rule: one step, the manager of the sales rep (`lib/approvals/chain.ts:88-97`).
4. **The steps.** `buildSteps` compares each **Minimum amount** with the amount before tax, marks `SKIPPED` the steps the order does not reach, and resolves each approver to people (`chain.ts:118-131`).
5. **The write.** In one transaction: the order becomes `PENDING_APPROVAL`, the chain is written with a copy of its rules, and the first kept step becomes `WAITING` (`lib/services/approvalService.ts:63-71`).
6. **The audit.** `order.submit` and `approval.chain.create` are written in the same transaction (`lib/audit.ts:22`).
7. **The e-mail.** After the commit, each approver of the first step receives "Order #{id} awaits your approval", with a link built from `APP_URL` (`lib/mail/links.ts:6`, [P1](#/examples/findings~production-findings)). A failure writes `[mail] send failed` and is not retried.
8. **The decision.** In [[menu Orders › Approvals]], an approver clicks **Approve** or **Reject**; a rejection requires a comment. `decide(stepId, decision)` checks [[perm orders:approve]] and that the person may approve the waiting step, but not the scope of the order (`approvalService.ts:88-97`, [C2](#/examples/findings~c2-approval-decisions-ignore-the-scope)).
9. **The next step.** On **Approve**, the next kept step becomes `WAITING` and its approvers are e-mailed, as in step 7 (`approvalService.ts:102-110`).
10. **The end.** When the last step is approved, the order becomes `APPROVED`. On **Reject**, the step becomes `REJECTED` and the order goes back to `DRAFT`, keeping its chain ([I4](#/examples/findings~important-findings), `approvalService.ts:141-150`). Both write `approval.decide`.
11. **The reminder that never comes.** `jobs/reminderJob.ts:38-44` would e-mail the approvers of a step waiting for more than 24 hours, but no scheduled task calls it in production ([C1](#/examples/findings~c1-the-reminder-job-never-runs-in-production)).
:::

### The four cases of approval chain

| Case | When | Steps kept | E-mailed first |
|---|---|---|---|
| None | No active chain for the order type | One: the manager of the sales rep | That manager |
| Single | A chain with one step | That step | Its approvers |
| Sequential | A chain with several steps | All, one `WAITING` at a time | The approvers of the first step |
| By amount | Steps with a **Minimum amount** | Those the amount before tax reaches; the others `SKIPPED` | The approvers of the first kept step |

## What is read and written

| Where | What | When |
|---|---|---|
| `orders` | `status`, `submitted_at` | Step 5; then step 10 |
| `approval_chains` | The chain and the copy of its rules, `rules_json` | Step 5 |
| `approval_steps` | One row per step: `status`, approvers, decision, comment | Step 5; then steps 8 to 10 |
| `audit_log` | `order.submit`, `approval.chain.create`, `approval.decide` | Steps 6, 8 and 10 |
| Mail relay | One e-mail per approver of the step that opens | Steps 7 and 9, after the commit |
| Server log | `[approval]` and `[mail]` lines | At each step |

## The states

| Status | Displayed label | What to do |
|---|---|---|
| `PENDING_APPROVAL` | **Open** | Wait; follow the progress on **Approval chain** |
| `APPROVED` | **Open** | Nothing here: the warehouse can ship |
| `DRAFT`, after a rejection | **Open** | Read the comment on **Approval chain**, fix the order, submit again |
| Step `WAITING` | **Waiting** | The approvers of that step decide |
| Step `APPROVED`, `REJECTED` | **Approved**, **Rejected** | Nothing |
| Step `SKIPPED` | **Skipped** | Nothing: the amount is below the step's threshold |

## What the user sees

:::screen{capture="order-detail" title="Orders › Order #1041"}
1. **Order #1041**. The order number, which is also its address ([[route /orders/1041]]). The heading shows no status and no step.
2. **Details**. **Customer**, **Status**, **Date**, **Lines** (the number of lines) and **Amount**, before tax: the amount that the thresholds of the chain compare. **Status** shows [[status open]] for a draft, an order pending approval and an approved order alike.
3. **Approval chain**. Opens [[route /orders/[id]/approval]]: the steps, their approvers and their decisions. As the note next to the link says, opening it creates the chain on the server when the order has none ([I1](#/examples/findings~important-findings)).
:::

What the record does not show:
- which step is waiting, and for whom: open **Approval chain**;
- whether the e-mail to the approvers left: only the server log knows;
- a decision made meanwhile: nothing refreshes until you reload.

The **Approve** and **Reject** buttons are in the approvers' inbox, [[menu Orders › Approvals]] ([[route /approvals]]), which has no capture in these examples.

## When things go wrong

| Message | Origin | Recovery |
|---|---|---|
| "This order has no lines" | Step 2, `orderService.ts:129` | Add a line, then submit again |
| "Only a draft can be submitted" | Step 2: a double click, or an order already submitted (`orderService.ts:125`) | Reload the record |
| "No approver found for step {n}" | Step 4: no active account behind a role or a person (`chain.ts:131`) | Fix the chain or the account, then submit again |
| "You are not allowed to perform this action" | Step 8: missing permission, or not an approver of the waiting step (`approvalService.ts:92`) | Check the role; sign in again ([I3](#/examples/findings~important-findings)) |
| "This step has already been decided" | Step 8: two approvers of the same step at once (`approvalService.ts:99`) | Reload; the first decision stands |
| "A comment is required to reject" | Step 8, `lib/validation/approval.ts:8` | Write the reason |
| "Order not found" | Step 2 or 8: the order is out of your scope (`orderService.ts:61-66`) | Ask an approver of its region |

> [!WARNING] What is left half-written
> - **The e-mail failed**: the order is `PENDING_APPROVAL` and the step `WAITING`, but nobody knows. There is no **Resend** button; the approver must open [[menu Orders › Approvals]] by themselves.
> - **The chain was created by a visit**: an order with no chain, opened on **Approval chain**, gets one with the rules of that day, and its approvers are e-mailed ([I1](#/examples/findings~important-findings)).

## Further reading

- [End-to-end journey: an order](#/examples/journey): the six steps; the next one, **4. Invoicing**, has no page in these examples.
- [Security](#/examples/technical~scope-filtering): the scope, and why the decision escapes it.
- [The orders list](#/examples/screen): where the order shows **Open** during the whole step.
- [Approve large orders in two steps](#/examples/recipe): the recipe that adds a step by amount.
- [Troubleshooting: access](#/examples/troubleshooting-area~acting-and-changing-permissions): "You are not allowed to perform this action".
