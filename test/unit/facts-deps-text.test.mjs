// The text readers behind every dependency and private-declaration reader (engine/facts/deps/read.mjs and
// toml-values.mjs): the same path whatever the TOML form, strings and escapes decoded as the tools decode them, what is
// a doubt and what is valid TOML (in pairs), the bounds, the line breaks of the configuration files, and the decoding
// of a file's bytes (byte order mark, UTF-16). What a consumer does with a doubt is tested with that consumer.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  configLines,
  decodeText,
  dottedParts,
  equalsAt,
  inlineTable,
  keyPart,
  MAX_NAME,
  readJson,
  readText,
  splitTopLevel,
  tomlEntries,
  tomlLeaves,
} from "../../engine/facts/deps/read.mjs";
import { inlineFields, tomlString } from "../../engine/facts/deps/toml-values.mjs";
import { CH, HOST } from "../tools/locks.mjs";
import { deps, registriesOf } from "../tools/deps-apps.mjs";
import { tempDir } from "../tools/helpers.mjs";

const GIT = '"https://git.corp.internal/lib.git"';
const BS = CH.BACKSLASH;

/** The reading of a TOML text: its entries' paths, its leaves' paths (inline tables opened) and its doubt. */
function read(text) {
  const report = {};
  const entries = tomlEntries(text, report);
  const leaves = tomlLeaves(entries, report);
  return {
    entries: entries.map((e) => e.path.join("|")),
    leaves: leaves.map((l) => l.path.join("|")),
    doubt: report.doubt === true,
  };
}

const doubtOf = (text) => read(text).doubt;

/** A text as UTF-16 with its byte order mark: little-endian ("le") or big-endian ("be"). */
function utf16(text, endian) {
  const le = Buffer.from(text, "utf16le");
  return endian === "le"
    ? Buffer.concat([Buffer.from([0xff, 0xfe]), le])
    : Buffer.concat([Buffer.from([0xfe, 0xff]), le.swap16()]);
}

describe("a TOML path is the same whatever the form a table is written in", () => {
  test("a dotted name keeps a quoted part whole and trims the white space around the dots", () => {
    assert.deepEqual(dottedParts(' tool . uv."corp.lib" '), ["tool", "uv", "corp.lib"]);
    assert.deepEqual(dottedParts("'corp.lib'.git"), ["corp.lib", "git"], "a literal string too");
  });

  const FORMS = [
    ["a key of the table", `[tool.uv.sources]\n"corp.lib" = { git = ${GIT} }`],
    ["a header of its own, with a comment", `[tool.uv.sources."corp.lib"] # a comment\ngit = ${GIT}`],
    ["a dotted key under the parent table", `[tool.uv]\nsources."corp.lib".git = ${GIT}`],
    ["an inline table in an inline table", `[tool.uv]\nsources = { "corp.lib" = { git = ${GIT} } }`],
    ["a dotted key at the root", `tool.uv.sources."corp.lib" = { git = ${GIT} }`],
    [
      "inline tables from the first key, one in an array",
      `[tool]\nuv = { sources = { "corp.lib" = [{ git = ${GIT} }] } }`,
    ],
  ];
  for (const [label, text] of FORMS)
    test(`${label}: the one path tool|uv|sources|corp.lib|git`, () => {
      const leaves = tomlLeaves(tomlEntries(text)).map((l) => `${l.path.join("|")}=${l.value}`);
      assert.deepEqual(leaves, [`tool|uv|sources|corp.lib|git=${GIT}`], label);
    });

  test("a plain value has the path of its table and its key", () => {
    assert.deepEqual(read("[project]\nname = 'app'\n").leaves, ["project|name"]);
  });
});

