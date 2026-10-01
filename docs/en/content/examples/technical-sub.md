> [!NOTE] About this example
> This page is the example of the `technical-sub` template, written for Acme Orders, the kit's fictional product. Its `file:line` proofs point to a fictional code base.

::diagram{id="ex-sign-in" title="The sign-in flow in eight messages, numbered as the steps below. Read from top to bottom; each arrow goes from the sender to the receiver; in the brand colour, what the Acme Orders server does on its own."}

## The sign-in flow

According to the code of version 2.4.0, a sign-in takes eight steps, the same as on the diagram:

:::steps
1. **No session.** The middleware finds no `acme_session` cookie and redirects to [[route /login]], keeping the requested address in `next` (`middleware.ts:24-29`).
2. **To the provider.** **Sign in** starts an OpenID Connect flow with PKCE, a `state` and a `nonce` (`lib/auth/index.ts:33-41`). In production, Acme Orders has no password form; the e-mail and password form exists only in the demo mode (`lib/auth/index.ts:45`).
3. **At the provider.** The person signs in with the provider's own rules, such as multi-factor authentication. Acme Orders sees none of it.
4. **Back with a code.** The provider redirects to [[route /api/auth/callback/oidc]] with a one-time code.
5. **The callback.** The browser calls the callback; the server checks the `state` (`lib/auth/index.ts:50`).
6. **The token.** The server exchanges the code for an ID token, with `AUTH_OIDC_CLIENT_SECRET`, then checks its signature, issuer, audience and `nonce` (`lib/auth/index.ts:52-60`).
7. **The user and the role.** The `users` row is created at the first sign-in, then updated: the e-mail from the `email` claim, the name from `name` unless the person changed it in **Settings** (`lib/auth/index.ts:84-92`). The groups are mapped to one role (see [mapping groups to roles](#/examples/technical-sub~mapping-groups-to-roles)).
8. **The session.** The server sets the `acme_session` cookie and redirects to `next`, or to [[route /orders]]. It writes `auth.signin`, with the role obtained (`lib/auth/index.ts:96-104`).
:::

## The identity provider

| Setting | Effect |
|---|---|
| `AUTH_OIDC_ISSUER` | Address of the provider's tenant; its discovery document is read at start-up (`lib/auth/index.ts:27`) |
| `AUTH_OIDC_CLIENT_ID` | Identifier of Acme Orders at the provider (`:28`) |
| `AUTH_OIDC_CLIENT_SECRET` | Reference to the key vault; used only by the server, at step 6 (`:29`) |
| `AUTH_URL` | Public address of Acme Orders; it builds the callback address, which must be registered at the provider exactly (`:18`) |
| Scopes `openid profile email` | Fixed in the code (`:36`); the groups come from the token configuration of the registration, not from a scope |

The registration at the provider belongs to the identity team (see [who manages what](#/examples/architecture~who-manages-what)). Its secret expires there; Acme Orders shows no warning before it does.

## Mapping groups to roles

The ID token carries the identifiers of the person's groups, in the claim named by `AUTH_GROUPS_CLAIM`, `groups` by default (`lib/auth/roles.ts:12`). `mapRole` (`roles.ts:40-58`) compares them with the table `role_group_mappings`, which administrators edit in [[menu Administration › Roles]].

| Value | Effect |
|---|---|
| No mapped group | Sign-in refused: "Access denied: your account has no role in Acme Orders"; `auth.signin.denied`, reason `no_role` |
| One mapped group | Its role |
| Several mapped groups | The highest role wins: **Administrator**, then **Finance**, **Sales manager**, **Sales rep**; permissions are not added up (`roles.ts:52-58`) |
| No `groups` claim in the token | Refused as well, reason `no_groups_claim`; the server log writes `[auth] no groups claim` (`roles.ts:24-30`) |

The region, which sets the scope, does not come from the provider: an administrator sets it in [[menu Administration › Users]].

## The session

| Value | Effect |
|---|---|
| Cookie `acme_session` | Encrypted with `AUTH_SECRET`; `HttpOnly`, `Secure`, `SameSite=Lax` (`lib/auth/index.ts:76-82`) |
| Lifetime | `SESSION_MAX_AGE` seconds, **28,800 by default** (8 hours); not extended by activity (`:71`) |
| Contents | User id, role and region, frozen at sign-in |
| **Sign out** | Deletes the cookie only; the provider's session remains, so the next sign-in may not ask for a password |

> [!WARNING] A group change waits for the next sign-in
> The role is in the cookie. Adding someone to a group, or removing them, changes nothing for up to 8 hours, until they sign in again ([I3](#/examples/findings~important-findings)). To cut access at once, deactivate the account in [[menu Administration › Users]].

## Further reading

- [Security](#/examples/technical): the parent page and the four other mechanisms.
- [Approve large orders in two steps](#/examples/recipe): a recipe that maps a new group to a role.
- [Troubleshooting: access](#/examples/troubleshooting-area): "Access denied", sign-in loops, rights that do not change.
- [Environment variables](#/examples/variables): the authentication variables declared in production.
