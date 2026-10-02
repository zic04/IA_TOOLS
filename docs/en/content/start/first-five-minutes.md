## The goal

In five minutes, you create the documentation project of a real (fictional) application, capture its first screen
with numbered markers, and open the site with live reload. The application is **Acme Orders**, the small demo shipped
with the kit in `examples/demo-app`: a sign-in page, an orders list, an order record and a settings page.

> [!RECIPE] What you need
> - The kit installed, and `doc-kit doctor` without ✖ ([Install doc-kit](#/start/install)).
> - A terminal you can type in: `connect` waits for you to press Enter.
> - Five free minutes. The demo needs no database and no account: it accepts any e-mail and password.

## Who does what

| Step | Command | What you get |
|---|---|---|
| 1 | `node serve.mjs` | The demo application on `http://127.0.0.1:4173` |
| 2 | `doc-kit init` | `docs/manual/`, a complete project skeleton |
| 3 | `npm install` | The project linked to the kit |
| 4 | `doc-kit connect` | Your session, saved in `.doc-kit/session.json` |
| 5 | `doc-kit capture --preview` | `images/home.webp` and its zones |
| 6 | `doc-kit dev` | The site in your browser, rebuilt on every change |

## Step 1 — Start the demo application

Copy the demo out of the kit, so that the documentation project is not created inside the kit's repository, then
start it and leave the terminal open:

```bash
cp -r <kit folder>/examples/demo-app acme-orders
node acme-orders/serve.mjs
```

The terminal prints `Acme Orders (demo) on http://127.0.0.1:4173`. Another port: `node acme-orders/serve.mjs --port 4180`.

## Step 2 — Create the documentation project

In a second terminal:

```bash
doc-kit init acme-orders --url http://127.0.0.1:4173
```

`init` looks at the application folder (framework, routes, port, product name), then asks the **product name**
(`Acme Orders`, from the folder name), the **language** of the site (`en` or `fr`) and the **sign-in method**
(`manual`: you sign in, then press Enter); it asks the **application URL** too when `--url` is not given. Press Enter
to accept each proposal. Before writing anything, it prints a **recap**: the product name and where it was found, the
slug, the language, the URL, the version and the file it is read in, the sign-in, the coverage, the masked `.env` files
and the application folder. Check it, then confirm. It writes 22 files in `acme-orders/docs/manual/` and prints the
next commands. To rename the product afterwards, change `product.name` in `doc.config.mjs` and the titles of
`content/toc.json`.

> [!TIP] Without questions
> `doc-kit init acme-orders --url http://127.0.0.1:4173 --name "Acme Orders" --auth manual --yes` takes the detected
> values and the options as they are, and prints the same recap. The language of the site is then `--lang`, or the
> language of your system. Add `--capture none` for a documentation without any screenshot: steps 4 and 5 then do not
> apply, and each screen is described by a table of its elements.

## Step 3 — Link the project to the kit

```bash
cd acme-orders/docs/manual
npm install
```

The project's `package.json` depends on the kit through a `file:` path. On Windows, npm links it with a directory
junction: the project always runs the kit you installed.

## Step 4 — Sign in once

```bash
doc-kit connect
```

A Chromium window opens on the application. Sign in on the page below with any e-mail and password, then come back
to the terminal and press Enter. The kit checks that the browser is no longer on a sign-in page, then saves the
session.

:::screen{capture="sign-in" title="Acme Orders · sign-in page of the demo"}
1. **E-mail**: any address; the demo does not check it.
2. **Password**: any value.
3. **Sign in**: opens the orders list. Back in the terminal, press Enter.
:::

The terminal confirms `✔ Session saved: .doc-kit/session.json` and reminds you that this file is a secret. It is
ignored by git.

## Step 5 — Take the first capture

```bash
doc-kit capture --preview
```

The skeleton's plan, `captures/plans/example.mjs`, declares one capture, `home`, with three zones: the top bar, the
menu and the content. The run is **read-only**: every request other than `GET`, `HEAD` and `OPTIONS` is blocked.

```text
1 capture · http://127.0.0.1:4173 · session: .doc-kit/session.json · read-only: on
✔ home (3 zones, 30 KB, 3.5 s)

1/1 capture taken.
Previews (zones in red, never published): .doc-kit/<id>.zones.png
Read-only: 0 write requests blocked
```

Open `.doc-kit/home.zones.png`: each zone is drawn in red with its number.

## Step 6 — Open the site

```bash
doc-kit dev
```

The site opens in your browser on `http://127.0.0.1:4400/`. Open **Use › Getting started**: the capture is there,
with its three markers and a **Guided tour** button. Edit `content/use/getting-started.md` and save: the page
reloads by itself. Stop the server with [[key Ctrl+C]].

## How to check it works

- **Project**: `doc-kit doctor` in `docs/manual` shows ✔ for the configuration, the table of contents and the session.
- **Capture**: `images/home.webp` and `images/zones/home.json` exist; the zone file holds three zones.
- **Site**: the **Getting started** page shows the capture with markers 1 to 3; hovering a marker highlights its
  legend item.
- **Guided mode**: `doc-kit` alone now says the project is in place and offers `dev`, `audit`, `build`, `doctor`.

## Common errors and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| "the application cannot be reached" | The demo is not running, or on another port | Step 1 again; or `doc-kit connect --url http://127.0.0.1:4180` |
| "no session: .doc-kit/session.json" | Step 4 skipped | `doc-kit connect` |
| "the project's dependencies are not installed" | Step 3 skipped | `npm install` in `docs/manual` |
| "the folder … already exists and is not empty" | `init` was already run | Use the existing project, or `--dir docs/other` |

## Pitfalls and limits

> [!WARNING] The skeleton is not a finished site
> The skeleton's sample pages still hold their template guidance and cite captures and diagrams that do not exist
> yet. `doc-kit dev` and `doc-kit build --draft` work right away; the strict `doc-kit build` passes once the sample
> pages are written or removed. `doc-kit audit` lists what remains.

> [!NOTE] A real application
> With your own application, `init` detects Next.js (App Router) and React Router and writes the matching coverage
> check. On production, read [Demo or production](#/capture/safety) before your first capture.

## Required permissions

> [!PERMISSIONS] What this recipe needs
> - On the demo: nothing, any e-mail and password are accepted.
> - On a real application: an account that sees the screens to document, used **by you** in the window opened by
>   `connect`. Never a shared service account.
> - Write access to the application folder, where `init` creates `docs/manual/`.