describe("a TOML string is decoded as the tools decode it", () => {
  // [label, a dotted key, the parts read, whether the kit doubts it, why]
  const KEYS = [
    ["a basic string's \\u escape", '"corp\\u002dlib"', ["corp-lib"], false, "uv reads it so"],
    ["a basic string's \\U escape", '"corp\\U0000002dlib"', ["corp-lib"], false, "eight hex digits"],
    ["a basic string's \\x escape", `"corp${BS}x2dlib"`, ["corp-lib"], false, "TOML 1.1: uv reads it"],
    ["a \\x escape before a bare letter", `tool."ind${BS}x65x"`, ["tool", "index"], false, "\\x65 is e"],
    ["\\e is ESC", `"a${BS}e"`, [`a${String.fromCharCode(0x1b)}`], false, "TOML 1.1"],
    ["\\t is a tab", `"a${BS}tb"`, ["a\tb"], false, "one of the escapes TOML names"],
    ["an escaped quote does not end the string", `"a${BS}"b.c"`, ['a"b.c'], false, "the dot is inside the quotes"],
    ["an escaped backslash", `"a${BS}${BS}"`, [`a${BS}`], false, "one backslash"],
    ["a code point past U+10FFFF", `"${BS}U00110000"`, ["\uFFFD"], false, "the replacement character"],
    ["an escape TOML does not know", `"a${BS}q"`, [`a${BS}q`], true, "the tool may read a name the kit cannot"],
    ["a literal string keeps its backslash", `'a${BS}q'`, [`a${BS}q`], false, "no escape in a literal string"],
    ["a bare key", "a-b", ["a-b"], false, "as written"],
  ];
  for (const [label, key, parts, doubt, why] of KEYS)
    test(`${label} -> ${JSON.stringify(parts)}${doubt ? ", a doubt" : ""}`, () => {
      const report = {};
      assert.deepEqual(dottedParts(key, report), parts, why);
      assert.equal(report.doubt === true, doubt, label);
    });

  test("keyPart decodes one part and trims it; a mismatched quote is left as written", () => {
    assert.equal(keyPart(' "a\\u002db" ', {}), "a-b");
    assert.equal(keyPart(`"a'`, {}), `"a'`);
    assert.equal(keyPart('"', {}), '"');
  });

  // [label, a value as tomlEntries gives it, the string read (null: not a one-line string)]
  const STRINGS = [
    ["a basic string with an escape", '"a\\u002db"', "a-b"],
    ["a literal string as written", `'lit${BS}n'`, `lit${BS}n`],
    ["an empty basic string", '""', ""],
    ["an empty literal string", "''", ""],
    ["an escaped quote inside", `"a${BS}"b"`, 'a"b'],
    ["trailing white space after the closing quote", '"a"   ', "a"],
    ["a multi-line string (an empty one followed by more)", '"""x"""', null],
    ["a string followed by more on its line", '"a" more', null],
    ["a bare value", "1", null],
    ["a string left open", '"abc', null],
  ];
  for (const [label, value, expected] of STRINGS)
    test(`tomlString: ${label} -> ${JSON.stringify(expected)}`, () => {
      assert.equal(tomlString(value), expected, label);
    });

  test("tomlString: an escape TOML does not know in a string is a doubt, a known one is not", () => {
    const unknown = {};
    assert.equal(tomlString(`"a${BS}q"`, unknown), `a${BS}q`);
    assert.equal(unknown.doubt, true);
    const known = {};
    assert.equal(tomlString('"a\\u002db"', known), "a-b");
    assert.equal(known.doubt, undefined);
  });

  test("an escape TOML does not know in a key of an inline table is a doubt", () => {
    const text = `[tool.uv]\nsources = { "a${BS}q" = 1 }\n`;
    assert.equal(read(text).doubt, true);
    assert.equal(read(`[tool.uv]\nsources = { "a${BS}e" = 1 }\n`).doubt, false, "minimal pair: \\e is known");
  });

  // [label, a TOML text, the entries' paths, why]
  const ESCAPED_NAMES = [
    ["an escape in a table name inside a header", `[[tool.uv."ind${BS}x65x"]]\nurl = "x"\n`, ["tool|uv|index|url"]],
    ["an escape in the first part of a header", `["${BS}x74ool".uv]\nindex-url = "x"\n`, ["tool|uv|index-url"]],
    ["an escape in a key", `[tool.uv.sources]\n"corp${BS}x2dlib" = 1\n`, ["tool|uv|sources|corp-lib"]],
  ];
  for (const [label, text, paths] of ESCAPED_NAMES)
    test(`${label} is read decoded`, () => {
      const result = read(text);
      assert.deepEqual(result.entries, paths, label);
      assert.equal(result.doubt, false, label);
    });

  test("a key given twice however it is spelled is one key", () => {
    assert.equal(doubtOf('a = 1\n"a" = 2\n'), true, "bare then quoted");
    assert.equal(doubtOf(`corp-lib = 1\n"corp${BS}x2dlib" = 2\n`), true, "decoded");
    assert.equal(doubtOf('a.b = 1\na."b" = 2\n'), true, "dotted");
    assert.equal(doubtOf("a = 1\nb = 2\n"), false, "minimal pair: two keys");
  });
});

