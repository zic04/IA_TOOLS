// Mutants of engine/capture/plans.mjs: the forms of a path a server reads as the same route (pathForms), each taken
// out, which the tests of capture.forbidden must catch (RULES.md M16, S6).
export default {
  target: "engine/capture/plans.mjs",
  tests: ["test/unit/capture.test.mjs"],
  mutants: [
    {
      name: "the percent-decoded form not tested",
      find: '  for (const f of [p, decoded, decoded.replace(/\\\\/g, "/")])\n',
      replace: '  for (const f of [p, p.replace(/\\\\/g, "/")])\n',
    },
    {
      name: "a backslash not a slash",
      find: '  for (const f of [p, decoded, decoded.replace(/\\\\/g, "/")])\n',
      replace: "  for (const f of [p, decoded])\n",
    },
    {
      name: "path parameters kept",
      find: '    for (const g of [f, f.replace(/;[^/]*/g, "")]) {',
      replace: "    for (const g of [f]) {",
    },
    {
      name: "slashes not collapsed",
      find: '      const collapsed = g.replace(/\\/{2,}/g, "/");',
      replace: "      const collapsed = g;",
    },
    {
      name: "dot segments kept",
      find: "      for (const h of [g, collapsed, withoutDotSegments(g), withoutDotSegments(collapsed)]) {",
      replace: "      for (const h of [g, collapsed]) {",
    },
    {
      name: "a dot dot segment climbs above the root",
      find: '      if (s === ".." && out.length > 1) out.pop();',
      replace: '      if (s === "..") out.pop();',
    },
    {
      name: "a dot segment at the end drops the slash",
      find: '      if (last) out.push("");',
      replace: "",
    },
    {
      name: "a trailing slash kept",
      find: '        if (h.length > 1) forms.add(h.replace(/\\/$/, ""));\n',
      replace: "",
    },
  ],
};
