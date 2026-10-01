## In short

Most applications need a sign-in. `doc-kit connect` opens the application in a **visible** Chromium window, **you**
sign in (single sign-on and multi-factor authentication work: it is a real browser), and the kit saves the session.
Every later `doc-kit capture` reuses it, headless, until it expires.

1. **The session is a file**: `.doc-kit/session.json`, a Playwright storage state (cookies and local storage).
2. **It is a secret**: as long as it is valid, it gives access to the application with your rights.
3. **It never leaves the work folder**: `.doc-kit/` gets its own `.gitignore` that ignores everything, and
   `doc-kit check secrets` reports a session file found anywhere else or tracked by git.
4. **Delete it when you are done**: `doc-kit connect --forget`.

## Signing in with `connect`

```bash
doc-kit connect
```

:::steps
1. The kit opens the application at `auth.start` (default `/`): `A Chromium window is open on http://127.0.0.1:4173:
   sign in there (SSO and MFA work).`
2. Sign in as usual, in that window. On the demo application, any e-mail and password are accepted.
3. Back in the terminal, press Enter (with the `manual` adapter). The `nextauth` and `api-me` adapters detect the
   sign-in by themselves.
4. The kit asks the adapter whether a tab of the window is signed in, then saves the session: `✔ Session saved:
   .doc-kit/session.json`.
:::

If you press Enter too early, the kit says `not signed in yet (still on a sign-in page)` and waits again. It gives up
after 15 minutes, or when the window is closed.

| Option | Effect |
|---|---|
| `--url <url>` | Opens another address than `app.url` (another environment) |
| `--forget` | Deletes the session file and exits |

## When a page is a sign-in page

A page is considered a **sign-in page** when it leaves the application's origin (an identity provider), or when its
path and query match `auth.loginPattern` (default `login|signin|sign-in|oauth|authorize`, case ignored). A 401 answer
counts as signed out too. This rule is used by `connect`, by the session check before a capture, and during the
capture itself.

## Expiry

| Moment | What happens | Exit code |
|---|---|---|
| Before the first capture | The kit opens `auth.start` with the session; a sign-in page means it has expired: `the session has expired (sign-in page: …)` | 3 |
| During the run | A capture lands on a sign-in page: the run stops, the captures already taken are kept | 3 |
| `doc-kit doctor` | Reports the session's age: ⚠ after 24 hours, and ⚠ expired when every cookie that has an expiry date is past | — |

Sign in again with `doc-kit connect`, then capture the remaining ids. Never work around an expiry.

## Where the session lives

| Setting | Effect |
|---|---|
| default | `.doc-kit/session.json` in the documentation project |
| `<PREFIX>_SESSION` or `DOC_KIT_SESSION` | Another file, relative to the project: one session per environment |
| `auth.adapter: "none"` | No session at all: `connect` has nothing to do, `capture` never loads one |
| `doc-kit capture --no-session` | One run without the session (public pages) |

## The authentication adapters

| Adapter | Session recognised when | `connect` |
|---|---|---|
| `manual` (default) | The application does not send the browser to a sign-in page | You press Enter |
| `none` | Always (public application) | Nothing to do |
| `nextauth` | `GET /api/auth/session` (option `endpoint`) answers a user | Detects by itself |
| `api-me` | `GET /api/me` (option `url`) answers JSON with the `proof` field (default `id`) | Detects by itself |

Every adapter also accepts `start`, `loginPattern` and `browser` (`chromium`, or `chrome` for the installed Google
Chrome, useful behind a bot challenge). See [Adapters](#/reference/adapters) to write your own.

## Pitfalls and observed gaps

> [!WARNING] Never a shared account
> Sign in with an account that is yours, with the rights needed to see the screens. The session gives these rights
> to whoever holds the file: never copy it, show it, attach it to a ticket or pass it to someone else.

> [!NOTE] No terminal, no Enter
> In a pipe or a CI job, `connect` with the `manual` adapter stops: "no terminal to press Enter in". Use an adapter
> that detects the session, or sign in from a terminal. Captures do not belong in CI anyway.

> [!NOTE] Bot challenges
> A "Just a moment…" interstitial page is waited for up to 20 s. If it never clears, set the adapter's `browser`
> option to `chrome`, sign in again, and capture with the same browser.

## Further reading

- [Demo or production](#/capture/safety): the read-only lock that comes with a session.
- [The first five minutes](#/start/first-five-minutes): `connect` on the demo application.
- [Capture and session problems](#/faq/troubleshooting/capture): the messages and their fix.
