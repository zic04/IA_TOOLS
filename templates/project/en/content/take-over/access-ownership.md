## In short

<!-- guidance: who to contact first for what (business owner, technical owner, on-call), and the overall confidence in the ownership map below: fully known, partly, mostly unknown. -->

One or two sentences, then the confidence in this page.

## Who owns what

<!-- guidance: one row per asset: domain, repository, hosting, CI/CD, database, payment, e-mail, each AI tool account. "Owner" is a real name or team; when only a role is known, say so under "Status" instead of inventing a name. -->

| Asset | Owner | Where | How to hand it over | Status |
|---|---|---|---|---|
| Production database | — | `host:port` | Reset the password, create one account per operator | Owner unknown |

## Secrets and where they live

<!-- guidance: optional. Every place a secret is kept (vault, CI variables, a production .env file, a teammate's password manager) — never the value itself. Run `doc-kit facts --source secrets` first, then cross-reference it here. -->

| Secret | Where it lives | Status |
|---|---|---|
| Example secret | CI variable `NAME` | To rotate |

## Accounts of the AI tools

<!-- guidance: optional. Every AI coding assistant account used on this codebase (Claude Code, Copilot, Cursor…), who holds it, and what access it carries (repository, cloud, package registry). -->

| Tool | Account | Access | Owner |
|---|---|---|---|
| Example tool | — | Repository (write) | Unknown |

## Unknown owners

<!-- guidance: the list the handover checklist below exists to empty: every asset of "Who owns what" whose owner is "—" or "Unknown", repeated here so it cannot be missed. -->

- Asset with no known owner: what to do to find one.

## Handover checklist

<!-- guidance: optional. The concrete steps to actually receive what is listed above: reset shared secrets, create named accounts, revoke the departing team's access, confirm every "Unknown owners" row has closed. -->

:::steps
1. **Reset every shared secret**: database, third-party APIs, signing keys.
2. **Create one named account per operator**: no more shared logins.
3. **Revoke the previous team's access**: once the new one confirms it works without them.
:::