describe("a quote protects what it holds in a key, a header and an inline table", () => {
  test('"=" in a quoted key splits nothing: equalsAt finds the first one outside quotes', () => {
    assert.equal(equalsAt('"a=b" = 1'), 6);
    assert.equal(equalsAt("a = '='"), 2);
    assert.equal(equalsAt("no equals sign"), -1);
  });

  test('"=" in a quoted key of an inline table: the key is whole', () => {
    assert.deepEqual(
      [...inlineTable('{ "a=b" = 1, path = "../x" }')].map(([key]) => key),
      ["a=b", "path"],
    );
    assert.deepEqual(read('x = { "a=b" = { git = "y" } }\n').leaves, ["x|a=b|git"]);
  });

  test('a quoted key holding "=" and a quote of its own: valid TOML, no doubt, both entries read', () => {
    const result = read('"a=b" = 1\n[t]\n\'c = d\' = "x = y"\n');
    assert.deepEqual(result.entries, ["a=b", "t|c = d"]);
    assert.equal(result.doubt, false);
  });

  test("']' and ']]' in a quoted header end no header", () => {
    const result = read('[tool."a]b"]\nk = 1\n[[t."c]]d"]]\nm = 2\n');
    assert.deepEqual(result.entries, ["tool|a]b|k", "t|c]]d|m"]);
    assert.equal(result.doubt, false, "a quoted ']' ends no header");
  });

  test("a comma and a bracket inside a string split no piece", () => {
    assert.deepEqual(splitTopLevel('version = "1, 2", features = ["a", "b"]'), [
      'version = "1, 2"',
      'features = ["a", "b"]',
    ]);
  });
});

describe("a multi-line string is text, never TOML", () => {
  test("a section written in it moves nothing (pyproject.toml read as a manifest)", () => {
    const text =
      '[project]\nname = "app"\ndescription = """\nA tool.\n[tool.other]\nx = 1\n"""\ndependencies = ["fastapi>=0.110"]\n';
    assert.deepEqual(
      tomlEntries(text).map((e) => `${e.section}.${e.key}`),
      ["project.name", "project.description", "project.dependencies"],
    );
    assert.equal(deps({ "pyproject.toml": text })["pyproject.toml"].fastapi.spec, ">=0.110");
  });

  // [label, a TOML text whose table after the trap must still be read, the leaves' paths, why]
  const TRAPS = [
    [
      "a lone quote in a triple literal string in an array",
      `keywords = ['''it's''']\n[tool.uv.sources]\ncorp-lib = { git = ${GIT} }\n`,
      ["keywords", "tool|uv|sources|corp-lib|git"],
      "a string read as left open would swallow the source",
    ],
    [
      "quotes of its own and a trailing space in a triple basic string",
      `keywords = ["""say "hi" """]\n[tool.uv.sources]\ncorp-lib = { git = ${GIT} }\n`,
      ["keywords", "tool|uv|sources|corp-lib|git"],
      "TOML lets one or two quotes belong to the text",
    ],
    [
      "a lone quote in a triple string on its own line",
      `keywords = [\n  '''a ' b''',\n]\n[tool.uv.sources]\ncorp-lib = { git = ${GIT} }\n`,
      ["keywords", "tool|uv|sources|corp-lib|git"],
      "the array goes on over several lines",
    ],
    [
      "a triple basic string ended by 4 quotes inside an inline table",
      `[tool.uv]\nsources = { a = { path = """x"""" }, corp-lib = { git = ${GIT} } }\n`,
      ["tool|uv|sources|a|path", "tool|uv|sources|corp-lib|git"],
      "the fourth quote is the text's, the first three end it",
    ],
    [
      "a triple literal string ended by 5 quotes inside an inline table",
      `[tool.uv]\nsources = { a = { path = '''x''''' }, corp-lib = { git = ${GIT} } }\n`,
      ["tool|uv|sources|a|path", "tool|uv|sources|corp-lib|git"],
      "two of the five quotes are the text's",
    ],
    [
      "an escaped quote at the end of a line in a triple basic string",
      `description = """\nHe wrote ${BS}"""\nstill text\n"""\n[tool.uv.sources]\ncorp-lib = { git = ${GIT} }\n`,
      ["description", "tool|uv|sources|corp-lib|git"],
      "the backslash makes the third quote part of the text",
    ],
    [
      "a basic string ended by 4 quotes in an array",
      'keywords = ["""say "hi""""]\n[[tool.uv.index]]\nurl = "https://pypi.corp.internal/simple"\n',
      ["keywords", "tool|uv|index|url"],
      "the index after the trap is still seen",
    ],
    [
      "a string opened inside a multi-line string's text",
      'description = """\nHe wrote \\"""\nx = """\n[[tool.uv.index]]\nurl = "https://pypi.corp.internal/simple"\n',
      ["description", "tool|uv|index|url"],
      "the escaped quotes close nothing; the next triple quote does",
    ],
    [
      "Poetry's marker holding quotes",
      '[tool.poetry.dependencies]\ncorp-lib = { markers = """sys_platform == "linux"""", path = "../corp-lib" }\n',
      ["tool|poetry|dependencies|corp-lib|markers", "tool|poetry|dependencies|corp-lib|path"],
      "the path is read",
    ],
    [
      "a Pipfile's marker holding quotes",
      '[packages]\ncorp-lib = { markers = """sys_platform == "linux"""", path = "../corp-lib" }\nrequests = "*"\n',
      ["packages|corp-lib|markers", "packages|corp-lib|path", "packages|requests"],
      "the path and the next package are read",
    ],
  ];
  for (const [label, text, leaves, why] of TRAPS)
    test(`${label}: what follows is read, no doubt`, () => {
      const result = read(text);
      assert.deepEqual(result.leaves, leaves, why);
      assert.equal(result.doubt, false, why);
    });

  const TRAP_KEY = `'a="""' = 1\n`;
  const AFTER = [
    [
      "a table of indexes",
      '[[tool.uv.index]]\nname = "corp"\nurl = "https://pypi.corp.internal/simple"\n',
      "tool|uv|index|name",
    ],
    ["a table of sources", `[tool.uv.sources]\ncorp-lib = { git = ${GIT} }\n`, "tool|uv|sources|corp-lib|git"],
    [
      "Poetry's sources",
      '[[tool.poetry.source]]\nname = "corp"\nurl = "https://pypi.corp.internal/simple"\n',
      "tool|poetry|source|name",
    ],
  ];
  for (const [label, after, first] of AFTER)
    test(`a quoted key holding '=' then a triple quote opens no string: ${label} after it is read`, () => {
      const result = read(`[tool.mycorp]\n${TRAP_KEY}${after}# """\n`);
      assert.equal(result.leaves[0], 'tool|mycorp|a="""', "the trap is a key");
      assert.equal(result.leaves[1], first, label);
      assert.equal(result.doubt, false, label);
    });

  test("a Pipfile, a uv.toml and a bunfig.toml are read past the same trap", () => {
    for (const [label, text, expected] of [
      [
        "Pipfile",
        `[scripts]\n'a="""' = "x"\n[[source]]\nurl = "x"\n[packages]\ncorp-lib = "*"\n# """\n`,
        "packages|corp-lib",
      ],
      ["uv.toml", `[cache]\n'a="""' = 1\n[pip]\nindex-url = "x"\n# """\n`, "pip|index-url"],
      ["bunfig.toml", `[define]\n'a="""' = "1"\n[install]\nregistry = "x"\n# """\n`, "install|registry"],
    ])
      assert.ok(read(text).leaves.includes(expected), label);
  });

  test("a string left open to the end of the text is a doubt; closed, it is not", () => {
    assert.equal(doubtOf('a = """open\n'), true);
    assert.equal(doubtOf('a = """open"""\n'), false, "minimal pair: closed");
  });
});

