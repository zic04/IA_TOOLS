// What 0.4.1 found is still found (RULES.md S7, SECURITY.md "The secret detectors have limits"): the detectors of
// `check secrets` may find more than those of 0.4.1, never less. Two proofs:
//   - a recall corpus, realistic configuration files that do hold (fictional) secrets: every line holding one is
//     reported, with its kind, and no other line (test/fixtures/secret-configs-with-secrets/);
//   - a parity table: lines the `assignment` and `connectionString` rules of 0.4.1 reported, each still reported by
//     scanText and by looksSecret (the filters of `facts`: withoutCredentials, routeWithoutSecrets). A line 0.4.1
//     reported and this version does not is an intended change: INTENDED_CHANGES gives it with its reason, and the
//     CHANGELOG names it: only a reference in code or a placeholder, decided on the whole value (never on a part of
//     it: `password=Replacement2024!` is a password), never a value holding a number of two digits or more, which is
//     never read as code. Each rule of those exceptions has its minimal pair here and its mutant
//     (test/mutations/secret-values.mjs).
// The false-positive side is in secret-detectors.test.mjs (test/fixtures/secret-configs/, the kit's documentation).
// A literal of a provider's token shape is written in parts (push protection).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { GENERIC, scanText, looksSecret } from "../../engine/check/secrets.mjs";
import { withoutCredentials } from "../../engine/facts/dependencies.mjs";
import { routeWithoutSecrets } from "../../engine/facts/behaviour-common.mjs";
import { KIT_ROOT } from "../tools/helpers.mjs";

/** The kinds the generic detectors report on each line of a text: { line: [kind…] }. */
function kindsByLine(text) {
  /** @type {Record<number, string[]>} */
  const out = {};
  for (const f of scanText(text, GENERIC)) (out[f.line] ??= []).push(f.kind);
  return out;
}
const kinds = (text) => scanText(text, GENERIC).map((f) => f.kind);

describe("a recall corpus: realistic configuration files holding secrets", () => {
  const dir = path.join(KIT_ROOT, "test", "fixtures", "secret-configs-with-secrets");
  const A = "assignment";
  const C = "connectionString";
  /** Each line that holds a secret, with the kind reported; no other line is reported. */
  const EXPECTED = {
    // Spring: a password of words and digits, a password of letters only (6 characters or more after `password=`,
    // as 0.4.1 read it), a JWT secret, a key store's password, an OAuth2 client's secret under a name of 65
    // characters.
    "application.properties": { 3: [A], 4: [A], 5: [A], 6: [A], 7: [A], 8: [A], 9: [A], 10: [A] },
    "application.yml": { 5: [A], 8: [A], 11: [A], 12: [A] },
    "config.ini": { 4: [A], 7: [A] },
    // An environment list, a map, and a command line (`--password=`).
    "docker-compose.yml": { 6: [A], 10: [A], 13: [A] },
    "k8s-secret.yaml": { 8: [A], 9: [A] },
    // A URL's password, compound names, a name glued in capitals (PGPASSWORD), a libpq DSN of blank-separated pairs.
    "orders.env": { 2: ["credentialsUrl"], 3: [A], 4: [A], 5: [A], 6: [A], 7: [A], 8: [C] },
    "backup.sh": { 3: [A], 4: [C], 5: [A] },
    // ADO.NET connection strings (a password holding a dot, `Pwd=` with a sign), a setting.
    "appsettings.json": { 3: [C], 4: [C], 8: [A] },
    "settings.xml": { 6: [A] },
    "NuGet.Config": { 9: [A] },
    "values.yaml": { 5: [A], 6: [A], 9: [A] },
  };

  test("every line holding a secret is reported with its kind, and no other line", () => {
    assert.deepEqual(fs.readdirSync(dir).sort(), Object.keys(EXPECTED).sort());
    for (const [file, expected] of Object.entries(EXPECTED)) {
      const found = kindsByLine(fs.readFileSync(path.join(dir, file), "utf8"));
      assert.deepEqual(found, expected, file);
    }
  });

  test("looksSecret, the filter of facts, finds each of those lines alone", () => {
    for (const [file, expected] of Object.entries(EXPECTED)) {
      const lines = fs.readFileSync(path.join(dir, file), "utf8").split("\n");
      for (const n of Object.keys(expected)) assert.ok(looksSecret(lines[+n - 1]), `${file}:${n}`);
    }
  });
});

/**
 * Lines 0.4.1 reported (its `assignment` rule: a word among password, passwd, secret, token, api_key, client_secret,
 * access_key, a value of 16 characters or more with a digit; its `connectionString` rule: `Password=` or `Pwd=`, a
 * value of 6 characters or more), checked against its engine when this table was written.
 */
