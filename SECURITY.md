# Security

## Reporting a vulnerability

Please **do not open a public issue** for a vulnerability. Report it privately, through GitHub's private
vulnerability reporting, which is enabled on the repository: on its **Security** tab, choose **Report a
vulnerability** ([github.com/zic04/IA_TOOLS/security/advisories/new](https://github.com/zic04/IA_TOOLS/security/advisories/new)).
Only you and the maintainers see the report. Include the kit version (`doc-kit --version`), the operating system,
what you did, what happened, and, when possible, a minimal project that reproduces it — built on the fictional demo
of `examples/`, never on a real application or with a real session.

The maintainers answer each report within **7 days**, and keep the reporter informed until a fix is released. Only
the latest release receives security fixes.

## What doc-kit protects, and what it does not

doc-kit signs in to real applications, sometimes in production, and turns what it sees into a file that people
share. Its safety rests on the rules below. Know their limits.

### The session file is a secret

`doc-kit connect` saves the browser's cookies and local storage (a Playwright storage state) in
`.doc-kit/session.json`, or in the file named by `<PREFIX>_SESSION` / `DOC_KIT_SESSION`. **As long as it is valid,
this file gives access to the application with the rights of the person who signed in.**

- `.doc-kit/` gets its own `.gitignore` that ignores everything. A file named by `<PREFIX>_SESSION` /
  `DOC_KIT_SESSION` outside `.doc-kit/` gets none: keep it out of the repository yourself (`doctor` reports it if git
  tracks it).
- The file is created readable by its owner only (mode 0600) from its first byte, and replaces an older one in a
  single rename. Windows ignores that mode: there the file takes the rights of its folder, so keep the project in a
  folder only you can read (your user profile).
- `doc-kit doctor` reports a session file tracked by git; `doc-kit check secrets` reports a session file found
  anywhere else in the project, or tracked by git.
- `doc-kit export` never copies a `.doc-kit/` folder (at any depth), the file named by `<PREFIX>_SESSION` /
  `DOC_KIT_SESSION`, any JSON file that is a browser session, environment files (`.env*`, `.envrc`), keys and
  certificates (`*.pem`, `*.key`, `*.p12`, `id_rsa`…) or tool credentials (`.npmrc`, `.netrc`, `.git-credentials`).
- Never copy, show, attach or pass the file on — not in a ticket, not to a colleague, not to an agent, not to a CI
  pipeline. Delete it at the end of a campaign: `doc-kit connect --forget`. If it leaked, sign out of the application
  (or revoke the session on the identity provider) to invalidate it.

### Read-only captures have limits

With a session, `doc-kit capture` aborts **in the browser** every request other than `GET`, `HEAD` and `OPTIONS`, and
counts them. With `capture.forbidden`, the kit fetches every `GET` navigation itself, hop by hop, without following
redirects, whatever the origins its chain goes through (a sign-in round trip through the identity provider): each hop
back on the application is tested before it is requested, and a forbidden one never is (the navigation is refused,
and the capture stops; a chain of more than 10 redirects is refused the same way, a redirect off the web is aborted).
The application is every address of its own: its host and port whatever the scheme (an `http` application its server
upgrades to `https`), without a trailing dot, and every name of the loopback interface (`localhost` and `*.localhost`,
`127.x`, `0.0.0.0`, `[::1]`, `[::]`, `[::ffff:127.x]`) as one host: the guard fetches a hop from Node.js, which
reaches `0.0.0.0` and `[::ffff:127.0.0.1]` where Chromium refuses them.
With `capture.forbidden` and no sign-in (`auth: none`), a start page that lands anywhere else stops the run (exit
code 2): the guard would not cover its pages. A chain has bounds: 20 s for a hop, 25 s for the whole chain (below the
30 s a start page gets), 32 MB for the answer held for a frame and 64 MB for all the answers held at once; past them
the navigation is aborted and the capture says why. Each answer the guard fetched is freed once used, and one held
for a frame also when the frame goes elsewhere (another of its chains that ends after it included) or its page
closes. When two navigations of a frame overlap and the older one's chain ends last, its end is held in place of the
newer one's, although the frame went on with the newer one: it stays held, within the bounds above, until that
frame's next navigation or until its page closes.
The browser never gets a redirect, only the end of the chain: in a top-level frame, a page that sends the frame on to
the end, whose answer, already fetched, is held for that frame's next navigation (recognised whatever the way
Node.js and Chromium write its address: `/end|x`, `/end%7Cx`); in an iframe, the end itself, since a sandboxed
iframe could not run that page's script. The server is never asked again for a hop of the chain,
so a server that would answer a second request otherwise is not replayed; only when the end opens in another frame,
or in a pop-up the kit could not tell yet, is the end asked again — and tested again. A hop sends the cookies the
browser holds for its own address, never those of the first request, and another origin gets only the referrer's
origin. A forbidden pattern is tested on the path as written, percent-decoded once and twice (`%252e`, for a proxy
that decodes before the server does) with each run of escapes decoded on its own (a malformed one, `%zz`, is left as
written and leaves the others decoded), its backslashes read as slashes, without its path parameters (`;jsessionid=…`,
dropped before decoding as Tomcat does, and after), with its `.` and `..` segments resolved, with doubled slashes
collapsed, with each segment's trailing dots and spaces dropped (`approval.`, `approval%20`, `approval%2e`: IIS
ignores them) and without a trailing slash. A refused, aborted or blocked request is reported by its path without
its path parameters and without its query string, and a sign-in page (an expired session, a sign-in asked for) or a
bot challenge by its origin and that path only: a session id, a sign-in state or a code the application puts in its
URLs is never printed, nor written in `--json`.

**Speculation rules.** Chromium fetches the prefetches and prerenders a page asks for in speculation rules
(`<script type="speculationrules">`, a `Speculation-Rules` header) from its own process, where the guard never sees
them. No Chromium launch flag turns them off, and a `Content-Security-Policy` cannot refuse them without refusing
the page's own inline scripts (`'unsafe-inline'` allows both). With `capture.forbidden`, the documents the guard
serves lose their `Speculation-Rules` header, and a script the kit runs in every page before the page's own removes
each `<script type="speculationrules">` before the browser reads it: inserted by the parser or by a script, retyped,
in the document or in a shadow root the page attaches by script or declares open, at any depth (a declared root
inside another). A root the HTML declares in a host the kit has already seen is found by the next sweep of the whole
document: once it is parsed, and after a script attaches a shadow root.

**WebSockets.** No route of the guard sees a WebSocket's handshake, a `GET` its server answers. With
`capture.forbidden`, the kit routes the WebSockets of every page through Playwright (`routeWebSocket`): one to a
forbidden path of the application (`ws:` read as `http:`, `wss:` as `https:`, every form of the path) is closed
before it opens, as a connection that failed (code 1006), and listed with the prefetches aborted; the capture goes
on. Any other connects, its messages relayed by Playwright.

