// The scanners made linear (RULES.md S5, test/unit/scanners-growth.test.mjs measures their growth) find what they
// found before. Each former, super-linear form is kept here as the reference, and run against the new one on
// texts of random tokens (a fixed seed: a run is a function of it, test/tools/fuzz/prng.mjs) — the property. The bounds
// that do change a result on a crafted file are pinned by minimal pairs; the readers that no longer read a file over
// 512 KB list it, as the others do. No clock here: a mutant of a rule runs this file.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { RULES } from "../../engine/facts/security.mjs";
import { functionsOf } from "../../engine/facts/quality.mjs";
import { pySpecifiers } from "../../engine/facts/imports.mjs";
import { collectSource } from "../../engine/facts/registry.mjs";
import { scanText, GENERIC, isUrlTemplate, htmlText, isLocalAddress } from "../../engine/check/secrets.mjs";
import { apiPathsIn } from "../../engine/sync/api-links.mjs";
import { PROOF_REF, extractProofs } from "../../engine/sync/proofs.mjs";
import { DB_PATTERNS, DB_CLOSERS } from "../../engine/facts/db.mjs";
import { ENV_READ_PATTERNS } from "../../engine/facts/env.mjs";
import { upToLast } from "../../engine/core/text.mjs";
import { contentSecurityPolicy, INLINE_SCRIPT, SCRIPT_END } from "../../engine/build/csp.mjs";
import { parseEnv } from "../../engine/capture/masking.mjs";
import { closingBrace } from "../../engine/util/js-scan.mjs";
import { rng } from "../tools/fuzz/prng.mjs";
import { tempDir } from "../tools/helpers.mjs";

/** `count` texts of 0 to `max` tokens drawn from `tokens`, from `seed`. */
function texts(seed, tokens, { count = 500, max = 40 } = {}) {
  const r = rng(seed);
  return Array.from({ length: count }, () => Array.from({ length: r.int(max + 1) }, () => r.pick(tokens)).join(""));
}
/** Asserts `now(text)` equals `before(text)` on every text, naming the first that differs. */
function same(label, list, now, before) {
  for (const text of list) assert.deepEqual(now(text), before(text), `${label} on ${JSON.stringify(text)}`);
}
const find = (name) => RULES.find((r) => r.rule === name).find;
/** The former line of an index: the text before it sliced and split, for each. */
const lineAt = (text, index) => text.slice(0, index).split("\n").length;
const sorted = (set) => [...set].sort((a, b) => a - b);
const pad = ["x", "  ", "\n", "y".repeat(60), "z".repeat(150)];

