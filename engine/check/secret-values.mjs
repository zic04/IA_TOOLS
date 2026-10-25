// The value detectors of `check secrets` (engine/check/secrets.mjs, which runs them): what a secret's value looks
// like, by format (private keys, JWTs, connection strings, credentials in a URL, cloud and service tokens, an
// assignment to a secret's name, signed URLs), then the two rules of 0.4.1 as a floor (what they found is still
// found), last by entropy, and what is never one (a placeholder, a reference written as code). Also used by `pack`,
// `backlog export`, `inputs ingest` and the `secrets` facts (SECURITY.md, RULES.md S5: every expression here is
// measured by the ReDoS harness, through GENERIC).

/** A masked value as a whole (`xxxx…`, `****`, `0000…`): never a secret. */
const MASK = /^(?:x+|\*+|•+|\.+|0+|_+|-+)$/i;
/** 0.4.1's placeholders: a mask, or a word of documentation anywhere in the value (`your-api-key`, `<password>`). */
const PLACEHOLDER_0_4_1 = new RegExp(
  MASK.source +
    String.raw`|example|exemple|placeholder|your|votre|changeme|masked|redacted|dummy|sample|mot[-_ ]?de[-_ ]?passe|[<>{}]|\$\(|\.\.\.|…|process\.env|import\.meta|os\.environ`,
  "i",
);
/**
 * A placeholder, a variable name or a masked value: not a secret. 0.4.1's (PLACEHOLDER_0_4_1), and an instruction to
 * replace the value, as the whole value only: `change-me`, `replace_me`, words after it and a number last
 * (`replace-me-with-a-real-key-2024`); never a word that holds it (`Replacement2024!`, `Exchange-Me2024`), nor a
 * number right after it (`Change-Me-2024!`, `change-meXYZ2024` are passwords).
 */
export const PLACEHOLDER = new RegExp(
  String.raw`^(?:change|replace)[-_ ]?me(?:(?:[-_. ][a-z]+)+(?:[-_. ]\d+)?)?$|` + PLACEHOLDER_0_4_1.source,
  "i",
);

const VARIABLE_NAME = /^[A-Z][A-Z0-9_]*$/;
const isValue = (v) => !!v && !PLACEHOLDER.test(v) && !VARIABLE_NAME.test(v);
/** A value as 0.4.1 read it: not one of its placeholders, nor a variable name. */
const isValue041 = (v) => !!v && !PLACEHOLDER_0_4_1.test(v) && !VARIABLE_NAME.test(v);

/** A value that looks generated (letters and digits, varied), not a word: a key, a token. */
export const looksRandom = (v) => isValue(v) && /\d/.test(v) && /[A-Za-z]/.test(v) && new Set(v).size > 5;

/** The words of a name, in lower case: `DB_PASSWORD`, `db-password` and `dbPassword` all give ["db", "password"]. */
const nameParts = (name) =>
  String(name)
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z\d]+/)
    .filter(Boolean);
/** The words of a public name (`publicKey`, `PublicKeyToken`, `NEXT_PUBLIC_…`, `STRIPE_PUBLISHABLE_KEY`). */
const isPublic = (parts) => parts.includes("public") || parts.includes("publishable");
/** The last word of a name that says its value is a secret. */
const SECRET_WORDS = new Set(["secret", "token", "password", "passwd", "pwd", "pass", "pw", "passphrase", "apikey"]);
/** Words of a name that points to a resource holding the secret (Helm's `existingSecret`, `imagePullSecret`). */
const REFERENCE_WORDS = new Set(["existing", "pull"]);
/** Words that make a name ending in "key" a secret's: `API_KEY`, `SECRET_KEY`, `accessKey`, `PRIVATE_KEY`… */
const KEY_WORDS = new Set(["api", "secret", "access", "private", "client", "auth", "signing", "encryption", "master"]);
/** A name in capitals, an environment variable's (`PGPASSWORD`, `DB_PASSWORD`). */
const ENV_NAME = /^[A-Z][A-Z\d_]*$/;
/** The secret's words a name in capitals may end in, glued to the word before (`PGPASSWORD`, `MYSQLPASSWORD`). */
const GLUED_WORDS = ["password", "passwd", "passphrase", "token", "secret"];

/**
 * What a name says of its value: "secret" when its last word says so (`GITHUB_TOKEN`, `DB_PASSWORD`, `clientSecret`),
 * or ends so in a name in capitals (`PGPASSWORD`), or it ends in "key" after a word that makes it one (`SECRET_KEY`,
 * `aws_secret_access_key`, `apiKey`); "key" for the key of anything else (`STRIPE_KEY`, `CACHE_KEY`, `sortKey`),
 * whose value must look generated; null for a word merely starting so (`KEYBOARD`, `TOKENIZER`), a public name, the
 * name of a reference to a resource (`existingSecret`, `imagePullSecret`; `secretName`, `secretRef` end in another
 * word) and any other name.
 * @returns {"secret"|"key"|null}
 */
