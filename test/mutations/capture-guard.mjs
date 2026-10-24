// Mutants of engine/capture/capture.mjs: the rules of the capture guard taken out (requestGuard, redirectChain,
// hopHeaders, localNetworkGrant), which its tests must catch (RULES.md M16, S6). The guard's work in a real browser
// (the page that opens the end of a chain, the local addresses of a loopback application) is
// test/e2e/capture-redirects.test.mjs.
export default {
  target: "engine/capture/capture.mjs",
  tests: ["test/unit/capture.test.mjs"],
  mutants: [
    // The first address of every request.
    {
      name: "the first address not tested",
      find: "    if (forbidden.length && u.origin === appOrigin && forbiddenMatch(u.pathname, forbidden)) return refuse(u.pathname);\n",
      replace: "",
    },
    {
      name: "a forbidden path tested on every origin",
      find: "    if (forbidden.length && u.origin === appOrigin && forbiddenMatch(u.pathname, forbidden))",
      replace: "    if (forbidden.length && forbiddenMatch(u.pathname, forbidden))",
    },
    {
      name: "read-only off",
      find: "    if (readOnly && !SAFE_METHODS.includes(req.method())) {",
      replace: "    if (false) {",
    },
    // Which navigations the guard follows itself.
    {
      name: "only the application's navigations followed",
      find: "      forbidden.length &&\n      req.isNavigationRequest() &&",
      replace: "      forbidden.length &&\n      u.origin === appOrigin &&\n      req.isNavigationRequest() &&",
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
        "    if (!/^https?:$/.test(next.protocol)) return {};\n    if (next.origin !== appOrigin) return { response, url: at };\n",
    },
    {
      name: "a redirect off the web followed",
      find: "    if (!/^https?:$/.test(next.protocol)) return {};\n",
      replace: "",
    },
    {
      name: "a hop back on the application not tested",
      find: "    if (next.origin === appOrigin && forbiddenMatch(next.pathname, forbidden)) return { forbidden: next.pathname };\n",
      replace: "",
    },
    {
      name: "a hop on another origin tested against capture.forbidden",
      find: "    if (next.origin === appOrigin && forbiddenMatch(next.pathname, forbidden))",
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
    // What the browser gets.
    {
      name: "no redirect, and the guard's page all the same",
      find: "    if (withoutHash(chain.url.href) === key) return route.fulfill({ response: chain.response });\n",
      replace: "",
    },
    {
      name: "the end of the chain asked again",
      find: "    if (sent && !sent.opened && withoutHash(sent.url) === key) {",
      replace: "    if (false) {",
    },
    {
      name: "a held answer given twice",
      find: "      sent.opened = true;\n",
      replace: "",
    },
    {
      name: "a frame's landing kept after it goes elsewhere",
      find: "    if (frame) landings.delete(frame);",
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
