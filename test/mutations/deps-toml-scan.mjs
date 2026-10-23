// Mutants of engine/facts/deps/toml-scan.mjs: what no TOML value holds is a doubt (the tool refuses the file).
import { DEPENDENCY_TESTS } from "./_tests.mjs";

export default {
  target: "engine/facts/deps/toml-scan.mjs",
  tests: DEPENDENCY_TESTS,
  mutants: [
    {
      name: "a bare word that is no value inside an array is no doubt",
      find: "if ((top.array || !top.key) && letter && !BARE_VALUES.has(chunk.slice(i, end))) entry.doubt = true;",
      replace: "void letter;",
    },
    {
      name: "an '=' inside an array is no doubt",
      find: "    if (top.array || !top.key) entry.doubt = true;\n",
      replace: "",
    },
    {
      name: "a table or an array where an inline table expects its key is no doubt",
      find: "top ? !top.array && top.key : entry.ended",
      replace: "top ? false : entry.ended",
    },
    {
      name: "a table or an array after a value is no doubt",
      find: "top ? !top.array && top.key : entry.ended",
      replace: "top ? !top.array && top.key : false",
    },
    {
      name: "an escape a basic string does not know is no doubt",
      find: "    if (!continued && !ESCAPES.has(next)) entry.doubt = true;\n",
      replace: "",
    },
    {
      name: "a string after a value is no doubt",
      find: "  if (opening && !entry.frames.length && entry.ended) entry.doubt = true;\n",
      replace: "",
    },
    {
      name: "a word after a value is no doubt",
      find: "  if (entry.ended && !(entry.bare && digit)) entry.doubt = true;\n",
      replace: "",
    },
    {
      name: "a character no value starts with is no doubt",
      find: "  if (!wordChar(c)) {\n    entry.doubt = true;\n    return i;\n  }",
      replace: "  if (!wordChar(c)) return i;",
    },
    {
      name: "a bracket closing another kind is no doubt",
      find: '    if (top && top.array !== (c === "]")) entry.doubt = true; // a bracket closing another kind\n',
      replace: "",
    },
    {
      name: "triple quotes as single ones",
      find: "state.quote = text.startsWith(c + c + c, i) ? c + c + c : c;",
      replace: "state.quote = c;",
    },
    {
      name: "a quote run of 3 only",
      find: "while (run < 5 && text[i + run] === c) run++;",
      replace: "while (run < 3 && text[i + run] === c) run++;",
    },
    {
      name: "a one-line string carried on",
      find: "  if (entry.quote.length === 1) {",
      replace: "  if (false) {",
    },
  ],
};