function secretName(name) {
  const parts = nameParts(name);
  const last = parts.at(-1) ?? "";
  if (isPublic(parts) || parts.some((p) => REFERENCE_WORDS.has(p))) return null;
  if (SECRET_WORDS.has(last)) return "secret";
  if (ENV_NAME.test(name) && GLUED_WORDS.some((w) => last.endsWith(w))) return "secret";
  if (last !== "key") return null;
  return parts.slice(0, -1).some((p) => KEY_WORDS.has(p)) ? "secret" : "key";
}

/** Shannon entropy of a text, in bits per character. */
function entropy(text) {
  const counts = new Map();
  for (const c of text) counts.set(c, (counts.get(c) || 0) + 1);
  let bits = 0;
  for (const n of counts.values()) bits -= (n / text.length) * Math.log2(n / text.length);
  return bits;
}
const charClass = (c) => (c >= "a" ? 0 : c >= "A" ? 1 : 2);
/**
 * How often a letter or digit is of another kind (lower case, upper case, digit) than the one before it: about 0.6
 * in a random token, under 0.3 in a name made of words and numbers (`JSONSchema7Definition`, `File_0_not_found_6053`).
 */
function classChanges(value) {
  const s = value.replace(/[^A-Za-z\d]/g, "");
  let n = 0;
  for (let i = 1; i < s.length; i++) if (charClass(s[i]) !== charClass(s[i - 1])) n++;
  return s.length > 1 ? n / (s.length - 1) : 0;
}
/** The last word of a name whose value is a hash, a nonce or an identifier: never a secret on its entropy alone. */
const NOT_SECRET_WORD =
  /^(?:sha\d*|md5|h1|hash|digest|checksum|integrity|fingerprint|pin|etag|nonce|challenge|state|id|ids|uuid|guid|name|ref|parent|source|target)$/;
/** A hash written with its algorithm (`sha512-…`, as npm and Subresource Integrity write them), or hexadecimal. */
const HASH_VALUE = /^(?:sha(?:1|224|256|384|512)|md5)[-_]|^[\da-f-]+$/i;
/** At least this share of a random token's letters and digits are of another kind than the one before. */
const RANDOM_CHANGES = 0.45;
/**
 * Bits per character a value of this length needs to look random: log2(length) - 0.6, at most 4.2. Random tokens of
 * base 62 or 64 reach it about 9 times in 10 from 20 characters and 97 times in 100 from 32
 * (test/unit/secret-detectors.test.mjs measures it, and the false positives of a corpus).
 */
const entropyThreshold = (length) => Math.min(4.2, Math.log2(length) - 0.6);

/**
 * Does a value assigned to `name` (or quoted) look random enough to be a secret whatever its name? 20 characters or
 * more, lower case, upper case and digits, kinds of characters that change as in a random token (RANDOM_CHANGES),
 * and an entropy over entropyThreshold. Never a placeholder, a hash (hexadecimal, `sha512-…`), the value of a hash,
 * a nonce or an identifier (`integrity`, `pin-sha256`, `state`, `client_id`, `storage_name`), or of a public name
 * (`publicKey`, `NEXT_PUBLIC_…`).
 * @param {string} value
 * @param {string} [name]
 */
export function highEntropy(value, name = "") {
  const v = value.replace(/=+$/, "");
  if (v.length < 20 || !isValue(v) || HASH_VALUE.test(v)) return false;
  if (!/[a-z]/.test(v) || !/[A-Z]/.test(v) || !/\d/.test(v)) return false;
  const parts = nameParts(name);
  if (NOT_SECRET_WORD.test(parts.at(-1) ?? "") || isPublic(parts)) return false;
  return classChanges(v) >= RANDOM_CHANGES && entropy(v) >= entropyThreshold(v.length);
}

/** A number, written as a program or a price list writes it (`8.76e-06`): never a secret. */
const NUMBER = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i;
/** Is a value assigned to the key of anything (`STRIPE_KEY`, `CACHE_KEY`, `sortKey`) a generated one? */
const assignedKey = (name, value) =>
  secretName(name) === "key" &&
  looksRandom(value) &&
  !NUMBER.test(value) &&
  !members(value) &&
  classChanges(value) >= RANDOM_CHANGES;

/** The fewest characters of a password under a secret's name; of one made of letters only (a label's word is shorter). */
const PASSWORD_MIN = 8;
const WORDS_MIN = 16;
/** Letters only, in words joined by `-`, `_` or `.` (`correcthorsebatterystaple`, `correct-horse-battery`). */
const WORDS = /^[A-Za-z]+(?:[-_.][A-Za-z]+)*$/;
/** A name in capitals with an underscore (`DB_PASSWORD_VALUE`, `__TOKEN__`): a variable's, not a value. */
const CONSTANT_NAME = /^_*[A-Z][A-Z\d]*(?:_+[A-Z\d]+)+_*$/;
/**
 * Is a value a variable's name in capitals with an underscore: unquoted always; quoted, when it holds no digit, is
 * wrapped in underscores (`"__REPLACE_AT_DEPLOY__"`) or one of its words is a secret's (`"OPENAI_API_KEY"`), so that
 * `"S3CR_ET99_ZQ"` is a value.
 * @param {string} v
 * @param {string} quote
 */
