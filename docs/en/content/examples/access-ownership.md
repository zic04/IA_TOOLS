> [!NOTE] About this example
> This page is the example of the `access-ownership` template, written for Acme Orders, the kit's fictional product. Its `file:line` proofs point to a fictional code base.

## In short

Half of what a takeover needs is already known: the repository, the hosting and the database have a named owner. The domain, the payment provider and two of the AI tool accounts used while building Acme Orders do not — start the handover with the checklist below.

## Who owns what

| Asset | Owner | Where | How to hand it over | Status |
|---|---|---|---|---|
| Domain `orders.example.org` | — | Registrar console | Transfer or add a new admin contact | Owner unknown |
| Repository | Priya Shah (Platform team) | GitHub, `acme/orders` | Add the new team as owners, then remove the old one | Known |
| Hosting (container app) | Platform team | Cloud console, resource group `rg-orders-prod` | Add the new team to the resource group's IAM | Known |
| Production database | Platform team | `infra/db.tf:1-22` | Reset the connection password, create one role per operator | Known |
| Payment provider account | — | Provider's dashboard | Find the billing contact first; the account holds live card tokens | Owner unknown |
| Transactional e-mail account | Platform team | Provider's dashboard | Rotate the API key, add the new team | Known |

## Secrets and where they live

| Secret | Where it lives | Proof | Status |
|---|---|---|---|
| Database password | CI variable `DB_PASSWORD` | [[verified infra/db.tf:6]] | To rotate at handover |
| Payment provider API key | Container app secret `PAYMENT_KEY` | [[verified infra/jobs.tf:14]] | To rotate; also exists in a teammate's password manager (to confirm and remove) |
| Signing key for session cookies | Container app secret `SESSION_SECRET` | [[deduced lib/auth/index.ts:1]] | To rotate |

## Accounts of the AI tools

| Tool | Account | Access | Owner |
|---|---|---|---|
| Claude Code | `ci-claude@example.org` | Repository (write), no cloud credentials found | Platform team |
| GitHub Copilot | Individual developer seats | Repository (read/write), tied to each developer's own account | — |

## Unknown owners

- Domain `orders.example.org`: find who holds the registrar account, or start a recovery with the registrar.
- Payment provider account: ask finance for the original signup e-mail before trying a password reset (it may lock the account).

## Handover checklist

:::steps
1. **Reset every shared secret**: database password, payment provider key, session signing key.
2. **Create one named account per operator**: remove the shared `ci-claude@example.org` login once replaced.
3. **Revoke the previous team's access**: repository, hosting, database, payment provider, once the new team confirms it works without them.
4. **Close the two "Owner unknown" rows**: domain and payment provider, before go-live of the new team.
:::