const CAUGHT_BY_0_4_1 = [
  // A password of words and digits, unquoted under a name in lower case.
  "spring.datasource.password=Summer2024Winter",
  "spring.datasource.password=Orders2024Prod",
  "spring.datasource.password: Summer2024Winter",
  "password: SummerHoliday2024",
  "password: WinterIsComing2024",
  "  password: Welcome2024Admin",
  "secret: Prod2024Secret99",
  "token: Bearer2024Token99",
  "secret = Abcdefgh12345678Q",
  "secret=AbcdefGhijkl2024",
  "x-api-key: AbCdEf1234567890",
  "apiKey: myApiKey2024Prod",
  "api_key=Abc123Def456Ghi789",
  "token: GhP4ssTok3nValue99",
  "password: Abc123456789xyzz",
  "client_secret: 1234abcd5678efgh",
  "redis.password=Redis2024Cache",
  "mail.password=Smtp2024Relay",
  "--password=Summer2024Winter",
  'command: ["--password=Cli2024Secret"]',
  "PASSWORD=Summer2024Winter",
  // A value holding a dot: quoted, or with a number of several digits, it is not a member.
  'password: "Summer2024.Winter99"',
  "password: Summer2024.Winter99",
  "password: abc.def.123456789",
  "token: " + "ya" + "29.a0AfH6SMBxYz12kLmN3oPqR4sTuV5wXyZ",
  // A short password after `password=` or `pwd=` (6 characters or more), letters only or a weak one.
  "password=hunter2",
  "password=admin1",
  "password=root123",
  "Password=secret1",
  "password=postgres",
  "spring.datasource.password=postgres",
  "password=letmeinplease",
  "password=changeit",
  "password=mysecretpassword",
  "password=MyPassword",
  "password=1234567",
  "password=my.pass.word",
  "password=john.smith",
  "password=$ecretPa55w0rd",
  "password=@dmin2024Prod",
  "password=Summer(2024)",
  "password=pass[2024]",
  "db.password=Passw0rd!",
  "pwd=Pa55word",
  "PWD=MySecret12",
  "Pwd=abc123xyz",
  "password = Tr0ub4dor3xQ",
  // A name in code with nothing of code around it reads as a password, as 0.4.1 read it.
  "password = new_password",
  // Connection strings: ADO.NET, JDBC, a libpq DSN of blank-separated pairs.
  "Data Source=db;User Id=sa;Password=Pass.word2024;",
  "Server=db;Password=my.pass.word;",
  "jdbc:sqlserver://db:1433;user=sa;password=Orders2024Prod",
  "DATABASE_DSN=host=db user=app password=Orders2024Prod dbname=orders",
  "psql 'host=db password=Orders2024Prod'",
  "login?password=Orders2024Prod",
  // Under a public name, a resource's name with a number, the value on the next line: 0.4.1 read them.
  "public.token=8hG3kL9mN2pQ4rS6tU8v",
  "public-api-key: 8hG3kL9mN2pQ4rS6tU8v",
  "secret: kubernetes-secret-2024-prod",
  "jwt:\n  secret: my-super-secret-key-2024",
  "password:\n  Summer2024Winter99",
  // An instruction to replace the value is a placeholder as the whole value only: a word that holds it, or a number
  // right after it, is a password, in a connection string, a DSN and a URL too.
  "password=Replacement2024!",
  "Server=db;Database=orders;User Id=sa;Password=Replacement2024!;",
  "host=db user=app password=Replacement2024! dbname=orders",
  "postgres://app:Replacement2024@db/orders",
  "AccountKey=Replacement2024abc==",
  "password=MyReplacementPwd1",
  "password=Exchange-Me2024",
  "password=change-meXYZ2024",
  "password=Change-Me-2024!",
  "password=Change-Me-2024",
  "password=replace_me_2024!",
  // A sigil before a number of two digits, or before a name in capitals that has no `_` and names no secret.
  "password=$ECRET2024",
  "password=%ECRET2024%",
  "PASSWORD=$UPER2024PASS",
  "PASSWORD=$DB_PASSWORD_2024",
  "password=$PRODPASS",
  "password=%PRODPASS%",
  // A parenthesis that is not a call as the whole value: a sign after it, a number or a word in capitals in it, a
  // word alone before it; a bracket that is not an index by a quoted key.
  "password=Pass.Word(1)#Kx!q",
  "password=HappyDays(1)!",
  "mysqldump --password=HappyDays(1)! orders",
  "jdbc:postgresql://db:5432/orders?user=app&password=HappyDays(1)!",
  "password=SuperSecret(1)",
  "password=BlueSky(7)",
  "password=Orders.Prod(1)",
  "Password = SuperSecret(1);",
  "Password = SummerFun(Beach);",
  "Password = Welcome(user);",
  "Password = Secret[x];",
  'Password = configuration["DbPassword2024"];',
  "password=GetPassword())Kx9",
  "password = config.get(key)#Kx9!q",
  "secret: vault.v1.read_secret(path)#Kx9",
  // A member or a call in a line that is not written as code: `password=…` at the end of the line (a properties
  // file's, a command line's), or a name in capitals after a blank.
  "password=Admin.Pass",
  "password=my.secret",
  "password=Root.Secret",
  "password = Root.Secret",
  "Password = Model.Password",
  "password=model.Password",
  "password=GetPassword()",
  // The `,` of code after a value holding a number of two digits: still the value's.
  "password=PROD_DB_PASS_2024,",
  "AccountKey=PROD_KEY_2024,",
];