describe("what the kit does not read as the tool does is a doubt, valid TOML is not", () => {
  // [label, a text the tool refuses or the kit cannot follow, the same text made valid, why]
  const DOUBTS = [
    ["a line that is no TOML", "just words\n", 'just = "words"\n', "neither a header nor key = value"],
    ["a bracket closed that was never opened", "a = 1]\n", "a = [1]\n", "the end of a table that never began"],
    ["a header left open", "[tool.uv\n", "[tool.uv]\n", "no closing bracket"],
    ["a header followed by more than a comment", "[t] x = 1\n", "[t] # x = 1\nx = 1\n", "TOML refuses it"],
    ["an array-of-tables header closed once", "[[a]\n", "[[a]]\n", "needs two brackets"],
    ["an array left open at the end", 'keywords = ["a", "b"\n', 'keywords = ["a", "b"]\n', "a bracket still open"],
    ["a one-line string left open", 'description = "open\n', 'description = "open"\n', "ends with its line"],
    ["a key twice under one header", "a = 1\na = 2\n", "a = 1\nb = 2\n", "TOML refuses it"],
    ["a table twice in one block", "[t]\nx = 1\n[t]\ny = 2\n", "[t]\nx = 1\n[u]\ny = 2\n", "TOML refuses it"],
    [
      "a table over an array of tables",
      '[[package]]\nname = "x"\n[package]\nsource = 1\n',
      '[[package]]\nname = "x"\n[package.source]\nurl = 1\n',
      "[package] redefines [[package]]",
    ],
    ["an array of tables over a table", "[a]\nx = 1\n[[a]]\ny = 2\n", "[a]\nx = 1\n[[b]]\ny = 2\n", "the reverse"],
    ["a key over 1,000 characters", `${"k".repeat(MAX_NAME + 1)} = 1\n`, `${"k".repeat(MAX_NAME)} = 1\n`, "left out"],
    [
      "a header over 1,000 characters",
      `[${"t".repeat(MAX_NAME + 1)}]\nx = 1\n`,
      `[${"t".repeat(MAX_NAME)}]\nx = 1\n`,
      "left out",
    ],
    [
      "a key of an inline table over 1,000 characters",
      `x = { ${"k".repeat(MAX_NAME + 1)} = 1, b = 2 }\n`,
      `x = { ${"k".repeat(MAX_NAME)} = 1, b = 2 }\n`,
      "left out, like a key of a line (the bound counts the key as written, quotes included)",
    ],
    [
      "an array-of-tables header inside an array",
      'x = [\n[[package]]\nname = "a"\n]\n',
      'x = [\n"[[package]]",\n"a",\n]\n',
      "no value: the tool refuses the file, the kit would read on to the bracket",
    ],
    ["a key = value inside an array", 'x = [\n  name = "a"\n]\n', 'x = [\n  "a",\n]\n', "an '=' is no element"],
    ["a bare word inside an array", "x = [\n  corp\n]\n", "x = [\n  true, false, inf, nan\n]\n", "no value"],
    [
      "a table header inside an inline table",
      'x = {\n[package]\nname = "a"\n}\n',
      'x = { name = "a" }\n',
      "an inline table expects its key",
    ],
    ["a bare word as an inline table's value", "x = { a = b }\n", "x = { a = true }\n", "no value"],
    ["an array where an inline table expects its key", 'x = { ["a"] }\n', 'x = { a = ["a"] }\n', "a key comes first"],
    [
      "an escape a basic string does not know, in a value",
      `x = "a${BS}qb"\n`,
      `x = "a${BS}tb"\n`,
      "uv and Poetry refuse it, as in a key",
    ],
    [
      "an unknown escape in a multi-line string",
      `x = """a${BS}qb"""\n`,
      `x = """a${BS}\n  b"""\n`,
      "a backslash that ends a line continues it",
    ],
    ["a key with no value", "x =\n", "x = 1\n", "TOML has no empty value"],
    ["a bare key with a blank inside", "a b = 1\n", '"a b" = 1\n', "a bare key is letters, digits, _ and -"],
    ["a bare key with another character", "a@b = 1\n", '"a@b" = 1\n', "the same"],
    ["a value followed by more", 'x = "a" b\n', 'x = "a" # b\n', "one value a key"],
    ["a word after a number", "x = 1 b\n", "x = 1979-05-27 07:32:00\n", "a date and its time are one value"],
    ["a table after a string", 'x = "a" { b = 1 }\n', 'x = { a = "a", b = 1 }\n', "one value a key"],
    ["a string after a string", 'x = "a" "b"\n', 'x = "a b"\n', "one value a key"],
    ["a comma after a number", "x = 1, 2\n", "x = [1, 2]\n", "no value starts with a comma"],
    [
      "a header over 1,000 characters with no key under it",
      `[${"t".repeat(MAX_NAME + 1)}]\n[u]\nb = 2\n`,
      `[${"t".repeat(MAX_NAME)}]\n[u]\nb = 2\n`,
      "the header itself is the doubt, not only its keys",
    ],
    ["two '=' in one pair", "x = { a = 1 = 2 }\n", "x = { a = 1, b = 2 }\n", "a pair has one"],
    ["a bracket closing another kind", "x = [ { a = 1 ] }\n", "x = [ { a = 1 } ]\n", "TOML refuses it"],
    [
      "numbers, dates and their letters in an array",
      "x = [\n  corp-1\n]\n",
      "x = [\n  1_000, 0x1F, 1e5, -2.5, +inf, 1979-05-27T07:32:00Z, 1979-05-27 07:32:00\n]\n",
      "a number or a date starts with a digit or a sign",
    ],
    ["a NUL in a comment", `# a${CH.NUL}b\nx = 1\n`, "# a b\nx = 1\n", "TOML has no control character"],
    ["a lone carriage return", `x = 1${CH.CR}y = 2\n`, "x = 1\r\ny = 2\n", "a newline is LF or CRLF"],
    [
      "a control character in a string",
      `x = "a${String.fromCharCode(1)}"\n`,
      `x = "a${CH.BACKSLASH}u0001"\n`,
      "escaped, it is valid",
    ],
    ["DEL in a comment", `# a${String.fromCharCode(0x7f)}\nx = 1\n`, "# a\tb\nx = 1\n", "a tab is the one allowed"],
  ];
  for (const [label, doubtful, valid, why] of DOUBTS)
    test(`${label}: a doubt (${why}); made valid, none`, () => {
      assert.equal(doubtOf(doubtful), true, `${label}: ${doubtful.slice(0, 40)}`);
      assert.equal(doubtOf(valid), false, `${label}, made valid: ${valid.slice(0, 40)}`);
    });

  test("what TOML allows is no doubt: the same keys and sub-tables in every element of an array of tables", () => {
    for (const text of [
      '[[package]]\nname = "a"\n[package.source]\nurl = "x"\n\n[[package]]\nname = "b"\n[package.source]\nurl = "y"\n',
      '[[manifest.dependency-metadata]]\nname = "a"\n[manifest]\nmembers = []\n',
      "[[p]]\nk = 1\n[[p]]\nk = 2\n",
    ])
      assert.equal(doubtOf(text), false, text.slice(0, 50));
  });

  test("a comment after a value, a header or a string's '#' is no doubt", () => {
    assert.deepEqual(read('a = 1 # c\nb = "x#y" # c\n[t] # c\nx = 1\n'), {
      entries: ["a", "b", "t|x"],
      leaves: ["a", "b", "t|x"],
      doubt: false,
    });
  });

  test("a doubt does not stop the reading: the entries after it are kept", () => {
    const result = read('description = "open\n[[tool.uv.index]]\nurl = "https://pypi.corp.internal/simple" # "\n');
    assert.equal(result.doubt, true);
    assert.deepEqual(result.entries, ["description", "tool|uv|index|url"]);
  });

  test("a multi-line string never closed swallows the rest: a doubt, one entry", () => {
    const result = read('description = """never closed\n[tool.uv.sources]\ncorp-lib = { git = "x" }\n');
    assert.equal(result.doubt, true);
    assert.deepEqual(result.entries, ["description"]);
  });

  test("inlineFields: a key given twice, however it is spelled, is a doubt; once, none", () => {
    const twice = {};
    assert.deepEqual([...inlineFields('{ a = 1, "a" = 2 }', twice).keys()], ["a"]);
    assert.equal(twice.doubt, true);
    const dotted = {};
    inlineFields('{ "a.b" = 1, a."b" = 2 }', dotted);
    assert.equal(dotted.doubt, true, "a dotted key and a quoted dot");
    const once = {};
    assert.deepEqual(
      [...inlineFields("{ a = 1, b = 2 }", once)],
      [
        ["a", "1"],
        ["b", "2"],
      ],
    );
    assert.equal(once.doubt, undefined);
  });

  test("inlineFields: a decoded key, a dotted key, a value holding a comma; null for no table", () => {
    assert.deepEqual(
      [...inlineFields('{ "regi\\u0073try" = "x", a.b = 1, p = "a,b", q = [1, 2] }')],
      [
        ["registry", '"x"'],
        ["a.b", "1"],
        ["p", '"a,b"'],
        ["q", "[1, 2]"],
      ],
    );
    assert.equal(inlineFields('"x"'), null);
    assert.deepEqual([...inlineFields("{ }")], []);
  });
});