**What a page sends as it is left.** While the next capture, or a link, replaces a page, what that page still sends
(`navigator.sendBeacon`, a `fetch` with `keepalive`, even an image) leaves from a document that no route of the guard
sees any more: it reached the server whatever its method or its route. `fetchLater` sends its requests from
Chromium's own process, when the page is left or once their delay is over. So whenever a guard is active (read-only,
or `capture.forbidden`), a script the kit runs in every page before any other stops the events of a page being left
(`pagehide`, `unload`, and `visibilitychange` to hidden) before any handler of the page sees them (one a script
added or the HTML set, on the window or on the document), whatever the page redefines: the script keeps the
browser's own `stopImmediatePropagation`, `visibilityState` getter and `Reflect.apply` before the page's scripts run,
and calls only those when an event fires, so a page that redefines them (on a prototype, on the document, or their
`call`) changes nothing. It also removes `fetchLater`, and the browser is launched without it
(`--disable-blink-features=FetchLaterAPI`: a second `--disable-features` would replace the list Playwright passes
there). A page's handlers for being left therefore never run during a capture: what they would send is neither sent
nor counted. The events a page dispatches itself still reach its handlers, and what a page sends while it is open (a
beacon, a keepalive `fetch` included) goes through the guard, blocked and counted as any other request.

**Shared workers.** Playwright routes the requests of pages, frames and dedicated workers (a `Worker`, and one it
starts), never those of a `SharedWorker`: they reached the server whatever their method or their route, neither
blocked nor counted. So whenever a guard is active, the browser is launched without shared workers (`SharedWorker`
in the same flag: `--disable-blink-features=FetchLaterAPI,SharedWorker`), and the script the kit runs first in every
page removes `SharedWorker` as well, in every document and frame: a page that starts one gets an error, as in a
browser without them, and nothing it would have sent leaves. A dedicated worker's requests go through the guard,
blocked and counted as a page's.

None of this covers:

- **writes made by the server while it renders a page** requested with a `GET` (a record created when a detail page
  opens, a notification sent): the browser cannot see them. Read the server code of a page before opening it, and
  list such routes in `capture.forbidden`, which the kit never opens;
- `GET` requests that change state, WebSocket messages, and calls the server makes to other services;
- a WebSocket opened by a dedicated worker (`Worker`) or with `WebSocketStream`: Playwright's routing only replaces
  the `WebSocket` of each page and frame, so their handshake reaches the server unseen, neither refused nor counted;
- a `WebTransport` session (HTTP/3): Chromium exposes it to pages and to workers, no route of the guard sees it, and
  no launch flag removes it (`--disable-blink-features=WebTransport`, `--disable-features=WebTransport` and
  `--disable-quic` leave it to the page). The kit does not take it from the page either: a script run before the
  page's would remove it from the page, from an `about:blank` frame the page creates and from a pop-up, but a worker
  the page starts keeps it. So it reaches its server whatever its path, neither refused nor counted;
- `capture.readOnly: false`, which turns the protection off (the CLI warns on every run);
- the letter case of a path: on a server that ignores it (IIS, ASP.NET), write the pattern for every case
  (`[Aa]pprove`);
- a route on another host or port than the application's (an API on another subdomain, `www.`, `https` on another
  port, a name that resolves to the loopback interface through DNS such as `localtest.me`): `capture.forbidden` only
  covers the application's host and port. With sign-in, a page on another origin is
  read as a sign-in page (the capture stops as for an expired session);
- a server that matches a route by its suffix (Spring MVC's suffix pattern matching, off by default since Spring 5.3:
  `/approval.json` for `/approval`), or that decodes a path more than twice: write the pattern for it
  (`^/orders/\d+/approval(\.\w+)?$`); and a path in a non-standard encoding, IIS's `%u0061` or an overlong UTF-8
  sequence (`%C1%A1` for `a`), which the kit does not decode: current servers reject them;
- the size of an answer while it is fetched: Playwright reads a whole answer into memory before the kit can measure
  it; the 32 MB and 64 MB caps bound what is held for the frames, not what one request reads;
- the speculation rules the parser puts in an open shadow root it declares in a host the kit has already seen (a
  script, or content long enough for the parser to pause, before the `<template shadowrootmode>` in its host): no
  mutation reports such a root, which the kit finds only once the document is parsed or a script attaches a shadow
  root. Chromium may fetch their pages before then, all the more when the document waits for a slow script after
  them; rules a script puts there later are removed;
