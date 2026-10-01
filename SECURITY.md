# Security

## Reporting a vulnerability

Please **do not open a public issue** for a vulnerability. Report it privately to the maintainers, through the
private vulnerability reporting of the platform that hosts the repository (for example a private security advisory).
If the platform offers no private channel, open a public issue that only asks the maintainers to contact you, without
any detail of the vulnerability. Include the kit version (`doc-kit --version`), the operating system, what you did, what
happened, and, when possible, a minimal project that reproduces it — built on the fictional demo of `examples/`,
never on a real application or with a real session.

The maintainers acknowledge each report and keep the reporter informed until a fix is released. Only the latest
release receives security fixes.

## What doc-kit protects, and what it does not

doc-kit signs in to real applications, sometimes in production, and turns what it sees into a file that people
share. Its safety rests on the rules below. Know their limits.

### The session file is a secret

`doc-kit connect` saves the browser's cookies and local storage (a Playwright storage state) in
`.doc-kit/session.json`, or in the file named by `<PREFIX>_SESSION` / `DOC_KIT_SESSION`. **As long as it is valid,
this file gives access to the application with the rights of the person who signed in.**

- `.doc-kit/` gets its own `.gitignore` that ignores everything; the file is made readable by its owner only where
  the system allows it.
- `doc-kit doctor` reports a session file tracked by git; `doc-kit check secrets` reports a session file found
  anywhere else in the project, or tracked by git.
- `doc-kit export` never copies `.doc-kit/`.
- Never copy, show, attach or pass the file on — not in a ticket, not to a colleague, not to an agent, not to a CI
  pipeline. Delete it at the end of a campaign: `doc-kit connect --forget`. If it leaked, sign out of the application
  (or revoke the session on the identity provider) to invalidate it.

### Read-only captures have limits

With a session, `doc-kit capture` aborts **in the browser** every request other than `GET`, `HEAD` and `OPTIONS`, and
counts them. This does not cover:

- **writes made by the server while it renders a page** requested with a `GET` (a record created when a detail page
  opens, a notification sent): the browser cannot see them. Read the server code of a page before opening it, and
  list such routes in `capture.forbidden`, which the kit never opens;
- `GET` requests that change state, WebSocket messages, and calls the server makes to other services;
- `capture.readOnly: false`, which turns the protection off (the CLI warns on every run).

On production, plans only navigate: no click on Save, Create, Approve, Delete, Send, Import or Sign out.

### Masking has limits

Before each screenshot, the kit replaces with dots the GUIDs, the values of the application's local `.env` files
whose key name looks sensitive, the `masking.patterns` and the `masks` targets. It does **not** know values that exist
only in production (an address, an index name, a partly displayed key), it cannot change text drawn inside an image
or a canvas, and `doc-kit check secrets` reads text only, never images. **Review every image** before delivering a
site.

### Content and configuration are code

- `doc.config.mjs`, capture plans, setup scripts and local adapters are JavaScript modules run with your rights.
  Only run doc-kit on projects you trust.
- Markdown pages may contain HTML, and SVG diagrams are inlined as they are: the build does not sanitise them (only
  the logo and the icons are checked). Review documentation contributions like code, and never build content from
  an untrusted source.
- The generated site has no access control: anyone who has the file can read it. A site that shows real data is
  shared only with the people its owner allows.

### Network

The kit talks to nothing but the application you capture: no telemetry, no update check. `doc-kit dev` listens on
`127.0.0.1` only. The generated site loads nothing from the network.
