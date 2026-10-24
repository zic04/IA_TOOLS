// Mutants of engine/capture/guard.mjs: the rules of the capture guard taken out (requestGuard, redirectChain,
// hopHeaders, localNetworkGrant), which its tests must catch (RULES.md M16, S6). The guard's work in a real browser
// (the page that opens the end of a chain, the local addresses of a loopback application, its bounds on a slow and
// a huge server) is test/e2e/capture-redirects.test.mjs.
export default {
  target: "engine/capture/guard.mjs",
  tests: ["test/unit/capture.test.mjs"],
  mutants: [
    // The first address of every request.
    {
      name: "the first address not tested",
      find: "    if (forbidden.length && onApp(u) && forbiddenMatch(u.pathname, forbidden)) return refuse(u.pathname);\n",
      replace: "",
    },
    {
      name: "a forbidden path tested on every origin",
      find: "    if (forbidden.length && onApp(u) && forbiddenMatch(u.pathname, forbidden))",
      replace: "    if (forbidden.length && forbiddenMatch(u.pathname, forbidden))",
    },
    {
      name: "the application's other addresses (https, a trailing dot, a loopback alias) not the application",
      find: "  const onApp = (u) => applicationKey(u) === app;",
      replace: "  const onApp = (u) => new URL(u).origin === new URL(appOrigin).origin;",
    },
    {
      name: "read-only off",
      find: "    if (readOnly && !SAFE_METHODS.includes(req.method())) {",
      replace: "    if (false) {",
    },
    // What is reported: never a path parameter (a session id, S7).
    {
      name: "a refused request listed with its path parameters",
      find: "      const line = `${req.method()} ${shownPath(pathname)}`;",
      replace: "      const line = `${req.method()} ${pathname}`;",
    },
    {
      name: "a refused navigation reported with its path parameters",
      find: "        onNavigation(shownPath(pathname));",
      replace: "        onNavigation(pathname);",
    },
    {
      name: "a blocked request listed with its path parameters",
      find: '  const shown = (u) => (onApp(u) ? "" : u.host) + shownPath(u.pathname);',
      replace: '  const shown = (u) => (onApp(u) ? "" : u.host) + u.pathname;',
    },
    // Which navigations the guard follows itself.
    {
      name: "only the application's navigations followed",
      find: "      forbidden.length &&\n      req.isNavigationRequest() &&",
      replace: "      forbidden.length &&\n      onApp(u) &&\n      req.isNavigationRequest() &&",
    },
    {
      name: "a write navigation fetched by the guard",
      find: "      req.isNavigationRequest() &&\n      SAFE_METHODS.includes(req.method()) &&\n",
      replace: "      req.isNavigationRequest() &&\n",
    },
    {
      name: "a navigation off the web fetched by the guard",
      find: "      SAFE_METHODS.includes(req.method()) &&\n      /^https?:$/.test(u.protocol)\n",
      replace: "      SAFE_METHODS.includes(req.method())\n",
    },
    // The chain.
    {
      name: "a hop on another origin ends the check",
      find: "    if (!/^https?:$/.test(next.protocol)) return {};\n",
      replace:
        "    if (!/^https?:$/.test(next.protocol)) return {};\n    if (!onApp(next)) return { response, url: at };\n",
    },
    {
      name: "a redirect off the web followed",
      find: "    if (!/^https?:$/.test(next.protocol)) return {};\n",
      replace: "",
    },
    {
      name: "a hop back on the application not tested",
      find: "    if (onApp(next) && forbiddenMatch(next.pathname, forbidden)) return { forbidden: next.pathname };\n",
      replace: "",
    },
    {
      name: "a hop on another origin tested against capture.forbidden",
      find: "    if (onApp(next) && forbiddenMatch(next.pathname, forbidden))",
      replace: "    if (forbiddenMatch(next.pathname, forbidden))",
    },
    {
      name: "a longer chain followed",
      find: "const MAX_REDIRECTS = 10;",
      replace: "const MAX_REDIRECTS = 11;",
    },
    {
      name: "the fragment lost through a redirect",
      find: "    if (!next.hash && at.hash) next.hash = at.hash;\n",
      replace: "",
    },
    // The bounds of a chain (RULES.md M7).
    {
      name: "a hop without its own timeout",
      find: "        timeout: Math.min(limits.hop, left),",
      replace: "        timeout: left,",
    },
    {
      name: "no deadline for the whole chain",
      find: "  const deadline = now() + limits.chain;",
      replace: "  const deadline = Infinity;",
    },
    {
      name: "a hop asked after the deadline",
      find: "    if (left <= 0) return { late: true };\n",
      replace: "",
    },
    {
      name: "a hop past its timeout read as a failure, never said",
      find: '      if (e?.name === "TimeoutError") return { late: true };\n',
      replace: "",
    },
    {
      name: "an iframe's chain too slow stops the capture",
      find: '      if (forbiddenRequestKind(req) === "navigation") onStop(key, { route: shown(u), ...vars });',
      replace: "      onStop(key, { route: shown(u), ...vars });",
    },
    {
      name: "no cap on the answer held for a frame",
      find: "  else if ((await chain.response.body()).length > limits.bytes) {",
      replace: "  else if (false) {",
    },
    {
      name: "an answer of the cap's size refused",
      find: "  else if ((await chain.response.body()).length > limits.bytes) {",
      replace: "  else if ((await chain.response.body()).length >= limits.bytes) {",
    },
    // Each answer freed.
    {
      name: "a hop's answer kept once read",
      find: "    await dispose(response);\n    const next = new URL(location, at);",
      replace: "    const next = new URL(location, at);",
    },
    {
      name: "an answer kept once the browser has it",
      find: "  } finally {\n    await dispose(response);\n  }",
      replace: "  } finally {\n    void 0;\n  }",
    },
    {
      name: "a held answer kept when its frame goes elsewhere",
      find: "      dispose(response);\n    },",
      replace: "    },",
    },
    {
      name: "the end of a pop-up's chain kept",
      find: "  if (!frame) await dispose(chain.response);",
      replace: "  if (!frame) void 0;",
    },
    // What the browser gets.
    {
      name: "no redirect, and the guard's page all the same",
      find: "  if (withoutHash(chain.url.href) === key) return answer(route, chain.response);\n",
      replace: "",
    },
    {
      name: "the end of the chain asked again",
      find: "  if (held && !held.opened && withoutHash(held.url) === key) {",
      replace: "  if (false) {",
    },
    {
      name: "a held answer given twice",
      find: "    held.opened = true;\n",
      replace: "",
    },
    {
      name: "the end opened without waiting for its commit (afterRedirects reads the address instead)",
      find: "    held.open(nextCommit(frame));",
      replace: "    held.open(Promise.resolve());",
    },
    {
      name: "a frame's landing kept after it goes elsewhere",
      find: "  if (frame) forget(landings, frame);",
      replace: "",
    },
    // The headers of a hop.
    {
      name: "the request's cookies sent to every hop",
      find: "  delete headers.cookie;\n",
      replace: "",
    },
    {
      name: "the whole referrer sent to another origin",
      find: "    else if (referrer.origin !== url.origin) headers.referer = `${referrer.origin}/`;\n",
      replace: "",
    },
    {
      name: "an unreadable referrer sent",
      find: "    if (!referrer) delete headers.referer;\n",
      replace: "    if (!referrer) void 0;\n",
    },
    // Local network access.
    {
      name: "local network access for an application off loopback",
      find: "  if (!forbidden.length || !isLoopbackUrl(appUrl)) return null;",
      replace: "  if (!forbidden.length) return null;",
    },
    {
      name: "local network access without forbidden routes",
      find: "  if (!forbidden.length || !isLoopbackUrl(appUrl)) return null;",
      replace: "  if (!isLoopbackUrl(appUrl)) return null;",
    },
    {
      name: "local network access for every origin",
      find: '  return [["local-network-access"], { origin: new URL(appUrl).origin }];',
      replace: '  return [["local-network-access"], {}];',
    },
  ],
};