- speculation rules in a shadow root that the HTML declares closed (`<template shadowrootmode="closed">`), in a
  document the guard does not serve (a navigation sent with another method than `GET`, with
  `capture.readOnly: false`), or put by a page that works around the kit on purpose; and, with Google Chrome
  (`browser: "chrome"`), a `<link rel="prerender">`, which Chrome fetches itself (Playwright's Chromium ignores it):
  such a prefetch is never seen, so neither refused nor counted;
- an iframe whose address is redirected keeps its first address (its relative links resolve from it), and a pop-up
  that a sandboxed iframe opens, then redirected, stays blank: it inherits the sandbox and cannot run the guard's
  page;
- the redirects of a request that is not a navigation (a `fetch`, an image) or of a navigation sent with another
  method than `GET` (a form posted with `capture.readOnly: false`): the browser follows them unseen. The first address
  of such a request is tested, not the places the server sends it to;
- what Chromium itself would add to a navigation the kit now sends from Node.js (Playwright's request client), for
  every origin, third-party frames included: cookies are chosen by domain, path and `Secure` only, never by
  `SameSite`; no HSTS upgrade, no system proxy or certificate store, no Local Network Access check.

**Local addresses.** A page the kit answers itself comes, for Chromium, from no address: its calls to a local address
(the API of a local application on another port) are refused (Local Network Access). The kit allows them again, for
the application's origin only, when the application is on a loopback address (`localhost`, `127.x`, `[::1]`…). On any
other address (a LAN address, a name), `doctor` warns when the application's env files (`masking.env`) name a local
address on another origin, except on a production target: use `localhost` or `127.0.0.1` in `app.url`, or capture
that instance without `capture.forbidden`.

On production, plans only navigate: no click on Save, Create, Approve, Delete, Send, Import or Sign out.

### Masking has limits

Before each screenshot, the kit replaces with dots the GUIDs, the values of the application's local `.env` files
whose key name looks sensitive, the `masking.patterns` and the `masks` targets. It looks in every frame of the page
(iframes included) and every open shadow root: text, field values, the `title`, `placeholder`, `alt`, `aria-label`
and `aria-description` attributes, a value split across several elements (the smallest element that holds it is
masked whole), and the text generated by CSS (`content` of `::before` and `::after`). It does **not** know values
that exist only in production (an address, an index name, a partly displayed key), it cannot read a **closed** shadow
root, it cannot change text drawn inside an image, a canvas or an SVG drawn as an image, and `doc-kit check secrets`
reads text only, never images. **Review every image** before delivering a site.

### Content and configuration are code

- `doc.config.mjs`, capture plans, setup scripts and local adapters are JavaScript modules run with your rights.
  Only run doc-kit on projects you trust.
- `doc-kit --version`, `doc-kit --help` and `doc-kit <command> --help` run nothing of the folder they are typed in,
  nor of its parents: for them, `doc.config.mjs` is never imported; the language of the messages is read in the
  file's text (a literal `language`, or the first item of `languages`; a regular file only, and 1 MB read at most, whatever size it reports). Every
  other command that loads the project runs its `doc.config.mjs`, and so does `doc-kit` without a command: the
  guided mode loads the project like a command to tell the next step, even without a terminal
  (`test/unit/cli-startup.test.mjs`, with a configuration that leaves a file behind when it runs). Limit: this holds
  for the doc-kit you installed. `npx doc-kit` typed in a cloned application runs the kit its `node_modules` holds,
  which is the folder's code; and on Windows, `cmd.exe` runs a `doc-kit.cmd` of the current folder before the one
  on the `PATH`.
- Markdown pages may contain HTML, and SVG diagrams are inlined as they are: the build does not sanitise them (only
  the logo and the icons are checked). Review documentation contributions like code, and never build content from
  an untrusted source.
- What the kit itself writes from the content is escaped. A section or page id of the table of contents is
  lower-case segments of `a-z`, `0-9`, `-` and `_` separated by `/` (the toc schema refuses another, and the error
  names it), and the site escapes every id it writes into a link or an attribute all the same. `::facts{source}` and
  `::diagram{id}` name a file of the project by a plain name (`a-z`, `0-9`, `-`): a path (`../..`, `a/b`) is a build
  error (`facts.source`, `diagram.id`), and nothing is read; `sync` takes such a `::facts` table for no dependency of
  the page, and neither reads nor hashes the file it names (nor one an older `sync.json` recorded).
- The generated site carries a Content Security Policy (a `<meta>` in its `<head>`): only its own inline scripts
  run, each allowed by its hash; images and fonts must be embedded; no request, frame, form or `<base>` is allowed.
  A script, an `onclick=`, a `javascript:` link, an iframe or an external image written in a page is refused by the
  browser. It is a second line of defence, not a reason to build untrusted content. A policy set by a `<meta>` cannot
  forbid framing (`frame-ancestors`): the server that hosts the file decides that.
- The generated site has no access control: anyone who has the file can read it. A site that shows real data is
  shared only with the people its owner allows.

### The application folder is not trusted

A takeover reads an application written by someone else, often with its `.git/` folder. The kit treats that folder
as untrusted input:

- git is only run with hardened options (no file system monitor, no pager, no external diff, no textconv, no git
  started in a submodule: a diff never looks into a submodule's working tree nor shows its inner diff, nothing
  recurses into one — a submodule has a configuration of its own, which the kit does not read), and a git reference
  read from `sync.json` or `--since` is refused unless it is a plain reference (never an option);
- git runs with a cleaned environment: no variable of git's own (`GIT_*`, in any case) reaches it — none can move
  the repository read (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`,
  `GIT_ALTERNATE_OBJECT_DIRECTORIES`), add to or replace the configuration read (`GIT_CONFIG_COUNT` and
  `GIT_CONFIG_KEY_n`/`GIT_CONFIG_VALUE_n`, `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`) or
  name a program (`GIT_EXEC_PATH`, `GIT_EXTERNAL_DIFF`…) — but how `inputs fetch` connects (`GIT_SSH_COMMAND`,
  `GIT_SSH`, `GIT_ASKPASS`, the certificate authorities `GIT_SSL_CAINFO` and `GIT_SSL_CAPATH`); it never asks for a
  password (`GIT_TERMINAL_PROMPT=0`), and never fetches the objects a partial clone lacks (`GIT_NO_LAZY_FETCH=1`:
  the fetch would start the transport the repository names). Your `HOME` and your global configuration (its
  credential helper) still apply. The external tools get the same environment, for any git they start;
- git is **not run at all** in a repository whose configuration names a program it could start (`core.fsmonitor`,
  `diff.external`, a `textconv` driver, a `clean`/`smudge`/`process` filter, an `include`, the program that checks
  a signature — `gpg.program`, `gpg.<format>.program`: `git log` and `git show` check signatures when
  `log.showSignature` says so —, and what Git LFS runs or writes to when its filters run: an extension
  `lfs.extension.<name>.clean`/`smudge`, a custom transfer agent `lfs.customtransfer.<name>.path`, `lfs.storage`):
  the command warns, names the keys, and works without git (files are listed directly). Nor is any external tool run
  there (`facts --tools`: `failed`, reason `refused`): a tool may start git in the repository itself (semgrep lists
  the files with `git ls-files`). The one exception is Git LFS's own filters, for exactly the values it writes,
  each for its own key and as the whole value (`git-lfs clean -- %f`, `git-lfs smudge -- %f`,
  `git-lfs filter-process`, the last two also with `--skip`): anything before or after (`;`, `&&`, `|`, a backtick,
  `$(`, a newline, one more word, a blank other than a space or a tab) makes it a program named. These filters stay
  on, so that a file stored in Git LFS is compared as its pointer, never reported changed for its content; they
  start `git-lfs` from the `PATH` below. The configuration is read as git reads it — a line separator (U+2028,
  U+2029) in a value or a subsection included — from every git folder git may use: walking up from the folder, a
  `.git` folder, the one a `.git` file names (its path as git reads it, line ends only taken off; so is a worktree's
  `commondir`), a folder that is itself a git folder (a bare repository); the walk goes past a `.git` git would not
  take for one (no HEAD naming a branch or a commit, no objects, no refs, a HEAD that is a link), as git does, and
  stops at the first git surely uses;
- programs (git, gitleaks, osv-scanner, syft, knip, semgrep) are looked up on the `PATH` only, never in the folder
  read, the application, the documentation project, a folder inside them, or a `node_modules/.bin` (npm puts the
  application's, and its parent folders', first on the `PATH` when the kit runs as an npm script of a documentation
  project inside it): a `git.exe` or a `node_modules/.bin/git` placed in the application cannot replace the real
  one. The program started gets that `PATH`, without those folders: what git starts in turn (`git-lfs`, a credential
  helper) is looked up there too. The folders are compared by their real paths as well (links and junctions
  followed, in any case on Windows), so a `PATH` folder reached through a link, macOS's `/var` included, is still
  left out;
- `hooks install` writes only into a hooks folder inside the repository or its git folder (for a worktree, the main
  repository's), links followed: a `core.hooksPath` that leads out of them, a hook that is a link out of them or
  leading nowhere, or a hook that is a hard link, is refused;
- every expression and every loop that scans the application's files stays linear (a crafted file cannot block
  `facts` or `check secrets`), and is tested for it: the ReDoS test runs each on adversarial inputs — the shapes
  that once made one quadratic among them: an occurrence repeated, a construct left open, a long run — and
  `test/unit/redos-registration.test.mjs` fails when a regular expression that `engine/facts`, `engine/check`,
  `engine/sync` or the masking export is not registered there. A scanner finds the line of a match through one
  index of its file, matches braces in one pass, reads a block up to the last of its closers only, and reads a
  bounded window (the arguments of a redirect call over 1,000 characters, an algorithms list over 200, a type
  annotation over 200, a class's bases over 500); `quality`, `env`, `db`, `agents` and `tests` read no source,
  schema, instruction or test file over 512 KB (listed in `unreadable`; a coverage report or a configuration file
  is read whole, by expressions that stay linear), `security` and `secrets` none over 2 MB. Limit: the patterns
  that read the application's paths (a test file, an agent's instructions) grow with the square of a folder name
  repeated in one path, which the file system bounds to a few thousand characters;
- what `facts --source behaviours` keeps of the code is a name (a field, a parameter), a number, a word of a fixed
  list (asc, desc, a field's type, a library, a cron expression) or a short list of values, each through a whitelist
  and refused when it looks like a key, a token or a long number (a card, a phone): never a string as written, a
  default only as a number, and no value at all for a field whose name says it is secret (password, token, key…);
  it never reads the tests, the comments, or a file over 512 KB;
- the stack adapters that read the routes, screens and hints of a framework (`facts`: `api`, `screens`,
  `behaviours`) are the kit's, or the project's own named `local:` in `stacks.adapters` — a file of the documentation
  project, never of the application (the configuration accepts nothing else, and a path that leads out of the
  project, links followed, is refused before anything is loaded). They are given the texts of the
  application's files, never a test, a generated file or a file over 512 KB, and run nothing of it; the kit classifies
  the access of a route itself, from the names they return, keeps 32 guards per route and 5,000 routes per adapter at
  most, reading 128 entries of a guard list at most (engine/facts/stack-common.mjs: a guard after them is not seen,
  so a route may look less guarded than it is, never more), and writes "…" for a segment of a route that looks like a key or a token — what a secret detector of the kit finds
  (always), or 20 characters or more that do not read as words, each part between separators judged alone: a
  heuristic, which masks a random token of 32 characters or more of the usual shapes (base62, base64url,
  hexadecimal, a-z0-9) 999 times in 1,000 and a shorter one, or one of letters only, about 99 times in 100, and keeps
  the words of a route (`GetUserProfileByIdV2`, `k8s-cluster-node-pools`, `how-to-set-up-a-new-account`) and its
  parameters — a single word of twenty letters or more, or one with five consonants in a row, is masked. The kit's
  coverage adapters that read routes (`fastapi`, `next-app-router`, `openapi`, `react-router`) mask their ids and
  forms the same way, and so does `glob` for a segment of a file's path (the file's name judged without its
  extension, so `OrderSummaryCard.tsx` and `GetUserProfileByIdV2.tsx` are kept; its forms rendered from the masked
  path), so a coverage report or the audit never shows a segment that `facts` masks; `sync` compares a route's files
  masked the same way, and finds the files of a masked route. Limits of that masking: the masked names of one folder
  share one id (`db/migrate/…` for migrations named by a timestamp, `alembic/versions/…`, files named by a UUID or a
  hash, the hashed assets of `public/`), covered and followed together; and an ordinary name that reads as no words
  is masked as well (`XMLHttpRequestInterceptor.ts`, `OrderSummary.test.tsx.snap`) — a loss of detail, never a
  secret shown;
- the access of a route (`auth`) never says more than the names of its guards (engine/facts/guards.mjs): a guard is
  a user guard by its whole name (`get_current_user`, `login_required`, `IsAuthenticated`, `auth:sanctum`,
  `Authorize`…) and a role guard by one of its words (`require_admin`, `hasRole('ADMIN')`), never by a part of
  another word — a database session (`get_session`), a CSRF check (`VerifyCsrfToken`), a session or a token alone
  (`getSession`, `tokenMiddleware`) names no user; a guard that lets anonymous callers in (`IsAuthenticatedOrReadOnly`,
  `@jwt_required(optional=True)`, `IS_AUTHENTICATED_ANONYMOUSLY`) is neither, whatever `review.guards` says, nor is
  a negation (`!hasRole('BANNED')`, `(!hasRole(…))`, `not(has_role(…))`, DRF's `~IsAdminUser`,
  `hasRole('ADMIN') == false`, `!= true`, `and!hasRole(…)`) nor a guard under express-unless's condition
  (`requireAdmin.unless(…)`); a role word counts in the called name only, never in a module's or an object's name
  before it (`admin_crud.get_db`, `permissions.none`) nor in a loader's (`loadRoles`); an expression is as weak as
  its weakest alternative (`or`, `||`, `|` between blanks, whatever its parentheses or line breaks:
  `hasRole('ADMIN') or(permitAll())`, DRF's `[IsAdminUser | AllowAny]`), and an alternative as strong as the
  strongest of the parts it requires all of, read outside parentheses only (`and`, `&&`, `&`:
  `isAuthenticated() and !hasRole('BANNED')` is `user`, `not (isAuthenticated() and hasRole('ADMIN'))` is
  `unknown`); a name the kit does not know is `unknown`, never `user`; `optional=` anything but `False`, or `True`
  first, in a decorator's arguments outside comments lets anonymous callers in (`@jwt_required (optional=True)`
  too). A guard found where it checks some requests only, or none the kit reads, is `unknown` whatever its name and
  `review.guards`: a session lookup or a role word in a Next.js handler's body (`auth (body)`: a lookup refuses an
  anonymous caller nothing, whatever the handler returns), a Rails callback under `if:` or `unless:`
  (`authenticate_user! (if)`), and a Rails callback declared again replaces the one of the same name (a parent's
  `before_action :authenticate_user!` redeclared with `unless:` or `only: :destroy`). A `Depends(…)` in a comment or
  a string is no guard, nor an `APIRouter(…)` or an `include_router(…)` in a comment or a docstring, and DRF's
  module `permissions` names no role (`permissions.AllowAny` is read `AllowAny`). A Flask `before_request` hook never makes a route
  `user` or `role`, whatever its name, its body or `review.guards`: when it may deny a request — a guard decorator
  under it, or in its body, outside strings and comments, `abort(`, `raise`, `redirect(`, a `return` of a value
  other than `None`, or a call of a guard by its whole name (a built-in user guard, or instead, when
  `review.guards.user` is set, a name it matches, as it replaces them; or a name `review.guards.role` matches: the
  built-in role words never count in a hook) — it gives the routes it applies to the guard `before_request`, always
  `unknown`; a hook that may deny nothing (it logs, loads `g.user`, does `pass` or `return None`) gives none.
  Telling whether a hook may deny can be wrong either way, which the promise allows: `unknown` is never more, and
  `none` for a hook that guards through a helper the kit does not read is less. The global rules of a framework are
  not read (DRF's `DEFAULT_PERMISSION_CLASSES`, Spring's `SecurityFilterChain`, ASP.NET's `FallbackPolicy`,
  `FastAPI(dependencies=…)`): a route they alone protect looks unguarded (`none`) — so a route may look less
  protected than it is, never more, except in these known cases, where the names do not tell and a route may look
  more protected than it is:
  - a per-request override that loosens a class rule: DRF's `get_permissions()` returning `[AllowAny()]` under a
    class `permission_classes = [IsAdminUser]` (`role`);
  - Spring's method-level `@Secured("IS_AUTHENTICATED_ANONYMOUSLY")` under a class `@Secured("ROLE_ADMIN")`
    (`role`);
  - rare argument forms, such as Flask's `@jwt_required(**{"optional": True})` or
    `@jwt_required(optional=False or True)` (`user`);
- the manifests of Maven, Gradle, NuGet, Composer, Go, Bundler and Cargo are read offline, never sent anywhere (only
  the public names of npm and PyPI that you list may be, with `--network`); their XML goes through the bounded reader of the
  sources (no DTD, no entity expanded, a bounded number of elements), the others through small line readers;
- the installed copies of the packages, which `facts` reads for the licence a lock file does not give (an npm
  package's `node_modules/<name>/package.json`, a Python distribution's `*.dist-info/METADATA` in a `.venv/` or
  `venv/` folder), are untrusted data the application's installs wrote: read offline, never executed, imported or
  written. A path there is resolved from the application's folder one part at a time, each link's target judged
  before it is touched (as written): a link out of the application is never followed, 32 links at most (a loop); a
  folder refused so stops the search, nothing further up stands in for it; a `.venv` that is a file is never
  followed; a package's
  name is only looked up among the entries of the folders listed, never used as a path. Everything is bounded:
  10,000 entries a folder listed, 4 `python*` folders a virtual environment, 5,000 dist-info folders a site-packages,
  a `package.json` of 1 MB, only a METADATA's header (64 KB read at most). A copy counts only when it is the item's
  own (its name, its exact version), and what it says is kept only as a licence's name, one line of 100 characters
  at most, nothing a secret detector finds. Limits: a hard link is a file of the application, read as such (pnpm
  links its store's files so: the same bytes); and the kit does not guard against an application that changes its
  own folders while `facts` reads them (a folder swapped for a link between the check and the read);
- the `infra` source keeps what infrastructure files declare through one whitelist (names, types, an image and its
  tag, replicas, ports, whether it runs as root, has TLS, is open to all, the names of its variables), the project's
  adapters included: never an environment variable's value, a ConfigMap's or Secret's data, a parameter's default, a
  connection string; a name a secret detector finds is written "…" (and, judged word by word, a word that reads as a
  token), a name is kept on one line, the credentials of an address are taken off, and
  so is a source's query (a SAS token, a presigned URL's signature) but its `ref`. The files of values are never
  read: Terraform's `.tfvars`, Bicep's `.bicepparam`, an ARM parameters file; nor a CDK assembly (`cdk.out/`). A
  folder named `test/` is read there as the test environment (`k8s/overlays/test/`); `tests/`, `spec/`, `fixtures/`
  and a Maven `src/test/` never are. An address range written as a variable, a parameter or an expression leaves
  "open to all" unknown — but open when an open range is written in it (a condition): the kit never says closed what
  it cannot tell. YAML is read by a bounded reader that never
  expands an alias (no billion laughs) nor resolves a tag, and gives what it could read of a text that is not YAML (a
  Helm template); JSON (ARM, CloudFormation) by a walk that refuses more than 256 levels before JSON.parse;
- the `stack` source measures the languages of the code and names the stacks and low-code platforms found from the
  dependency names and the file names only; what the kit does not read is told (`inputs status`, the context of a
  page), never guessed;
- the `sources` of a page (toc.json) and of a feature (features.json) are confined to the application: an absolute
  glob, one that climbs (`..`) or one that holds a `:` (a drive, `C:x`; a data stream of a Windows file,
  `.env::$DATA`) is left out, and so is what is not a file in `app.dir` once links are followed (a symbolic link, a
  junction) or is a secret file (`.env`, a key) under the name the system gives it (`realpathSync.native`: a short
  name such as `ENV~1`, or another case, is the real `.env`) — the context of a page gives its files whole to an
  agent;
- the `secrets` and `security` sources read the files `git ls-files` lists, which holds a committed link as a file
  (and a folder of its index may be a junction on disk): a file whose real path, links and junctions followed
  (`realpathSync.native`, the confinement of the `sources` above), is not in the application is never opened, so no
  finding of their reports comes from a link to a file of the operator (`~/.aws/credentials`);
- the imports of a page's code (the closure of `sync` and of the context of a page, two levels for a feature sheet)
  and of the `modules` source are resolved, and their files and `tsconfig.json` read, only where they really are in
  the application, links and junctions followed: an import through a junction to a folder outside is not resolved,
  and a dependency of a page outside the application (a route's file reached through a link) is named in its
  context, never excerpted. The file of a proof (`file:line`) is confined the same way, when `sync` records it and
  when its report compares it: one through `../` or a link out of the application is never read, its first line
  never written in `sync.json` (`sync.proofOutside` says why, for one an older `sync.json` recorded too). So is
  every dependency file of a page, by one helper (`dependencyFile`) for the marking, the report, `--since` and the
  page's files read for the API paths they call: a declared source (`--sources ../shared/money.ts`, a `declared`
  entry of `sync.json`), the `file` of a `facts/api.json` item or a route file through a junction that lies outside
  the application is never read, hashed nor shown by git, never counted deleted, and `sync.dependencyOutside` says
  so. A proof or a dependency through a link out of the application is outside whether its file exists there or
  not (judged by where its nearest existing folder really is, found by bisection: a path of thousands of missing
  parts costs a few calls, and one longer than 32,767 characters, Windows' limit, is missing without any), and a
  link that leads nowhere is judged by its target as written (32 links at most: a loop is outside too), except a
  target with a `..` after a name (`j/../x`), which is outside: the system takes that `..` from wherever `j` leads,
  the text cannot. The cap holds for the path as written too, before `path.resolve` reads it (quadratic on `a/`
  repeated then `b/../` repeated): climbing out (`../`) is judged first, in one pass, and a path padded past the cap
  (`./` 20,000 times before `lib/a.txt`) is missing, though it names a file. Neither the marking, the report nor
  `--since` tells whether a file of the operator exists.
  Every real path of this confinement is compared exactly, case included: in a case-sensitive folder (WSL's, or
  one `fsutil` marks so), a sibling `APP` of `app` is another folder, outside. `realpathSync.native` gives the case
  on disk on Windows and macOS; on a case-insensitive Linux mount (ext4 with casefold, WSL's DrvFs) it keeps the
  case as written, so a file of the application reached in another case may be judged outside: a false "outside",
  never a file read outside. The coverage report that `tests` reads by its fixed name (`coverage/lcov.info`,
  `coverage/coverage-summary.json`, `coverage.xml`) is confined the same way. The private
  declarations of the dependency readers (`.npmrc`, `.yarnrc.yml`, `bunfig.toml`, `pyproject.toml`, `pip.conf`, a
  requirements file…, read by their fixed names) follow links, as they read the operator's own configuration on
  purpose; only flags, scopes and names to keep off the network come out of them (whether a registry or an index is
  private, a private scope, the application's own package names), never a value;
- limits of this confinement: a hard link cannot be told from the file itself (it is another name of the same file,
  with no target to follow), so a hard link in the application to a file outside it is read as a file of the
  application — git never checks one out, but a folder copied or unpacked as it is may hold one. And a path is
  checked, then read: a file or a folder of the application swapped for a link in between, by a process that
  changes the application while the kit reads it, is not seen. Read an application received as an archive from a
  fresh clone, and let nothing change it while the kit runs;
- an OpenAPI document of the application is read for 20,000 parameters and properties at most, a `$ref` of more than
  512 characters or 16 keys is not followed and each is resolved once, and the line of each route is found by a
  cursor that only moves forward: a document built to cost (thousands of parameters to one long `$ref`, routes
  written with escaped slashes) is read in a bounded time;
- the ReDoS test also measures growth: the slowest inputs of each scanner are built again 4 and 16 times longer —
  longer still, up to 256 times, while a step under 20 ms may hide a quadratic growth (it looks quadratic, or the
  size below was too fast to measure), so that a fast machine cannot hide one — and a scanner more than eight times
  slower from one size to the next in a step of 20 ms or more (a linear one takes four times as long, a quadratic
  one sixteen) is quadratic, and fails; a scanner written to be quadratic (the canary) must be caught, so that the
  check cannot pass by measuring nothing. Limit: a ratio shows only the part of the time that grows — a scanner
  whose linear part outweighs its quadratic part at every size measured (up to 768,000 characters) is not seen;
- the skill's `scripts/analysis.mjs check` reads the files that the proofs of an analysis name (an agent's output,
  written from the application's code, ARCHITECTURE.md §6.11a), only to count their lines. A path that is not
  relative, has an empty, `.` or `..` segment, a backslash, a colon or a NUL is refused without being read.
  Otherwise its real path, links followed, must stay in the application folder, and the file must be 8 MB at most.
  No text of an analysis may hold a value that a secret detector of the kit finds: the place and the kind are
  reported, never the value. The texts it prints are put on one line, without control characters. Limit: without
  `app.dir`, the application folder is guessed from the documentation's (its git parent, else its grandparent),
  which can be wider than the application; the script warns;
- the skill's `scripts/usage.mjs scan` and its statistics hook (`scripts/usage-hook.mjs`) read Claude Code's
  transcripts, which hold the prompts, what the agents read of the code and what they wrote — a secret among them.
  Of a transcript they keep only counts (tokens, responses, lines, files), its time span (the hook), and the
  model's name when it reads as one (letters, digits, `.` `_` `:` `@` `-`, at most 100 characters; otherwise
  none — judged by its shape only: Claude Code fills it from the API's answer, not from what a person wrote): a block of a response is told apart from its copies by its id or a SHA-256 digest of what it wrote, never
  by its text, and nothing else of a transcript reaches `.doc-kit/usage.jsonl`, `usage/` or the terminal
  (`scripts/transcript-usage.mjs`, tested with a marker text). `scan` also records the folder it read, and the hook
  the agent's id (else the session's) and type that Claude Code gives it. Limit: to read its version, the hook loads the documentation
  project's `doc.config.mjs`, which is code, like every doc-kit command — the first one from the session's folder
  upwards (else `docs/manual`), when a `usage/` folder is beside it. `skill install --hooks` writes the hook in the
  project's own `.claude/settings.json`; written in your user settings (`--settings`), it runs in every session,
  so in any folder you open that holds such a project: keep it to the projects you trust.

Limits: `facts --tools` runs third-party tools on the folder. **knip loads the application's configuration files
(JavaScript) to read them**: run `--tools` only on an application you trust, or in a throwaway container. A knip
installed only in the application (its `node_modules/.bin`) is not run: install it outside the application. Read a
`.git/config` handed over with an application before running anything on it. The cleaned environment of git is a
defence in depth, not a sandbox: an environment the application controls (a `direnv` `.envrc` you allowed, a shared
CI runner) can still change what the kit itself runs (its `PATH`, `NODE_OPTIONS`); a `GIT_CONFIG_GLOBAL` of
your own is not read (git then reads `~/.gitconfig`); and a git too old to know `GIT_NO_LAZY_FETCH` ignores it.
Reading every configuration git may use can refuse git where git would not have read the one named (a parent
repository above a `.git` the kit cannot be sure of): the warning names the keys. On Windows a program is started
as a `.exe` or a `.com` only, never through a shell: a tool installed as a `.cmd` (a global npm package) is not
found.

### The sources: shared repositories and documents (`inputs`)

`doc-kit inputs` (ARCHITECTURE.md §6.19) reads what a team already has besides the code: repositories, documents.
Both are untrusted input.

- **Shared repositories** (`inputs fetch`): the only git commands of the kit that write (RULES.md S2), into
  `.doc-kit/inputs/repos/<name>` only. The address is refused unless it is https without credentials, ssh or
  `git@host:path` (never an option, never a transport helper such as `ext::`), and the branch unless it is a plain
  reference; both come after `--end-of-options`. Every clone is configured from its creation so that its own
  fetches and checkouts never run a hook (`core.hooksPath` points to an empty folder of the kit), check out a link
  as a link (`core.symlinks=false`: nothing outside the clone is ever read through one), use the `ext` or `file`
  transport, recurse into submodules, or accept a malformed object (`transfer.fsckObjects`); every update gives these
  settings again (`git -c`), so a clone whose own configuration changed since stays hardened. git never asks for a
  user or a password in the terminal (`GIT_TERMINAL_PROMPT=0`) — your own SSH agent or credential manager may still
  ask for a passphrase or show its window — and Git LFS downloads nothing. A source's name is also its folder: it is
  checked (letters, digits, dashes) before a clone folder is ever removed, so nothing outside `.doc-kit/inputs/repos/`
  is touched. What git prints back is shown without its control characters. git authenticates with **your own** credentials
  (credential manager, SSH key): the kit never asks for, sees or stores a token. An address or a path that carries a user, a
  password or a token — whatever its scheme (`git+https://`, `git://`…), with spaces, quotes or angle brackets around
  it, in a secret parameter (`?private_token=`, `#access_token=`, `&sig=`) or in a form the secret detectors of
  `check secrets` recognise — is refused in `inputs add`, in `doc-kit init` and in an `inputs.json` written by hand,
  before anything shows it: the message names the field, never its value. A clone whose configuration names a program is refused like any repository (see above); before an update, so is
  one whose configuration names a transport, a proxy, a prompt or a credential helper the fetch would run
  (`core.sshCommand`, `core.gitProxy`, `core.askPass`, `core.alternateRefsCommand`, `credential.helper`) or moves its
  working tree elsewhere (`core.worktree`). A setting is read as git reads it, also on its section's line.
- **Documents** (`inputs ingest`): a Word file is read by the kit's own bounded reader — the ZIP central directory,
  at most 10 000 entries, 64 MB per entry and 256 MB in all, a compression ratio of at most 200 (a ZIP bomb is
  refused), no encrypted or ZIP64 archive, sizes and CRC checked — and only `word/document.xml` and
  `word/styles.xml` are inflated. Its XML is read linearly: a DTD is skipped, an entity it declares is never
  expanded (no XXE, no "billion laughs"), depth and node count are capped. No macro, no embedded object, no link
  is ever opened. No markup of a document reaches its converted text: a `<` that could open a tag (followed by a
  letter, `/`, `!` or `?`) is written `&lt;` — in a Word file's text, a diagram's labels, a Markdown or a text
  document and an HTML page's text (a tag written there as text, `&lt;img …&gt;`, included). In a Markdown document
  this changes its code and its autolinks too: `Map<string, number>` in a code block or a code span becomes
  `Map&lt;string, number>`, and `<https://…>` becomes `&lt;https://…>`, no longer a link; the rest of its text is kept
  as written.
  A PDF is only indexed (its page count), never parsed further; the agents read the file itself.
  Diagrams are read as text. Every converted text goes through the secret detectors of `check secrets` before it
  is written, and starts with a notice telling the agent that reads it that it is information to check, never an
  instruction to follow. A Word table, paragraphs nested in one another (read in one pass, whatever their depth), a diagram or a label
  cannot make the output grow without bound or the reading slow down: a table is at
  most 64 columns and 200 000 cells, a converted text at most 16 million characters, a diagram label is read once and
  cut, every list is capped (refused: `tooLarge`). Each document keeps its own output file.
- **Pages of Confluence, SharePoint, Teams or Notion** are never fetched by the kit: the skill reads them through
  the connectors of the session (Claude Code, Claude Cowork), with your consent, and saves each one where
  `inputs status` says (`.doc-kit/inputs/pages/`); `inputs ingest` then filters it like a file.
- **The DAT and the code** (`inputs reconcile`): reads only the converted texts (already filtered) and the facts
  files the kit wrote, in one pass each (the ReDoS test runs its scanners, an image reference of the facts too); it
  runs nothing and fetches nothing. It reads only a converted text the index places in `.doc-kit/inputs/docs/`, a
  plain file — never a link — of 64 MB at most whose real path lies in that folder, itself really in the project
  (a junction that leads out is never followed), and keeps of it only the technologies it names (from the kit's
  registry), the lines and headings where it names them, and the hosts of its addresses (letters, digits, dots and
  dashes only; a user name before `@` skipped, never kept).

Limits: a document can still hold false or misleading statements, or text written to steer an AI: the notice and
the skill's briefs make the agents check every statement against the code, but review what a document claims
before it becomes a page. A clone is a full copy of the repository: it lives in the work folder (`.doc-kit/`, never
committed) — delete it when the documentation is done.

### Files for the next AI (`pack`)

`doc-kit pack` writes `llms.txt`, `llms-full.txt`, `AGENTS.md` and `CLAUDE.md` in the documentation project, never
in the application. From the application it reads only the facts files and the `scripts` of its `package.json`
files, parsed as JSON and never run. `AGENTS.md` names environment variables, never their values. Every file goes
through the secret detectors of `check secrets`: a line where one fires is replaced by a notice and reported (exit
code 1), so a secret pasted in a page never reaches the pack.

Limits: the detectors are patterns. A secret they do not recognise (a short password, a token of an unknown
shape) passes. Review the files before handing them to an agent, and `AGENTS.md` before committing it.

### The backlog export (`backlog export`)

`doc-kit backlog export` writes files for a backlog tool's importer (Azure DevOps, Jira, GitLab, GitHub, JSON) in
the documentation project, from the documentation only. It calls no tool and takes no token: the person imports the
files. Every text goes through the secret detectors of `check secrets`: a line where one fires is replaced by a
notice and reported (exit code 1). What the files say cannot act on the tool or on whoever opens them:

- a CSV cell that a spreadsheet would read as a formula (one starting with `=`, `+`, `-`, `@`, a tab or a carriage
  return) starts with an apostrophe;
- in the Markdown of GitHub and GitLab, a mention (`@name`) or a reference (`#12`, `acme/shop#42`, `!12`, `&12`,
  `GH-12`…) is followed by an invisible word joiner, so the import notifies no one and marks no other issue as
  mentioned; `&` is escaped, so no entity (`&commat;`) becomes a mention; a GitLab line that starts with `/` is
  escaped, so it is no quick action; every markup character of the text is escaped;
- in Jira's wiki markup, the characters of links, mentions (`[~name]`), macros, images, tables and emphasis are
  escaped (a dash or a heading prefix may still format a line); in Azure DevOps' HTML, the text is escaped.

Limits: the detectors are patterns (above). An address of an issue written in full (`https://github.com/…/issues/12`)
stays a link, and GitHub notes it as mentioned. The files name the product's epics, features and stories: share them
as you share the documentation.

### Network

The kit talks to nothing but the application you capture and, with `doc-kit inputs fetch`, the repositories you declared (through git, above): no telemetry, no update check. `doc-kit dev` listens on
`127.0.0.1` only, and answers only requests whose `Host` is itself (`localhost`, `127.0.0.1` or `[::1]` with its
port): a web page cannot read the draft site through DNS rebinding. `facts --network` (opt-in) **sends nothing
unless you list it**: only the packages that `facts.network.allow` of your `doc.config.mjs` names, one entry a package
(`"npm:react"` compared exactly, `"pip:fastapi"` as PEP 503 normalises it, no wildcard), are ever sent; the list is
empty by default, and then nothing is sent. The gate is the network gateway's own (`isPrivatePackage`,
`createRegistryClient`), so every request is held by it (`dependencies` and `quality`), and it judges each item before
the answers already received in the run are looked at. The list is the first net; behind it stand the lock files'
proof and the second net (the declarations, below): a listed name either of them keeps back is never sent. To
build the list without guessing, the command prints how many direct packages it kept back as unlisted, and
`--json` gives them as `network.candidates` — only names the proof and the second net would let through, never a
private or unproven one —, to review with whoever owns the application before listing any. The list is
configuration, and configuration is code (above): whoever can edit `doc.config.mjs` — the application's own
authors, when the documentation project lives in their repository — decides what is sent; read a change to the
list as you read a change to the code. For a listed name, `--network` asks the npm and PyPI registries — one request
a package for the whole run, for the document of its latest version: that it exists, that version, and the licence it
declares — and sends nothing else
(never a version, never a file's content); their answer is untrusted, and kept through allowlists only: the latest
version as a release reads (a digit first, 64 characters at most, no blank, no address, nothing a secret detector
finds), the licence as a licence's name (`safeLicence`), a body whose told size is over 8 MiB never read, the whole
answer within the timeout; anything else is no value. Limit: the size is checked only when the registry tells it
(`Content-Length`, the compressed size of a compressed body); a body that tells none is bounded by the 5-second
timeout alone. The proof, behind the list: it sends a listed name **only when a lock file proves the public
registry served the package**: a `package-lock.json` or Yarn 1
`yarn.lock` entry resolved to that package's own tarball on npm's registry (an alias resolved to another package's
proves nothing, and another entry of the same lock resolved to another package's tarball, or written without `resolved` (a
copy bundled inside another package's tarball apart), drops the proof, whatever the order of the lock's keys; a
`yarn.lock` proves only when written as a whole as Yarn 1 writes one — no lone carriage return, no blank or
comment line inside a block, no berry metadata, no git conflict marker, no string left open on its line, no backslash — and a name only when every
block naming it does and no other name of the lock goes into the same folder (`corp-lib.`, `Corp-Lib`, another
Unicode form), each in Yarn 1's own form: its header, its fields with one space before their value and nothing after
it, `version` and `resolved` once), a `poetry.lock` entry
with no other source (a lock holding an array of tables other than `[[package]]` proves nothing), a `uv.lock`
entry from PyPI's registry whose files are on PyPI's file host (a source or files written in a form uv never
writes, or a key given twice in their inline table, prove nothing); the TOML locks are read by the decoded path of
each value, as their tools read them (a header spelled `[["package"]]` or `[package . sdist]`, an escaped key or
value: a name that is no one-line string is a doubt); a package-lock whose locations are not written as npm writes
them (`node_modules/x/`, `node_modules//x`, `a/../x`, a location that leaves the lock's folder and comes back into
it, past the filesystem's root too, a drive, a UNC path, a `\`; two locations a case-insensitive filesystem reads
as one, in any case or Unicode form, or as a Windows 8.3 short name; a v1 dependency named as a path, or one a link
to the lock's own folder may bring onto the root's — counted at every place npm may put it, wider than npm's own
reading —, or a link to a home folder, an absolute path or a drive) proves nothing — a `file:` link outside the folder
(`../shared`) is npm's own form —, and so does a lock in UTF-16, which its tool does not read; a TOML lock with what TOML and its tool refuse (a key given twice under one header, a table
defined twice in one block, a table over an array of tables, what no value holds inside an array or an inline
table — a header or a `key = value` line in one —, a control character or a lone carriage return, an escape it does not
know, a key with no value or a value followed by more, a bare key holding a blank, a `[[package]]` with no name) or a
key or a table name over 1,000 characters as written (the kit's own limit: what it holds is left out) proves nothing, and
one that is not valid UTF-8 is unreadable (Poetry and uv read none). A name known only from a manifest, a `pnpm-lock.yaml` or a Yarn berry lock (they write no registry), or
from a `Pipfile.lock` (it names PyPI even for a package Pipenv's mirror, `PIPENV_PYPI_MIRROR`, served), is never sent, wherever its registry is declared (a
CI file, a Dockerfile, a monorepo's root, the first team's `~/.npmrc`): `unproven`. Nor is a name its public
registry cannot hold, whatever a lock says of it (npm: URL-safe, neither `.` nor `_` first, 214 characters at most;
pip: PEP 508's — `café`, `_corp`, `corp-`). On top of that proof, the second net keeps back the
private ones, listed or not: the application's own packages (its workspaces), an npm scope that has its own
registry, every npm package when a registry replaces the default one, every pip package when a private index is declared, every npm package when a `package.json` cannot be read as JSON (a
merge left unresolved: its own name and the places its ranges name cannot be told), any package taken from a folder (a spec that starts with `.` or a drive included, as npm reads it), an
archive, a workspace, a git repository, a URL, any protocol but `npm:`, or a private registry, an npm alias
(`npm:@corp/ui@^1`, `npm:corp-ui`) (as a
`package.json` range, `package-lock.json` (v1 to v3), `yarn.lock`, `pnpm-lock.yaml`, `poetry.lock`, `uv.lock`, a
`Pipfile` or `Pipfile.lock`, a PEP 621 direct reference or `[tool.uv.sources]` shows; a requirements line that is a
path or a local archive is never read as a package name), every package a `[tool.uv.sources]` names in any
`pyproject.toml` of the application (the root of a uv workspace names its members'), whatever its form, and any
package of an ecosystem other than npm and pip. Every TOML file these declarations are read from (`pyproject.toml`,
`Pipfile`, `uv.toml`, `bunfig.toml`, Poetry's configuration) goes through the kit's one TOML reader, the one the
manifests are read with: a value is known by its full dotted path, whatever the form a table is written in (a
header followed by a comment, a dotted or a quoted key, an inline table), 16 parts and 8 inline tables deep at most;
a file it cannot read as TOML to its end (a string or a bracket left open…), or holding what TOML refuses (a key given twice, a table defined twice in one block, what no value
holds inside an array or an inline table, a control character) or a key or a table name over 1,000 characters,
makes every package of its ecosystem private; so does a registry, an index, an own name or a requirement written as a string the kit does
not read (a multi-line one). A requirements file's options are an allowlist too (any other option, pip's abbreviations included, is
taken as an index), your `pip.conf` keys are read as pip reads them, an `.npmrc` as npm's ini reader reads it and a `.yarnrc` word by
word (any registry key the kit does not follow, and a key that loads another file, `userconfig` or `globalconfig`,
make every npm package private), a `.yarnrc.yml` in the forms the kit follows only (any other makes every npm
package private), every option word of every logical line of a requirements file is judged, and a byte order mark
hides no first line (a UTF-16 file is read as one).
Poetry's and a Pipfile's dependencies are read the same way, and a dependency with a field that is not a registry's
(`path`, `git`, `develop`… — an allowlist, so that a field the kit does not know never lets a name out) is never
sent. Behind every reader, a range or a pip version holding anything but a release's characters (`/`, `:`, `@`, `\`…)
names a place: it is never sent.
The manifests read beside a lock file to tell its direct dependencies (a `package.json` and its workspace members,
a `pyproject.toml`, a `Pipfile`) are read in the lock's own folder only: a workspace pattern is compared with the
folders listed there, never resolved (three folders deep, 2,000 folders, 50 patterns of 8 segments, 200 members;
a form other than a name, `*`, `**` or one `*` in a name is not followed), and a link, a folder the facts never walk (`build/`, `dist/`, `vendor/`…), or
an unusual file (a device, a pipe, over 4 MB) is not read. The declarations are read
in the application (every folder down to each manifest: `.npmrc`, `.yarnrc`, `.yarnrc.yml`, `bunfig.toml`,
`pip.conf`, `pip.ini`, requirements files and the files they include (`-r`, `-c`; one the kit cannot read counts as
an index), their `--find-links`, Poetry, PDM, Rye and uv indexes, uv's `find-links` and `[tool.uv.pip]`, `uv.toml`,
Pipfile sources, a project's `poetry.toml`, Poetry's PyPI mirror plugin a `pyproject.toml` requires), in your own
configuration (every home folder, `NPM_CONFIG_USERCONFIG`, `PIP_CONFIG_FILE`, `UV_CONFIG_FILE`, Poetry's
repositories and its PyPI mirror plugin's table, `find-links` in your `pip.conf`) and in the npm, yarn, bun, pip,
uv and Poetry variables (their `FIND_LINKS`, `PIPENV_PYPI_MIRROR`, `POETRY_PYPI_MIRROR_URL` and Yarn 1's
`YARN_REGISTRY` too). A yarn or bun file that names scopes in a
form the kit does not follow makes every npm package private. **What these readers promise** (the second net, behind the list and the
lock files' proof): each reads the forms its tool documents as the tool reads them (line breaks, comments, quotes and escapes, a requirements file's
joined lines), and fails closed on what it does not follow — a whole family of forms at once where it can (any
quote or escape in a requirements line's options, any key escaped or quoted strangely, any TOML it cannot read to
its end). A declaration written on purpose to look like something else, by the application's own authors, may
still escape a reader: the protection is against the accidental leak of an ordinary configuration. Not read: the global npm and pip configurations of the machine, PDM's and Rye's own configurations, Hatch's
environments, a uv workspace root above the application folder. What the proof cannot tell: a private package published on npm's or PyPI's public registry itself is proven by
its lock like any other, and its name, once listed, sent to the registry that already hosts it. A lock written without
`resolved` (npm's `omit-lockfile-registry-resolved`) proves nothing: nothing of it is sent. Nor can a lock tell
an install that went elsewhere than the registry it names: a lock whose URLs a team rewrites to the public
registry while npm (`replace-registry-host`) or Yarn sends the installs to its own registry, or a `poetry.lock`
installed through Poetry's PyPI mirror plugin, proves its packages public; so does a lock written through a private
registry declared elsewhere than the kit reads (a CI variable, another computer) that serves a private package under
a tarball URL shaped as npm's own (`https://registry.npmjs.org/<name>/-/…`): npm writes that URL in the lock, and
npm itself reads the lock so. The second net keeps them back only when that registry or mirror is declared where the
kit reads (the application's files, your configuration, your variables), not when it is set on the installing
machines alone: declare it before `--network`, and never list such a package. Nor can the kit tell a link (v1) or a location (v3) that comes back
into the application folder under another name than the folder has where the kit reads it (a renamed clone): it is
read as an outside folder.
`facts --tools` runs `osv-scanner` **offline only**: its database is downloaded (public files, no package name sent)
only with `--network`. The reports of the external tools are kept through an allowlist of fields (rule, file, line,
package, version…): a matched secret, a line of code, an author or an e-mail address never reaches `facts/`.
`probe` runs only on a local instance or one you declared a demo (`capture.target: "demo"`), with `GET` and `HEAD`
only, never follows a redirect, and never requests a route of `capture.forbidden`. The generated site loads nothing
from the network (its Content Security Policy forbids it).
