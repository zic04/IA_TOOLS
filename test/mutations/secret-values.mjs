// Mutants of engine/check/secret-values.mjs: each rule of the secret detectors' floor (what 0.4.1 found is still
// found) and of the exceptions it allows taken out, which the secret tests must catch (RULES.md M3, S7, SECURITY.md
// "The secret detectors have limits").
//
// Not a mutant: `harmlessParameter` reading the parameter at the match's start instead of the name's. It is
// equivalent: a name after digits, dots or dashes (`?-list=`) has neither a `=` at `m.index + name.length` (inside
// the name) nor a `?`, `&`, `#` or `&amp;` before the name (a digit, a dot or a dash): both read "not a harmless
// parameter".
//
// Not a mutant either: the old `ARGUMENT`, whose members started with any letter (`[A-Za-z_$]`) where they now start
// with a capital. It matches the same strings: members in lower case are already its first form's. Only its time
// differs, a call never closed taking 2^k tries for k such arguments, which the ReDoS harness catches
// (test/tools/redos-worker.mjs, `password = a.b(c` then `, d.e`), not the tests above.
const mutant = (name, find, replace) => ({ name, find, replace });

export default {
  target: "engine/check/secret-values.mjs",
  tests: ["test/unit/secret-recall.test.mjs", "test/unit/secret-detectors.test.mjs"],
  mutants: [
    // The placeholders: an instruction to replace the value is one as the whole value only.
    mutant(
      "change-me and replace-me anywhere in the value",
      String.raw`String.raw` +
        "`" +
        String.raw`^(?:change|replace)[-_ ]?me(?:(?:[-_. ][a-z]+)+(?:[-_. ]\d+)?)?$|` +
        "`",
      String.raw`String.raw` + "`" + String.raw`change[-_ ]?me|replace[-_ ]?me|` + "`",
    ),
    mutant(
      "a number right after change-me",
      String.raw`me(?:(?:[-_. ][a-z]+)+(?:[-_. ]\d+)?)?$|`,
      String.raw`me(?:[-_. ](?:[a-z]+|\d+))*$|`,
    ),
    // The floors of the URL's password and of a signed URL: as 0.4.1 read them.
    mutant(
      "a URL's password with the new placeholders",
      "accept: (m) => isValue041(m.groups.v) &&",
      "accept: (m) => isValue(m.groups.v) &&",
    ),
    mutant("0.4.1's ?sig= read without its floor", 'm[0].slice(1, 5) === "sig=" || ', ""),
    mutant(
      "a signature's placeholder read anywhere",
      "|| !MASK.test(m.groups.v),",
      "|| !PLACEHOLDER.test(m.groups.v),",
    ),
    // A value holding a number of two digits or more is never an exception, checked first.
    mutant(
      "a sigil before the number of two digits",
      "  if (NUMBER_RUN.test(v)) return false;\n  CALL_OR_INDEX.lastIndex = 0;",
      "  if (sigilConstant(v)) return true;\n  if (NUMBER_RUN.test(v)) return false;\n  CALL_OR_INDEX.lastIndex = 0;",
    ),
    mutant("a number of two digits in the call's arguments", "|| NUMBER_RUN.test(whole) ||", "||"),
    mutant("the , of code after a value holding a number", "  if (NUMBER_RUN.test(v)) return true;\n", ""),
    mutant(
      "a key's variable name holding a number",
      "CONSTANT_NAME.test(v) && !NUMBER_RUN.test(v)) return false;",
      "CONSTANT_NAME.test(v)) return false;",
    ),
    // A shell's or Windows' variable: its words joined by `_`, or a secret's name.
    mutant("a sigil and any name in capitals", '(CONSTANT_NAME.test(name) || secretName(name) === "secret")', "true"),
    // A call or an index as the whole value.
    mutant("a value going on past the call", "v.length > whole.length || ", ""),
    mutant("a call followed by anything", " || !CODE_END.has(input[at + whole.length])", ""),
    mutant("a call of a word alone", 'head.includes(".") || nameParts(head).length > 1;', "true;"),
    mutant(
      "a number as a call's argument",
      String.raw`(?:\.[A-Za-z_$][\w$]*)+|$` + "{QUOTED})`;",
      String.raw`(?:\.[A-Za-z_$][\w$]*)+|\d+|$` + "{QUOTED})`;",
    ),
    mutant(
      "a word in capitals alone as a call's argument",
      String.raw`(?:[a-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*|`,
      String.raw`(?:[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*|`,
    ),
    mutant(
      "an index by any key",
      "QUOTED_INDEX = String.raw`" + String.raw`\[\s*(?:$` + "{QUOTED})" + String.raw`\s*\]` + "`",
      "QUOTED_INDEX = String.raw`" + String.raw`\[\s*(?:$` + "{ARGUMENT})" + String.raw`\s*\]` + "`",
    ),
    // A reference only in a line written as code.
    mutant("a reference wherever it is written", "  if (!writtenAsCode(input, at, whole)) return false;\n", ""),
    mutant("a reference before the ; of code only", '[";", ",", ")"].includes(input[at + v.length]) ||', ""),
    mutant("a reference in capitals after a blank", " && /^[a-z_$]/.test(v)", ""),
    // The new detectors (an assignment to a secret's name, a connection string's password).
    mutant(
      "a quoted value read as members",
      "(!quote && !NUMBER_RUN.test(v) && members(v))",
      "(!NUMBER_RUN.test(v) && members(v))",
    ),
    mutant(
      "members holding a number of two digits",
      "(!quote && !NUMBER_RUN.test(v) && members(v))",
      "(!quote && members(v))",
    ),
    mutant("a quoted Password= handed to the connection string", "    !quote &&\n", ""),
    mutant(
      "a quoted Password name handed to the connection string",
      String.raw`    !/[\w"']/.test(input[nameAt + name.length] ?? "") &&` + "\n",
      "",
    ),
    mutant(
      "a Password glued to a digit handed to the connection string",
      String.raw`    !/\w/.test(input[nameAt - 1] ?? "");`,
      "    true;",
    ),
    mutant("a DSN's pair read back 8 characters only", "const PAIR_BACK = 256;", "const PAIR_BACK = 8;"),
    mutant(
      "the shell expansion read before the match, not the name",
      'input.slice(Math.max(0, nameAt - 2), nameAt) === "${"',
      'input.slice(Math.max(0, at - 2), at) === "${"',
    ),
  ],
};
