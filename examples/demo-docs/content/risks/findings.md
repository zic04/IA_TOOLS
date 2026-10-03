## How to read this page

This is the work list of whoever takes Acme Orders over: the gaps found in version 1.4.0, re-checked directly
in `serve.mjs` and the files under `public/`. There is no production deployment, so no finding here comes from
anywhere but the code.

| Severity | Definition | Count |
|---|---|---|
| **Critical** | A current risk for data security or the product's core promise; to address before any other change | 1 |
| **Important** | A real defect, a possible bypass, or a broken feature; to schedule quickly | 1 |
| **Minor** | Debt, inconsistency or a setting with no effect; to address along the way | 1 |

Findings are numbered **C** (critical), **I** (important) and **M** (minor). A number never changes: a new
finding takes the next free number of its family.

## The essentials in one minute

:::steps
1. **Add a role check**: any signed-in person can use every feature of Acme Orders today (C1).
2. **Stop writing on a GET**: opening a link should never create data (I1).
3. **Wire up the theme setting, or remove it**: it is saved but has no effect (M1).
:::

## Findings

### C1 — No access control

**Finding**: the only check before any action is "is someone signed in" ([[verified serve.mjs:46]]); nothing
checks what that person is allowed to do. [[feature F-02]] names [[perm orders:approve]] as a separate
permission from [[perm orders:read]], but the server never tells the two apart.

**Impact**: any signed-in person can read every order, change the profile, and open — and so create — any
order's approval chain. The [roles and permissions](#/features/roles) page describes the model Acme Orders
does not yet enforce.

**Recommendation**: attach a role to each session ([[verified serve.mjs:36]]) and check it before every action,
starting with [[perm orders:approve]].

Owner: Demo maintainers · Decision: Fix · Status: Open · Due: —

### I1 — Opening the approval chain writes on a GET

**Finding**: visiting `/orders/<id>/approval` creates the order's approval chain and records a write, whether
the visit was deliberate or not ([[verified serve.mjs:59]]). The order page even prefetches this route in the
background as soon as it loads ([[verified order.html:22]], [[verified app.js:16]]), so the chain is created
before anyone clicks anything.

**Impact**: a link preview, a crawler, or doc-kit's own read-only capture (blocked only because this route is
declared in `capture.forbidden`) can trigger the same write. [[rule BR-02]] describes this as intentional
business behaviour, but a GET request creating data is still a risk for anyone who forwards the link.

**Recommendation**: create the chain when the order is submitted, not when the link is opened; make the
approval page a plain read.

Owner: Demo maintainers · Decision: Fix · Status: Open · Due: —

### M1 — The theme setting has no effect

**Finding**: **Settings → Theme** offers Light, Dark and System, and the choice is saved
([[verified app.js:55]]). Nothing reads it back: `app.js:51` only writes the saved value into the select, and
`style.css` defines no dark variant at all.

**Impact**: none beyond confusion — the setting looks like it should change the page, and does not.

**Recommendation**: either implement a dark variant of `style.css`, or remove the setting until one exists.

Owner: Demo maintainers · Decision: Accept · Status: Open · Due: —

## What could not be checked

- Whether a real deployment of Acme Orders would sit behind a reverse proxy or a load balancer: this demo only
  ever runs with `node serve.mjs` on a local machine.
