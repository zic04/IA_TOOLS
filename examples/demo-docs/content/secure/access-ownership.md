## In short

Acme Orders is a demo: it ships with no production deployment and no team roster. The table below shows what a
real handover of this code would look like, filled in as far as the code itself answers.

## Who owns what

| Asset | Owner | Where | How to hand it over | Status |
|---|---|---|---|---|
| Repository | — | Wherever this kit's repository is cloned | Transfer or add a co-owner | Owner unknown |
| Hosting | — | None: `node serve.mjs` runs on a local machine only | N/A, no production host exists | Owner unknown |
| Session token | — | In memory only ([[verified serve.mjs:35]]), lost on every restart | Nothing to rotate: it is random and never persisted | Known |
| Demo data (`data.json`) | — | Committed with the repository | Edit the file, or call `POST /api/demo/reset` | Known |

## Secrets and where they live

Acme Orders holds no secret to rotate: there is no API key, password or signing key anywhere in the code. The
only per-session value is the random session token ([[verified serve.mjs:35]]), kept in a `Map` in the server's
memory and never written to disk ([[verified serve.mjs:21]]).

## Unknown owners

- Repository and hosting: a demo has no team to name; a real deployment would fill in a person or team here
  before anything else on this page matters.

## Handover checklist

:::steps
1. **Clone the repository** and run `node serve.mjs` to confirm it still starts.
2. **Decide who owns it**: even a demo benefits from one named maintainer.
3. **Read [the API surface](#/secure/api-surface)** before exposing it beyond a local machine: today, nothing
   checks who is allowed to do what.
:::