describe("the security source finds what its former form found (engine/facts/security.mjs)", () => {
  test("cors.wildcardCredentials: the sweep of the sorted lists against the double loop, windows straddled", () => {
    const ORIGIN =
      /\borigin\s*[:=]\s*["']\*["']|Access-Control-Allow-Origin["']?\s*,\s*["']\*["']|allow_origins\s*=\s*\[\s*["']\*["']/gi;
    const CREDS =
      /\bcredentials\s*[:=]\s*True\b|\bcredentials\s*:\s*true\b|allow_credentials\s*=\s*True\b|Access-Control-Allow-Credentials["']?\s*,\s*["']true["']/gi;
    const before = (text) => {
      const origins = [...text.matchAll(ORIGIN)].map((m) => m.index);
      const creds = [...text.matchAll(CREDS)].map((m) => m.index);
      const lines = new Set();
      for (const o of origins)
        for (const c of creds) if (Math.abs(o - c) <= 400) lines.add(lineAt(text, Math.min(o, c)));
      return sorted(lines);
    };
    const tokens = ['origin: "*"', "credentials: true", "allow_credentials=True", "allow_origins = ['*']", ...pad];
    same("cors", texts(0x5e03c085, tokens, { max: 30 }), find("cors.wildcardCredentials"), before);
    // The window's edge, as before: 400 characters apart is a pair, 401 is not — whichever comes first.
    const at = (gap) => find("cors.wildcardCredentials")(`origin: "*"${" ".repeat(gap - 11)}credentials: true`);
    assert.deepEqual([at(400), at(401)], [[1], []]);
    const back = (gap) => find("cors.wildcardCredentials")(`credentials: true\n${" ".repeat(gap - 18)}origin: "*"`);
    assert.deepEqual([back(400), back(401)], [[1], []]);
  });

  test("sql.concat: one cursor over the build lines against a search of all of them for each call", () => {
    const before = (text) => {
      const lines = text.split("\n");
      const builds = lines.flatMap((l, i) =>
        /\b(?:select|insert|update|delete)\b/i.test(l) && /\$\{|\bf["']|["'`]\s*\+|\+\s*["'`]/.test(l) ? [i] : [],
      );
      if (!builds.length) return [];
      const flagged = new Set();
      for (const m of text.matchAll(/\b(?:execute|query|raw|text)\s*\(/g)) {
        const call = lineAt(text, m.index) - 1;
        if (builds.some((b) => Math.abs(b - call) <= 4)) flagged.add(call + 1);
      }
      return sorted(flagged);
    };
    const tokens = ["q = `select ${x}`", "db.query(q)", "conn.execute(", '"delete " + id', "\n", "\n\n\n", "x"];
    same("sql.concat", texts(0x5e03c0a1, tokens), find("sql.concat"), before);
  });

  test("redirect.open, auth.noRateLimit, jwt.noVerify, xss.innerHTML: as before under their bounds", () => {
    const parens = (text, open) => {
      let depth = 0;
      for (let i = open; i < text.length; i++)
        if (text[i] === "(") depth++;
        else if (text[i] === ")" && --depth === 0) return text.slice(open + 1, i);
      return text.slice(open + 1);
    };
    const lines = (text, re, keep = () => true) =>
      sorted(new Set([...text.matchAll(re)].filter(keep).map((m) => lineAt(text, m.index))));
    const redirect = (text) =>
      lines(text, /\b(?:res\.redirect|NextResponse\.redirect|RedirectResponse|redirect)\(/g, (m) =>
        /\breq(?:uest)?\.(?:query|args|GET)\b|searchParams\.get\(|query_params\[|query_params\.get\(/.test(
          parens(text, m.index + m[0].length - 1),
        ),
      );
    const signin = (text) =>
      lines(
        text,
        /\b(?:get|post|put|patch|delete|route)\(\s*["'`]([^"'`]*(?:login|signin|sign-in|authorize)[^"'`]*)["'`]/gi,
        (m) => !/rate[-_]?limit|throttle|limiter/i.test(text.slice(Math.max(0, m.index - 200), m.index + 200)),
      );
    const jwt = (text) =>
      lines(text, /verify_signature["']?\s*[:=]\s*False\b|algorithms\s*[:=]\s*\[[^\]]*["']none["']/gi);
    const tokens = [
      "res.redirect(",
      "redirect(",
      "req.query.next",
      ")",
      "(",
      "post('/login",
      "get(`/signin",
      "'",
      "`",
      "throttle",
      "algorithms: [",
      '"none"',
      "]",
      "verify_signature: False",
      "el.innerHTML = x",
      "==",
      "\n",
      " ",
      "a",
    ];
    // Under the bounds: a call's arguments within 1,000 characters, a list within 200 (pinned below).
    const list = texts(0x5e03c0b2, tokens).filter((t) => t.length <= 1000);
    assert.ok(list.length > 400);
    same("redirect.open", list, find("redirect.open"), redirect);
    same("auth.noRateLimit", list, find("auth.noRateLimit"), signin);
    same(
      "jwt.noVerify",
      list.filter((t) => !/\[[^\]]{201}/.test(t)),
      find("jwt.noVerify"),
      jwt,
    );
    same("xss.innerHTML", list, find("xss.innerHTML"), (text) => lines(text, /\.innerHTML\s*=(?!=)/g));
  });

  test("the bounds that change a result on a crafted file: 1,000 characters of a call, 200 of a list", () => {
    const call = (gap) => find("redirect.open")(`res.redirect(${" ".repeat(gap)}req.query`);
    assert.deepEqual([call(991), call(992)], [[1], []], "the parameter read within the first 1,000 characters");
    const list = (gap) => find("jwt.noVerify")(`algorithms: [${" ".repeat(gap)}"none"]`);
    assert.deepEqual([list(200), list(201)], [[1], []], "'none' after 200 characters of the list at most");
  });
});

describe("the functions of the quality source are those its former form found (engine/facts/quality.mjs)", () => {
  const CONTROL = ["if", "for", "while", "switch", "catch", "else", "do", "function", "return", "new", "typeof"];
  CONTROL.push("delete", "void", "throw", "class", "try", "finally", "case", "in", "of", "instanceof", "export");
  CONTROL.push("import", "yield", "await");
  /** The former reader: its expressions, a brace matched by a scan for each, a slice for each body. */
  function before(text) {
    const opens = new Set();
    const at = (re, keep = () => true) => {
      for (const m of text.matchAll(re)) if (keep(m)) opens.add(m.index + m[0].length - 1);
    };
    at(/\bfunction\s*\*?\s*\w*\s*\([^()]*\)\s*(?::\s*[^{;]+)?\{/g);
    at(/\b(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\([^()]*\)\s*(?::\s*[^{;=]+?)?=>\s*\{/g);
    at(
      /(?:async\s+)?(?:static\s+)?(?:get\s+|set\s+)?(\w+)\s*\([^()]*\)\s*(?::\s*[^{;]+)?\{/g,
      (m) => !CONTROL.includes(m[1]),
    );
    const BRANCH =
      /\bif\b|\bfor\b|\bwhile\b|\bcase\b|\bcatch\b|\bexcept\b|\belif\b|&&|\|\||\band\b|\bor\b|\?(?!\.|\?)/g;
    return [...opens].map((open) => {
      const c = closingBrace(text, open);
      const close = c < 0 ? text.length - 1 : c;
      const body = text.slice(open + 1, close);
      return {
        startLine: lineAt(text, open),
        endLine: lineAt(text, close),
        complexity: 1 + (body.match(BRANCH) || []).length,
      };
    });
  }
  // Eight headers at most: their scans outside the code, all together, stay under the bound (8 times the text); and
  // no type annotation of more than 200 characters.
  const headers = ["function a() {", "function* g(x) {", "const f = (a) => {", "async m(b): T {", "get v() {"];
  const rest = [
    "if (x) {",
    "for (;;) {",
    "{",
    "}",
    "}",
    "// c",
    "/*",
    "*/",
    '"',
    "'",
    "`",
    "${",
    "\n",
    " ",
    "&&",
    "?",
    "x ? y : z",
    "a?.b",
    "a():",
    ": Promise<T>",
    "elif",
    "ifx",
  ];
  const r = rng(0x5e03c0c3);
  const list = Array.from({ length: 600 }, () =>
    Array.from({ length: r.int(40) }, () => (r.chance(0.12) ? r.pick(headers) : r.pick(rest))).join(""),
  ).filter((t) => (t.match(/function|=>|\w\(/g) || []).length <= 8 && !/:[^{;]{201}/.test(t));

  test("the same functions, lines and complexity on texts of headers, braces, comments and strings", () => {
    assert.ok(list.length > 400);
    same("functionsOf", list, (text) => functionsOf("x.js", text), before);
  });

  test("past the bound, a body that is not code runs to the end of the file (a header in a comment, repeated)", () => {
    const text = "// function a() {\n".repeat(40) + "}\nx";
    const ends = (found) => found.map((f) => f.endLine);
    assert.deepEqual(ends(before(text)), Array(40).fill(41), "each read as code to the brace");
    assert.deepEqual(ends(functionsOf("x.js", text)), [...Array(9).fill(41), ...Array(31).fill(42)]);
  });
});

describe("check secrets finds what its former form found (engine/check/secrets.mjs)", () => {
  const TEMPLATE = /[a-z][a-z0-9+.-]*:\/\/\S*\{[^{}\s]+\}/i;
  test("isUrlTemplate: one search per word against the expression, schemes of 32 characters at most", () => {
    const tokens = ["a", "1", ".", "+", "-", ":", "/", "://", "{", "}", "{z}", " ", "\n", "https://", "x"];
    const list = texts(0x5e03c0d4, tokens).filter((t) => !/[a-z0-9+.-]{32}:\/\//i.test(t));
    same("isUrlTemplate", list, isUrlTemplate, (t) => TEMPLATE.test(t));
  });

  test("scanText: the token of each match, and what is reported, as when each was walked again", () => {
    const stop = /[\s"'`<>()[\]|]/;
    const tokenAround = (text, a, b) => {
      while (a > 0 && !stop.test(text[a - 1])) a--;
      while (b < text.length && !stop.test(text[b])) b++;
      return text.slice(a, b);
    };
    /** What scanText gives `ignore`, in order, with the former token. */
    const calls = (text) =>
      GENERIC.flatMap((d) =>
        [...text.matchAll(new RegExp(d.re.source, d.re.flags))]
          .filter((m) => !d.accept || d.accept(m))
          .map((m) => [(m.groups?.v ?? m[0]).trim(), tokenAround(text, m.index, m.index + m[0].length)]),
      );
    const tokens = [
      "eyJabcdefgh",
      ".",
      "https://t/",
      "{z}",
      " ",
      "Password=abcd3fgh9",
      "'",
      "(",
      "AKIA" + "ABCDEFGHIJKLMNOP",
      "/",
      "x",
    ];
    const list = texts(0x5e03c0e5, tokens);
    same(
      "scanText tokens",
      list,
      (text) => {
        const seen = [];
        scanText(text, GENERIC, (value, token) => (seen.push([value, token]), null));
        return seen;
      },
      calls,
    );
    // The built-in rules on those tokens: a match is left out as before, its URL template decided once per token.
    same(
      "scanText findings",
      list,
      (text) => scanText(text, GENERIC).length,
      (text) => calls(text).filter(([value, token]) => !isLocalAddress(value) && !TEMPLATE.test(token)).length,
    );
  });

  test("htmlText: scripts, styles and tags blanked as before, those left open kept as they are", () => {
    const before = (html) =>
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<wbr\s*\/?>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
    const tokens = [
      "<script>",
      "</script>",
      "<SCRIPT a>",
      "</ScRiPt>",
      "<style>",
      "</style>",
      "<",
      ">",
      "<wbr>",
      "&lt;",
      "a",
      " ",
      "\n",
      "<p>",
    ];
    same("htmlText", texts(0x5e03c0f6, tokens), htmlText, before);
  });

  test("the Content Security Policy: the hashes of the same inline scripts, searched up to the last </script>", () => {
    const hashes = (html) =>
      [...html.matchAll(INLINE_SCRIPT)].map(([, attributes = "", text]) => [attributes, text]).join("\n");
    const tokens = ["<script>", "</script>", '<script type="module">', "</SCRIPT>", "a", " ", "\n", "<", ">", "x()"];
    same("csp", texts(0x5e03c19a, tokens), (html) => hashes(upToLast(html, SCRIPT_END)), hashes);
    // And the policy itself, on the page shapes above.
    assert.match(contentSecurityPolicy("<script>a</script><script>"), /script-src 'sha256-[^']+'/);
  });
});

describe("the other scanners find what their former forms found", () => {
  test("apiPathsIn: braces matched once, trailing slashes taken off once", () => {
    const before = (text) => {
      const out = new Set();
      for (const m of text.matchAll(/["'`]\//g)) {
        let p = "";
        let i = m.index + 1;
        while (i < text.length) {
          const c = text[i];
          if (/[A-Za-z0-9_\-./]/.test(c)) ((p += c), i++);
          else if (c === "$" && text[i + 1] === "{" && p.endsWith("/")) {
            let depth = 0;
            let j = i + 1;
            for (; j < text.length; j++)
              if (text[j] === "{") depth++;
              else if (text[j] === "}" && --depth === 0) break;
            if (j >= text.length) break;
            ((p += ":param"), (i = j + 1));
          } else break;
        }
        p = p.replace(/\/+$/, "");
        if (p.split("/").filter(Boolean).length >= 2) out.add(p);
      }
      return [...out];
    };
    const tokens = ['"/', "'/", "`/", "a", "/", "//", "${", "}", "{", "x", "?q", " ", "-", ".", "`"];
    same("apiPathsIn", texts(0x5e03c107, tokens), apiPathsIn, before);
  });

  test("PROOF_REF: the file read up to the ':' and checked behind, as the lazy form found it", () => {
    const before =
      /`([^`\n:]*?(?:[\w@./-]*[\w-]\.[A-Za-z]\w{0,7}|Dockerfile|Makefile|Procfile|Jenkinsfile)):(\d+)(?:-(\d+))?[^`\n]*`/g;
    const groups = (re) => (text) => [...text.matchAll(re)].map((m) => [m.index, ...m]);
    const tokens = ["`", "a", "b.ts", ".", "x/", ":", "12", "-", "3", " ", "\n", "Dockerfile", "@", "_", "abcdefghij"];
    same("PROOF_REF", texts(0x5e03c118, tokens), groups(PROOF_REF), groups(before));
  });

  test("a badge's text starts at its first character that is not a blank: a blank one is no proof, as before", () => {
    const refs = (markdown) => extractProofs(markdown).map((p) => p.ref);
    assert.deepEqual(refs("[[verified  a.ts:3]]"), ["a.ts:3"]);
    assert.deepEqual(refs("[[verified  ]] [[verified ]]"), []);
  });

  test("parseEnv: the value from its first character that is not a blank, a comment from its first blank", () => {
    const before = (text) =>
      String(text)
        .split(/\r?\n/)
        .flatMap((l, i) => {
          const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(l);
          if (!m) return [];
          let v = m[2].trim();
          const q = /^(["'`])(.*)\1/.exec(v);
          v = q ? q[2] : v.replace(/\s+#.*$/, "").trim();
          return [{ key: m[1], value: v, line: i + 1 }];
        });
    const tokens = [
      "export ",
      "KEY",
      "A_1",
      "=",
      " ",
      "\t",
      "#",
      " # c",
      "'",
      '"',
      "`",
      "x",
      "\r",
      "\u2028",
      "\n",
      "v",
    ];
    same("parseEnv", texts(0x5e03c129, tokens), parseEnv, before);
  });

  test("pySpecifiers: the blanks of one line, the module after its dots", () => {
    const before = (text) => [
      ...[...text.matchAll(/^\s*from\s+(\.*)([\w.]*)\s+import\b/gm)].map((m) => ({ module: m[2], level: m[1].length })),
      ...[...text.matchAll(/^\s*import\s+([\w.]+)/gm)].map((m) => ({ module: m[1], level: 0 })),
    ];
    // Python's statements, each on its line (a statement split over two lines without a backslash is not Python).
    const r = rng(0x5e03c13a);
    const ws = () => r.pick(["", " ", "  ", "\t"]);
    const module = () => {
      const dots = ".".repeat(r.int(4));
      return dots + r.pick(dots ? ["", "a", "a.b", "pkg_1.x"] : ["a", "a.b", "pkg_1.x"]);
    };
    const statement = () =>
      r.pick([
        () => `from${ws() || " "}${module()}${ws() || " "}import ${r.pick(["x", "(a, b)", "*"])}`,
        () => `import${ws() || " "}${r.pick(["os", "a.b", "x.y.z"])}`,
        () => r.pick(["", "x = 1", "def f():", "fromage = 2", "important()", "  # from x import y"]),
      ])();
    const list = Array.from({ length: 500 }, () =>
      Array.from({ length: r.int(12) }, () => ws() + statement()).join(r.pick(["\n", "\r\n", "\n\n", "\r", "\r\r"])),
    );
    same("pySpecifiers", list, pySpecifiers, before);
    // A `from` without a module is not Python: no longer read (the former form gave an empty module of level 0).
    assert.deepEqual(before("from  import x"), [{ module: "", level: 0 }]);
    assert.deepEqual(pySpecifiers("from  import x"), []);
  });
});

describe("the db, env and secret.default expressions find what their former forms found", () => {
  test("SQLAlchemy: a class to the next one or the end, its bases bounded, a column's blanks those of its line", () => {
    const CLASS = /class\s+(\w+)\s*\([^)]*\):\r?\n([\s\S]*?)(?=\r?\nclass\s+\w|\r?\n*$)/g;
    const COLUMN = /^\s*(\w+)\s*(?::[^=\n]+)?=\s*(?:mapped_column|Column)\(/gm;
    /** Each class as the reader keeps it: its name, its table, its columns (its body's trailing blanks aside). */
    const read = (klass, column) => (text) =>
      [...text.matchAll(klass)].map((m) => [
        m[1],
        /__tablename__\s*=\s*["']([^"']+)["']/.exec(m[2])?.[1],
        [...m[2].matchAll(column)].map((c) => c[1]),
      ]);
    const tokens = [
      "class A(Base):\n",
      "class B(Base, X):\r\n",
      "\n",
      "\r\n",
      '    __tablename__ = "a"\n',
      "    id = Column(Integer)\n",
      "    name: Mapped[str] = mapped_column()\n",
      "    x = 1\n",
      "  \t",
      "class C(",
      ")",
    ];
    const list = texts(0x5e03c14b, tokens).filter((t) => !/\([^)]{501}/.test(t));
    same("SQLAlchemy", list, read(DB_PATTERNS.sqlalchemyClass, DB_PATTERNS.sqlalchemyColumn), read(CLASS, COLUMN));
  });

  test("Prisma models and SQL tables: the same matches on the text up to its last closer", () => {
    const groups = (re, closer) => (text) =>
      [...(closer ? upToLast(text, closer) : text).matchAll(re)].map((m) => [...m]);
    const tokens = [
      "model A {",
      "model B{",
      "\n}",
      "}",
      "\n",
      "  id Int\n",
      "{",
      "CREATE TABLE t (",
      ")",
      ";",
      ") ;",
      "a int,",
    ];
    const list = texts(0x5e03c15c, tokens);
    for (const name of ["prismaModel", "createTable"])
      same(name, list, groups(DB_PATTERNS[name], DB_CLOSERS[name]), groups(DB_PATTERNS[name]));
  });

  test("env: the names destructured from process.env, read up to the next brace", () => {
    const names = (re) => (text) =>
      [...text.matchAll(re)].flatMap((m) =>
        m[1]
          .split(",")
          .map((raw) => raw.trim().split(/[:=]/)[0].trim())
          .filter((n) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n)),
      );
    const before = /(?:const|let|var)\s*\{\s*([^}]+)\}\s*=\s*process\.env\b/g;
    const tokens = ["const {", "let{", " A", ",", " B: c", "}", " = process.env", "{", "\n", " ", "=", "C"];
    // A former match holding a "{" is not JavaScript: left to the pair below.
    const list = texts(0x5e03c16d, tokens).filter((t) => ![...t.matchAll(before)].some((m) => m[1].includes("{")));
    assert.ok(list.length > 300);
    same("NODE_DESTRUCTURE", list, names(ENV_READ_PATTERNS.NODE_DESTRUCTURE), names(before));
    // An opening never closed before another: the names are read from the last one (the former form, from the first).
    const nested = "const { A, const { B } = process.env";
    assert.deepEqual([names(before)(nested), names(ENV_READ_PATTERNS.NODE_DESTRUCTURE)(nested)], [["A"], ["B"]]);
  });

  test("secret.default: an interpolation that slices, read up to its '}' or the next '${'", () => {
    const before = /\$\{[^}]*\.(?:slice|substring|substr)\(/;
    const tokens = ["${", "}", "a.slice(", ".slice(", "$", "{", "x", "1", "k.substr(", "b", "q"];
    const r = rng(0x5e03c17e);
    const values = Array.from({ length: 500 }, () => Array.from({ length: r.int(12) }, () => r.pick(tokens)).join(""));
    const flagged = (value) => value.length >= 8 && !/^[•*x]+$/i.test(value) && !before.test(value);
    same(
      "secret.default",
      values,
      (v) => find("secret.default")(`password = "${v}"`),
      (v) => (flagged(v) ? [1] : []),
    );
  });
});

describe("a file over 512 KB is listed, not read, by quality, env, db, agents and tests", () => {
  test("each source names it in `unreadable` (tooLarge), and reads the others", async () => {
    const dir = tempDir();
    try {
      const big = "x".repeat(512 * 1024 + 1);
      const write = (rel, text) => {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), text);
      };
      write("src/big.js", `process.env.BIG_ONE;\nfunction a() {}\n${big}`);
      write("src/small.js", "process.env.SMALL_ONE;\nfunction b() {}\n");
      write("prisma/schema.prisma", `model Big {\n  id Int\n}\n//${big}`);
      write("db/small.sql", "CREATE TABLE small (id int);\n");
      write("CLAUDE.md", `# Big\n${big}`);
      write("api/AGENTS.md", "# Small\n");
      write("src/big.test.js", `test("a", () => {});\n${big}`);
      write("src/small.test.js", 'test("b", () => {});\n');
      const tooLarge = (...files) => files.map((file) => ({ file, reason: "tooLarge" }));
      const env = await collectSource("env", { appDir: dir });
      assert.deepEqual(
        env.items.map((i) => i.name),
        ["SMALL_ONE"],
      );
      // The env source reads the tests too.
      assert.deepEqual(
        [...env.unreadable].sort((a, b) => a.file.localeCompare(b.file)),
        tooLarge("src/big.js", "src/big.test.js"),
      );
      const db = await collectSource("db", { appDir: dir });
      assert.deepEqual(
        db.items.map((i) => i.table),
        ["small"],
      );
      assert.deepEqual(db.unreadable, tooLarge("prisma/schema.prisma"));
      const agents = await collectSource("agents", { appDir: dir });
      assert.deepEqual(
        agents.items.map((i) => i.file),
        ["api/AGENTS.md"],
      );
      assert.deepEqual(agents.unreadable, tooLarge("CLAUDE.md"));
      const tests = await collectSource("tests", { appDir: dir });
      assert.deepEqual(tests.items, [{ file: "src/small.test.js", tests: 1 }]);
      assert.deepEqual(tests.unreadable, tooLarge("src/big.test.js"));
      assert.equal(tests.extra.summary.files, 2, "counted among the test files, its tests unknown");
      const quality = await collectSource("quality", { appDir: dir, network: null });
      assert.deepEqual(
        quality.items.map((i) => i.file),
        ["src/small.js"],
      );
      assert.equal(quality.extra.summary.files, 2, "counted among the source files, not measured");
      assert.equal(quality.extra.summary.bigFiles, 1, "and a big one");
      assert.equal(quality.extra.summary.testRatio, 1, "two test files for two source files");
      assert.deepEqual(quality.unreadable, tooLarge("src/big.js"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