const constantName = (v, quote) =>
  CONSTANT_NAME.test(v) &&
  (!quote || !/\d/.test(v) || /^_|_$/.test(v) || nameParts(v).some((p) => SECRET_WORDS.has(p) || p === "key"));
/** A sigil and a name: a shell, PHP, Windows, Ruby or Razor variable, a YAML alias (`$DB_PASSWORD`, `%DB_PASSWORD%`). */
const SIGIL_NAME = /^[$@%*&]{1,2}[A-Za-z_][\w.]*[$@%]{0,2}$/;
/** A YAML tag (`!ImportValue`, `!vault`, `!!binary`), or a negation in code (`!!user.password`). */
const YAML_TAG = /^!{1,2}(?:[A-Za-z_]+|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)$/;
/** A member of an object in code (`request.form.password`, `settings.SECRET_KEY`, `config.jwt.secret`). */
const MEMBER = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/;
/** Members, or a sum of members (`r.C0.ESC+r.C0.ESC`, minified code): an expression, not a value. */
const members = (v) => v.split("+").every((p) => MEMBER.test(p));
/**
 * A number of two digits or more: a name in code seldom holds one, a password often does (`Orders2024Prod`,
 * `Summer2024.Winter99`), so a value holding one is never read as a name or a member in code.
 */
const NUMBER_RUN = /\d\d/;
/** A path to a file holding the secret (`/run/secrets/db`, `~/.pgpass`, `./keys/app`). */
const FILE_PATH = /^(?:~|\.{1,2})?(?:\/[A-Za-z_.][\w.-]*)+\/?$/;
/** A name in code: an identifier of several words (`hashedPassword`, `new_password`, `oauth2Token`, `Token$1`). */
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const WORD_PART = /^[a-z]*\d*$/;
/**
 * A secret's word in a value of letters only, or in capitals: a documentation's example (`mysecretpassword`,
 * `MYTOKEN1`), not a password.
 */
const SECRET_WORD_IN = /secret|passw|token|changeit/i;
/** A name in code of several words, without a number of two digits or more (NUMBER_RUN): `hashedPassword`. */
const codeName = (v) => {
  if (!IDENTIFIER.test(v) || !/[a-z]/.test(v) || NUMBER_RUN.test(v)) return false;
  const parts = nameParts(v);
  return parts.length > 1 && parts.every((p) => WORD_PART.test(p)) && classChanges(v) < RANDOM_CHANGES;
};

/**
 * Is a value written as a reference: a PEM armour line (the private key detectors decide), a comparison
 * (`token === x`), code (`a&&b`), a sigil and a name, a YAML tag, a path, a variable's name in capitals
 * (constantName), and unquoted, members without a number of two digits or more (`config.jwt.secret`; a quoted
 * value, `"Summer2024.Winter99"`, or `ya29.a0…` is a value)?
 * @param {string} v
 * @param {string} [quote]
 */
const writtenAsReference = (v, quote = "") =>
  v.startsWith("-----") ||
  v[0] === "=" ||
  v.includes("&&") ||
  constantName(v, quote) ||
  SIGIL_NAME.test(v) ||
  YAML_TAG.test(v) ||
  (!quote && !NUMBER_RUN.test(v) && members(v)) ||
  FILE_PATH.test(v);
/** A vendor's CSS pseudo-class after a selector named as a secret (`#password:-webkit-autofill`, `.token:-moz-…`). */
const VENDOR_PREFIX = /^-(?:webkit|moz|ms|o)-/i;
/**
 * A resource's name: lower-case words joined by `-`, `.` or `/`, a number as a word of its own (`orders-db-credentials`,
 * `kubernetes.io/tls`, `orders-tls-2024`; `pa55-word` is not one).
 */
const RESOURCE_NAME = /^[a-z]+(?:[-./](?:[a-z]+|\d+))+$/;
/** The last words of a password's name: a number is a value under them (`DB_PASSWORD=73829164`). */
const PASSWORD_WORDS = new Set(["password", "passwd", "pwd", "pass", "pw", "passphrase"]);
/** A number a password's name holds: digits only, 8 at least (a price, a size or a ratio is not one). */
const NUMERIC_PASSWORD = /^\d{8,}$/;

/**
 * Is a value read after `:` not a value: a CSS pseudo-class (a vendor's, or one a rule's block follows:
 * `.password:focus-visible{`), or, under a name in lower case ending in "secret" (a Helm value), a resource's name
 * (`tlsSecret: wildcard-tls-certificate`)?
 * @param {string} name
 * @param {string} v
 * @param {string|undefined} next   the character after the value
 */
const notAValueAfterColon = (name, v, next) =>
  VENDOR_PREFIX.test(v) ||
  next === "{" ||
  (/[a-z]/.test(name) && nameParts(name).at(-1) === "secret" && RESOURCE_NAME.test(v));

/**
 * Is a value under a secret's name too plain to be its password: shorter than 8 characters, a placeholder, fewer than
 * 5 different characters, a number (but 8 digits or more under a password's name), fewer than 16 letters, or letters
 * only or capitals holding a secret's word (a documentation's example)?
 * @param {string} name
 * @param {string} v
 */
