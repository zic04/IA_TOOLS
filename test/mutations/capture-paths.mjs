// Mutants of engine/capture/plans.mjs: the forms of a path a server reads as the same route (pathForms), the path
// and the address as they are reported (shownPath, shownUrl) and the addresses of the application (applicationKey,
// isLoopbackUrl), each taken out, which the tests of capture.forbidden must catch (RULES.md M16, S6, S7).
export default {
  target: "engine/capture/plans.mjs",
  tests: ["test/unit/capture.test.mjs", "test/unit/reviews.test.mjs"],
  mutants: [
    {
      name: "the percent-decoded form not tested",
      find: "    return [x, once, decodeEscapes(once)];",
      replace: "    return [x];",
    },
    {
      name: "a path decoded once only",
      find: "    return [x, once, decodeEscapes(once)];",
      replace: "    return [x, once];",
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
      find: '  forms = expand(forms, (x) => [x, x.replace(/\\\\/g, "/")]);',
      replace: "  void 0;",
    },
    {
      name: "path parameters dropped only after decoding",
      find: "  let forms = new Set([p, withoutParameters(p)]);",
      replace: "  let forms = new Set([p]);",
    },
    {
      name: "path parameters kept after decoding (%3B)",
      find: "  forms = expand(forms, (x) => [x, withoutParameters(x)]);",
      replace: "  void 0;",
    },
    {
      name: "slashes not collapsed",
      find: '    const collapsed = x.replace(/\\/{2,}/g, "/");',
      replace: "    const collapsed = x;",
    },
    {
      name: "dot segments kept",
      find: "    return [x, collapsed, withoutDotSegments(x), withoutDotSegments(collapsed)];",
      replace: "    return [x, collapsed];",
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
      find: '  forms = expand(forms, (x) => (x.length > 1 ? [x, x.replace(/\\/$/, "")] : [x]));\n',
      replace: "",
    },
    // A segment's trailing dots and spaces (IIS).
    {
      name: "a segment's trailing dots and spaces kept",
      find: "  forms = expand(forms, (x) => [x, withoutTrailingDots(x)]);",
      replace: "  void 0;",
    },
    {
      name: "a segment's trailing spaces kept",
      find: '  while (end > 0 && (s[end - 1] === "." || s[end - 1] === " ")) end--;',
      replace: '  while (end > 0 && s[end - 1] === ".") end--;',
    },
    {
      name: "a dot segment trimmed like a name (/approval/.. read as /approval/)",
      find: '  if (s === "." || s === "..") return s;\n',
      replace: "",
    },
    // A path as it is reported (S7).
    {
      name: "a path reported with its path parameters",
      find: "export const shownPath = (pathname) => withoutParameters(pathname);",
      replace: "export const shownPath = (pathname) => pathname;",
    },
    {
      name: "an address shown with its query and parameters",
      find: "  if (u.host) return `${u.protocol}//${u.host}${shownPath(u.pathname)}`;",
      replace: "  if (u.host) return u.href;",
    },
    // The addresses of the application, and the one loopback definition.
    {
      name: "0.0.0.0 not the loopback interface",
      find: '    host === "0.0.0.0" ||\n',
      replace: "",
    },
    {
      name: "[::] not the loopback interface",
      find: '    host === "::" ||\n',
      replace: "",
    },
    {
      name: "an IPv4-mapped loopback address ([::ffff:127.0.0.1]) not the loopback interface",
      find: '    host === "::" ||\n    /^::ffff:(?:7f[0-9a-f]{2}:[0-9a-f]{1,4}|0:0)$/.test(host)\n',
      replace: '    host === "::"\n',
    },
    {
      name: "a *.localhost name not the loopback interface",
      find: '    host.endsWith(".localhost") ||\n',
      replace: "",
    },
    {
      name: "a loopback name with a trailing dot not the loopback interface",
      find: '    .replace(/^\\[|\\]$/g, "")\n    .replace(/\\.$/, "")\n',
      replace: '    .replace(/^\\[|\\]$/g, "")\n',
    },
    {
      name: "an application upgraded to https another application",
      find: '  return `${isLoopbackUrl(u) ? "loopback" : host}:${u.port}`;',
      replace: '  return `${u.protocol}${isLoopbackUrl(u) ? "loopback" : host}:${u.port}`;',
    },
    {
      name: "loopback names told apart",
      find: '  return `${isLoopbackUrl(u) ? "loopback" : host}:${u.port}`;',
      replace: "  return `${host}:${u.port}`;",
    },
    {
      name: "the port not part of the application",
      find: '  return `${isLoopbackUrl(u) ? "loopback" : host}:${u.port}`;',
      replace: '  return `${isLoopbackUrl(u) ? "loopback" : host}`;',
    },
    {
      name: "a trailing dot another application",
      find: '  const host = u.hostname.replace(/\\.$/, "");\n  return',
      replace: "  const host = u.hostname;\n  return",
    },
    {
      name: "an address off the web read as an application",
      find: "  if (!/^https?:$/.test(u.protocol)) return null;\n  const host",
      replace: "  const host",
    },
  ],
};