/**
 * Lines 0.4.1 reported that this version does not, on purpose: a reference in code, which names where the secret is,
 * never the secret, and a placeholder. Each is named in the CHANGELOG.
 */
const INTENDED_CHANGES = [
  ["Password = model.Password;", "a member that names a secret's field: a reference in code"],
  ["password = request.form.password", "a member that names a secret's field: a reference in code"],
  ["Password = GetPassword();", "a call: a reference in code"],
  ['Password = configuration["DbPassword"];', "an index by a quoted key: a reference in code"],
  ["PASSWORD=$DB_PASSWORD", "a shell variable: a sigil and a variable's name in capitals"],
  ["password=%DB_PASSWORD%", "a Windows variable: a variable's name in capitals between %"],
  ["password=change-me", "a placeholder, as changeme already was"],
  ["secret: replace-me-with-a-real-key-2024", "a placeholder"],
  ["password=********,", "a mask: the , of code after it is not the value's"],
  ["connect(password=DB_PASSWORD_VALUE, user=USER)", "a variable's name in capitals: the , of code is not the value's"],
  ["token: config.v2.jwt.secret", "a member that names a secret's field: a reference in code"],
];

describe("parity with 0.4.1: what it reported is still reported", () => {
  test("every line of the table is reported by scanText and by looksSecret", () => {
    const lost = CAUGHT_BY_0_4_1.filter((line) => kinds(line).length === 0);
    assert.deepEqual(lost, [], "lost by scanText");
    assert.deepEqual(
      CAUGHT_BY_0_4_1.filter((line) => !looksSecret(line)),
      [],
      "lost by looksSecret",
    );
  });

  test("the filters of facts keep none of them: withoutCredentials, routeWithoutSecrets", () => {
    // Dropped, or, for a URL's password, the user and password taken out of the URL (as 0.4.1 did).
    for (const line of CAUGHT_BY_0_4_1) {
      const kept = withoutCredentials(line);
      assert.ok(kept === null || (kept !== line && !looksSecret(kept)), line);
    }
    assert.equal(routeWithoutSecrets("/login?password=Orders2024Prod"), "/…");
    assert.equal(routeWithoutSecrets("/reset/password=postgres"), "/reset/…");
  });

  test("each intended change is not reported, has its reason, and the CHANGELOG names it", () => {
    // Every entry written since 0.4.1, the floor: [Unreleased] while it is unreleased, the releases after 0.4.1 then.
    const changelog = fs.readFileSync(path.join(KIT_ROOT, "CHANGELOG.md"), "utf8");
    const start = changelog.indexOf("## [Unreleased]");
    const since = changelog.slice(start, changelog.indexOf("\n## [0.4.1]", start + 1));
    assert.ok(start >= 0 && since.length > 1000);
    for (const [line, reason] of INTENDED_CHANGES) {
      assert.deepEqual(kinds(line), [], line);
      assert.ok(reason.length > 10, line);
      assert.ok(since.includes("`" + line + "`"), `the CHANGELOG names ${line}`);
    }
  });

  test("the minimal pairs of the intended changes: the same values outside code are reported", () => {
    for (const line of [
      // A member that does not name a secret's field, before a `;` too; the same member inside a connection string.
      "password=model.Passwords2024",
      "Password = model.Passw0rd2024;",
      "Server=db;Password=model.Password;",
      "Password=model.Password;Server=db",
      // A sigil before a name that is not in capitals; a password before the `,` of code; a word alone before a
      // parenthesis, an index by a number.
      "PASSWORD=$ecretPa55w0rd",
      "connect(password=hunter22, user=USER)",
      "password=Summer(2024)",
      "password=pass[2024]",
      // A number of two digits or more: never a name in code, before a parenthesis either.
      "password=Orders2024Prod(1)",
      "password=Pass2024Word(x)",
      "password=MyPass(2024)",
    ])
      assert.ok(kinds(line).length > 0, line);
  });

  test("an exception is decided on the whole value: each rule's minimal pair, a password and an intended change", () => {
    // [reported, not reported]: the same shape, one rule apart.
    for (const [secret, reference] of [
      // A placeholder: an instruction to replace the value as the whole value, words then a number after it.
      ["password=Replacement2024!", "password=change-me"],
      ["password=Change-Me-2024", "secret: replace-me-with-a-real-key-2024"],
      // A number of two digits or more first: never a variable, a call's argument or the value before a `,` of code.
      ["PASSWORD=$DB_PASSWORD_2024", "PASSWORD=$DB_PASSWORD"],
      ['Password = configuration["DbPassword2024"];', 'Password = configuration["DbPassword"];'],
      ["password=PROD_DB_PASS_2024,", "connect(password=DB_PASSWORD_VALUE, user=USER)"],
      // A sigil and a name in capitals whose words are joined by `_`, or that names a secret.
      ["password=$PRODPASS", "PASSWORD=$DB_PASSWORD"],
      ["password=%PRODPASS%", "password=%DB_PASSWORD%"],
      // A call as the whole value, nothing after it but the end of the value: a name of several words or members, then
      // names in lower case, members or quoted texts.
      ["password=GetPassword())Kx9", "Password = GetPassword();"],
      ["password = config.get(key)#Kx9!q", "password = config.get(key)"],
      ["secret: vault.v1.read_secret(path)#Kx9", "secret: vault.v1.read_secret(path)"],
      ["Password = Welcome(user);", "Password = GetPassword(user);"],
      ["Password = SuperSecret(1);", "Password = GetPassword(user);"],
      ["Password = SummerFun(Beach);", "Password = GetPassword(Keys.Db);"],
      // An index by a quoted key only.
      ["Password = Secret[x];", 'Password = configuration["DbPassword"];'],
      // A line written as code: the `;`, `,` or `)` of code after the value, or a blank before it and a name in
      // lower case first.
      ["password=my.secret", "password = request.form.password"],
      ["password=model.Password", "Password = model.Password;"],
      ["password=GetPassword()", "Password = GetPassword();"],
      ["password = Root.Secret", "password = request.form.password"],
      ["Password = Model.Password", "Password = Model.Password;"],
    ]) {
      assert.ok(kinds(secret).length > 0, secret);
      assert.ok(looksSecret(secret), `looksSecret: ${secret}`);
      assert.deepEqual(kinds(reference), [], reference);
    }
  });

  test("known limits (SECURITY.md): a properties, INI or YAML line with a blank and lower case first reads as code", () => {
    // [reported, left out]: the same password, without and with the blank before it. The detectors read a text, never
    // its file's name: with the blank and a value in lower case first, the line is written as code, and members that
    // name a secret's field are a reference there. 0.4.1 reported the lines with the blank too.
    for (const [secret, limit] of [
      ["spring.datasource.password=s3cr3t.pass", "spring.datasource.password = s3cr3t.pass"],
      ["password:adm1n.secret.pass", "password: adm1n.secret.pass"],
    ]) {
      assert.ok(kinds(secret).length > 0, secret);
      assert.ok(looksSecret(secret), `looksSecret: ${secret}`);
      assert.deepEqual(kinds(limit), [], limit);
      assert.equal(looksSecret(limit), false, `looksSecret: ${limit}`);
    }
  });

  test("a URL's password and 0.4.1's ?sig= are read as 0.4.1 read them: its placeholders only, a mask too", () => {
    // 0.4.1's placeholders (`changeme`, `your`, `example`…) never held `change-me`: its floor reads it in a URL.
    assert.deepEqual(kinds("postgres://app:change-me@db.example.org/orders"), ["credentialsUrl"]);
    assert.deepEqual(kinds("postgres://app:your-password@db.example.org/orders"), []);
    const query = "https://acct.blob.core.windows.net/c/f.pdf?sv=2024-01-01&";
    assert.deepEqual(kinds(`${query}s${"ig"}=${"X".repeat(43)}`), ["signedUrl"], "0.4.1's ?sig=: whatever its value");
    // Under another name, a mask as the whole value is a placeholder; a placeholder's word in a signature is not.
    assert.deepEqual(kinds(`${query}S${"ig"}=${"X".repeat(43)}`), []);
    assert.deepEqual(kinds(`${query}S${"ig"}=AbYour3kL9mN2pQ4rS6tU8vW1xY%3D`), ["signedUrl"]);
  });
});