function tooPlain(name, v) {
  if (v.length < PASSWORD_MIN || PLACEHOLDER.test(v) || new Set(v).size < 5) return true;
  if (NUMBER.test(v) && !(PASSWORD_WORDS.has(nameParts(name).at(-1) ?? "") && NUMERIC_PASSWORD.test(v))) return true;
  if (WORDS.test(v) && v.length < WORDS_MIN) return true;
  return (WORDS.test(v) || !/[a-z]/.test(v)) && SECRET_WORD_IN.test(v);
}

/**
 * Is the value assigned to a secret's name (`DB_PASSWORD=`, `"clientSecret":`) a secret? Any value of 8 characters
 * or more (16 when made of letters only), signs included (`Tr0ub4dor&3xQ!`, an Azure secret's `~`), in capitals too
 * (a base 32 key), but never a placeholder, a number, a value of fewer than 5 different characters, or a reference:
 * a variable's name in capitals with an underscore, a sigil and a name (`$DB_PASSWORD`, `%DB_PASSWORD%`), a YAML tag, a
 * path; unquoted, a member (`config.password`), a call or an index (`getPassword()`, `config["password"]`) and, under
 * a name that is not in capitals (code, not an environment file), a name in code (`hashedPassword`, `new_password`),
 * neither holding a number of two digits or more (NUMBER_RUN: `Orders2024Prod` is a password); after `:`, a CSS
 * pseudo-class or a resource's name (notAValueAfterColon); the default of a shell expansion
 * (`${DB_PASSWORD:-postgres}`). A number is a value under a password's name only (8 digits or more). What 0.4.1 read
 * is read again after it (floorAssignment, floorPassword).
 * @param {RegExpMatchArray} m   a match of the detector: groups n (the name), s (the separator), q (a quote, or `>` for
 *   the text of an XML element), v (the value)
 */
