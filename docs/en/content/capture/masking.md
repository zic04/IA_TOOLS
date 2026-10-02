## In short

Before each screenshot, the kit replaces sensitive values with dots (`••••••••`) **in the page itself**: the text, the
field values, the `title` and `placeholder` attributes. What it masks:

1. **GUIDs** (8-4-4-4-12 hexadecimal), with `masking.guid: true` (default).
2. **Values of the application's local `.env` files** listed in `masking.env`, when the name of their key suggests a
   URL, a host, a tenant, a client, an account, an e-mail address, a user or a secret, and the value is at least 7
   characters long. Values matching `masking.exclude` (default `localhost|127\.0\.0\.1`) are kept.
3. **Your patterns**: the JavaScript regular expressions of `masking.patterns`.
4. **The `masks` of an entry**: every element matching one of its targets, replaced whole.

The same values are what `doc-kit check secrets` looks for in the pages and in the site; `masking.allow` lists the
values known to be public, that the check must not report ([below](#/capture/masking~values-known-to-be-public)).

## A masked capture

:::screen{capture="settings-profile" title="The settings page of the demo application, masked"}
1. **Profile**: a name, a language and a theme. Nothing here matches a masking rule: it is shown as it is.
2. **Workspace**: the **Workspace ID** is a GUID, replaced by dots by `masking.guid`. The **Integration** address
   would be masked too if the application's `.env` held it under a key such as `API_URL`.
3. **Save**: never clicked during a capture; on this page, the presence heartbeat sent when the page opens is a
   write request, blocked by read-only.
:::

## The configuration

```js
masking: {
  env: ["../../.env", "../../.env.local"],   // the application's local .env files, relative to the project
  exclude: "localhost|127\\.0\\.0\\.1",       // values kept even when their key looks sensitive
  guid: true,                                 // GUIDs
  patterns: ["ACME-\\d{6}", "[A-Z]{2}\\d{2}(?: ?\\d{4}){4}"],   // more regular expressions (flags g and i)
  allow: ["^pk\\.acme-public-maps$"],      // values known to be public: not reported by check secrets
},
```

| Key name contains | Examples |
|---|---|
| URL, URI, HOST, DOMAIN, ENDPOINT | `API_URL`, `DB_HOST`, `AUTH_DOMAIN` |
| TENANT, CLIENT, AUDIENCE, ACCOUNT | `AUTH_TENANT`, `CLIENT_ID`, `STORAGE_ACCOUNT` |
| EMAIL, MAIL, USER, LOGIN | `SUPPORT_EMAIL`, `DB_USER` |
| SECRET, PASSWORD, PASSWD, PWD, TOKEN, KEY, DSN, CONNECTION | `CLIENT_SECRET`, `API_KEY`, `SENTRY_DSN` |

The `.env` parser understands `KEY=value`, `export KEY=value`, quoted values and comments. `doc-kit init` lists the
`.env` and `.env.local` files it finds at the root of the application and in its front-end folder (never the
`*.example` ones), and `doc-kit doctor` reports a `masking.env` file that does not exist.

## Values known to be public

`doc-kit check secrets` reports the masked values it finds in the text of the documentation. Some of them are public
by design: the browser key of a map service, published by its provider; a public identifier. List them in
`masking.allow`:

```js
masking: {
  env: ["../../.env"],
  allow: ["^pk\\.acme-public-maps$", "^https://tiles\\.example\\.org/"],
},
```

- Each entry is a JavaScript regular expression, case-sensitive, searched in the value: anchor it (`^…$`) to allow
  one exact value.
- `allow` only silences `check secrets`: the screenshots are still masked.
- An invalid expression stops the check with exit code 2 and its path: `masking.allow[0]`.

Without any configuration, the check never reports:

- `0.0.0.0`, `::`, the loopback and private addresses (`127.0.0.1`, `10.…`, `172.16.…` to `172.31.…`, `192.168.…`,
  `169.254.…`), alone, with a port, or as the host of a URL without credentials;
- a value inside a URL template, a URL with `{…}` placeholders: `https://tiles.example.org/{z}/{x}/{y}.png?key=…`;
- a value matching `masking.exclude`.

GUIDs stay reported: only their owner knows whether one is public. Allow one by its value once you have decided.

## Masks in a plan

```js
{
  id: "admin-users",
  route: "/admin/users",
  masks: [{ css: "td.email" }, { text: "Last sign-in", up: 1 }],
}
```

Every match of a mask target is replaced, unless the target names one with `nth` or `last`. A field gets dots as its
value; any other element gets dots as its text.

## Pitfalls and observed gaps

> [!WARNING] Masking only knows what you tell it
> A production-only value (a gateway address, an index name, a partly displayed key) is not in the local `.env`:
> it is not masked. **Review every image** before keeping it.

> [!NOTE] Masking happens before the measure
> Dots are shorter or longer than the value: a zone around a masked text is measured on the masked page, so the
> markers stay right.

> [!NOTE] Text inside images
> A value drawn inside an image or a canvas (a chart, a map tile) cannot be replaced: frame the capture so that it
> is out of the picture, or cover it with a `masks` target on its container.

## Further reading

- [Capture and masking keys](#/reference/configuration/capture): `masking.*` with types and defaults.
- [The checks](#/publish/checks~secrets): the secret check, which uses the same rules.
- [Demo or production](#/capture/safety): real data or a prepared demo.
