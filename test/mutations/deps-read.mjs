// Mutants of engine/facts/deps/read.mjs: how a manifest is decoded, and what the TOML reader takes for a doubt.
import { DEPENDENCY_TESTS, GROWTH_TESTS } from "./_tests.mjs";

export default {
  target: "engine/facts/deps/read.mjs",
  tests: DEPENDENCY_TESTS,
  mutants: [
    {
      name: "a control character or a lone CR in a TOML file is no doubt",
      find: "    if (hasControl(raw)) report.doubt = true;\n",
      replace: "",
    },
    {
      name: "a poetry.lock or uv.lock that is not valid UTF-8 is read",
      find: '    if (utf8Only === "strict") new TextDecoder("utf-8", { fatal: true }).decode(bytes);\n',
      replace: "",
    },
    {
      name: "a field's values copied at each one (quadratic)",
      find: "    if (values) values.push(quoted(value) ?? value);\n    else dep.fields.set(field, [quoted(value) ?? value]);",
      replace: "    dep.fields.set(field, [...(values ?? []), quoted(value) ?? value]);",
      tests: [...DEPENDENCY_TESTS, ...GROWTH_TESTS],
    },
    {
      name: "a key told by its whole path (quadratic), seen by the ReDoS test",
      find: '    const id = `${state.header}\\0${keyParts.join("\\0")}`;',
      replace: '    const id = `${state.block}\\0${path.join("\\0")}`;',
      tests: ["test/unit/security.test.mjs", ...GROWTH_TESTS],
    },
    {
      name: "an array over a table trusted",
      find: "    if (state.tableNames.has(name)) report.doubt = true;\n",
      replace: "",
    },
    {
      name: "a table over an array trusted",
      find: "    if (state.arrays.has(name) || state.tables.has(id)) report.doubt = true;",
      replace: "    if (state.tables.has(id)) report.doubt = true;",
    },
    {
      name: "a table twice trusted",
      find: "    if (state.arrays.has(name) || state.tables.has(id)) report.doubt = true;",
      replace: "    if (state.arrays.has(name)) report.doubt = true;",
    },
    {
      name: "a long header followed",
      find: "  state.skip = name.length > MAX_NAME;",
      replace: "  state.skip = false;",
    },
    {
      name: "a long key followed",
      find: "    const skip = state.skip || line.slice(0, eq).trim().length > MAX_NAME;",
      replace: "    const skip = state.skip;",
    },
    {
      name: "what a long name holds kept",
      find: "    if (!e.skip) out.push(",
      replace: "    out.push(",
    },
    {
      name: "a long inline key followed",
      find: "        if (piece.slice(0, eq).trim().length > MAX_NAME) report.doubt = true;\n        else visit(",
      replace: "        visit(",
    },
    {
      name: "a long inline key followed, no doubt",
      find: "        if (piece.slice(0, eq).trim().length > MAX_NAME) report.doubt = true;\n        else visit(",
      replace: "        if (piece.slice(0, eq).trim().length > MAX_NAME) continue;\n        else visit(",
    },
    {
      name: "UTF-16 locks read",
      find: '    if (utf8Only && utf16) throw new Error("UTF-16");\n',
      replace: "",
    },
    {
      name: "every field read as the version",
      find: 'const field = keys.length > n + 1 ? keys[n + 1] : "version";',
      replace: 'const field = "version";',
    },
    {
      name: "no doubt at the end",
      find: "    open.doubt = true; // a string or a bracket still open at the end",
      replace: "",
    },
    {
      name: "'=' found inside quotes",
      find: "    const eq = equalsAt(line);",
      replace: '    const eq = line.indexOf("=");',
    },
    {
      name: "a line that is no TOML trusted",
      find: "    if (eq <= 0) {\n      report.doubt = true;\n      continue;\n    }",
      replace: "    if (eq <= 0) continue;",
    },
    {
      name: "a value cut trusted",
      find: "      else open.doubt = true;\n",
      replace: "\n",
    },
    {
      name: "a value cut closed at once",
      find: "      if (follow(open, chunk)) {",
      replace: "      if (follow(open, chunk) || open.value.length >= MAX_TOML_VALUE) {",
    },
    {
      name: "UTF-16 not read",
      find: 'if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString("utf16le");',
      replace: "",
    },
    {
      name: "\\xHH not decoded",
      find: "|U([0-9a-fA-F]{8})|x([0-9a-fA-F]{2})|([\\s\\S]))/g;",
      replace: "|U([0-9a-fA-F]{8})|()|([\\s\\S]))/g;",
    },
    {
      name: "an unknown escape trusted",
      find: "      if (ESCAPED[ch] === undefined) report.doubt = true;\n",
      replace: "",
    },
    {
      name: "0x1c no line break",
      find: "13, 0x1c, 0x1d, 0x1e, 0x85,",
      replace: "13, 0x1d, 0x1e, 0x85,",
    },
    {
      name: "0x1e no line break",
      find: "13, 0x1c, 0x1d, 0x1e, 0x85,",
      replace: "13, 0x1c, 0x1d, 0x85,",
    },
    {
      name: "\\v no line break",
      find: "new Set([10, 11, 12, 13,",
      replace: "new Set([10, 12, 13,",
    },
    {
      name: "U+0085 no line break",
      find: "0x1e, 0x85, 0x2028,",
      replace: "0x1e, 0x2028,",
    },
    {
      name: "U+2029 no line break",
      find: "0x2028, 0x2029]);",
      replace: "0x2028]);",
    },
    {
      name: "the arrays of tables not reported",
      find: "    (report.arrays ??= new Set()).add(name);\n",
      replace: "",
    },
    {
      name: "a key twice trusted",
      find: "    if (skip || state.given.has(id)) report.doubt = true;",
      replace: "    if (skip) report.doubt = true;",
    },
    {
      name: "a long key trusted",
      find: "    if (skip || state.given.has(id)) report.doubt = true;",
      replace: "    if (state.given.has(id)) report.doubt = true;",
    },
    {
      name: "a long table name trusted",
      find: "  if (state.skip) report.doubt = true;\n",
      replace: "  if (state.skip) void 0;\n",
    },
    {
      name: "escapes not decoded",
      find: "return p.slice(1, -1).replace(ESCAPE, (m, u4, u8, x2, ch) => {",
      replace: "return p.slice(1, -1).replace(/(?!)/g, (m, u4, u8, x2, ch) => {",
    },
    {
      name: "a BOM kept",
      find: '  return stripBom(bytes.toString("utf8"));',
      replace: '  return bytes.toString("utf8");',
    },
    {
      name: "the first value of a field only",
      find: "    if (values) values.push(quoted(value) ?? value);\n",
      replace: "    if (values) void value;\n",
    },
    {
      name: "a header left open trusted",
      find: "  if (end >= line.length || line.slice(end + (array ? 2 : 1)).trim()) report.doubt = true;\n",
      replace: "",
    },
    {
      name: "a lone \\r no line break",
      find: "new Set([10, 11, 12, 13,",
      replace: "new Set([10, 11, 12,",
    },
    {
      name: "a bare key with a blank or another character is no doubt",
      find: "    if (!bareKey(p)) report.doubt = true;\n",
      replace: "",
    },
    {
      name: "a key with no value is no doubt",
      find: "    if (!kv.value) report.doubt = true; // `key =` and nothing: TOML has no empty value\n",
      replace: "",
    },
  ],
};