describe("the bounds of the TOML reader", () => {
  test("a dotted name keeps 16 parts at most; 16 are whole", () => {
    assert.deepEqual(dottedParts(Array(40).fill("a").join(".")), Array(16).fill("a"));
    assert.equal(dottedParts(Array(16).fill("a").join(".")).length, 16);
    assert.equal(dottedParts(Array(15).fill("a").join(".")).length, 15);
  });

  test("a value's path keeps 16 parts at most, the table's and the key's together", () => {
    const header = Array.from({ length: 20 }, (_, i) => `t${i}`).join(".");
    const [entry] = tomlEntries(`[${header}]\nkey = 1\n`);
    assert.equal(entry.path.length, 16);
    assert.deepEqual(entry.path.slice(0, 3), ["t0", "t1", "t2"]);
  });

  const nest = (depth) => "x = " + "{ a = ".repeat(depth) + "1" + " }".repeat(depth);
  test("8 inline tables are opened: the leaf is the value, its path has 9 parts", () => {
    const [leaf] = tomlLeaves(tomlEntries(nest(8)));
    assert.equal(leaf.path.length, 9);
    assert.equal(leaf.value, "1");
  });
  test("a 9th inline table is not opened: it stays one value", () => {
    const [leaf] = tomlLeaves(tomlEntries(nest(9)));
    assert.equal(leaf.path.length, 9);
    assert.equal(leaf.value, "{ a = 1 }");
  });
  test("10 inline tables: the deeper ones stay one value too", () => {
    const [leaf] = tomlLeaves(tomlEntries(nest(10)));
    assert.equal(leaf.path.length, 9);
    assert.ok(leaf.value.startsWith("{"), "deeper, the table is one value");
  });

  test("a name of 1,000 characters is followed, 1,001 is left out with what it holds", () => {
    const kept = read(`[t.${"x".repeat(MAX_NAME - 2)}]\na = 1\n`);
    assert.deepEqual(kept.entries, [`t|${"x".repeat(MAX_NAME - 2)}|a`], "1,000 characters in all: followed");
    assert.equal(kept.doubt, false);
    const left = read(`[t.${"x".repeat(MAX_NAME)}]\na = 1\n\n[u]\nb = 2\n${"k".repeat(MAX_NAME + 1)} = 3\nc = 4\n`);
    assert.deepEqual(left.entries, ["u|b", "u|c"], "the long header, its keys and the long key are left out");
    assert.equal(left.doubt, true);
  });

  test("the key of an inline table over 1,000 characters is left out, the others are read", () => {
    const report = {};
    const leaves = tomlLeaves(tomlEntries(`x = { "${"k".repeat(MAX_NAME + 1)}" = 1, b = 2 }\n`), report);
    assert.deepEqual(
      leaves.map((l) => l.path.join("|")),
      ["x|b"],
    );
    assert.equal(report.doubt, true);
  });

  test("inlineFields leaves out a key over 1,000 characters and reports a doubt", () => {
    const report = {};
    assert.deepEqual([...inlineFields(`{ "${"k".repeat(MAX_NAME + 1)}" = 1, b = 2 }`, report).keys()], ["b"]);
    assert.equal(report.doubt, true);
  });

  const longArray = (lines) =>
    `big = [\n${Array.from({ length: lines }, () => `  "${"x".repeat(100)}",`).join("\n")}\n]\n`;
  test("a value over 200,000 characters is a doubt, followed to its end: the lines after it stay in place", () => {
    const result = read(`${longArray(2100)}[tool.uv.sources]\ncorp-lib = { git = "x" }\n`);
    assert.equal(result.doubt, true, "a value not kept whole");
    assert.deepEqual(result.entries, ["big", "tool|uv|sources|corp-lib"]);
  });
  test("a value under 200,000 characters is no doubt", () => {
    const result = read(`${longArray(1500)}[tool.uv.sources]\ncorp-lib = { git = "x" }\n`);
    assert.equal(result.doubt, false);
    assert.deepEqual(result.entries, ["big", "tool|uv|sources|corp-lib"]);
  });
  test("a string's text past the cut is never read as TOML: the value is followed to its closing quotes", () => {
    const text = Array.from({ length: 2100 }, (_, i) => `k${i} = "${"y".repeat(90)}"`).join("\n");
    assert.deepEqual(read(`description = """\n${text}\n"""\nafter = 1\n`).entries, ["description", "after"]);
  });
});