function assignedPassword(m) {
  const { n: name, s: separator, q: quote, v } = m.groups;
  if (secretName(name) !== "secret") return false;
  const input = m.input ?? "";
  const at = m.index ?? 0;
  const nameAt = at + m[0].indexOf(name);
  // A connection string's password is reported as one (connectionPassword), once: only where its expression reads
  // it, `Password=` unquoted and written as a word, then a value without a quote.
  const asConnection =
    /^(?:password|pwd)$/i.test(name) &&
    separator === "=" &&
    !quote &&
    !/[\w"']/.test(input[nameAt + name.length] ?? "") &&
    !/\w/.test(input[nameAt - 1] ?? "");
  if (asConnection && connectionContext(m)) return false;
  if (tooPlain(name, v) || writtenAsReference(v, quote) || input.slice(Math.max(0, nameAt - 2), nameAt) === "${")
    return false;
  if (quote) return true;
  const next = input[at + m[0].length];
  if (separator === ":" && notAValueAfterColon(name, v, next)) return false;
  return next !== "(" && next !== "[" && !(/[a-z]/.test(name) && codeName(v));
}

/** At most this many characters are read back for the pair before a `Password=` (a DSN's `user=app`). */
const PAIR_BACK = 256;
/** A `key=value` pair of a connection string or a DSN (`user=app`, `Data Source=db`'s `Source=db`). */
const PAIR = /^[A-Za-z_][\w.-]*=/;
const BLANKS = new Set([" ", "\t"]);
/** The text from `i` back to a blank, a quote or the start of the line, PAIR_BACK characters at most. */
function tokenBefore(input, i) {
  let a = i;
  while (a >= 0 && i - a < PAIR_BACK && !` \t\r\n"'\`;`.includes(input[a])) a--;
  return input.slice(a + 1, i + 1);
}
/**
 * Where a `Password=` or `Pwd=` stands: "pairs" inside a connection string, a `key=value` pair next to it, after a
 * `;` or a blank (`Server=db;Password=…`, `Password=…;Server=db`, a libpq DSN `host=db password=… dbname=orders`);
 * "statement" when only a `;` follows its value (`Password=…;`, or a statement in code); null alone. Linear: a fixed
 * number of characters read around the match.
 * @param {RegExpMatchArray} m
 * @returns {"pairs"|"statement"|null}
 */
function connectionContext(m) {
  const input = m.input ?? "";
  const start = m.index ?? 0;
  const end = start + m[0].length;
  let before = start - 1;
  while (before >= 0 && BLANKS.has(input[before])) before--;
  if (input[before] === ";" || (before < start - 1 && PAIR.test(tokenBefore(input, before)))) return "pairs";
  let after = end;
  if (input[after] === ";") after++;
  const semicolon = after > end;
  while (BLANKS.has(input[after])) after++;
  if ((semicolon || after > end) && PAIR.test(input.slice(after, after + 65))) return "pairs";
  return semicolon ? "statement" : null;
}

/** A sigil and a variable's name in capitals: a shell's or Windows' variable (`$DB_PASSWORD`, `%DB_PASSWORD%`). */
const SIGIL_CONSTANT = /^(?:\$(?<s>[A-Z_][A-Z\d_]*)|%(?<w>[A-Z_][A-Z\d_]*)%)$/;
/**
 * Is a value, as a whole, a sigil and a variable's name in capitals whose words are joined by `_` (CONSTANT_NAME) or
 * that names a secret (`$DB_PASSWORD`, `%DB_PASSWORD%`, `$PGPASSWORD`)? `$PRODPASS` and `$ECRET` are passwords.
 * @param {string} v
 */
function sigilConstant(v) {
  const g = SIGIL_CONSTANT.exec(v)?.groups;
  const name = g?.s ?? g?.w;
  return !!name && (CONSTANT_NAME.test(name) || secretName(name) === "secret");
}
/** A value without the `,` and `)` of code after it (`connect(password=DB_PASSWORD,`). Linear: no expression. */
function bare(v) {
  let e = v.length;
  while (e > 0 && (v[e - 1] === "," || v[e - 1] === ")")) e--;
  return v.slice(0, e);
}
/** A name in code, or members (`GetPassword`, `config.get`, `os.getenv`). */
const CODE_NAME = String.raw`[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*`;
/** A quoted text on one line (`"DbPassword"`, `'db'`). */
const QUOTED = String.raw`"[^"\r\n]*"|'[^'\r\n]*'`;
/**
 * An argument of a call in code: a name in lower case (`user`, `userId`), members (`Keys.Db`) or a quoted text; never a
 * number nor a word in capitals alone (`BlueSky(7)`, `SummerFun(Beach)` are passwords). Its three forms start with
 * different signs (lower case, `_` or `$`; a capital; a quote), so an argument is read one way only: members in lower
 * case tried as two forms made 2^k tries for k arguments of a call never closed.
 */
const ARGUMENT = String.raw`(?:[a-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*|[A-Z][\w$]*(?:\.[A-Za-z_$][\w$]*)+|${QUOTED})`;
/** An index by a quoted key (`["DbPassword"]`). */
const QUOTED_INDEX = String.raw`\[\s*(?:${QUOTED})\s*\]`;
/**
 * A call or an index, read from the start of a value (sticky): a name in code, then its arguments in parentheses
 * (`GetPassword()`, `config.get("db", key)`) or a quoted key in brackets (`configuration["DbPassword"]`). Linear:
 * each repetition starts with a sign the one before cannot read, on CODE_MAX characters at most.
 */
const CALL_OR_INDEX = new RegExp(
  String.raw`(?<head>${CODE_NAME})(?:(?<call>\(\s*(?:${ARGUMENT}(?:\s*,\s*${ARGUMENT})*\s*)?\))|${QUOTED_INDEX})`,
  "y",
);
/** The most characters read as a call or an index: a longer one is not. */
const CODE_MAX = 256;
/**
 * What may follow a reference in code: what ends a value as 0.4.1 read it (the end of the text, a blank, `;`, a quote,
 * a backtick), or the `,` or `)` of code.
 */
const CODE_END = new Set([undefined, "\r", "\n", " ", "\t", ";", '"', "'", "`", ",", ")"]);
/**
 * Is a value written as code: the `;`, `,` or `)` of code after it, or a blank before it and a name in lower case
 * first (`password = request.form.password`, `password = config.get("db")`)? Not `password=my.secret` nor
 * `password=GetPassword()` (a properties file's or a command line's password), nor `password = Root.Secret`.
 * @param {string} input
 * @param {number} at   where the value starts
 * @param {string} v
 */
const writtenAsCode = (input, at, v) =>
  [";", ",", ")"].includes(input[at + v.length]) ||
  ((input[at - 1] === " " || input[at - 1] === "\t") && /^[a-z_$]/.test(v));

/**
 * Is a value, as a whole, a reference in code, which names where the secret is, never the secret: a shell's or
 * Windows' variable (sigilConstant), or, written as code (writtenAsCode), a call (`GetPassword()`, `config.get("db")`:
 * a name of several words or members, then names in lower case, members or quoted texts; a word alone before a
 * parenthesis, `Welcome(x)`, or a number in it, `SuperSecret(1)`, is a password), an index by a quoted key
 * (`configuration["DbPassword"]`) or a member that names a secret's field (`Password = model.Password;`)? Nothing may
 * follow it but the end of the value (CODE_END: `HappyDays(x)!` is a password), and a value holding a number of two
 * digits or more is none of them, checked first (NUMBER_RUN: `$ECRET2024`, `Orders2024Prod(1)`). What the floor
 * (0.4.1's rules) leaves out, its only exceptions with the placeholders (test/unit/secret-recall.test.mjs).
 * @param {RegExpMatchArray} m   a match whose value, group v, ends it
 */
function codeReference(m) {
  const input = m.input ?? "";
  const v = bare(m.groups.v);
  const at = (m.index ?? 0) + m[0].length - m.groups.v.length;
  if (NUMBER_RUN.test(v)) return false;
  CALL_OR_INDEX.lastIndex = 0;
  const shape = CALL_OR_INDEX.exec(input.slice(at, at + CODE_MAX));
  // The whole value: the call or the index read from its start (past a quote the value stops at), else the value.
  const whole = shape?.[0] ?? v;
  if (v.length > whole.length || NUMBER_RUN.test(whole) || !CODE_END.has(input[at + whole.length])) return false;
  if (sigilConstant(whole)) return true;
  if (!writtenAsCode(input, at, whole)) return false;
  if (!shape) return MEMBER.test(whole) && secretName(whole.slice(whole.lastIndexOf(".") + 1)) === "secret";
  const head = shape.groups.head;
  return !shape.groups.call || head.includes(".") || nameParts(head).length > 1;
}

/**
 * Is a connection string's key or password one: `AccountKey=`, `SharedAccessKey=`, or a `Password=`, `Pwd=` inside a
 * connection string (connectionContext: next to another pair, a libpq DSN too), whatever its value as 0.4.1 read it
 * (but a placeholder, the `,` or `)` of code after it put aside), or before a `;` alone unless it is a reference in
 * code (`Password = model.Password;`)? A lone `password = …` is an assignment to a secret's name (assignedPassword,
 * floorPassword).
 * @param {RegExpMatchArray} m
 */
const connectionPassword = (m) => {
  const v = bare(m.groups.v);
  if (!v || PLACEHOLDER.test(v)) return false;
  // A value in capitals is a password (a base 32 key, `ORDERS2024PROD`), a variable's name with an underscore is not,
  // unless it holds a number of two digits or more (`AccountKey=PROD_KEY_2024,`, as 0.4.1 read it).
  if (VARIABLE_NAME.test(v) && CONSTANT_NAME.test(v) && !NUMBER_RUN.test(v)) return false;
  if (/key$/i.test(m.groups.k)) return true;
  const where = connectionContext(m);
  return where === "pairs" || (where === "statement" && !codeReference(m));
};

/**
 * 0.4.1's assignment, the floor of the detectors (SECURITY.md): one of its words written as a word (`password`,
 * `passwd`, `secret`, `token`, `api_key`, `client_secret`, `access_key`), then a value of 16 characters or more of
 * letters, digits and `_-+/=.` that looks generated, on the name's line or the next (`\s`), as it read them. Reported
 * unless a detector before found it (scanText reports a value once), or it is a reference in code (codeReference) or
 * a placeholder.
 * @param {RegExpMatchArray} m
 */
const floorAssignment = (m) => looksRandom(m.groups.v) && !codeReference(m);
/**
 * 0.4.1's connection string's password, the floor of the detectors for a lone `Password=` or `Pwd=` (written as a
 * word): a value of 6 characters or more up to a blank, a quote or a `;`, as it read it (`password=postgres`,
 * `--password=…`), but never a reference in code (codeReference) or a placeholder, the `,` or `)` after it put aside
 * (`password=********,`), unless it holds a number of two digits or more (`password=PROD_DB_PASS_2024,`).
 * @param {RegExpMatchArray} m
 */
function floorPassword(m) {
  const v = m.groups.v;
  if (!isValue(v)) return false;
  if (NUMBER_RUN.test(v)) return true;
  return isValue(bare(v)) && !codeReference(m);
}

/**
 * The end of a URL parameter's name that says its value is a secret (`sig`, `access_token`, `X-Amz-Signature`). Not
 * `code`: an OAuth authorisation code is used once, within minutes, and the documentation of every provider shows one.
 */
const URL_SECRET_NAME =
  /(?:token|secret|password|passwd|pwd|pass|signature|sig|key|credentials?|bearer|jwt|session|sessionid|sid|auth)$/;
/**
 * Is an entropy match the value of a URL's query or fragment parameter (`?list=…`, `&fbclid=…`, `&amp;si=…`) whose
 * name says nothing of a secret? Such values are identifiers (a playlist, a click, a share), not secrets.
 * @param {RegExpMatchArray} m
 */
function harmlessParameter(m) {
  const name = m.groups?.n;
  const input = m.input ?? "";
  const at = (m.index ?? 0) + (name ? m[0].indexOf(name) : 0);
  if (!name || input[at + name.length] !== "=") return false;
  if (!"?&#".includes(input[at - 1] ?? "x") && input.slice(Math.max(0, at - 5), at) !== "&amp;") return false;
  return !URL_SECRET_NAME.test(name.toLowerCase().replace(/[^a-z\d]/g, ""));
}

/** The random part of a token after its prefix: a placeholder (`glpat-xxxx…`) has none. */
const TOKEN_PREFIX = /^(?:github_pat_|gl(?:pat|rt|dt|ptt)-|GR1348941|npm_|GOCSPX-|xapp-\d-|SG\.|do[opr]_v1_|SK)/;
/** Letters of both cases, varied: the random part of a token of letters only (Hugging Face). */
const randomLetters = (v) => isValue(v) && /[a-z]/.test(v) && /[A-Z]/.test(v) && new Set(v).size > 10;
/** The material of a key written on one line, its line ends escaped (`\n`, as in a JSON file). */
const ESCAPED_MATERIAL = /\\[rn/]/g;

/**
 * Value detectors: `re` (group `v` = the value, else the whole match), an optional `accept(match)`, and `fallback`
 * for the one that only reports a line no other detector reported (scanText).
 */
export const GENERIC = Object.freeze([
  {
    kind: "privateKey",
    // PEM blocks (PKCS#8, RSA, EC, OpenSSH, encrypted) and PGP private key blocks.
    re: /-----BEGIN ([A-Z0-9 ]*?)PRIVATE KEY( BLOCK)?-----[ \t]*\r?\n(?<v>(?:[ \t]*(?:(?:[A-Za-z0-9+/=]+|[A-Za-z-]+:[^\n]*)[ \t]*)?\r?\n)+?)[ \t]*-----END \1PRIVATE KEY\2-----/g,
    accept: (m) => m.groups.v.replace(/^[A-Za-z-]+:.*$/gm, "").replace(/\s/g, "").length >= 40,
  },
  {
    kind: "privateKey",
    // A PEM block on one line, its line ends escaped: the private_key of a JSON key file (a service account).
    re: /-----BEGIN ([A-Z0-9 ]*?)PRIVATE KEY-----(?<v>(?:\\[rn/]|[A-Za-z0-9+/=])+?)-----END \1PRIVATE KEY-----/g,
    accept: (m) => m.groups.v.replace(ESCAPED_MATERIAL, "").length >= 40,
  },
  {
    kind: "privateKey",
    // The private lines of a PuTTY key (.ppk), encrypted or not.
    re: /\bPrivate-Lines:[ \t]*\d{1,5}[ \t]*\r?\n(?<v>(?:[A-Za-z0-9+/=]+[ \t]*\r?\n)+)/g,
    accept: (m) => m.groups.v.replace(/\s/g, "").length >= 40,
  },
  { kind: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  {
    kind: "connectionString",
    re: /\b(?<k>AccountKey|SharedAccessKey|Password|Pwd)\s*=\s*(?<v>[^;\s"'`]{6,})/gi,
    accept: connectionPassword,
  },
  {
    kind: "credentialsUrl",
    // A scheme of 32 characters at most: from each word of "a-a-a…", never a run to the end of the text.
    re: /\b[a-z][a-z0-9+.-]{0,31}:\/\/[^\s:@/"'<>`]+:(?<v>[^\s@/"'`]{3,})@[^\s"'<>`]+/gi,
    // As 0.4.1 read it, its placeholders only (isValue041): a floor of its own (test/unit/secret-recall.test.mjs).
    accept: (m) => isValue041(m.groups.v) && !/^pass(word)?$/i.test(m.groups.v),
  },
  {
    kind: "cloudKey",
    re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bxox[abprs]-[A-Za-z0-9-]{10,}|\bsk-[A-Za-z0-9_-]{20,}|\bAIza[0-9A-Za-z_-]{35}\b|\b[sr]k_(?:live|test)_[0-9A-Za-z]{16,}\b|\bwhsec_[0-9A-Za-z]{24,}\b/g,
  },
  {
    kind: "cloudKey",
    // GitHub fine-grained; GitLab personal, runner (and its registration token), deploy and pipeline trigger tokens;
    // npm; Google OAuth client secrets; Slack app tokens; SendGrid; DigitalOcean; Twilio API keys: their random part
    // is random.
    re: /\bgithub_pat_[0-9A-Za-z_]{40,}|\bgl(?:pat|rt|dt)-[0-9A-Za-z_-]{20,}|\bGR1348941[0-9A-Za-z_-]{20,}|\bglptt-[0-9a-f]{40}\b|\bnpm_[0-9A-Za-z]{36}\b|\bGOCSPX-[0-9A-Za-z_-]{24,}|\bxapp-\d-[0-9A-Za-z-]{20,}|\bSG\.[\w-]{22}\.[\w-]{43}(?![\w-])|\bdo[opr]_v1_[0-9a-f]{64}\b|\bSK[0-9a-fA-F]{32}\b/g,
    accept: (m) => looksRandom(m[0].replace(TOKEN_PREFIX, "")),
  },
  {
    kind: "cloudKey",
    // A Hugging Face token: letters only after its prefix.
    re: /\bhf_[A-Za-z0-9]{34}\b/g,
    accept: (m) => randomLetters(m[0].slice(3)),
  },
  {
    kind: "cloudKey",
    // A Slack incoming webhook (its last segment is the secret; Slack's placeholder is XXXX…).
    re: /\bhooks\.slack\.com\/(?:services|workflows|triggers)\/[A-Za-z0-9_-]{6,40}\/[A-Za-z0-9_-]{6,40}\/(?<b>[A-Za-z0-9_-]{16,80})/g,
    accept: (m) => looksRandom(m.groups.b),
  },
  {
    kind: "cloudKey",
    // A Discord webhook (its last segment is the secret).
    re: /\bdiscord(?:app)?\.com\/api\/webhooks\/\d{17,20}\/(?<b>[\w-]{60,80})/g,
    accept: (m) => looksRandom(m.groups.b),
  },
  {
    kind: "cloudKey",
    // A Microsoft Teams incoming webhook (an Office 365 connector): its key after IncomingWebhook/.
    re: /\b(?:webhook\.office|outlook\.office(?:365)?)\.com\/webhook(?:b2)?\/[\w-]{36}@[\w-]{36}\/IncomingWebhook\/(?<b>[0-9a-f]{32})\/[\w-]{36}/gi,
    accept: (m) => looksRandom(m.groups.b),
  },
  {
    kind: "assignment",
    // The key of anything (secretName "key"), 128 characters of name at most: `STRIPE_KEY=`, `"sortKey": "`. A name
    // is read from the start of its run of name characters (never after a letter, a digit, `.` or `-`; digits, dots
    // and dashes first are skipped, `--db-key`), so that a long run is read once, not again from each of its words.
    re: /(?<![\w.-])[\d.-]{0,8}(?<n>[A-Za-z_][\w.-]{0,127})["']?\s*[:=]>?\s*["'`]?(?:base64:)?(?<v>[\w\-+/=.]{16,})/g,
    accept: (m) => assignedKey(m.groups.n, m.groups.v),
  },
  {
    kind: "signedUrl",
    re: /[?&](?:sig|signature|x-amz-signature|x-goog-signature)=(?<v>[A-Za-z0-9%+/=]{20,})/gi,
    // 0.4.1 read `?sig=` and `&sig=` whatever the value: they still are (its floor). After another name, a mask as
    // the whole value is not a signature, a placeholder's word inside one is (a signature is random).
    accept: (m) => m[0].slice(1, 5) === "sig=" || !MASK.test(m.groups.v),
  },
  {
    kind: "assignment",
    // The value of a secret's name (secretName "secret"), on its line, up to a blank, a quote, `,`, `:`, `;`, a
    // bracket or a parenthesis: `DB_PASSWORD=`, `"clientSecret": "`, `password := "`, `'password' => '`. Its signs
    // include `~!@#$%&*`; a `&` that starts another parameter (`&user=`) ends it. Only a name ending in a secret's word
    // is matched, so that the value of another (`https://…#access_token=…`) never hides one.
    re: /(?<![\w.-])[\d.-]{0,8}(?<n>[A-Za-z_][\w.-]{0,127})(?<=secret|token|passw(?:or)?d|passphrase|pwd|pass|pw|key)["']?[ \t]*(?<s>:=|[:=]>?)[ \t]*(?<q>["'`]?)(?:base64:)?(?<v>(?:[\w\-+/=.~!@#$%*]|&(?![\w.-]*=)){8,})/gi,
    accept: assignedPassword,
  },
  {
    kind: "assignment",
    // The text of an XML element named as a secret, on one line, up to its closing tag (Maven's settings.xml:
    // `<password>…</password>`). Linear: a name of 64 characters at most, a value of 256 that never holds a `<`.
    re: /<(?<n>[A-Za-z_][\w.-]{0,63})(?<=secret|token|passw(?:or)?d|passphrase|pwd|pass|pw|key)(?<q>>)(?<v>[^<>\s]{8,256})<\/\k<n>>/gi,
    accept: assignedPassword,
  },
  {
    kind: "assignment",
    // An XML setting named as a secret: `<add key="ClearTextPassword" value="…" />` (NuGet.Config), `<add
    // key="DbPassword" value="…"/>` (a .NET appSettings). Linear: fixed words, a name of 64 characters at most.
    re: /<add\s+key\s*=\s*["'](?<n>[\w.:-]{1,64})["']\s+value\s*=\s*(?<q>["'])(?<v>[^"'<>\r\n]{8,256})\k<q>/gi,
    accept: assignedPassword,
  },
  // The floor: the two value rules of 0.4.1, as they read the text, so that what they reported is still reported
  // (test/unit/secret-recall.test.mjs), but a reference in code and a placeholder (codeReference, isValue). After the
  // detectors above: a value one of them reported is not reported again.
  {
    kind: "assignment",
    re: /\b(?:api[_-]?key|secret|token|password|passwd|client[_-]?secret|access[_-]?key)\b["']?\s*[:=]\s*["']?(?<v>[A-Za-z0-9_\-+/=.]{16,})/gi,
    accept: floorAssignment,
  },
  {
    kind: "assignment",
    re: /\b(?<k>Password|Pwd)\s*=\s*(?<v>[^;\s"'`]{6,})/gi,
    accept: floorPassword,
  },
  {
    kind: "entropy",
    fallback: true,
    // An assigned value (`NAME=value`, `name: "value"`) or a quoted one, of a token's characters: 256 at most (a
    // longer run is embedded data), up to a quote, a blank or a separator. Never a URL parameter whose name says
    // nothing of a secret (`?list=`, `&fbclid=`).
    re: /(?:(?<![\w.-])[\d.-]{0,8}(?<n>[A-Za-z_][\w.-]{0,127})["']?[ \t]*[:=]>?[ \t]*["'`]?|["'`])(?<v>[\w+/-]{20,256}={0,2})(?=["'`\s,;)}\]&#]|$)/g,
    accept: (m) => !harmlessParameter(m) && highEntropy(m.groups.v, m.groups.n),
  },
]);
