// Configuration of the {{name}} documentation site, built with doc-kit.
// Reference: §3 of the kit's ARCHITECTURE.md; commented examples: standard/config.md in the kit.
// Validation is strict: an unknown key is an error (exit code 2), reported with its path.
// Precedence, from strongest to weakest: CLI option > DOC_KIT_* variable > <PREFIX>_* variable > this file > default.
// Paths are relative to this folder.
import { defineConfig } from "doc-kit/config";

export default defineConfig({
  // Accepted kit versions (semver range). Outside the range, every command stops with exit code 3.
  kit: "^1.0.0",

  // Renaming the product: change name here, then the title, tagline and section titles of content/toc.json.
  product: { name: "{{name}}", slug: "{{slug}}" },
  language: "{{language}}", // "en" | "fr": language of the site and of the CLI messages
{{languagesLine}}  // output: "dist/{{slug}}-documentation.html", // default: dist/<product name>-Documentation.html

  // Folders of the project. Older projects declare their own here, e.g. { content: "contenu", diagrams: "schemas" }.
  paths: { content: "content", images: "images", diagrams: "diagrams" },

  // Version shown in the site's banner, read in the application's code. The fallback is used when the file
  // cannot be found (for example, a copy of this folder outside the repository).
  version: {
    file: {{versionFile}},
    pattern: {{versionPattern}},
    fallback: "0.0.0",
  },

  // With a prefix, the commands also read <PREFIX>_URL, <PREFIX>_SESSION, <PREFIX>_PLANS and <PREFIX>_READONLY.
  // Example: { prefix: "ACME" } reads ACME_URL…
  env: {},

  // The application: its address (captures) and its root folder, the code the writers read (dir).
  // On production, captures only run read-only (see capture.target).
  app: { url: "{{appUrl}}", dir: "{{appRoot}}" },

  // How a session is recognised after `doc-kit connect`:
  //   manual  (default) the person signs in, then presses Enter; the session is valid while the app does not
  //           redirect to a sign-in page, matched by the loginPattern option
  //           (default "login|signin|sign-in|oauth|authorize")
  //   none    the app needs no sign-in
  //   nextauth  GET /api/auth/session
  //   api-me    the API's "me" endpoint
  //   local:adapters/x.mjs  an adapter of this project
  // Adapter options go next to "adapter", e.g. { adapter: "manual", loginPattern: "/login|/oauth2/" }.
  auth: { adapter: "{{auth}}" },

  capture: {
    // "app": the screens are captured on the running application; "none": no screenshot at all, each screen is
    // described by a table of its elements (capture and connect refuse to run, the audit does not count
    // annotated screens).
    mode: "{{captureMode}}",
    // Where the screenshots are taken: "local" (the application on this machine), "demo" (a demo copy, prepared
    // by `setup`) or "production" (the real application: always read-only, a banner and a confirmation before each
    // capture run, `doc-kit demo` refused).
    target: "{{captureTarget}}",
    plans: "captures/plans", // one .mjs file per batch of pages, each exporting CAPTURES
    setup: null, // idempotent script that prepares demo data (`doc-kit demo`), e.g. "captures/setup-demo.mjs"
    locale: null, // default: derived from language (en-US, fr-FR)
    timezone: "UTC",
    viewports: { desktop: { width: 1600, height: 1000 }, mobile: { width: 390, height: 844 } },
    webpQuality: 0.82,
    geolocation: null, // { latitude, longitude } for the mobile context, if the app uses the position
    // localStorage keys set before each capture (theme, language, app preferences). "{version}" is replaced
    // by the application version. Example: { theme: "light" }.
    storage: {},
    // Cookies set before each capture. Example, interface language of a Next.js app:
    // [{ name: "NEXT_LOCALE", value: "{{language}}" }].
    cookies: [],
    // CSS selectors used by the { block } target and by the "framed" option. Example: { block: "section.card" }.
    selectors: { block: null, frame: null },
    map: null, // { x, y, z }: URL parameters that frame a map (plan field `view`)
    // Routes NEVER to open (JavaScript regular expressions on the route path): pages whose rendering writes
    // on the server. Read the code of every detail page before you capture it. See standard/captures.md.
    forbidden: [],
    // Blocks every request other than GET/HEAD/OPTIONS: "auto" as soon as a session is used; always with
    // target "production", where false is refused.
    readOnly: {{readOnly}},
  },

  // Automatic masking in the images: GUIDs, values of the application's local .env files, patterns.
  // It does not know the production values: review every image.
  masking: {
    env: {{maskingEnv}},
    exclude: "localhost|127\\.0\\.0\\.1",
    guid: true,
    patterns: [],
  },

  // Coverage check: every element inventoried by these adapters (routes, registries…) must be cited in the
  // documentation. Empty: no check.
  coverage: {{coverage}},

  theme: {
    key: "{{slug}}-doc-theme", // localStorage key of the site's light / dark theme
    logo: "theme/logo.svg",
    colors: {}, // light-theme colour tokens; empty: the kit's neutral palette
    dark: {}, // dark-theme colour tokens
    icons: {}, // extra or replaced icons, by name
  },

  // Coloured [[status …]] badges: { "0": ["st-0", "0 · paid"] }. Empty: neutral badges.
  statuses: {},

  // Overrides of the site's texts (any i18n key), e.g. { "home.primaryAction": "Explore the editors" }.
  texts: {},

  // "Report a problem" link: { label, url }, or null.
  feedback: null,

  // Free: passed to the project's own scripts (demo setup, capture plans) and to the skill's briefs (extra.briefs).
  extra: {},
});