describe("configLines splits at every line break one of the tools reads", () => {
  // [label, code, why]
  const BREAKS = [
    ["\\n", 0x0a, "every file"],
    ["\\v", 0x0b, "Python's splitlines (pip)"],
    ["\\f", 0x0c, "Python's splitlines (pip)"],
    ["a lone \\r", 0x0d, "configparser, npm's ini, YAML"],
    ["0x1c", 0x1c, "Python's splitlines (pip)"],
    ["0x1d", 0x1d, "Python's splitlines (pip)"],
    ["0x1e", 0x1e, "Python's splitlines (pip)"],
    ["U+0085", 0x85, "Python's splitlines (pip)"],
    ["U+2028", 0x2028, "Python's splitlines (pip)"],
    ["U+2029", 0x2029, "Python's splitlines (pip)"],
  ];
  for (const [label, code, why] of BREAKS)
    test(`${label} ends a line (${why})`, () => {
      assert.deepEqual(configLines(`a${String.fromCharCode(code)}b`), ["a", "b"], label);
    });

  // [label, a character that is no line break, why]
  const NOT_BREAKS = [
    ["0x1f", String.fromCharCode(0x1f), "pip's splitlines does not split at it"],
    ["U+FEFF", CH.BOM, "a byte order mark in the text is no break"],
    ["a tab", "\t", "white space"],
    ["a NUL", CH.NUL, "no tool breaks at it"],
  ];
  for (const [label, character, why] of NOT_BREAKS)
    test(`${label} ends no line (${why})`, () => {
      assert.deepEqual(configLines(`a${character}b`), [`a${character}b`], label);
    });

  test("\\r\\n is one break, not two", () => {
    assert.deepEqual(configLines("a\r\nb"), ["a", "b"]);
  });
  test("an empty line stays a line; a final break leaves an empty last line; an empty text is one empty line", () => {
    assert.deepEqual(configLines("a\n\nb\n"), ["a", "", "b", ""]);
    assert.deepEqual(configLines(""), [""]);
  });
  test("\\n\\r is two breaks", () => {
    assert.deepEqual(configLines("a\n\rb"), ["a", "", "b"]);
  });
});

