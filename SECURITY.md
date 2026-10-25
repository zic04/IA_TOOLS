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
  anywhere else in the project, whatever its size (one over 5 MB is told by its first 64 KB, as `export` tells it
  below), or tracked by git.
- `doc-kit export` never copies a `.doc-kit/` folder (at any depth), the file named by `<PREFIX>_SESSION` /
  `DOC_KIT_SESSION`, any JSON file that is a browser session, environment files (`.env*`, `.envrc`), keys and
  certificates (`*.pem`, `*.key`, `*.p8`, `*.p12`, `*.ppk`, `id_rsa`…), tool credentials (`.npmrc`, `.netrc`,
  `.git-credentials`, `.htpasswd`, `credentials`, `credentials.json`, a Google OAuth `client_secret*.json`, a
  `kubeconfig`), Terraform state and variables (`*.tfstate`, `*.tfstate.backup`, `*.tfvars`), VPN profiles
  (`*.ovpn`), encrypted files (`*.gpg`) or the settings of an environment (`appsettings.*.json` and its `.bak` copy;
  `appsettings.json` itself is copied). A JSON file of 5 MB at most is parsed whole: it is a session when its
  top-level object holds a `cookies` and an `origins` list, in any order, or one of them alone whose first item has a
  session's shape (a cookie with its `name`, `value` and `domain`, in any order; an origin with its
  `localStorage`). A longer one is told by its first 64 KB: it starts as a session (an object whose first key is
  `cookies` or `origins`), and the top-level keys of those 64 KB hold the other one (the depth of the JSON is
  followed: a key of a nested object never counts), or its first item has a session's shape as Playwright writes it
  (`name`, `value`, `domain` in that order; `origin`, `localStorage`). So a session holding megabytes of local
  storage is left out too, and a data file that merely starts with a `cookies` list, even one whose items hold an
  `origins` list, is not one. A session longer than 5 MB written in another order, its other key past its first
  64 KB, is not recognised: keep sessions in `.doc-kit/`. Other names are copied: a `.kube/config`, a key without its
  extension.
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

### The secret detectors have limits

`doc-kit check secrets` blocks the build, and its detectors (`engine/check/secrets.mjs`) also filter `pack`,
`backlog export` and `inputs ingest`, and give the `secrets` facts of an application. They look for values, never
for a mere mention:

- private keys holding key material: PEM blocks (PKCS#8, RSA, EC, OpenSSH, encrypted ones), a PEM block escaped on one
  line in a JSON file (the `private_key` of a service account), PGP private key blocks, the private lines of a PuTTY
  key; a JWT; the password of a connection string or of a URL;
- the tokens of known services, by their shape: AWS access key IDs, GitHub (classic and fine-grained), GitLab
  (personal, runner and runner registration, deploy and pipeline trigger tokens), npm, Slack (tokens, app tokens,
  incoming webhooks), Google API keys and OAuth client secrets, OpenAI-style `sk-` keys, Stripe keys and webhook
  secrets, SendGrid (`SG.`), Hugging Face (`hf_`), DigitalOcean (`dop_v1_`, `doo_v1_`, `dor_v1_`), Twilio API keys
  (`SK` and 32 hexadecimal digits), Discord webhooks and Microsoft Teams incoming webhooks;
- the value of an assignment to a secret's name, whatever the words before it: `SECRET_KEY`, `DB_PASSWORD`,
  `GITHUB_TOKEN`, `aws_secret_access_key`, `dbPassword`, `"client-secret":`…, or a secret's word glued to a name in
  capitals (`PGPASSWORD`, `MYSQLPASSWORD`, `VAULTTOKEN`), after `=`, `:`, `:=` or `=>`, quoted
  or not, and the text of an XML element or setting named so, on one line (`<password>…</password>` in Maven's
  `settings.xml`, `<add key="ClearTextPassword" value="…" />` in a `NuGet.Config`, a .NET `appSettings`). The value
  is read on the name's line, up to a character other than an ASCII letter, a digit or
  `_-+/=.~!@#$%&*` (a blank, a quote, `,`, `:`, `;`, a bracket, a parenthesis…): it may hold the signs of a password
  (`Tr0ub4dor&3xQ!`) and the `~` of every Azure AD client secret, but a `&` that starts another URL parameter
  (`&user=`) ends it. It is a secret from 8 characters, in capitals (a base 32 key) or without a digit too, and from
  16 when made of letters only, or of words of letters joined by `-`, `_` or `.` (`correcthorsebatterystaple`; a
  label's word, `"password": "Passwort"`, is shorter); a number is one under a password's name only (`password`,
  `passwd`, `pwd`, `pass`, `pw`, `passphrase`), from 8 digits (`DB_PASSWORD=73829164`). A name merely starting so (`KEYBOARD`, `TOKENIZER`) is not one. For the key of anything else
  (`STRIPE_KEY`, `CACHE_KEY`), the value must have 16 characters or more and look generated; a public name
  (`publicKey`, `PublicKeyToken`, `NEXT_PUBLIC_…`) is never a secret's. The password of a connection string
  (`Password=` or `Pwd=` written as a word, its value unquoted) is a connection string's next to another pair, after a
  `;` or a blank (`Server=db;Password=…`, `Password=…;Server=db`, a libpq DSN `host=db user=app password=…
  dbname=orders`), whatever its value, in capitals too (`Password=ORDERS2024PROD;`), but a placeholder or a variable's
  name in capitals with an underscore; a lone `password = …` is an assignment (and the floor below reads it from 6
  characters), and so is `password:` or a quoted value next to a pair;
- the signature of a signed URL (`sig=`, `Sig=`, `X-Amz-Signature=`…, in any case), but a mask as the whole value
  (`Sig=XXXX…`; a placeholder's word inside a signature does not hide it);
- the floor: the two value rules of 0.4.1 run after the detectors above, reading the text as they read it, so that
  what 0.4.1 reported is still reported (`test/unit/secret-recall.test.mjs` checks a table of such lines and eleven
  realistic files holding secrets): one of the words `password`, `passwd`, `secret`, `token`, `api_key` (`api-key`,
  `apikey`), `client_secret` or `access_key`, written as a word (`db.password`, `x-api-key`, `--password`; not
  `DB_PASSWORD`), then `:` or `=` and a value of 16 characters or more of letters, digits and `_-+/=.` holding a digit
  and a letter, on the name's line or the next (`password:` then `  Summer2024Winter99`); and `Password=` or `Pwd=`,
  written as a word, then a value of 6 characters or more up to a blank, a quote or a `;` (`password=postgres`,
  `--password=Summer2024Winter`, `password=$ecretPa55w0rd`). What they find is reported whatever the exceptions
  below say, with only these, each decided on the whole value, never on a part of it, and, but for `change-me` and
  `replace-me`, which may end in a number (`replace-me-with-a-real-key-2024`), never for a value holding a number of
  two digits or more, checked first (`password=$ECRET2024`, `Password = configuration["DbPassword2024"];`
  and `password=PROD_DB_PASS_2024,` are reported):
  - a shell's or Windows' variable: a sigil and a name in capitals whose words are joined by `_`, or that names a
    secret (`PASSWORD=$DB_PASSWORD`, `password=%DB_PASSWORD%`, `$PGPASSWORD`; `$PRODPASS` is a password);
  - in a line written as code, that is with the `;`, `,` or `)` of code after the value, or a blank before it and a
    name in lower case first (`Password = model.Password;`, `password = request.form.password`; not
    `password=model.Password` nor `password=GetPassword()`, as a properties file or a command line writes a password,
    nor `password = Root.Secret`): a member that names a secret's field; a call of a name of several words or of
    members, whose arguments are names in lower case, members or quoted texts (`Password = GetPassword();`,
    `password = config.get("db")`; `Welcome(user)`, `SuperSecret(1)` and `SummerFun(Beach)` are passwords); an index
    by a quoted key (`Password = configuration["DbPassword"];`); with nothing after it but what ends a value as
    0.4.1 read it (a blank, `;`, a quote), `,` or `)` (`HappyDays(x)!`, `Pass.Word(1)#Kx!q` are passwords);
  - a placeholder: 0.4.1's, and `change-me` or `replace-me` as the whole value, words and a number last after it
    (`password=change-me`, `secret: replace-me-with-a-real-key-2024`; `Replacement2024!`, `Exchange-Me2024`,
    `Change-Me-2024` and `change-meXYZ2024` are passwords); a mask or a variable's name in capitals before the `,` or
    `)` of code (`password=********,`, `connect(password=DB_PASSWORD_VALUE, user=USER)`).

  The password of a URL (`credentialsUrl`) is read as 0.4.1 read it, with its placeholders only
  (`postgres://app:change-me@db/orders` is reported, `your-password` is not), and 0.4.1's `?sig=` and
  `&sig=` whatever their value (`?sig=XXXX…` too);
- last, a fallback by entropy: a value assigned to any name, or quoted, of 20 to 256 characters, holding lower case,
  upper case and digits, whose kind of character (lower case, upper case, digit) changes from one letter or digit to
  the next at least 45 times in 100, as in a random token (a name made of words and numbers changes far less), and
  whose Shannon entropy reaches log2(length) − 0.6 bits per character, at most 4.2. It reports only a line no other
  detector reported. Calibrated by `test/unit/secret-detectors.test.mjs`: it finds about 89 random tokens in 100 of
  20 to 28 characters and 97 in 100 of 32 or more, and nothing in a corpus of harmless values (names in code, paths,
  cloud sizes, versions, alphabets, hashes) nor in the kit's own documentation.

Never a secret: a placeholder (`<password>`, `****`, `${SECRET}`, `xxxx…`, `example`, `your…`, `exemple`, `votre`,
`motdepasse`…, and `change-me` or `replace-me` as the whole value), the default of a shell expansion
(`${DB_PASSWORD:-postgres}`), a reference (`process.env.…`, `os.environ…`). Under a secret's name (or the key of
anything), neither is a number (but 8 digits or more under a password's name) nor a value of fewer than 5 different
characters (`***-***-***`), nor, under a secret's name, a reference written as code: a variable's name in capitals with
an underscore, unquoted (`DB_PASSWORD_VALUE`), or quoted when it holds no digit, is wrapped in underscores or holds a
secret's word (`"__REPLACE_AT_DEPLOY__"`, `"OPENAI_API_KEY"`; `"S3CR_ET99_ZQ"` is a value), a sigil and a name
(`$DB_PASSWORD`, `%DB_PASSWORD%`, `@password`, a YAML alias `*password`), a YAML tag (`!ImportValue`), a path
(`/run/secrets/db`), a comparison (`token === …`); unquoted, a member (`config.jwt.secret`) or members joined by `+`
(`r.C0.ESC+r.C0.ESC`, minified code), a call or an index (`getPassword()`, `configuration["DbPassword"]`) and, under a
name that is not in capitals (code rather than an environment file), a name in code of several words (`hashedPassword`,
`new_password`): a value holding a number of two digits or more is neither a member nor a name in code
(`password: SummerHoliday2024`, `password: Summer2024.Winter99` and `ya29.…` are values); unquoted after `:`, a CSS
pseudo-class (a vendor's: `#password:-webkit-autofill`, `.token:-moz-ui-invalid`, or one a block follows:
`.password:picture-in-picture{`) and, under a name in lower case ending in `secret` (a Helm value), a resource's name of
lower-case words joined by `-`, `.` or `/` (`tlsSecret: wildcard-tls-certificate`); a documentation's example, letters
only or in capitals holding a secret's word (`mysecretpassword`, `MYTOKEN1`). A name holding `existing` or `pull` points
to a resource that holds the secret (`existingSecret`, `imagePullSecret`): it is not a secret's name, nor are
`secretName` and `secretRef`, which end in another word. For the entropy fallback, never a hash (hexadecimal,
`sha512-…`), the value of a hash, a nonce or an identifier (`integrity`, `pin-sha256`, `nonce`, `state`,
`code_challenge`, `id`, `client_id`, `…_name`) or of a public name, nor a URL's query or fragment parameter whose name
says nothing of a secret (`?list=`, `&fbclid=`, `&amp;gclid=`): one whose name ends in a secret's word, or in one a URL
gives a secret (`sig`, `signature`, `token`, `key`, `secret`, `password`, `credential`, `session`, `sid`, `auth`), is
read. An OAuth authorisation code (`?code=`) is not: it is used once, within minutes, and every provider's documentation
shows one. A value two detectors find is reported once, by the first (a Google key in a URL's `key=`: `cloudKey`). These
exceptions never hide what the floor finds (above).

Limits: the detectors are patterns and a measure, not a proof.

- A secret of an unknown shape under a name that does not say so passes when it is short (under 20 characters), of
  one case or without digits (a password made of words, a base 32 or hexadecimal key: only an assignment to a
  secret's name finds it), longer than 256 characters, not assigned nor quoted (a word alone in a sentence or a table
  cell), or the value of a URL parameter whose name says nothing of a secret.
- Under a secret's name, a password passes when it is shorter than 8 characters (16 for letters only), holds a
  character the value stops at (a blank: `"correct horse battery staple"` is read as `correct`; `:`, `,`, `;`, a
  bracket, a parenthesis, `^`, `?`, a letter outside ASCII) before its 8th, is on the line after its name, or is
  written like one of the references above: a name in code with one digit at most unquoted under a name in lower
  case (`db_password: OrdersProdValue1`), `PROD_DB_PASS_2024` unquoted (a variable's name in capitals:
  `SECRET=PROD_DB_PASS_2024`), `@dmin2024Prod` or `$ecretPa55w0rd` (a sigil and a name), `my.pass.word` (a
  member), `supersecretpassword` (letters with a secret's word), `!Password` (a YAML tag), lower-case words joined by
  `-` under a name in lower case ending in `secret` (a resource's name), or the default of a shell expansion. A
  number of fewer than 8 digits, or under a token's or a secret's name, is not one. The floor finds some of them
  all the same (after `Password=` or `Pwd=` from 6 characters; after one of 0.4.1's words, 16 characters or more
  holding a digit), as 0.4.1 did.
- The floor leaves out a password written exactly as a reference in a line written as code (above):
  `Password = Root.Secret;`, `password = my.secret`, `Password = Get.Token(x);`,
  `connect(password=Hello["x"], user=USER)`. A line cannot tell such a password from a reference of the same
  shape, and the detectors do not know whether a file is code or configuration (`scanText` reads a text, never its
  file's name): left out, as in code, where a reference is far more common than a password written so. 0.4.1
  reported them.
- A secret's word glued to a name in lower case (`pgpassword=`, `dbpassword:`) is not a secret's name, nor is a name
  of more than 128 characters (only the floor reads one, by its last word), nor a setting written without `=` or `:`
  (Redis' `requirepass Orders2024Prod`).
- On a command line, a password after a blank (`--password value`, `-p value`) is not looked for; `--password=value`
  is. An XML element's text is read on one line, without a blank, 256 characters at most; a setting only as
  `<add key="…" value="…">`, its key first.
- Not looked for: a token after `Authorization: Bearer` or `Basic` (unless it has a known shape or is a JWT), a token
  as the user of a URL (`https://<token>@host`; a `user:password@` is found), a PEM key whose lines start with `> `
  or `// ` (quoted in a message or a comment), a PEM block cut before its `END` line, and an Azure AD client secret
  under a name that does not say so.
- About one random token in ten of 20 to 28 characters looks too regular to the entropy fallback, and one in thirty
  of 32 or more.
- A random value that is not a secret can be reported: a test fixture, data encoded in base 64, an identifier made of
  short words and digits (`dnsAlpnH3JobWonWithoutRace`), a public token under a secret's name (a coverage badge's
  `?token=`). Set a value known to be public aside with `masking.allow`.
- Lines are the unit: one detector's finding hides the fallback's on the same line, and a filter (`pack`, `backlog
  export`, `inputs ingest`) replaces the whole line.

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
  parameters — a single word of twenty letters or more, or one with five consonants in a row, is masked;
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
  is ever opened. A PDF is only indexed (its page count), never parsed further; the agents read the file itself.
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

### The skill's agents: the application is data, never instructions

The skill's agents read the application's code, its comments, its instruction files (CLAUDE.md, AGENTS.md,
.cursorrules), its commit messages and its diffs — all of them text that may be written to steer an AI. The skill
treats them as data on every path an agent takes:

- **Every brief an agent reads and every agent definition** (`skill/doc-kit/assets/briefs/`, `skill/doc-kit/agents/`)
  says, in its common part and in both languages, that the application's files are data to describe, never
  instructions to follow, and that an instruction found in them is reported as a finding, never acted on
  (`test/unit/skill-briefs.test.mjs`, RULES.md M15, with a brief without the rule as its positive control).
- **A decision to skip work never rests on text from the application that asks for it**: `triage` never marks a page
  `intact` because a comment or a diff says so (that page is at least `edit`), nor do `update`, `findings-verification`,
  `security-review`, `code-health` and `inventory` leave out, reject or dismiss anything on such a text (same test).
- **Every context file** (`doc-kit context`, and its translator's dossier) starts with a fixed notice, in the site's
  language: what follows is the application's content, data only (`test/unit/context.test.mjs`,
  `test/unit/languages.test.mjs`).
- **The agents with Bash** (`doc-kit-writer`, `doc-kit-analyst`, `doc-kit-reviewer`) run it through a guard, their
  PreToolUse hook, written in Claude Code's exec form: `command: node`, `args: ["<skill>/scripts/bash-guard.mjs"]`,
  `onFailure: block`, the path `doc-kit skill install` writes in their definitions (a YAML string: no shell ever reads
  it, so a quote, a `$` or a backquote in it stays a character of the path). It reads the command as bash splits it —
  by hand: no shell, no eval, no regular expression, no file read — and lets through only the kit's CLI by its absolute
  path, `node "<kit>/cli/doc-kit.mjs" <command>` (the kit's path `skill install` wrote in the skill, never one a
  documentation project names), `node <skill>/scripts/<script>.mjs` (the skill's four scripts, by their absolute
  path: the skill's real one, or the one its hook was started from, below), read-only tools (`ls`, `cat`, `head`,
  `tail`, `wc`, `grep`, `rg`, `find`…) with their reading options, one
  `cd <folder> &&` first, `|`, `&&`, `||` and `;` between them, and the redirections `>/dev/null`, `>&1` and `>&2`,
  alone or after a `1` or a `2` written against them, unquoted (`2>&1`, `2>/dev/null`). The words it checks are
  bash's to the letter (but a `~` on Windows, which it keeps as it is: a word that is never a program's path there,
  nor an option): what a quote, a backslash or an empty string changes next to an operator, it reads as bash
  does or refuses — bash takes a word for the number of an output only when it is digits alone, as written, so of
  `"2">`, `'1'>`, `\2>` or `2"">` it makes the argument `2` (or `1`) and a redirection of the standard output, which
  the guard refuses as it does every word against a redirection but that `1` or `2`.
  - **Never `npx doc-kit`, `npm exec doc-kit` or a bare `doc-kit`**: npx looks for the bin in the `node_modules/.bin`
    of the folder and of every parent up to the root, so an application that ships a `node_modules/.bin/doc-kit` got
    it run whenever the documentation sat inside it (`<app>/docs/manual`, the default layout); with none found and no
    terminal, npx installs `doc-kit` from the public registry without asking. A bare `doc-kit` is the `PATH`'s, which
    may be anyone's.
  - **What runs never depends on the folder**: a program named by a relative path is refused, and so is a `cd` that is
    not the first command or not followed by `&&` — in a pipeline it runs in a subshell, after `||` it is skipped, and
    bash runs what follows in the folder it started in.
  - **On Windows, a program's path has its drive** (`C:/…` or `C:\…`), which Git Bash hands to node as it is. Git
    Bash's own form, `/c/…` (and `~`, which is `/c/Users/…` there), is refused: Git Bash converts it to `C:/…` only
    when the word holds none of `'`, a backquote, `*`, `?`, `[`, `]`, `:`, `;`, `/~` or `@@`, and never under
    `MSYS_NO_PATHCONV`; otherwise node reads `/c/…` as `C:\c\…`, so `node "/c/<kit>/cli/x'/../doc-kit.mjs"` looked
    like the kit to the guard and ran a file outside it. Two paths name one file when they differ by the case of ASCII
    letters only, as NTFS reads them by default: the guard folds `A`–`Z`, character by character, never with
    `toLowerCase()`, which folds letters NTFS keeps apart too (U+212A, the Kelvin sign, to `k`; U+212B, the Angstrom
    sign, to `å`), so that a lookalike folder's script passed for the skill's. Any other difference of case is another
    path, refused. A folder NTFS was told to read case by case (`fsutil file setCaseSensitiveInfo`; one WSL creates)
    holds `CLI` beside `cli`, two folders the guard takes for one: in the kit's or the skill's folder, or in any folder
    above it that reads case by case (a parent WSL made), what can write in that folder can make the second —
    `DOC-KIT` beside `doc-kit` in such a `skills` folder —, whose script then passes for the skill's (an agent's Write
    is not the guard's, below). Keep the folders that lead to the kit and to the skill read case-insensitively
    (`fsutil file queryCaseSensitiveInfo <folder>`).
  - **The skill's folder has two paths, the kit's one.** node loads a module by its real path, links resolved: that is
    the skill's folder the guard is sure of. Its hook is started by the path its configuration gives (`args`, the path
    `skill install` wrote), which may go through a link — a linked `~/.claude`, a dotfile manager's, macOS's
    temporary folder under `/var` (a link to `/private/var`), a junction — and so may the agents' commands. The guard
    takes either: the real path, and the folder of the path node was started from (`process.argv[1]`), when that one
    leads to the real one, links resolved; each is compared as above (on Windows, its drive, ASCII letters folded).
    The paths a command writes are never resolved: a folder that only looks like the skill's (`doc-kit2`, a Kelvin
    sign for the `k`) or a link planted to it is another path, refused, and a hook started by the real path knows no
    link. The kit has the one path `skill install` writes in the skill and in its texts alike, its real path. A limit,
    which fails closed: a hook started by a Windows 8.3 short path (`C:\PROGRA~1\…`) knows the skill by that short form
    only (node keeps it in the module's path, and the guard expands no short name), so it refuses the commands that
    name the skill by its long form.
  - **The read-only tools take the options of an allowlist, tool by tool** (`READ_ONLY_SPECS`): an option not listed
    — a new one, an abbreviation getopt would accept, another spelling — is refused, so no option that runs a program
    or writes a file can slip through. A list of the dangerous ones did: `rg --hostname-bin=<program>
    --hyperlink-format=… --color=always` ran the program while only `--pre` was refused. Left out, among others: rg's
    `--pre`, `--pre-glob`, `--hostname-bin`, `--hyperlink-format`, `-z` (it runs decompression programs),
    `--ignore-file`, `-f`; find's `-exec`, `-execdir`, `-ok`, `-okdir`, `-delete`, `-fprint*`, `-fls`; sort's `-o`,
    `-T`, `--compress-program`; `tail -f`, and its old forms that follow the file too (`tail +1f`, `tail -n +1f`): of
    a word that starts with `+`, tail, sort and uniq take a plain `+N` only, and `-n`, `-c` take a number; every option
    that reads its list of files or patterns from a file. A value given as the next word never starts with `-`
    (whatever a tool makes of the option before it, such a word is checked as an option), and uniq takes one file
    name at most (it writes to its second), every word from its first file name on counted as one, as a getopt that
    stops at the first operand reads them (GNU's under `POSIXLY_CORRECT` takes the `-c` of `uniq a -c` for the second).
  - It refuses git, npm, any other program or path, a variable, a command substitution and the other expansions
    (`$'…'`, `$"…"`, `$((…))`, braces, a `~` that starts a word other than `~` or `~/` — `~+`, `~-`, `~user` —, and
    one right after `=` or `:`, where bash expands it in a word that looks like an assignment, `x=~`), any other
    redirection (to or from a file, `&>`, `|&`, `>|`, `<>`, a here-string, `>&-`, a process substitution) and one
    right after a quoted or escaped word (above), a background job, a subshell, an unquoted wildcard, a second line, a NUL character (bash
    drops it from what it reads:
    `ls \<NUL>'; git push; ls \<NUL>'` was one `ls` to the guard, and ran `git push`), the doc-kit commands that run
    something else or
    belong to the orchestrator or the user (`bricks`, `connect`, `demo`, `dev`, `facts`, `hooks`, `init`, `inputs`,
    `open`, `probe`, `record`, `skill`, `upgrade`), and `--plans` (capture plans are code).
  - **It fails closed**: Claude Code blocks a command on exit code 2, so input it cannot read, a skill file that cannot
    load (a corrupt message file, its decision's module missing or throwing: the hook imports nothing before it runs,
    and loads the skill's modules inside a try), an answer of the decision other than 0, and an unexpected error are
    refused with 2; and, through `onFailure: block`, Claude Code counts as 2 what the guard cannot catch: the hook's
    own file missing or broken (node's exit code 1), no `node` on the `PATH` (the hook cannot start), a timeout. A
    decision that never comes is refused too: a module of the guard or the decision that never settles leaves node's
    event loop empty, and node then ends with 0 — the command ran; the hook's exit code is 2 from its first line, only
    the decision's explicit 0 ends with 0, and node's `beforeExit`, which comes only when no decision ended the
    process, refuses with 2 and says so (a module that ends the process itself, `process.exit()` without a code, or
    takes `beforeExit` away, ends with that first 2, without a word). The
    hook's file,
    `scripts/bash-guard.mjs`, exports nothing and checks nothing of how node was started: however node is given it
    (its path, through a linked folder — a linked `~/.claude`, macOS's temporary folder under `/var`, a junction —, a
    file URL with a query, an import), it reads its input, decides and exits; the decision reads `process.argv[1]` for
    the skill's second path only (above), never to choose whether to decide. The decision is
    `scripts/bash-decision.mjs`'s, with the read-only tools' allowlists of `scripts/bash-options.mjs`, which the tests
    import (a guard that checked whether it was the program node ran, wrong under a link or a URL, ended with 0 and
    let every command through). On Linux and macOS, node loads no ES module from under a folder whose name holds a
    backslash: there the guard cannot start (exit code 1), `onFailure: block` refuses, and the agents get no Bash.
  - It only ever refuses: what it lets through still goes through Claude Code's own permissions
    (`test/unit/bash-guard.test.mjs`: a table of allowed and refused commands; the words of quotes, escapes and empty
    strings next to an operator, the guard's against a real `sh`'s, which hands a program the argument `2` of
    `"2">&1`; a table, per read-only tool, of the
    options agents use and of the ones that run a program or write a file, through the decision and the real hook
    process, and a property: an option not listed is always refused; the Windows path forms, a lookalike folder
    (U+212A) refused by the decision and by the real hook process, and a property: every character that lower-cases
    onto a letter of the kit's or the skill's path, other than that letter's ASCII case, is refused; the hook's file
    started through a file URL with a query and through an import, which still refuses; a real hook process run
    from `<app>/docs/manual`, with a `node_modules/.bin/doc-kit` planted in the application, refuses every form that
    reaches that bin and lets through the kit's own, which never runs it; the hook started as the exec form starts it,
    from a folder whose name holds quotes, `$`, a backquote and `;`, through a linked folder, with a missing script
    and without `node`; the skill reached through a linked folder, its scripts let through by the path the hook was
    started from and by the real one, a `doc-kit2`, a lookalike and a planted link refused, and the linked path
    refused to a hook started by the real one; a corrupt message file, a module that throws, the decision's module missing or throwing, a decision that answers anything but 0, a module or a decision that never settles, and one that ends the process without a code or takes node's `beforeExit` away, which only the exit code set on the hook's first line refuses; the agent definitions that name it. The
    ReDoS harness measures it).
- **Every skill text gives the kit by its path**: SKILL.md, the references, the briefs (in English and French) and the
  agent definitions write the kit's commands `{{KIT_CLI}} <command>`, which `skill install` replaces with `node
  "<kit>/cli/doc-kit.mjs"` (and `brief.mjs`, filling a brief, with the same command): the agents run the one form the
  guard lets through, and the orchestrator, which no guard bounds, no longer runs npx either
  (`test/unit/skill-briefs.test.mjs`, RULES.md M15: no `npx doc-kit`, no bare `doc-kit` command, with both as its
  positive control; `test/unit/skill.test.mjs`: the installed texts, the filled briefs and the installed guard agree).
  `{{scriptsDir}}`, the skill's scripts folder in the analysis brief's `node "{{scriptsDir}}/analysis.mjs" check …`,
  is escaped for bash's double quotes as the kit's path in `{{KIT_CLI}}` is, and `skill install` replaces every
  placeholder in one pass, so a folder whose name holds one keeps it (`test/unit/skill.test.mjs`: a skill folder with
  a quote, `$` and a backquote gives a check the guard lets through and bash reads as the skill's script; a backslash,
  on both machines' settings; skills and kit folders named after the placeholders, and a kit path whose JavaScript
  string holds the scripts' form of one, `"{{KIT_CLI}}"`).

Limits: the briefs and the notices are words an agent may still not follow, and the guard is not a sandbox. What it
does not bound:

- **Bash only.** An agent's Edit and Write are bounded by its brief and Claude Code's permissions, not by the guard:
  an agent steered to write a file can write one the kit then runs — a capture plan is a JavaScript module that
  `doc-kit capture` imports, and `doc.config.mjs` is one every command loads.
- **A planted configuration is still read.** The guard names the program, not what the kit reads: the kit and the
  skill's scripts load the `doc.config.mjs` of the folder they run in (or of a parent), or of `--project`, and that
  file is code. `cd <any folder> && <kit> build` and `<kit> build --project <any folder>` go through, so a
  `doc.config.mjs` the application ships still runs if an agent is steered to it. The guard no longer checks that a
  folder holds a `doc.config.mjs`: that told nothing of whose it is (`cd docs && npx doc-kit build --project ../evil`
  passed it). Review a `doc.config.mjs` you did not write before running the kit on it.
- **Reads are not bounded to the project.** A read-only tool reads any file the operator can: `cat ~/.ssh/id_rsa`,
  `cat /proc/self/environ` and `grep -r TOKEN ~` pass the guard, so an agent steered to it can read the operator's
  keys, tokens and environment. Its Edit and Write are not guarded either (above), so what it read may end up in a
  page; `doc-kit check secrets` is then the remaining net (`pack` and `backlog export` run its detectors too), and it
  reads patterns (a secret of an unknown shape passes). Keep Claude Code's permission prompts on for the agents'
  Bash, and refuse a read outside the project.
- **The hook itself.** It needs Claude Code 2.1.295 or later, the first that knows the exec form of hooks (`args`) and
  `onFailure`; `doctor` warns when the `claude` on the `PATH` is older. An older one ignores both and runs `node` alone
  through its shell: node reads the hook's input as a script and fails, a failure that does not block, so the guard does
  not run — update Claude Code. The exec form needs no shell: written as a command line, the hook would need bash or sh,
  which Claude Code uses for hooks except on Windows without Git Bash, where it uses PowerShell, in which `|| exit 2`
  does not parse (the hook would fail without blocking) and a path's `\$` is no escape. An agent definition edited after
  installation may have lost its hook (`doctor` reports it as modified).

Keep Claude Code's permission prompts on for the agents' writes outside the documentation folder.

### Files for the next AI (`pack`)

`doc-kit pack` writes `llms.txt`, `llms-full.txt`, `AGENTS.md` and `CLAUDE.md` in the documentation project, never
in the application. From the application it reads only the facts files and the `scripts` of its `package.json`
files, parsed as JSON and never run. `AGENTS.md` names environment variables, never their values. Every file goes
through the secret detectors of `check secrets`: a line where one fires is replaced by a notice and reported (exit
code 1), so a secret pasted in a page never reaches the pack.

Limits: those of the secret detectors (above). A secret they do not recognise (a short password, a token of an
unknown shape that does not look random) passes. Review the files before handing them to an agent, and `AGENTS.md`
before committing it.

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
