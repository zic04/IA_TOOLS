## In short

Adapters are the kit's two extension points. Each one is a small module that exports an object; the configuration
names it and gives its options next to it.

1. **Coverage adapters** (`coverage`) list what the application contains (routes, registry entries, files). The kit
   searches the documentation for each element and reports what is not cited.
2. **Authentication adapters** (`auth`) recognise a signed-in session, for `connect` and before every capture.
3. **Built-in or local.** The kit ships four of each kind; a project adds its own with
   `adapter: "local:adapters/x.mjs"`, a path relative to the documentation project.
4. **Options are validated** like the configuration: an unknown or missing option is an error with its path
   (`coverage[0].ap`, `auth.loginPatern`), exit code 2.

## Coverage adapters

| Adapter | Inventories | Options (default) |
|---|---|---|
| `next-app-router` | The routes of a Next.js App Router folder (`page.tsx`, `.ts`, `.jsx`, `.js`, `.mdx`) | `app` (`"app"`), `family` (`"Routes"`), `exclude` (`["^/$"]`) |
| `react-router` | The `path` of the routes declared in source files | `file` (`"src/App.tsx"`, or a list), `pattern`, `prefix` (`"/"`), `family`, `exclude` (`["^/$"]`) |
| `i18n-registry` | The ids of a registry in a source file, covered by their label in an i18n file | `source`, `messages` (required), `key` (`"{id}"`), `block`, `pattern`, `flags` (`"m"`), `aliases`, `fallback`, `exclude`, `family` (`"Registry"`) |
| `glob` | The files of a folder, cited under a form you choose | `pattern` (required), `base` (`"."`), `match` (`"{name}"`), `family` (`"Files"`), `exclude` |

- **Next.js**: route groups `(marketing)` and slots `@modal` add no segment; intercepting routes and `_private`
  folders are skipped; `[id]`, `[...slug]` and `[[...slug]]` are kept.
- **Routes** are covered as written, with `:id`, `{id}` or `[id]`, or by their static prefix (`/orders/` for
  `/orders/[id]`).
- **`exclude`** holds regular expressions, or exact ids.
- **`glob`**: `match` is a template where `{path}` is the path relative to `base` without extension, `{name}` the
  file name without extension, `{dir}` its folder and `{file}` the file name.

```js
coverage: [
  { adapter: "next-app-router", app: "../../app", exclude: ["^/$", "^/api/"] },
  { adapter: "i18n-registry", family: "Widgets", source: "../../src/widgets/registry.ts",
    pattern: "id: \"(?<id>[a-z0-9_]+)\"", messages: "../../src/i18n/en.json", key: "dashboard.widget.{id}.title" },
  { adapter: "glob", family: "Specifications", base: "../../specs", pattern: "**/*.md", match: "{name}" },
],
```

An adapter whose source cannot be found answers "not available": its check is **skipped**, not failed, and the
report says why (`not found: ../../app`).

## Authentication adapters

| Adapter | Signed in when | `connect` | Options (default) |
|---|---|---|---|
| `manual` | The page is not a sign-in page | You press Enter | — |
| `none` | Always: no session is used | Nothing to do | — |
| `nextauth` | The session endpoint answers a `user` | Detects by itself | `endpoint` (`"/api/auth/session"`) |
| `api-me` | The "me" endpoint answers JSON holding `proof` | Detects by itself | `url` (`"/api/me"`), `proof` (`"id"`, a dotted path is accepted), `who` (`"name"`) |

Every authentication adapter also accepts `start` (`"/"`), `loginPattern`
(`"login|signin|sign-in|oauth|authorize"`) and `browser` (`"chromium"` or `"chrome"`).

## Writing an adapter

### A coverage adapter

```js
// adapters/screens.mjs, declared as { adapter: "local:adapters/screens.mjs", folder: "../../src/screens" }
export default {
  name: "screens",
  options: {
    folder: { type: "string", minLength: 1, required: true },
    family: { type: "string", default: "Screens" },
  },
  async inventory({ root, options, tools }) {
    if (!tools.exists(options.folder)) return { available: false, reason: "notFound", vars: { path: options.folder } };
    const items = tools.glob("*.tsx", options.folder).map((f) => ({ id: f, match: [f.replace(/\.tsx$/, "")] }));
    return { available: true, families: [{ name: options.family, items }] };
  },
};
```

| Part | Contract |
|---|---|
| `options` | Each option is a small schema: `type`, `default`, `enum`, `pattern`, `minLength`, `items`… and `required: true` |
| `inventory()` | Receives `root` (the documentation project), the validated `options` and `tools`; returns `{ available: true, families }` or `{ available: false, reason, vars }` |
| An item | `{ id, label?, match: [texts] }`: covered when one of its texts appears in the documentation, ignoring case and spaces |
| `tools` | `resolve`, `exists`, `read`, `json`, `walk`, `glob`, `i18nKey`; every path is relative to the documentation project |
| `reason` | `notFound`, `blockNotFound` and `error` are translated; any other text is shown as it is |

This site uses one: `docs/shared/kit-reference.mjs` in the kit's repository lists every key of the configuration
schema, every CLI option and every built-in adapter, and the coverage check fails when one of them is not cited in
these pages. `doc-kit inventory` shows its three families.

### An authentication adapter

```js
// adapters/sso.mjs, declared as auth: { adapter: "local:adapters/sso.mjs", profile: "/api/profile" }
export default {
  name: "sso",
  options: { profile: { type: "string", default: "/api/profile" } },
  browser: "chromium",          // or "chrome"
  detects: true,                // connect polls session() instead of waiting for Enter
  async session(page, options, { appUrl, isSignInUrl }) {
    if (isSignInUrl(page.url(), appUrl, options.loginPattern)) return null;
    const me = await page.evaluate(async (u) => (await fetch(u)).ok, options.profile);
    return me ? { who: null, details: null, expires: null } : null;
  },
};
```

`session()` returns `null` when the page is not signed in, otherwise `{ who, details, expires }`: `connect` prints
them. An adapter with `none: true` disables the session altogether.

## Pitfalls and observed gaps

> [!WARNING] Paths are relative to the documentation project
> `app: "../../app"` is resolved from the folder of `doc.config.mjs`, not from the application. `doc-kit doctor`
> checks every path option of the coverage entries.

> [!NOTE] Two options with the same name
> The options of an adapter are its own: `family` of `glob` and `family` of `react-router` never clash.

## Further reading

- [The checks](#/publish/checks~coverage): what the coverage check prints.
- [Connect and sessions](#/capture/sessions): the sign-in rule the adapters rely on.
- [Coverage, theme and text keys](#/reference/configuration/site): the `coverage` key.
