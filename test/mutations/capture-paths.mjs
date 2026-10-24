// Mutants of engine/capture/plans.mjs: the forms of a path a server reads as the same route (pathForms), the path
// as it is reported (shownPath) and the addresses of the application (applicationKey), each taken out, which the
// tests of capture.forbidden must catch (RULES.md M16, S6).
export default {
  target: "engine/capture/plans.mjs",
  tests: ["test/unit/capture.test.mjs"],
  mutants: [
    {
      name: "the percent-decoded form not tested",
      find: "    for (const decoded of [raw, once, decodeEscapes(once)])",
      replace: "    for (const decoded of [raw])",
    },
    {
      name: "a path decoded once only",
      find: "    for (const decoded of [raw, once, decodeEscapes(once)])",
      replace: "    for (const decoded of [raw, once])",
    },
    {
      name: "one malformed escape turns off all decoding",
      find: `const decodeEscapes = (p) =>
  p.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run.replace(/%[0-7][0-9A-Fa-f]/g, (e) => String.fromCharCode(parseInt(e.slice(1), 16)));
    }
  });`,
      replace: `const decodeEscapes = (p) => {
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
};`,
    },
    {
      name: "a run of escapes that is not UTF-8 left as written",
      find: "      return run.replace(/%[0-7][0-9A-Fa-f]/g, (e) => String.fromCharCode(parseInt(e.slice(1), 16)));",
      replace: "      return run;",
    },
    {
      name: "a backslash not a slash",
      find: '      for (const f of [decoded, decoded.replace(/\\\\/g, "/")])',
      replace: "      for (const f of [decoded])",
    },
    {
      name: "path parameters dropped only after decoding",
      find: "  for (const raw of [p, withoutParameters(p)]) {",
      replace: "  for (const raw of [p]) {",
    },
    {
      name: "path parameters kept after decoding (%3B)",
      find: "        for (const g of [f, withoutParameters(f)]) {",
      replace: "        for (const g of [f]) {",
    },
    {
      name: "slashes not collapsed",
      find: '          const collapsed = g.replace(/\\/{2,}/g, "/");',
      replace: "          const collapsed = g;",
    },
    {
      name: "dot segments kept",
      find: "          for (const h of [g, collapsed, withoutDotSegments(g), withoutDotSegments(collapsed)]) {",
      replace: "          for (const h of [g, collapsed]) {",
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
      find: '            if (h.length > 1) forms.add(h.replace(/\\/$/, ""));\n',
      replace: "",
    },
    // A path as it is reported (S7).
    {
      name: "a path reported with its path parameters",
      find: "export const shownPath = (pathname) => withoutParameters(pathname);",
      replace: "export const shownPath = (pathname) => pathname;",
    },
    // The addresses of the application.
    {
      name: "an application upgraded to https another application",
      find: '  return `${LOOPBACK.test(host) ? "loopback" : host}:${u.port}`;',
      replace: '  return `${u.protocol}${LOOPBACK.test(host) ? "loopback" : host}:${u.port}`;',
    },
    {
      name: "loopback names told apart",
      find: '  return `${LOOPBACK.test(host) ? "loopback" : host}:${u.port}`;',
      replace: "  return `${host}:${u.port}`;",
    },
    {
      name: "the port not part of the application",
      find: '  return `${LOOPBACK.test(host) ? "loopback" : host}:${u.port}`;',
      replace: '  return `${LOOPBACK.test(host) ? "loopback" : host}`;',
    },
    {
      name: "a trailing dot another application",
      find: '  const host = u.hostname.replace(/\\.$/, "");',
      replace: "  const host = u.hostname;",
    },
    {
      name: "an address off the web read as an application",
      find: "  if (!/^https?:$/.test(u.protocol)) return null;\n  const host",
      replace: "  const host",
    },
  ],
};
