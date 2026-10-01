> [!NOTE] About this example
> This page is the example of the `recipe` template, written for Acme Orders, the kit's fictional product. Its `file:line` proofs point to a fictional code base.

## The goal

Orders of 10,000 or more, before tax, are approved by the sales manager of the sales rep, then by Finance. Below 10,000, the sales manager alone approves, as today. The recipe chains four actors: the identity administrator creates the Finance group outside Acme Orders, an administrator of Acme Orders maps it to the **Finance** role and adds a step to the approval chain, the approvers sign in again, and a test order proves the whole chain.

> [!RECIPE] What you need
> - An administrator account of Acme Orders, with [[perm users:manage]] and [[perm approvals:configure]].
> - Someone who can create groups and edit the registration of Acme Orders at the identity provider.
> - The list of the Finance approvers, and the threshold agreed with Finance: 10,000 here.
> - A test sales rep account with [[perm orders:write]], in a region that has a sales manager.

## Who does what

::diagram{id="ex-recipe-actors" title="The four actors in the order of the steps. Left of the dotted line, outside the application; right of it, in Acme Orders. Each actor hands over to the next one."}

## Step 1 — Create the Finance group in the identity provider

In the identity provider's console, create a security group named `acme-orders-finance`. Note its **identifier**, which the provider shows on the group's page: step 4 needs it. Acme Orders compares identifiers, not names, so renaming the group later breaks nothing (`lib/auth/roles.ts:40-46`).

**When it worked**: the group exists, with its identifier, and no member yet.

## Step 2 — Add the approvers to the group

Add the Finance approvers as members of `acme-orders-finance`. Add only the people who must approve: the **Finance** role also sees the orders of every region.

**When it worked**: the group page lists the approvers.

## Step 3 — Send the groups in the token

In the registration of Acme Orders at the provider, make the ID token carry the groups of the person, in a claim named `groups`, limited to the groups assigned to the application. Assign `acme-orders-finance` to the application. Acme Orders reads the claim named by `AUTH_GROUPS_CLAIM`, `groups` by default (`lib/auth/roles.ts:12`).

**When it worked**: on the token preview of the provider, the claim `groups` holds the identifier of step 1 for a member.

## Step 4 — Map the group to the Finance role

In Acme Orders, open [[menu Administration › Roles]] ([[route /admin/roles]]), click the **Finance** role, then **Add group** under **Identity provider groups**. Paste the identifier of step 1 and click **Save**. The detail of the roles is on the [Sign-in](#/examples/technical-sub~mapping-groups-to-roles) page.

**When it worked**: the **Finance** role lists the identifier, and the audit log holds a `role.mapping.update` entry.

## Step 5 — Add the Finance step to the approval chain

Open [[menu Administration › Approval chains]] ([[route /admin/approval-chains]]) and click the active chain of the **Standard** order type. Below the step **Manager of the sales rep**, click **Add step**, then set **Approver** to **Role**, choose **Finance**, and type `10000` in **Minimum amount**. Leave **Mode** on **Sequential** and click **Save**.

**When it worked**: the chain shows two steps, the second one with "From 10,000". The change applies to the orders submitted from now on.

## Step 6 — Test the rule

On the same chain, click **Test the rule**, type an amount, and click **Run**. The test writes nothing: it runs the resolution of the chain on a fictitious order (`lib/approvals/chain.ts:142-160`).

**When it worked**: 9,999 gives one step; 10,000 and 12,000 give two steps, the sales manager first, then **Finance**.

## Step 7 — Have the approvers sign in again

Ask each Finance approver to click **Sign out**, then to sign in again. The role is read at sign-in and kept in the session for up to 8 hours ([I3](#/examples/findings~important-findings)).

**When it worked**: [[menu Administration › Audit log]] shows an `auth.signin` entry for each approver, with the role `finance`.

## Step 8 — Check with a test order

With the test sales rep account, create an order of 12,000 before tax, click **Save**, then **Submit for approval**. Approve it as the sales manager, then as a Finance approver, in [[menu Orders › Approvals]].

**When it worked**: the order reaches `APPROVED` after the second decision. The [approval step](#/examples/journey-step) describes what runs at each click.

## How to check it works

- **Roles**: in [[menu Administration › Roles]], **Finance** lists the identifier of `acme-orders-finance`.
- **Test the rule**: 9,999 gives one step; 10,000 gives two, **Finance** second.
- **Audit log**: one `auth.signin` per approver with the role `finance`, after step 7.
- **Approval chain** of the test order: two steps, **Manager of the sales rep** then **Finance**, the second one **Waiting** after the first decision.
- **Approvals inbox** of a Finance approver: the test order appears only once the sales manager has approved it.
- **The order**: `APPROVED` after the Finance decision, and back to `DRAFT` if Finance clicks **Reject**.

## Common errors and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| "Access denied: your account has no role in Acme Orders" | The token carries no `groups` claim (`roles.ts:24-30`) | Redo step 3 |
| "No approver found for step 2" at submission | No active account holds the **Finance** role yet (`chain.ts:131`) | Redo step 7, then submit again |
| The test order shows one step | The amount is below 10,000 before tax, or the order type is not **Standard** | Use 12,000 before tax on a **Standard** order |
| "You are not allowed to perform this action" on **Approve** | The session still holds the former role ([I3](#/examples/findings~important-findings)) | Sign out, then sign in |
| The Finance approver gets no e-mail | The e-mail leaves only when the Finance step opens, after the sales manager's decision | Approve the first step, then check [[menu Orders › Approvals]] |

## Pitfalls and limits

> [!WARNING] Orders already pending keep their old chain
> The chain is copied onto the order at submission (`lib/services/approvalService.ts:63-71`). An order of 50,000 submitted before step 5 is approved without Finance. List the orders pending approval before you change the chain.

> [!WARNING] The new role waits for the next sign-in
> Steps 2 and 4 change nothing for an approver who is already signed in, for up to 8 hours. Step 7 is not optional ([I3](#/examples/findings~important-findings)).

> [!WARNING] The threshold compares the amount before tax
> **Minimum amount** is compared with the amount of the lines before tax, inclusive (`lib/approvals/chain.ts:124`). An order of 9,500 before tax and 11,400 with tax goes without Finance.

> [!NOTE] Observed gaps (v2.4.0)
> - An order rejected by Finance, then submitted again, keeps the chain of its first submission ([I4](#/examples/findings~important-findings), `approvalService.ts:141-150`).
> - Nothing reminds a Finance approver who does not act: the reminder job never runs in production ([C1](#/examples/findings~c1-the-reminder-job-never-runs-in-production)).
> - **Test the rule** ignores the order type of the chain under test and always simulates a **Standard** order (`chain.ts:146`).

## Required permissions

> [!PERMISSIONS] Who can do what in this recipe
> - **Outside the application** (steps 1 to 3): the identity administrator, who can create groups, manage their members and edit the registration of Acme Orders.
> - **Map the group** (step 4): [[perm users:manage]], held by the **Administrator** role.
> - **Edit and test the chain** (steps 5 and 6): [[perm approvals:configure]], held by the **Administrator** role.
> - **Check** (step 8): the test sales rep needs [[perm orders:write]]; the sales manager and the Finance approvers need [[perm orders:approve]]; reading the audit log needs [[perm audit:read]].