describe("a file is decoded as its tools decode it", () => {
  test("UTF-8 without a mark is read as it is", () => {
    assert.equal(decodeText(Buffer.from("requests==2.31.0\n")), "requests==2.31.0\n");
  });
  test("a UTF-8 byte order mark is dropped", () => {
    assert.equal(decodeText(Buffer.from(`${CH.BOM}name = "app"`)), 'name = "app"');
  });
  test("UTF-16 little-endian after its mark (PowerShell 5's pip freeze)", () => {
    assert.equal(decodeText(utf16("requests==2.31.0\r\n", "le")), "requests==2.31.0\r\n");
  });
  test("UTF-16 big-endian after its mark", () => {
    assert.equal(decodeText(utf16("requests==2.31.0\n", "be")), "requests==2.31.0\n");
  });
  test("UTF-16 keeps a character outside ASCII, in both orders", () => {
    for (const endian of ["le", "be"]) assert.equal(decodeText(utf16("é€", endian)), "é€", endian);
  });
  test("UTF-16 big-endian with a lone final byte: the byte is dropped", () => {
    assert.equal(decodeText(Buffer.from([0xfe, 0xff, 0x00, 0x61, 0x00])), "a");
  });

  const withFile = (name, bytes, fn) => {
    const dir = tempDir("doc-kit-text-");
    try {
      fs.writeFileSync(path.join(dir, name), bytes);
      return fn(path.join(dir, name));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  test("readText reads a UTF-16 file; with utf8Only it is no file (a lock its tool reads as UTF-8)", () => {
    withFile("requirements.txt", utf16("a==1\n", "le"), (file) => {
      const unreadable = [];
      assert.equal(readText(file, "requirements.txt", unreadable), "a==1\n");
      assert.deepEqual(unreadable, []);
      assert.equal(readText(file, "requirements.txt", unreadable, true), null);
      assert.deepEqual(unreadable, [{ file: "requirements.txt", reason: "read" }]);
    });
  });

  test("readText with utf8Only still reads UTF-8, with or without its mark", () => {
    for (const [label, bytes] of [
      ["plain", Buffer.from("a==1\n")],
      ["with a mark", Buffer.from(`${CH.BOM}a==1\n`)],
    ])
      withFile("lock", bytes, (file) => {
        const unreadable = [];
        assert.equal(readText(file, "lock", unreadable, true), "a==1\n", label);
        assert.deepEqual(unreadable, [], label);
      });
  });

  test("readJson reads a package.json behind a byte order mark", () => {
    withFile("package.json", Buffer.from(`${CH.BOM}${JSON.stringify({ name: "app" })}`), (file) => {
      const unreadable = [];
      assert.deepEqual(readJson(file, "package.json", unreadable), { name: "app" });
      assert.deepEqual(unreadable, []);
    });
  });

  test("readJson: a package.json that is not JSON is unreadable with the reason json", () => {
    withFile("package.json", Buffer.from("{ nope"), (file) => {
      const unreadable = [];
      assert.equal(readJson(file, "package.json", unreadable), null);
      assert.deepEqual(unreadable, [{ file: "package.json", reason: "json" }]);
    });
  });

  test("a byte order mark before a package.json and its workspace member: both are read", () => {
    const bom = (value) => `${CH.BOM}${JSON.stringify(value)}`;
    const result = deps({
      "package.json": bom({ name: "app", workspaces: ["lib"], dependencies: { "corp-lib": "^1.0.0", react: "^18" } }),
      "lib/package.json": bom({ name: "corp-lib", version: "1.0.0", dependencies: { lodash: "^4" } }),
    });
    assert.deepEqual(Object.keys(result["package.json"]).sort(), ["corp-lib", "react"]);
    assert.deepEqual(Object.keys(result["lib/package.json"]), ["lodash"], "the member's manifest too");
  });

  test("a requirements file in UTF-16, in both orders, lists its packages", () => {
    for (const endian of ["le", "be"]) {
      const result = deps({ "requirements.txt": utf16("requests==2.31.0\r\nflask==3.0\r\n", endian) });
      assert.deepEqual(Object.keys(result["requirements.txt"]).sort(), ["flask", "requests"], endian);
      assert.equal(result["requirements.txt"].requests.version, "2.31.0", endian);
    }
  });

  const INDEX = `--index-url ${HOST.corpPypi}\ncorp-lib==1.0\n`;
  test("a private index in a UTF-16 requirements file is read (minimal pair: the same file without it)", async () => {
    for (const endian of ["le", "be"]) {
      const withIndex = await registriesOf({ "requirements.txt": utf16(INDEX, endian) });
      assert.equal(withIndex.pipAll, true, `${endian}: the index is seen`);
      const without = await registriesOf({ "requirements.txt": utf16("corp-lib==1.0\n", endian) });
      assert.equal(without.pipAll, false, `${endian}: the file is read, it declares none`);
    }
  });

  test("a byte order mark hides no first line: a requirements file's index, an .npmrc's scope and registry", async () => {
    const requirements = await registriesOf({ "requirements.txt": `${CH.BOM}${INDEX}` });
    assert.equal(requirements.pipAll, true, "requirements.txt");
    const scope = await registriesOf({ ".npmrc": `${CH.BOM}@corp:registry=${HOST.corpNpm}/\n` });
    assert.deepEqual([...scope.npmScopes], ["@corp"], ".npmrc scope");
    assert.equal(scope.npmAll, false);
    const all = await registriesOf({ ".npmrc": `${CH.BOM}registry=${HOST.corpNpm}/\n` });
    assert.equal(all.npmAll, true, ".npmrc registry");
    const plain = await registriesOf({ ".npmrc": `${CH.BOM}; nothing private here\n` });
    assert.deepEqual([plain.npmAll, [...plain.npmScopes]], [false, []], "minimal pair: no declaration");
  });
});
