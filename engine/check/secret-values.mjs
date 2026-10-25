// The value detectors of `check secrets` (engine/check/secrets.mjs, which runs them): what a secret's value looks
// like, by format (private keys, JWTs, connection strings, credentials in a URL, cloud and service tokens, an
// assignment to a secret's name, signed URLs) and last by entropy, and what is never one (a placeholder, a reference
// written as code). Also used by `pack`, `backlog export`, `inputs ingest` and the `secrets` facts (SECURITY.md,
// RULES.md S5: every expression here is measured by the ReDoS harness, through GENERIC).

/** A placeholder, a variable name or a masked value: not a secret. */
export const PLACEHOLDER =
  /^(?:x+|\*+|•+|\.+|0+|_+|-+)$|example|exemple|placeholder|your|votre|change[-_ ]?me|replace[-_ ]?me|masked|redacted|dummy|sample|mot[-_ ]?de[-_ ]?passe|[<>{}]|\$\(|\.\.\.|…|process\.env|import\.meta|os\.environ/i;

const VARIABLE_NAME = /^[A-Z][A-Z0-9_]*$/;
const isValue = (v) => !!v && !PLACEHOLDER.test(v) && !VARIABLE_NAME.test(v);

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

/**
 * What a name says of its value: "secret" when its last word says so (`GITHUB_TOKEN`, `DB_PASSWORD`, `clientSecret`)
 * or it ends in "key" after a word that makes it one (`SECRET_KEY`, `aws_secret_access_key`, `apiKey`); "key" for the
 * key of anything else (`STRIPE_KEY`, `CACHE_KEY`, `sortKey`), whose value must look generated; null for a word merely
 * starting so (`KEYBOARD`, `TOKENIZER`), a public name, the name of a reference to a resource (`existingSecret`,
 * `imagePullSecret`; `secretName`, `secretRef` end in another word) and any other name.
 * @returns {"secret"|"key"|null}
 */
function secretName(name) {
  const parts = nameParts(name);
  const last = parts.at(-1);
  if (isPublic(parts) || parts.some((p) => REFERENCE_WORDS.has(p))) return null;
  if (SECRET_WORDS.has(last)) return "secret";
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
const codeName = (v) => {
  if (!IDENTIFIER.test(v) || !/[a-z]/.test(v)) return false;
  const parts = nameParts(v);
  return parts.length > 1 && parts.every((p) => WORD_PART.test(p)) && classChanges(v) < RANDOM_CHANGES;
};

/**
 * Is a value written as a reference: a PEM armour line (the private key detectors decide), a comparison
 * (`token === x`), code (`a&&b`), a sigil and a name, a YAML tag, members, a path, a variable's name in capitals
 * (constantName)?
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
  members(v) ||
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
 * member (`config.password`), a path; unquoted, a call or an index (`getPassword()`, `config["password"]`) and, under
 * a name that is not in capitals (code, not an environment file), a name in code (`hashedPassword`, `new_password`);
 * after `:`, a CSS pseudo-class or a resource's name (notAValueAfterColon); the default of a shell expansion
 * (`${DB_PASSWORD:-postgres}`). A number is a value under a password's name only (8 digits or more).
 * @param {RegExpMatchArray} m   a match of the detector: groups n (the name), s (the separator), q (a quote, or `>` for
 *   the text of an XML element), v (the value)
 */
function assignedPassword(m) {
  const { n: name, s: separator, q: quote, v } = m.groups;
  if (secretName(name) !== "secret") return false;
  const input = m.input ?? "";
  const at = m.index ?? 0;
  // A connection string's password is reported as one (connectionPassword), once.
  if (/^(?:password|pwd)$/i.test(name) && inConnectionString(m)) return false;
  if (tooPlain(name, v) || writtenAsReference(v, quote) || input.slice(Math.max(0, at - 2), at) === "${") return false;
  if (quote) return true;
  const next = input[at + m[0].length];
  if (separator === ":" && notAValueAfterColon(name, v, next)) return false;
  return next !== "(" && next !== "[" && !(/[a-z]/.test(name) && codeName(v));
}

/**
 * Is a match inside a connection string: its name after a `;` (blanks between) or its value before one
 * (`Server=db;Password=…`, `Password=…;Server=db`)?
 * @param {RegExpMatchArray} m
 */
function inConnectionString(m) {
  const input = m.input ?? "";
  let before = (m.index ?? 0) - 1;
  while (before >= 0 && (input[before] === " " || input[before] === "\t")) before--;
  return input[before] === ";" || input[(m.index ?? 0) + m[0].length] === ";";
}
/** A call in code (`GetPassword()`, `config.get(`). */
const CALL = /^[A-Za-z_$][\w$.]*\(/;
/**
 * Is a connection string's key or password one: `AccountKey=`, `SharedAccessKey=`, or a `Password=`, `Pwd=` inside a
 * connection string, never a reference in code (`Password = model.Password;`)? A lone `password = …` is an assignment
 * to a secret's name (assignedPassword).
 * @param {RegExpMatchArray} m
 */
const connectionPassword = (m) => {
  const v = m.groups.v;
  if (!isValue(v)) return false;
  if (/key$/i.test(m.groups.k)) return true;
  return inConnectionString(m) && !MEMBER.test(v) && !SIGIL_NAME.test(v) && !CALL.test(v);
};

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
  const at = m.index ?? 0;
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
    accept: (m) => isValue(m.groups.v) && !/^pass(word)?$/i.test(m.groups.v),
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
    // The key of anything (secretName "key"), 64 characters of name at most: `STRIPE_KEY=`, `"sortKey": "`.
    re: /\b(?<n>[A-Za-z_][\w.-]{0,63})["']?\s*[:=]>?\s*["'`]?(?:base64:)?(?<v>[\w\-+/=.]{16,})/g,
    accept: (m) => assignedKey(m.groups.n, m.groups.v),
  },
  {
    kind: "signedUrl",
    re: /[?&](?:sig|signature|x-amz-signature|x-goog-signature)=(?<v>[A-Za-z0-9%+/=]{20,})/gi,
    accept: (m) => !PLACEHOLDER.test(m.groups.v),
  },
  {
    kind: "assignment",
    // The value of a secret's name (secretName "secret"), on its line, up to a blank, a quote, `,`, `:`, `;`, a
    // bracket or a parenthesis: `DB_PASSWORD=`, `"clientSecret": "`, `password := "`, `'password' => '`. Its signs
    // include `~!@#$%&*`; a `&` that starts another parameter (`&user=`) ends it. Only a name ending in a secret's word
    // is matched, so that the value of another (`https://…#access_token=…`) never hides one.
    re: /\b(?<n>[A-Za-z_][\w.-]{0,63})(?<=secret|token|passw(?:or)?d|passphrase|pwd|pass|pw|key)["']?[ \t]*(?<s>:=|[:=]>?)[ \t]*(?<q>["'`]?)(?:base64:)?(?<v>(?:[\w\-+/=.~!@#$%*]|&(?![\w.-]*=)){8,})/gi,
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
  {
    kind: "entropy",
    fallback: true,
    // An assigned value (`NAME=value`, `name: "value"`) or a quoted one, of a token's characters: 256 at most (a
    // longer run is embedded data), up to a quote, a blank or a separator. Never a URL parameter whose name says
    // nothing of a secret (`?list=`, `&fbclid=`).
    re: /(?:\b(?<n>[A-Za-z_][\w.-]{0,63})["']?[ \t]*[:=]>?[ \t]*["'`]?|["'`])(?<v>[\w+/-]{20,256}={0,2})(?=["'`\s,;)}\]&#]|$)/g,
    accept: (m) => !harmlessParameter(m) && highEntropy(m.groups.v, m.groups.n),
  },
]);
