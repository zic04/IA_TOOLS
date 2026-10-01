> [!NOTE] About this example
> This page is the example of the `troubleshooting-area` template, written for Acme Orders, the kit's fictional product. Its `file:line` proofs point to a fictional code base.

## In short

Four mechanisms explain almost every access problem in Acme Orders, according to the code of version 2.4.0:

- **The browser hides, the server decides**: a missing button proves nothing, and a visible one proves nothing either; the server checks the permission on every action (`lib/permissions.ts:51-60`).
- **The role is read at sign-in**: a group change waits for the next sign-in, up to 8 hours later (`lib/auth/index.ts:64-71`, [I3](#/examples/findings~important-findings)).
- **Out of scope is "not found"**: the server never answers "forbidden" for an order of another region (`lib/services/orderService.ts:61-66`).
- **No mapped group, no access**: Acme Orders has no default role (`lib/auth/roles.ts:40-46`).

## Signing in

### "Access denied: your account has no role in Acme Orders"

- **Likely causes**
  1. None of the person's groups is mapped to a role in [[menu Administration › Roles]] (`lib/auth/roles.ts:40-46`).
  2. The ID token carries no `groups` claim: the registration at the identity provider does not send it (`roles.ts:24-30`).
- **Check**: the audit entry `auth.signin.denied` and its reason, `no_role` or `no_groups_claim`; query 4 of [Troubleshooting by symptom](#/examples/troubleshooting~ready-to-use-queries).
- **Fix**: map the person's group to a role (cause 1), or ask the identity team to send the groups in the token (cause 2); then sign in again.
- **Understand**: [mapping groups to roles](#/examples/technical-sub~mapping-groups-to-roles).

### "I sign in and land on the sign-in page again"

- **Likely causes**
  1. The address in the browser is not the one set in `AUTH_URL`, so the cookie belongs to another host (`lib/auth/index.ts:18`). A link from an e-mail that opens staging does exactly that ([P1](#/examples/findings~production-findings)).
  2. The browser blocks the cookies of the site.
- **Check**: the address bar before and after **Sign in**; the `[auth] callback` lines of the server log.
- **Fix**: open `https://orders.example.org` directly; have `APP_URL` corrected (P1).
- **Understand**: [the sign-in flow](#/examples/technical-sub~the-sign-in-flow).

## Seeing

### "Order not found" for an order that exists

- **Likely causes**
  1. The order belongs to another region than the person's (`lib/services/orderService.ts:61-66`).
  2. The number comes from another environment: an e-mail link to staging shows numbers that production does not have ([P1](#/examples/findings~production-findings)).
- **Check**: a `[scope] denied` line with the person and the order, [query 3](#/examples/troubleshooting~ready-to-use-queries); the **Region** of the order and of the account.
- **Fix**: hand the order to someone of its region, or have an administrator correct the person's **Region**.
- **Understand**: [scope filtering](#/examples/technical~scope-filtering).

### "The orders list is empty"

- **Likely causes**
  1. The account has no **Region**: a new account sees no order until an administrator sets one (`lib/scope.ts:18`).
  2. The filters of the list hide every row.
- **Check**: **Region** in [[menu Administration › Users]]; a `[scope] no region` line in the server log.
- **Fix**: set the region, then reload [[menu Orders › All orders]]; or clear the three filters.
- **Understand**: [the orders list](#/examples/screen~how-it-works).

### "The New order button is missing"

- **Likely causes**
  1. The role has no [[perm orders:write]]; **Finance** has none (`app/(app)/orders/page.tsx:58`).
  2. The session still holds the former role ([I3](#/examples/findings~important-findings)).
- **Check**: the latest `auth.signin` entry of the person, and the role it gave.
- **Fix**: map the right group, then sign in again.
- **Understand**: [permissions and roles](#/examples/technical~permissions-and-roles).

## Acting and changing permissions

### "You are not allowed to perform this action"

- **Likely causes**
  1. The role lacks the permission of the action (`lib/permissions.ts:51-60`).
  2. On **Approve**: the person is not an approver of the step that is waiting. In a sequential chain, Finance waits for the sales manager (`lib/services/approvalService.ts:92`).
  3. The account was deactivated (`permissions.ts:44`).
- **Check**: the **Approval chain** page of the order, to see which step is **Waiting**; **Active** in Users.
- **Fix**: wait for the earlier step; otherwise correct the role or reactivate the account.
- **Understand**: [the approval step](#/examples/journey-step~what-happens-step-by-step).

### "I was added to Finance, and I still cannot approve"

- **Likely causes**
  1. The session still holds the former role, for up to 8 hours ([I3](#/examples/findings~important-findings), `lib/auth/index.ts:64-71`).
  2. The group was created at the identity provider but not mapped in [[menu Administration › Roles]].
- **Check**: an `auth.signin` entry after the change, and the role it gave.
- **Fix**: **Sign out**, then sign in; map the group if the role is still wrong.
- **Understand**: [the session](#/examples/technical-sub~the-session).

### "Someone who left can still approve"

- **Likely causes**
  1. They were removed from the group at the identity provider only: their session stays valid for up to 8 hours ([I3](#/examples/findings~important-findings)).
  2. A step given to a role accepts holders of that role from any region ([C2](#/examples/findings~c2-approval-decisions-ignore-the-scope)).
- **Check**: the `approval.decide` entries of that person in the audit log.
- **Fix**: deactivate the account in [[menu Administration › Users]]; it takes effect at their next action (`lib/permissions.ts:44`).
- **Understand**: [security](#/examples/technical~permissions-and-roles).

## Further reading

- [Troubleshooting by symptom](#/examples/troubleshooting): the parent page, the first checks and the log queries.
- [Security](#/examples/technical) and [Sign-in](#/examples/technical-sub): the mechanisms behind these symptoms.
- [Journey step: approval](#/examples/journey-step): who may decide, at which step.
- [Findings](#/examples/findings): C2 and I3 in detail.
