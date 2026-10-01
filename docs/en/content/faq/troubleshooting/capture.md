## In short

- **A capture needs three things**: the application running at `app.url`, a valid session (unless `auth.adapter` is
  `none`), and Chromium.
- **The session expires**: the kit checks it before the run and during it, and stops at the first sign-in page with
  exit code 3. Captures already taken are kept.
- **Targets are searched for 8 seconds**: a zone, a frame or an action that fails names its target; `--preview`
  shows what was measured.
- **Some failures are protections**: a forbidden route, a blocked write. They are not bugs to work around.

## Connecting

### "no session: .doc-kit/session.json"

- **Likely causes**
  1. `doc-kit connect` was never run in this project, or the session was deleted (`--forget`).
  2. `<PREFIX>_SESSION` points to another file.
- **Check**: `doc-kit doctor`, line "session".
- **Fix**: `doc-kit connect`; for a public application, `auth: { adapter: "none" }` or `capture --no-session`.
- **Understand**: [Connect and sessions](#/capture/sessions).

### "the session has expired (sign-in page: …)"

- **Likely causes**
  1. The application's session lifetime is over (often a few hours).
  2. You signed out of the application in another browser, which revoked the session.
- **Check**: `doc-kit doctor` gives the session's age.
- **Fix**: `doc-kit connect`, then capture the remaining ids again (`doc-kit capture "use-*"`).
- **Understand**: [Connect and sessions](#/capture/sessions~expiry).

### "no terminal to press Enter in"

- **Likely causes**
  1. `connect` runs in a pipe or a CI job, with the `manual` adapter.
- **Check**: run it in an interactive terminal.
- **Fix**: sign in from a terminal; or use an adapter that detects the session (`nextauth`, `api-me`).
- **Understand**: [Adapters](#/reference/adapters).

### "the application cannot be reached: http://127.0.0.1:4173 (…)"

- **Likely causes**
  1. The application is not running, or listens on another port.
  2. `<PREFIX>_URL` or `DOC_KIT_URL` points elsewhere.
- **Check**: `doc-kit doctor --network`.
- **Fix**: start the application; correct `app.url`, or pass `--url` to `connect`.
- **Understand**: [Project, version and sign-in keys](#/reference/configuration/project).

## Capturing

### "zone 3 (role button “New order”) not found — …"

- **Likely causes**
  1. The element is not visible yet: the page loads slowly, or an action should have displayed it.
  2. The label changed in the application, or the target matches nothing (`exact`, case).
- **Check**: `doc-kit capture "<id>" --preview`, then the preview image; the label in the application.
- **Fix**: raise `delay`, add a `wait` action, or make the target more precise (`within`, `has`, `nth`).
- **Understand**: [Targets and actions](#/capture/targets-actions).

### "the route /orders/1041/approval is forbidden (capture.forbidden: …)"

- **Likely causes**
  1. The entry opens a route listed in `capture.forbidden`: its server writes while rendering.
- **Check**: the server code of the route, and the reason it was forbidden.
- **Fix**: describe the page from its code; or reuse a record already opened and narrow the pattern.
- **Understand**: [Demo or production](#/capture/safety~forbidden-routes-why-the-browser-is-not-enough).

### "the page requested a forbidden route (…): capture stopped"

- **Likely causes**
  1. The page navigated to a forbidden path: an action of the plan clicked its link, or the page redirects to it.
- **Check**: the last lines of the run list the refused navigation.
- **Fix**: remove the action, capture another page, or describe this one from its code.
- **Understand**: [Demo or production](#/capture/safety~during-the-run-prefetch-or-navigation).

### "1 prefetch request to forbidden routes aborted — GET …"

- **Likely causes**
  1. Normal: the page prefetches a link to a forbidden route (a menu, a "next" link). The request was aborted before
     it reached the server, and the capture was taken.
- **Check**: the image shows the page of the plan.
- **Fix**: nothing.
- **Understand**: [Demo or production](#/capture/safety~during-the-run-prefetch-or-navigation).

### "capture plans captures/plans: 2 errors"

- **Likely causes**
  1. An entry has an unknown key (a typo, a legacy key), a value of the wrong type, or no `id` or `route`.
- **Check**: the lines below it, one per mistake: `file › id (CAPTURES[index]) › path: what is wrong`.
- **Fix**: correct each entry listed: one invalid entry stops the command. A negative margin, a 150 px viewport or
  `steps: 0` are valid.
- **Understand**: [Capture plans](#/capture/plans).

### "Read-only: 3 write requests blocked — POST /api/…"

- **Likely causes**
  1. Normal: a presence heartbeat, an analytics beacon, a server action that loads data.
  2. A click of the plan on a button that saves.
- **Check**: the list of blocked requests on the last line.
- **Fix**: nothing for a heartbeat; remove the click that saves; a page loaded by a `POST` is captured incomplete,
  describe it as it is.
- **Understand**: [Demo or production](#/capture/safety~read-only).

### "stopped by a bot challenge (…)"

- **Likely causes**
  1. A protection page ("Just a moment…") did not clear within 20 s in the kit's Chromium.
- **Check**: open the application in your own browser.
- **Fix**: set `browser: "chrome"` in `auth`, sign in again with `doc-kit connect`, and capture again.
- **Understand**: [Connect and sessions](#/capture/sessions).

## Environment

### "Chromium browser not found for Playwright"

- **Likely causes**
  1. The browser was never installed, or the kit's Playwright version changed.
- **Check**: `doc-kit doctor`, line "Chromium for Playwright".
- **Fix**: the exact command printed after `→`, usually `npx playwright install chromium` in the kit.
- **Understand**: [Install doc-kit](#/start/install).

### "a module cannot be found" when reading a plan

- **Likely causes**
  1. A plan imports `doc-kit/targets`, and the project's dependencies are not installed.
- **Check**: `doc-kit doctor`, line "project dependencies".
- **Fix**: `npm install` in the documentation project.
- **Understand**: [Capture plans](#/capture/plans).

## Further reading

- [Troubleshooting by symptom](#/faq/troubleshooting): the reflexes and the first checks.
- [Build and writing problems](#/faq/troubleshooting/build): the other area.
- [Masking](#/capture/masking): when a value shows in an image.
