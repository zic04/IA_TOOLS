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
import { GENERIC, scanText, highEntropy, SECRET_FILE, isSessionFile } from "../../engine/check/secrets.mjs";
import { KIT_ROOT, tempDir } from "../tools/helpers.mjs";

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
const B32 = UPPER + "234567";
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

  test("SendGrid, Hugging Face, DigitalOcean, Twilio, GitLab runner, trigger and deploy tokens: found; their placeholders are not", () => {
    for (const [real, placeholder] of [
      ["S" + "G." + token(22, B64URL) + "." + token(43, B64URL), "SG." + "x".repeat(22) + "." + "x".repeat(43)],
      // (Letters only, as Hugging Face writes them.)
      ["h" + "f_" + draw(17, UPPER) + draw(17, LOWER), "hf_" + "x".repeat(34)],
      ["do" + "p_v1_" + draw(64, HEX), "dop_v1_" + "0".repeat(64)],
      ["do" + "o_v1_" + draw(64, HEX), "doo_v1_" + "a".repeat(64)],
      ["do" + "r_v1_" + draw(64, HEX), "dor_v1_" + "f".repeat(64)],
      ["S" + "K" + draw(32, HEX), "SK" + "0".repeat(32)],
      ["gl" + "rt-" + token(20, B64URL), "glrt-" + "x".repeat(20)],
      ["GR" + "1348941" + token(20, B64URL), "GR1348941" + "x".repeat(20)],
      ["gl" + "ptt-" + draw(40, HEX), "glptt-" + "0".repeat(40)],
      ["gl" + "dt-" + token(20, B64URL), "gldt-" + "X".repeat(20)],
    ]) {
      assert.deepEqual(kinds(`value: ${real}`), ["cloudKey"], real.slice(0, 3));
      assert.deepEqual(kinds(`value: ${placeholder}`), [], placeholder.slice(0, 7));
    }
  });

  test("Discord and Microsoft Teams webhooks: found; their placeholders are not", () => {
    const discord = "https://discord" + ".com/api/webhooks/";
    assert.deepEqual(kinds(`url: ${discord}${draw(18, DIGITS)}/${token(68, B64URL)}`), ["cloudKey"]);
    assert.deepEqual(kinds(`url: ${discord}123456789012345678/${"X".repeat(68)}`), []);
    const guid = () => [8, 4, 4, 4, 12].map((n) => draw(n, HEX)).join("-");
    const teams = () => "https://contoso.webhook" + `.office.com/webhookb2/${guid()}@${guid()}/IncomingWebhook/`;
    assert.deepEqual(kinds(`url: ${teams()}${draw(32, HEX)}/${guid()}`), ["cloudKey"]);
    assert.deepEqual(kinds(`url: ${teams()}${"x".repeat(32)}/${guid()}`), []);
    assert.deepEqual(kinds(`url: ${teams()}${"0".repeat(32)}/${guid()}`), []);
    // The connector's former address.
    const outlook = "https://outlook.office" + `.com/webhook/${guid()}@${guid()}/IncomingWebhook/`;
    assert.deepEqual(kinds(`url: ${outlook}${draw(32, HEX)}/${guid()}`), ["cloudKey"]);
    assert.deepEqual(kinds(`url: ${outlook}${"x".repeat(32)}/${guid()}`), []);
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

  test("a password made of words: found from 16 letters; a label, a placeholder or fewer letters are not", () => {
    const words = "correct" + "horse" + "battery" + "staple";
    assert.deepEqual(kinds(`DB_PASSWORD=${words}`), ["assignment"]);
    assert.deepEqual(kinds(`"password": "${words}"`), ["assignment"]);
    assert.deepEqual(kinds(`db_password: ${"correct-" + "horse-" + "battery"}`), ["assignment"]);
    assert.deepEqual(kinds(`DB_PASSWORD=your${words}`), [], "a placeholder");
    assert.deepEqual(kinds('"password": "Passwort"'), [], "a label");
    assert.deepEqual(kinds(`DB_PASSWORD=${words.slice(0, 15)}`), [], "15 letters");
    assert.deepEqual(kinds(`DB_PASSWORD=${words.slice(0, 16)}`), ["assignment"], "16 letters");
  });

  test("a base 32 key in capitals (SECRET_KEY=JBSWY3DP…): found; a variable's name in capitals is not", () => {
    // Its first character a letter, as in JBSWY3DP…: a variable's name in capitals, to the former rule.
    const key = draw(1, UPPER) + draw(31, B32);
    assert.deepEqual(kinds(`SECRET_KEY=${key}`), ["assignment"]);
    assert.deepEqual(kinds(`totp_secret: "${key}"`), ["assignment"]);
    assert.deepEqual(kinds("SECRET_KEY=DJANGO_SECRET_KEY"), [], "a variable's name");
    assert.deepEqual(kinds(`SECRET_KEY=${"A".repeat(32)}`), [], "one letter");
  });

  test("a password with signs (Tr0ub4dor&3xQ!): found from 8 characters; 7, a mask or a reference are not", () => {
    const pw = "Tr0" + "ub4dor&3xQ!";
    for (const text of [
      `DB_PASSWORD=${pw}`,
      `db_password: "${pw}"`,
      `"password":"${pw}"`,
      `password := "${pw}"`,
      `'password' => '${pw}',`,
      `DB_PASSWORD=${pw.slice(0, 8)}`,
      `DB_PASSWORD=~!@#$%&*${pw.slice(0, 3)}`,
    ])
      assert.deepEqual(kinds(text), ["assignment"], text);
    for (const text of [
      `DB_PASSWORD=${pw.slice(0, 7)}`,
      "DB_PASSWORD=********",
      "DB_PASSWORD=${DB_PASSWORD}",
      "DB_PASSWORD=$DB_PASSWORD_VALUE",
      "DB_PASSWORD=%DB_PASSWORD%",
      "DB_PASSWORD=<your-password>",
      "DB_PASSWORD=changeme",
      "DB_PASSWORD=xxxxxxxxxxxx",
      "DB_PASSWORD=***-***-***",
    ])
      assert.deepEqual(kinds(text), [], text);
  });

  test("an Azure AD client secret, with its ~: found; its placeholder is not", () => {
    const secret = token(3) + draw(1, DIGITS) + "Q~" + draw(34, B62 + "._~-");
    assert.deepEqual(kinds(`AZURE_CLIENT_SECRET=${secret}`), ["assignment"]);
    assert.deepEqual(kinds(`"clientSecret": "${secret}"`), ["assignment"]);
    // Under Spring's name of 65 characters (a name is read up to 128).
    const spring = "spring.security.oauth2.client.registration.azure-ad.client-secret";
    assert.deepEqual(kinds(`${spring}=${secret}`), ["assignment"]);
    assert.deepEqual(kinds("AZURE_CLIENT_SECRET=<client-secret>"), []);
    assert.deepEqual(kinds('"clientSecret": "${AZURE_CLIENT_SECRET}"'), []);
  });

  test("a value written as code is a reference, not a secret: a variable, a member, a call, an index, a path", () => {
    for (const text of [
      "password: hashedPassword,",
      "password: new_password",
      "token: accessToken",
      "password = request.form.password",
      "secret: config.jwt.secret,",
      "password: getPassword()",
      "token = generate_token(user)",
      'password = os.environ["DB_PASSWORD"]',
      "password: process.env.DB_PASSWORD,",
      'Password = configuration["DbPassword"];',
      "Password = model.Password;",
      "Password = GetPassword();",
      "type ArrowToken = ArrowToken$1;",
      "if (v.token===w.Keyword) return",
      "endToken=a&&a.join()",
      "passphrase: 'mysecretpassword',",
      "//registry.example.org/:_authToken=MYTOKEN1",
      "'password' => $password,",
      "password: @password",
      "password: *default_password",
      "MasterUserPassword: !ImportValue SharedPassword",
      "PASSWORD=$(cat /run/secrets/db)",
      "SECRET_KEY=/run/secrets/django_key",
      "password: string;",
      "password: undefined",
      "token: required",
      "GITHUB_TOKEN=\nOTHER_SETTING=a_long_value_2024",
    ])
      assert.deepEqual(kinds(text), [], text);
    // Quoted, the same kind of text is a value.
    assert.deepEqual(kinds('password = "new_password_2024"'), ["assignment"]);
    // After a lone `password =`, a name in code with nothing of code around it reads as a password, as 0.4.1 read it
    // (test/unit/secret-recall.test.mjs).
    assert.deepEqual(kinds("password = new_password"), ["assignment"]);
  });

  test("a name in code is a value under a name in capitals, a variable under a name in lower case; with a number of two digits, a password", () => {
    const words = "My" + "Secret" + "Password" + "2024";
    assert.deepEqual(kinds(`DB_PASSWORD=${words}`), ["assignment"]);
    assert.deepEqual(kinds(`db_password: "${words}"`), ["assignment"], "quoted");
    assert.deepEqual(kinds(`db_password: ${words}`), ["assignment"], "a number of two digits: not a name in code");
    for (const pw of [
      "Summer" + "Holiday2024",
      "Orders" + "2024Prod",
      "Prod2024" + "Secret99",
      "Ab" + "CdEf1234567890",
    ])
      assert.deepEqual(kinds(`password: ${pw}`), ["assignment"], pw);
    assert.deepEqual(kinds("db_password: hashedUserValue2"), [], "a name in code: one digit");
    assert.deepEqual(kinds("db_password: OrdersProdValue1"), [], "a name in code: one digit (SECURITY.md, a limit)");
    assert.deepEqual(kinds("DB_PASSWORD=hashedUserValue2"), ["assignment"], "under a name in capitals");
    // After one of 0.4.1's words, 16 characters or more holding a digit: the floor reads it, as 0.4.1 did.
    assert.deepEqual(kinds("password: OrdersProdValue1"), ["assignment"]);
  });

  test("known limits (SECURITY.md): a name of more than 128 characters, a setting without = or :", () => {
    const pw = "Orders" + "2024Prod";
    const name = "spring.datasource.hikari.data-source-properties.connection.attributes";
    assert.deepEqual(kinds(`${name}.db_password=${pw}`), ["assignment"], "128 characters at most");
    const long = `${name}.${name}`;
    assert.ok(long.length > 128);
    assert.deepEqual(kinds(`${long}.db_password=${pw}`), [], "only the floor reads a longer name, by its last word");
    assert.deepEqual(kinds(`${long}.password=${pw}`), ["assignment"], "the floor: `password` as a word");
    assert.deepEqual(kinds(`requirepass ${pw}`), []);
  });

  test("a value holding a dot is a member in code only unquoted and without a number of two digits", () => {
    const pw = "Summer" + "2024.Winter99";
    assert.deepEqual(kinds(`password: ${pw}`), ["assignment"]);
    assert.deepEqual(kinds(`db_password: "${pw}"`), ["assignment"], "quoted");
    assert.deepEqual(kinds(`token: ${"ya" + "29.a0AfH6SMBxYz12kLmN3oPqR4sTuV5wXyZ"}`), ["assignment"]);
    assert.deepEqual(kinds("db_password: config.jwt.secret"), [], "a member");
    assert.deepEqual(kinds("db_password: user.password2"), [], "a member: one digit");
  });

  test("a secret's word glued to a name in capitals (PGPASSWORD, MYSQLPASSWORD): found; in lower case, or at the start, not", () => {
    const pw = "Orders" + "2024Prod";
    for (const name of [
      "PGPASSWORD",
      "MYSQLPASSWORD",
      "export PGPASSWORD",
      "  - PGPASSWORD",
      "VAULTTOKEN",
      "APPSECRET",
    ])
      assert.deepEqual(kinds(`${name}=${pw}`), ["assignment"], name);
    for (const name of ["pgpassword", "KEYBOARD", "TOKENIZER", "PASSWORDLESS", "PGPASSFILE"])
      assert.deepEqual(kinds(`${name}=${pw}`), [], name);
  });

  test("a connection string's password inside a connection string; a lone password = … is an assignment, once", () => {
    const pw = "hun" + "ter22";
    assert.deepEqual(kinds(`Server=db;Password=${pw};`), ["connectionString"]);
    assert.deepEqual(kinds(`Password=${pw};Server=db`), ["connectionString"]);
    assert.deepEqual(kinds(`password = ${pw}`), ["assignment"]);
    assert.deepEqual(kinds("Password = model.Password;"), []);
    // A libpq DSN: pairs separated by blanks, before or after; a command line's option is not a pair.
    assert.deepEqual(kinds(`host=db user=app password=${pw}`), ["connectionString"]);
    assert.deepEqual(kinds(`password=${pw} dbname=orders`), ["connectionString"]);
    assert.deepEqual(kinds(`mysqldump --user=app --password=${pw} orders`), ["assignment"]);
    // Inside a connection string, whatever the value, as 0.4.1 read it; a short one alone too (6 characters).
    assert.deepEqual(kinds("Server=db;Password=my.pass.word;"), ["connectionString"]);
    assert.deepEqual(kinds("password=hunter2"), ["assignment"]);
    assert.deepEqual(kinds("password=hunt3"), [], "5 characters");
    // A password in capitals (a base 32 key) inside one too; a variable's name with an underscore is not one.
    const caps = "ORDERS" + "2024PROD";
    for (const text of [
      `Server=db;Password=${caps};`,
      `Password=${caps};`,
      `Data Source=db;User Id=sa;Password=${"P4SS" + "W0RD2024"};`,
      `host=db user=app password=${caps} dbname=orders`,
    ])
      assert.deepEqual(kinds(text), ["connectionString"], text);
    assert.deepEqual(kinds("Server=db;Password=DB_PASSWORD;"), []);
    // Next to a pair, but not written as a connection string's (`:`, a quoted name or value): an assignment.
    const pw2 = "Orders" + "2024";
    for (const text of [
      `pwd: ${pw2} dbname=x`,
      `user=app password: ${pw2}`,
      `PASSWORD: ${pw2} user=app`,
      `"password": "${pw2};Prod"`,
      `password: ${pw2};`,
      `password="${pw2}Prod" dbname=x`,
    ])
      assert.deepEqual(kinds(text), ["assignment"], text);
  });

  test("known limits (SECURITY.md): a password with a blank, on the next line, after Bearer or Basic, as a URL's user", () => {
    const pem = (prefix) =>
      [begin(""), ...Array.from({ length: 4 }, () => token(64, B64)), end("")].map((l) => prefix + l).join("\n");
    for (const text of [
      `"password": "correct ${"horse battery staple"}"`,
      `password:\n  ${"Tr0" + "ub4dor&3xQ!"}`,
      `Authorization: Bearer ${token(40, B64URL)}`,
      `Authorization: Basic ${token(28, B64)}==`,
      `https://${token(40)}@git.example.org/team/app.git`,
      pem("> "),
      pem("// "),
      pem("").split("\n").slice(0, -1).join("\n"),
    ])
      assert.deepEqual(kinds(text), [], text.slice(0, 30));
  });

  test("a CSS pseudo-class after a selector named as a secret is not a value; a value after a colon is", () => {
    for (const text of [
      "#password:-webkit-autofill{box-shadow:0 0 0 30px #fff inset}",
      ".token:-webkit-any-link{color:inherit}",
      ".field-secret:-moz-ui-invalid{box-shadow:none}",
      "input.password:-webkit-autofill:focus{transition:none}",
      ".password-field input.password:-webkit-autofill,",
      ".password:picture-in-picture{opacity:.5}",
    ])
      assert.deepEqual(kinds(text), [], text);
    const pw = "Kx9#" + "mQ2vL7pZ4";
    assert.deepEqual(kinds(`db_password:${pw}`), ["assignment"]);
    assert.deepEqual(kinds(`password: -${pw}`), ["assignment"], "a sign first, not a vendor's prefix");
    assert.deepEqual(kinds(`password: -webkit-${pw}`), [], "a vendor's prefix");
  });

  test("a Helm value naming a resource (existingSecret, imagePullSecret, tlsSecret) is not a secret; a password is", () => {
    for (const text of [
      "existingSecret: postgresql-credentials",
      '  existingSecret: "orders-api-secrets"',
      "imagePullSecret: registry-credentials",
      "tlsSecret: wildcard-tls-certificate",
      "adminPasswordSecret: grafana-admin-credentials",
      "secret: orders-db-credentials",
      "secret: kubernetes.io/service-account-token",
    ])
      assert.deepEqual(kinds(text), [], text);
    const pw = "Kx9#" + "mQ2vL7pZ4";
    assert.deepEqual(kinds(`tlsSecret: ${pw}`), ["assignment"]);
    assert.deepEqual(kinds(`existingSecret: ${pw}`), [], "the name of a reference: never a secret's");
    // In capitals (an environment file), words are a passphrase; under a password's name too.
    assert.deepEqual(kinds("JWT_SECRET=wildcard-tls-certificate"), ["assignment"]);
    assert.deepEqual(kinds(`db_password: ${"correct-" + "horse-" + "battery"}`), ["assignment"]);
    assert.deepEqual(kinds("tlsSecret: wildcard-tls-2024"), [], "a number as a word of its own");
    assert.deepEqual(kinds("tlsSecret: wildcard-tls-2024x"), ["assignment"], "a digit mixed in a word");
  });

  test("a number is a password's value from 8 digits, never a token's or a price", () => {
    const digits = "7382" + "9164";
    assert.deepEqual(kinds(`DB_PASSWORD=${digits}`), ["assignment"]);
    assert.deepEqual(kinds(`"pwd": "${digits}"`), ["assignment"]);
    assert.deepEqual(kinds(`DB_PASSWORD=${digits.slice(0, 7)}`), [], "7 digits");
    assert.deepEqual(kinds(`API_TOKEN=${digits}`), [], "a token's name: an identifier");
    assert.deepEqual(kinds(`DB_PASSWORD=${digits}.5`), [], "not digits only");
    assert.deepEqual(kinds("DB_PASSWORD=11111111"), [], "fewer than 5 different digits");
  });

  test("a variable's name in capitals is a reference unquoted; quoted, a value unless it reads as one", () => {
    const caps = "S3CR_" + "ET99_ZQ";
    assert.deepEqual(kinds(`{"password": "${caps}"}`), ["assignment"]);
    assert.deepEqual(kinds(`password: '${caps}'`), ["assignment"]);
    assert.deepEqual(kinds(`password: ${caps}`), [], "unquoted: a variable's name");
    for (const text of [
      '"Secret": "__REPLACE_AT_DEPLOY__"',
      '"ApiKey": "OPENAI_API_KEY"',
      '"password": "DB_PASSWORD_VALUE"',
      '"token": "API_KEY_FROM_VAULT"',
    ])
      assert.deepEqual(kinds(text), [], text);
  });

  test("XML: a secret element (Maven's settings.xml) and a secret setting (NuGet): found; placeholders are not", () => {
    const pw = "Kx9#" + "mQ2vL7pZ4";
    assert.deepEqual(kinds(`<password>${pw}</password>`), ["assignment"]);
    assert.deepEqual(kinds(`  <sonar.token>${pw}</sonar.token>`), ["assignment"]);
    assert.deepEqual(kinds(`<add key="ClearTextPassword" value="${pw}" />`), ["assignment"]);
    assert.deepEqual(kinds(`<add key='DbPassword' value='${pw}'/>`), ["assignment"]);
    for (const text of [
      "<password>${env.MAVEN_PASSWORD}</password>",
      "<password>your-password</password>",
      `<password>{${"COQLCE6DU6" + "GtcS5P="}}</password>`,
      `<password>${pw}</passphrase>`,
      `<username>${pw}</username>`,
      '<add key="ClearTextPassword" value="%NUGET_PASSWORD%" />',
      '<add key="DbPassword" value="$(DbPassword)" />',
      `<add key="Username" value="${pw}" />`,
    ])
      assert.deepEqual(kinds(text), [], text);
  });

  test("the default of a shell expansion (${DB_PASSWORD:-postgres}) is a placeholder; the value it replaces is not", () => {
    for (const text of [
      "POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}",
      "password: ${DB_PASSWORD:-postgres}",
      "REDIS_PASSWORD: ${REDIS_PASSWORD:-redis_dev_pass}",
      "- DB_PASSWORD=${DB_PASSWORD:=localdev1}",
    ])
      assert.deepEqual(kinds(text), [], text);
    assert.deepEqual(kinds(`POSTGRES_PASSWORD: ${"Kx9#" + "mQ2vL7pZ4"}`), ["assignment"]);
  });

  test("a value of members joined by + (minified code) is an expression; a generated key is a value", () => {
    assert.deepEqual(kinds("o.key=r.C0.ESC+r.C0.ESC"), []);
    assert.deepEqual(kinds("case 13:o.key=e.altKey?r.C0.ESC+r.C0.CR:r.C0.CR"), []);
    assert.deepEqual(kinds(`o.key=${generated}`), ["assignment"]);
    assert.deepEqual(kinds(`o.key=${generated.slice(0, 10)}+${generated.slice(10)}`), ["assignment"]);
  });

  test("a value two detectors find is reported once, under the first: a Google key in a URL's key=", () => {
    const key = "AI" + "za" + draw(35);
    const maps = "https://maps.googleapis" + ".com/maps/api/js";
    assert.deepEqual(kinds(`<script src="${maps}?key=${key}&callback=initMap"></script>`), ["cloudKey"]);
    assert.deepEqual(kinds(`GOOGLE_API_KEY=${key}`), ["cloudKey"]);
    // Two values on one line: each once.
    assert.deepEqual(kinds(`${maps}?key=${key} and ${maps}?key=${"AI" + "za" + draw(35)}`), ["cloudKey", "cloudKey"]);
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

  test("a URL's query value under a name that says nothing (?list=, ?fbclid=): not found; under a secret's name it is", () => {
    const youtube = "https://www.youtube" + `.com/watch?v=${token(11, B64URL)}&list=PL${token(32, B64URL)}`;
    assert.deepEqual(kinds(youtube), []);
    assert.deepEqual(kinds(`<a href="${youtube.replace("&", "&amp;")}">talk</a>`), []);
    assert.deepEqual(kinds(`https://shop.test/?fbclid=IwAR${token(57, B64URL)}`), []);
    assert.deepEqual(kinds(`https://shop.test/?utm_source=x&gclid=${token(40, B64URL)}`), []);
    // A secret's name, or a name a URL gives a secret (a session): found.
    assert.deepEqual(kinds(`https://shop.test/a?session=${token(32)}`), ["entropy"]);
    assert.deepEqual(kinds(`https://shop.test/cb?state=abc&sid=${token(32, B64URL)}`), ["entropy"]);
    assert.deepEqual(kinds(`https://shop.test/a#access_token=${token(32)}`), ["assignment"]);
    // Outside a query, the same name is an assignment like any other.
    assert.deepEqual(kinds(`list=PL${token(32, B64URL)}`), ["entropy"]);
  });

  test("an OAuth authorisation code (?code=) is not a secret: used once, within minutes; the documentation shows one", () => {
    // Google's and Microsoft's published examples, and a code of the same shape as a random token.
    for (const text of [
      `https://oauth2.example.com/auth?code=${"4/P7q7W91a-oMs" + "CeLvIaQm6bTrgtp7"}&scope=email`,
      `https://localhost/myapp/?code=${"OAAABAAAAiL9Kn2Z27Uub" + "vWFPbm0gLWQJVzCTE9UkP3pSx1aXxUjq3n8b2JRLk4OxVXr"}&state=12345`,
      `GET /callback?code=${token(24)}&state=abc HTTP/1.1`,
      `<a href="https://app.test/cb?state=abc&amp;code=${token(32, B64URL)}">sign in</a>`,
    ])
      assert.deepEqual(kinds(text), [], text.slice(0, 40));
    // The tokens a code is exchanged for are secrets.
    assert.deepEqual(kinds(`https://app.test/cb#access_token=${token(32)}&token_type=Bearer`), ["assignment"]);
    assert.deepEqual(kinds(`https://app.test/cb?state=abc&id_token=${token(32, B64URL)}`), ["assignment"]);
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

describe("false positives that would fail a build", () => {
  /** The files of a folder, at any depth, that `check secrets`, `pack` or `inputs ingest` would read. */
  const filesOf = (root) =>
    fs
      .readdirSync(root, { recursive: true })
      .map((f) => String(f))
      .filter((f) => !/(?:^|[\\/])(?:node_modules|dist|\.doc-kit)(?:[\\/]|$)/.test(f))
      .map((f) => path.join(root, f))
      .filter((f) => fs.statSync(f).isFile() && /\.(md|json|mjs|js|svg|html|txt|ya?ml|css|xml|env|Config)$/.test(f));
  const findings = (files) =>
    files.flatMap((f) =>
      scanText(fs.readFileSync(f, "utf8"), GENERIC).map((x) => `${path.relative(KIT_ROOT, f)}:${x.line} ${x.kind}`),
    );

  test("ten realistic configuration files hold no secret for any detector (Helm, CSS, docker-compose, .NET, .env…)", () => {
    const dir = path.join(KIT_ROOT, "test", "fixtures", "secret-configs");
    const files = filesOf(dir);
    assert.equal(files.length, 10, files.join(", "));
    assert.deepEqual(findings(files), []);
  });

  test("the kit's documentation, examples and templates hold no secret for any detector", () => {
    const files = ["docs", "examples", "templates"].flatMap((r) => filesOf(path.join(KIT_ROOT, r)));
    assert.ok(files.length > 300, `${files.length} files`);
    assert.deepEqual(findings(files), []);
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
      "appsettings.Production.json.bak",
      "terraform.tfvars",
      "prod.auto.tfvars",
      "client_secret.json",
      "client_secret_1234-abc.apps.googleusercontent.com.json",
      "kubeconfig",
      "AuthKey_ABC123.p8",
      ".htpasswd",
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
      "appsettings.Production.json.md",
      "terraform.tfvars.example",
      "tfvars.md",
      "client_secret.md",
      "client_secret.example.json",
      "kubeconfig.md",
      "p8.md",
      "htpasswd.md",
      ".htaccess",
    ])
      assert.ok(!SECRET_FILE.test(name), name);
  });

  test("a JSON file over 64 KB whose first key is cookies or origins is a session only with a session's shape", () => {
    const dir = tempDir("doc-kit-session-");
    try {
      const write = (name, data) => {
        const file = path.join(dir, name);
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        assert.ok(fs.statSync(file).size > 64 * 1024, name);
        return file;
      };
      const many = (item) => Array.from({ length: 2000 }, (_, i) => item(i));
      // Data that merely starts with a "cookies" or an "origins" list.
      const recipes = { cookies: many((i) => ({ id: i, flavour: "chocolate chip" })) };
      assert.equal(isSessionFile(write("recipes.json", recipes)), false);
      const cors = { origins: many((i) => ({ origin: `https://a${i}.test`, methods: ["GET"] })) };
      assert.equal(isSessionFile(write("cors.json", cors)), false);
      // Sessions: Playwright's cookies, the other key in the head, an origin with its local storage.
      const cookie = (i) => ({ name: `c${i}`, value: "v", domain: "app.test", path: "/", expires: -1 });
      assert.equal(isSessionFile(write("jar.json", { cookies: many(cookie) })), true);
      const origins = [{ origin: "https://app.test", localStorage: [{ name: "cache", value: "x".repeat(100_000) }] }];
      assert.equal(isSessionFile(write("state.json", { cookies: [], origins })), true);
      assert.equal(isSessionFile(write("origins-first.json", { origins, cookies: [] })), true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("up to 5 MB a file is parsed whole (SEC-12): a session in any key order is one, a nested origins list is not", () => {
    const dir = tempDir("doc-kit-session-");
    try {
      const write = (name, text) => {
        const file = path.join(dir, name);
        fs.writeFileSync(file, text);
        assert.ok(fs.statSync(file).size > 64 * 1024 && fs.statSync(file).size <= 5 * 1024 * 1024, name);
        return file;
      };
      // A session of 171 KB whose cookies are written domain first (another tool), and one whose first cookie fills
      // the first 64 KB: the head shows neither the other key nor a cookie of Playwright's order.
      const cookies = Array.from({ length: 1500 }, (_, i) => ({
        domain: "app.test",
        name: `n${i}`,
        value: "w".repeat(40),
      }));
      const otherOrder = JSON.stringify(
        { cookies: [{ domain: "app.test", name: "sid", value: "v" }, ...cookies], origins: [] },
        null,
        2,
      );
      assert.equal(isSessionFile(write("other-order.json", otherOrder)), true);
      const bigCookie = JSON.stringify({
        cookies: [{ name: "a", value: "q".repeat(70_000), domain: "app.test" }],
        origins: [],
      });
      assert.equal(isSessionFile(write("big-cookie.json", bigCookie)), true);
      assert.equal(isSessionFile(write("bom.json", "\uFEFF" + bigCookie)), true, "a byte order mark first");
      // Data of 251 KB that starts with a "cookies" list whose first item has an "origins" list: not a session.
      const recipes = (extra) => [
        { id: 0, flavour: "x", ingredients: [{ name: "cocoa", origins: ["CI", "GH"] }] },
        ...Array.from({ length: 3000 }, (_, i) => ({ id: i + 1, flavour: "chocolate chip", grams: 30 + (i % 7) })),
        ...extra,
      ];
      assert.equal(isSessionFile(write("bakery.json", JSON.stringify({ cookies: recipes([]) }, null, 2))), false);
      const late = JSON.stringify({ cookies: recipes([{ id: -1, origins: [] }]) }, null, 2);
      assert.equal(isSessionFile(write("bakery-late.json", late)), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("over 5 MB a file is told by its head, on its top-level keys only: a nested origins list is not the other key", () => {
    const dir = tempDir("doc-kit-session-");
    try {
      const write = (name, text) => {
        const file = path.join(dir, name);
        fs.writeFileSync(file, text);
        assert.ok(fs.statSync(file).size > 5 * 1024 * 1024, name);
        return file;
      };
      const fill = "x".repeat(5 * 1024 * 1024);
      // The other key at the top level, after a small list: a session holding megabytes of local storage.
      const origins = [{ origin: "https://app.test", localStorage: [{ name: "cache", value: fill }] }];
      const session = JSON.stringify({ cookies: [{ domain: "app.test", name: "sid", value: "v" }], origins });
      assert.equal(isSessionFile(write("session.json", session)), true);
      // The same key inside the first item: data.
      const data = JSON.stringify({ cookies: [{ id: 0, origins: ["CI"], notes: fill }] });
      assert.equal(isSessionFile(write("data.json", data)), false);
      // Brackets inside a string, after an escaped quote, close nothing.
      const escaped = JSON.stringify({ cookies: [{ id: 0, note: 'a "}]," word', origins: [] }], blob: fill });
      assert.equal(isSessionFile(write("escaped.json", escaped)), false, "an escaped quote does not end the string");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
