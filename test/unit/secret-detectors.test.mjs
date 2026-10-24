// The secret detectors of `check secrets` (engine/check/secrets.mjs), which also filter `pack`, `backlog export` and
// `inputs ingest`, format by format (SECURITY.md, RULES.md S7). Each format has its minimal pair: a value that looks
// real is found, the closest placeholder a documentation writes is not. The entropy fallback is calibrated on random
// tokens (how many it finds) and on a corpus of harmless values and on the kit's own documentation (none found).
// Every secret-shaped literal is built at run time from parts and a seeded generator: no complete secret shape is
// ever written in a file (push protection, the repository's own token checks).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { GENERIC, scanText, highEntropy, SECRET_FILE } from "../../engine/check/secrets.mjs";
import { KIT_ROOT } from "../tools/helpers.mjs";

/** The kinds the generic detectors report in a text, in order. */
const kinds = (text) => scanText(text, GENERIC).map((f) => f.kind);

/** A seeded generator (mulberry32): the same tokens on every run. */
function generator(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const B62 = UPPER + LOWER + DIGITS;
const B64 = B62 + "+/";
const B64URL = B62 + "-_";
const HEX = "0123456789abcdef";
const random = generator(0x5ec06);
/** `length` characters of `alphabet`, drawn by the generator. */
const draw = (length, alphabet = B62, next = random) =>
  Array.from({ length }, () => alphabet[Math.floor(next() * alphabet.length)]).join("");
/** A token that looks real: drawn until it holds lower case, upper case and digits (a placeholder holds none). */
function token(length, alphabet = B62) {
  for (;;) {
    const t = draw(length, alphabet);
    if (/[a-z]/.test(t) && /[A-Z]/.test(t) && /\d/.test(t)) return t;
  }
}
/** The first line of a PEM or PGP block, written in parts. */
const begin = (label) => `-----BEGIN ${label}PRIVATE ` + "KEY-----";
const end = (label) => `-----END ${label}PRIVATE ` + "KEY-----";

describe("cloud and service tokens", () => {
  test("the AWS secret access key, in an assignment: found; AWS's documented example is not", () => {
    const name = "aws_secret_" + "access_key";
    const key = token(40, B64);
    assert.deepEqual(kinds(`${name} = ${key}`), ["assignment"]);
    assert.deepEqual(kinds(`"Secret${"AccessKey"}": "${key}"`), ["assignment"]);
    assert.deepEqual(kinds(`${name.toUpperCase()}=${key}`), ["assignment"]);
    const documented = "wJalrXUtnFEMI/K7MDENG/" + "bPxRfiCY" + "EXAMPLEKEY";
    assert.deepEqual(kinds(`${name} = ${documented}`), []);
  });

  test("a GitHub fine-grained token: found; one of x is a placeholder", () => {
    const prefix = "github" + "_pat_";
    assert.deepEqual(kinds(`token ${prefix}${token(22)}_${token(59)}`), ["cloudKey"]);
    assert.deepEqual(kinds(`GH=${prefix}${token(22)}_${token(59)}`), ["cloudKey"], "once, not by entropy too");
    assert.deepEqual(kinds(`token ${prefix}${"x".repeat(22)}_${"x".repeat(59)}`), []);
    assert.deepEqual(kinds(`token ${prefix}${"X".repeat(82)}`), []);
  });

  test("GitLab, npm and Google OAuth client secrets: found; their placeholders are not", () => {
    for (const [prefix, length, alphabet] of [
      ["gl" + "pat-", 20, B62],
      ["np" + "m_", 36, B62],
      ["GOC" + "SPX-", 28, B64URL],
    ]) {
      assert.deepEqual(kinds(`value: ${prefix}${token(length, alphabet)}`), ["cloudKey"], prefix);
      assert.deepEqual(kinds(`value: ${prefix}${"x".repeat(length)}`), [], `${prefix}xxxx`);
      assert.deepEqual(kinds(`value: ${prefix}${"X".repeat(length)}`), [], `${prefix}XXXX`);
    }
  });

  test("a Slack webhook and a Slack app token: found; Slack's placeholders are not", () => {
    const hook = "https://hooks.slack" + ".com/services/";
    const id = (letter) => letter + draw(1, DIGITS) + draw(8, UPPER + DIGITS);
    assert.deepEqual(kinds(`url: ${hook}${id("T")}/${id("B")}/${token(24)}`), ["cloudKey"]);
    assert.deepEqual(kinds(`url: ${hook}T00000000/B00000000/${"X".repeat(24)}`), []);
    const app = "xa" + "pp-1-";
    const appToken = `${app}A${draw(10, UPPER + DIGITS)}-${draw(13, DIGITS)}-${draw(64, HEX)}`;
    assert.deepEqual(kinds(`SLACK=${appToken}`), ["cloudKey"]);
    assert.deepEqual(kinds(`SLACK=${app}${"X".repeat(11)}-${"X".repeat(13)}-${"X".repeat(64)}`), []);
  });

  test("a URL signature in any case (Sig=, sig=, X-Amz-Signature=): found; a placeholder is not", () => {
    const query = "https://acct.blob.core.windows.net/c/f.pdf?sv=2024-01-01&sp=r&";
    for (const name of ["S" + "ig", "s" + "ig", "SIG", "X-Amz-" + "Signature"])
      assert.deepEqual(kinds(`${query}${name}=${token(43, B64)}%3D`), ["signedUrl"], name);
    assert.deepEqual(kinds(`${query}S${"ig"}=<signature>`), []);
    assert.deepEqual(kinds(`${query}S${"ig"}=${"X".repeat(43)}`), []);
  });
});

describe("private keys", () => {
  const material = (lines) => Array.from({ length: lines }, () => token(64, B64));

  test("a PEM key escaped in a JSON file (a service account): found; an elided one is not", () => {
    const pem = (body) => `${begin("")}\\n${body.join("\\n")}\\n${end("")}\\n`;
    assert.deepEqual(kinds(`{"type": "service_account", "private_key": "${pem(material(4))}"}`), ["privateKey"]);
    // A JSON writer may escape the slashes too.
    const slashes = pem(material(4)).split("/").join("\\/");
    assert.deepEqual(kinds(`{"private_key": "${slashes}"}`), ["privateKey"]);
    assert.deepEqual(kinds(`{"private_key": "${pem(["..."])}"}`), []);
    assert.deepEqual(kinds(`{"private_key": "${pem(["MIIEvQIBADANBg"])}"}`), [], "too short to be key material");
  });

  test("a PGP private key block: found; its header and footer alone are not", () => {
    const line = (side) => `-----${side} PGP PRIVATE ` + "KEY BLOCK-----";
    const armored = (body) => `${line("BEGIN")}\nVersion: GnuPG v2\n\n${body}\n${line("END")}\n`;
    assert.deepEqual(kinds(armored(`${material(3).join("\n")}\n=${token(4, B64)}`)), ["privateKey"]);
    assert.deepEqual(kinds(armored("...")), []);
    assert.deepEqual(kinds(armored("")), []);
  });

  test("a PuTTY key (.ppk): found; a key with its private lines elided is not", () => {
    const ppk = (lines) =>
      [
        "PuTTY-User-Key-File-3: ssh-ed25519",
        "Encryption: none",
        "Comment: deploy",
        "Public-Lines: 2",
        ...material(2),
        `Private-Lines: ${lines.length}`,
        ...lines,
        `Private-MAC: ${draw(64, HEX)}`,
        "",
      ].join("\n");
    assert.deepEqual(kinds(ppk(material(1))), ["privateKey"]);
    assert.deepEqual(kinds(ppk(["..."])), []);
  });
});

describe("assignments to a secret's name", () => {
  // A value that looks generated but has no upper case: never found by the entropy fallback, so that each pair
  // tests the name alone.
  const value = draw(10, LOWER) + draw(10, DIGITS);
  const generated = Array.from(value, (c, i) => (i % 2 ? value[10 + (i >> 1)] : c)).join("");

  test("compound names (SECRET_KEY, DB_PASSWORD, GITHUB_TOKEN, dbPassword…): found; KEYBOARD and TOKENIZER are not", () => {
    for (const name of [
      "SECRET_KEY",
      "DB_PASSWORD",
      "GITHUB_TOKEN",
      "SMTP_PASS",
      "client-secret",
      "spring.datasource.password",
      "x-api-key",
      "accessToken",
      "dbPassword",
      "APIKey",
    ]) {
      // (`password=` is a connection string's password too.)
      assert.ok(kinds(`${name}=${generated}`).includes("assignment"), name);
      assert.ok(kinds(`"${name}": "${generated}"`).includes("assignment"), `"${name}"`);
    }
    for (const name of ["KEYBOARD", "TOKENIZER", "MONKEY", "SECRET_NAME", "TOKEN_URL", "password_hash", "max_tokens"])
      assert.deepEqual(kinds(`${name}=${generated}`), [], name);
  });

  test("the key of anything: found when its value looks generated; a key made of words, or public, is not", () => {
    assert.deepEqual(kinds(`STRIPE_KEY=${generated}`), ["assignment"]);
    assert.deepEqual(kinds("CACHE_KEY=user-profile-v2-cache"), []);
    assert.deepEqual(kinds("sortKey: createdAt2024Index"), []);
    assert.deepEqual(kinds(`SECRET_KEY=user-profile-v2-cache`), ["assignment"], "a secret's name: any value");
    assert.deepEqual(kinds(`NEXT_PUBLIC_MAP_KEY=${generated}`), []);
    assert.deepEqual(kinds(`PublicKeyToken=${draw(16, HEX)}`), []);
  });

  test("a documentation placeholder, a variable and a number are not values", () => {
    for (const v of [
      "change-me-in-production-2024",
      "CHANGE_ME_generate_a_real_secret_key_32",
      "replace-me-with-a-real-key-2024",
      "${DB_PASSWORD_VALUE}",
      "process.env.DB_PASSWORD_2",
      "YOUR_SECRET_KEY_HERE_2024",
    ])
      assert.deepEqual(kinds(`SECRET_KEY=${v}`), [], v);
    assert.deepEqual(kinds("input_price_per_token: 8.765432109876e-06"), []);
  });
});

describe("the entropy fallback", () => {
  test("a random value under any name, or quoted: found once, under the most precise kind", () => {
    assert.deepEqual(kinds(`MY_SERVICE_CREDENTIAL=${token(32)}`), ["entropy"]);
    assert.deepEqual(kinds(`const value = "${token(32, B64)}";`), ["entropy"]);
    assert.deepEqual(kinds(`run it with \`${token(40, B64URL)}\` as argument`), ["entropy"]);
    assert.deepEqual(kinds(`api_key: ${token(32)}`), ["assignment"], "not by entropy too");
    // Another detector on the line: the line is reported once, by it.
    assert.deepEqual(kinds(`run ${"gl" + "pat-"}${token(20)} with "${token(32)}"`), ["cloudKey"]);
  });

  test("placeholders, hashes, nonces, identifiers and public keys are not", () => {
    for (const text of [
      "MY_SERVICE_CREDENTIAL=<your-credential>",
      `MY_SERVICE_CREDENTIAL=${"X".repeat(32)}`,
      `MY_SERVICE_CREDENTIAL=your${token(28)}`,
      `"integrity": "sha512-${token(86, B64)}=="`,
      `<script src="a.js" integrity="sha384-${token(64, B64)}"></script>`,
      `commit = ${draw(40, HEX)}`,
      `"tenant": "${draw(8, HEX)}-${draw(4, HEX)}-${draw(4, HEX)}-${draw(4, HEX)}-${draw(12, HEX)}"`,
      `Public-Key-Pins: pin-sha256="${token(43, B64)}="`,
      `<script nonce="${token(24, B64)}">`,
      `client_id: ${token(24)}`,
      `?response_type=code&state=${token(22, B64URL)}&code_challenge=${token(43, B64URL)}`,
      `publicKey: "${token(87, B64URL)}"`,
      `<mxCell id="${token(20, B64URL)}-1" parent="${token(20, B64URL)}-1" />`,
    ])
      assert.deepEqual(kinds(text), [], text.slice(0, 40));
  });

  test("calibration: random tokens of 20 characters or more are found 85 times in 100, of 32 or more 95", () => {
    const next = generator(0xca11b);
    const rates = {};
    for (const length of [20, 24, 28, 32, 40, 64]) {
      let found = 0;
      const n = 3000;
      for (let i = 0; i < n; i++) if (highEntropy(draw(length, [B62, B64, B64URL][i % 3], next))) found++;
      rates[length] = found / n;
    }
    for (const [length, rate] of Object.entries(rates))
      assert.ok(rate >= (+length >= 32 ? 0.95 : 0.85), `${length} characters: ${(rate * 100).toFixed(1)} %`);
  });

  test("calibration: none of a corpus of harmless values of 20 characters or more is found, quoted or assigned", () => {
    const harmless = [
      // Names in code: classes, types, functions, constants, messages' keys.
      "JSONSchema7Definition",
      "ED25519KeyPairKeyObjectOptions",
      "X25519KeyPairKeyObjectOptions",
      "DecipherChaCha20Poly1305",
      "getAsBooleanFromENV2",
      "isPreviousLineEmpty2",
      "ecma5AndLessKeywords",
      "playwrightReportBase64",
      "stringifyStackFrames2",
      "HTTP2ServerResponseHandler",
      "UserProfileV2Controller",
      "MyComponent2024Version",
      "OrdersListPage2Columns",
      "File_0_not_found_6053",
      "Watch_and_Build_Modes_6250",
      "Emit_a_UTF_8_Byte_Order_Mark_BOM_6622",
      "cli.check.secrets.kind2.entropy",
      "PrefetchFailedNon2XX",
      "aws4_request_X_Amz_Algorithm",
      // Paths, routes and file names.
      "src/components/Button2Primary",
      "app/api/v2/OrdersController",
      "docs/en/content/use/Orders2024",
      "/api/v1/customers/ByRegion2",
      "assets/index-Cn0mmDuv.js",
      // Cloud resources, sizes, models, images.
      "Standard_NC4as_T4_v3",
      "Standard_D2s_v3_Promo",
      "DeepSeek-V4-Pro-0813",
      "gpt-4o-mini-2024-07-18",
      "mcr.microsoft.com/dotnet/aspnet:8.0",
      "Microsoft.Web/sites/config",
      "rg-orders-prod-westeurope-01",
      // Versions, dates and identifiers of a run.
      "2024-10-17T12:34:56.789Z",
      "v2.14.3-beta.4+build.20241017",
      "orders-list-2024-10-17T12",
      // Alphabets and their encodings.
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
      "0123456789ABCDEFabcdef",
      "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict",
      // Hashes of known kinds.
      `sha256-${token(43, B64)}=`,
      draw(64, HEX),
      draw(40, HEX).toUpperCase(),
    ];
    const contexts = (v) => [`"${v}"`, `value = "${v}"`, `\`${v}\``, `SETTING=${v}`, `setting: ${v}`];
    const found = harmless.flatMap((v) =>
      contexts(v)
        .filter((t) => kinds(t).length)
        .map((t) => `${t} → ${kinds(t)}`),
    );
    assert.deepEqual(found, [], `${harmless.length} harmless values, ${harmless.length * 5} texts`);
  });

  test("calibration: the kit's own documentation and demo hold no random-looking value", () => {
    const roots = ["docs/en/content", "docs/fr/content", "examples/demo-docs", "examples/demo-app"];
    const files = roots.flatMap((r) =>
      fs
        .readdirSync(path.join(KIT_ROOT, r), { recursive: true })
        .map((f) => path.join(KIT_ROOT, r, String(f)))
        .filter((f) => /\.(md|json|mjs|js|svg|html|txt)$/.test(f) && fs.statSync(f).isFile()),
    );
    // What the fallback reads: quoted or assigned values of a token's characters, 20 or more.
    const candidate = GENERIC.find((d) => d.kind === "entropy").re;
    let candidates = 0;
    const found = [];
    for (const f of files) {
      const text = fs.readFileSync(f, "utf8");
      candidates += [...text.matchAll(new RegExp(candidate.source, candidate.flags))].length;
      for (const x of scanText(text, GENERIC).filter((x) => x.kind === "entropy"))
        found.push(`${path.relative(KIT_ROOT, f)}:${x.line}`);
    }
    assert.ok(files.length > 100 && candidates > 200, `${files.length} files, ${candidates} values read`);
    assert.deepEqual(found, []);
  });
});

test("every kind the detectors report has its message in English and French", () => {
  for (const language of ["en", "fr"]) {
    const messages = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, "i18n", language, "capture.json"), "utf8"));
    for (const kind of new Set(GENERIC.map((d) => d.kind)))
      assert.ok(`cli.check.secrets.kind.${kind}` in messages, `${language}: ${kind}`);
  }
});

describe("secret files (export, the sources of a feature)", () => {
  test("Terraform state, PuTTY keys, VPN profiles, encrypted files, credentials, settings of an environment", () => {
    for (const name of [
      "terraform.tfstate",
      "terraform.tfstate.backup",
      "deploy.ppk",
      "office.ovpn",
      "backup.tar.gpg",
      "credentials.json",
      "credentials",
      "appsettings.Production.json",
      "appsettings.Development.json",
    ])
      assert.ok(SECRET_FILE.test(name), name);
    for (const name of [
      "tfstate.md",
      "terraform.tf",
      "ppk-howto.md",
      "ovpn.md",
      "gpg-keys.md",
      "credentials.md",
      "credentials.example.json",
      "appsettings.json",
      "appsettings.md",
    ])
      assert.ok(!SECRET_FILE.test(name), name);
  });
});
