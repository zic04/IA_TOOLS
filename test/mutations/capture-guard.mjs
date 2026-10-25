// Mutants of engine/capture/guard.mjs: the rules of the capture guard taken out (requestGuard, redirectChain,
// hopHeaders, addressForm, hold, socketGuard, blockSpeculationRules, localNetworkGrant, guardedLaunchArgs,
// blockUnloadRequests), which its tests must catch (RULES.md M16, S6).
// The guard's work in a real browser (the page that opens the end of a chain, a sandboxed iframe, the local
// addresses of a loopback application, speculation rules, WebSockets, what a page sends as it is left, its bounds on
// a slow and a huge server, the answers held for all pages) is test/e2e/capture-redirects.test.mjs.
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
      find: "    bytes > limits.bytes\n",
      replace: "    false\n",
    },
    {
      name: "an answer of the cap's size refused",
      find: "    bytes > limits.bytes\n",
      replace: "    bytes >= limits.bytes\n",
    },
    {
      name: "no cap on the answers held for all frames",
      find: "      : state.held + bytes > limits.held\n",
      replace: "      : false\n",
    },
    {
      name: "answers held up to the total cap exactly refused",
      find: "      : state.held + bytes > limits.held\n",
      replace: "      : state.held + bytes >= limits.held\n",
    },
    {
      name: "an answer still counted once its frame has opened it",
      find: "    open: (p) => {\n      release();\n",
      replace: "    open: (p) => {\n",
    },
    {
      name: "an answer still counted once dropped",
      find: "    drop: () => {\n      release();\n",
      replace: "    drop: () => {\n",
    },
    {
      name: "an end held for a frame in place of another, the other still counted (a chain that ended after the frame's next navigation started)",
      find: "  const bytes = (await chain.response.body()).length;\n  forget(state, frame);\n",
      replace: "  const bytes = (await chain.response.body()).length;\n",
    },
    {
      name: "a page's closing frees nothing held for it",
      find: '    page.once("close", () => forget(state, frame));',
      replace: "    void page;",
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
      find: "  if (addressForm(chain.url.href) === key || frame?.parentFrame()) return answer(route, chain.response);\n",
      replace: "",
    },
    {
      name: "an iframe given the guard's page (a sandboxed one stays blank, its answer held for ever)",
      find: "  if (addressForm(chain.url.href) === key || frame?.parentFrame()) return",
      replace: "  if (addressForm(chain.url.href) === key) return",
    },
    {
      name: "the end of the chain asked again",
      find: "  if (held && !held.opened && addressForm(held.url) === key) {",
      replace: "  if (false) {",
    },
    // One written form of an address (Node.js keeps /end|x, Chromium writes /end%7Cx).
    {
      name: "an address compared as written",
      find: "    c.length === 3 ? c.toUpperCase() : escaped(c),",
      replace: "    c.length === 3 ? c.toUpperCase() : c,",
    },
    {
      name: "an escape compared in its own case",
      find: "    c.length === 3 ? c.toUpperCase() : escaped(c),",
      replace: "    c.length === 3 ? c : escaped(c),",
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
      find: "  if (frame) forget(state, frame);",
      replace: "",
    },
    // Speculation rules, which Chromium fetches from its own process.
    {
      name: "the Speculation-Rules header kept",
      find: '  delete headers["speculation-rules"];\n',
      replace: "",
    },
    {
      name: "a rules script inserted left in the page",
      find: "    if (isRules(root)) {\n      root.remove();\n      return;\n    }\n",
      replace: "    if (isRules(root)) {\n      return;\n    }\n",
    },
    {
      name: "the rules scripts inside an inserted element left",
      find: "      if (isRules(el)) el.remove();\n",
      replace: "      if (isRules(el)) void 0;\n",
    },
    {
      name: "a rules script retyped in place left",
      find: "      if (isRules(r.target)) r.target.remove();\n",
      replace: "",
    },
    {
      name: "what a root already holds not swept",
      find: "    sweep(root);\n  };",
      replace: "  };",
    },
    {
      name: "a shadow root attached by a script not watched",
      find: "      const root = Reflect.apply(target, self, args);\n      watch(root);\n",
      replace: "      const root = Reflect.apply(target, self, args);\n",
    },
    {
      name: "an open shadow root that comes with its host not watched",
      find: "    if (root.shadowRoot) watch(root.shadowRoot);\n",
      replace: "",
    },
    {
      name: "the shadow roots inside a root or below an inserted element not reached (the recursion removed)",
      find: "      else if (el.shadowRoot) watch(el.shadowRoot);\n",
      replace: "",
    },
    {
      name: "the document not swept again once parsed (a root declared on a host already seen)",
      find: '  scope.addEventListener("DOMContentLoaded", () => sweep(scope.document), true);\n',
      replace: "",
    },
    {
      name: "the document swept again once parsed only if the page's own listeners let it",
      find: '  scope.addEventListener("DOMContentLoaded", () => sweep(scope.document), true);',
      replace: '  scope.addEventListener("DOMContentLoaded", () => sweep(scope.document));',
    },
    {
      name: "the document not swept again after a script attaches a shadow root",
      find: "      watch(root);\n      sweepAgain();\n",
      replace: "      watch(root);\n",
    },
    {
      name: "the document swept again after the first shadow root a script attaches only",
      find: "      again = false;\n",
      replace: "",
    },
    {
      name: "a rules script's type read as written",
      find: 'String(n.type).trim().toLowerCase() === "speculationrules"',
      replace: 'n.type === "speculationrules"',
    },
    {
      name: "a script retyped not observed",
      find: 'attributes: true, attributeFilter: ["type"] }',
      replace: "}",
    },
    // WebSockets, whose handshake no route sees.
    {
      name: "a WebSocket to a forbidden route left to connect",
      find: "      return forbidden.length > 0 && onApp(u) && forbiddenMatch(u.pathname, forbidden) !== null;",
      replace: "      return false;",
    },
    {
      name: "a WebSocket on another origin tested against capture.forbidden",
      find: "      return forbidden.length > 0 && onApp(u) && forbiddenMatch(u.pathname, forbidden) !== null;",
      replace: "      return forbidden.length > 0 && forbiddenMatch(u.pathname, forbidden) !== null;",
    },
    {
      name: "a WebSocket's address read in its own scheme (never the application's)",
      find: '    u.protocol = u.protocol === "wss:" ? "https:" : "http:";\n',
      replace: "",
    },
    {
      name: "a refused WebSocket not listed",
      find: "      result.prefetched.push(`GET ${shownPath(new URL(ws.url()).pathname)}`);\n",
      replace: "",
    },
    {
      name: "a refused WebSocket listed with its path parameters",
      find: "`GET ${shownPath(new URL(ws.url()).pathname)}`",
      replace: "`GET ${new URL(ws.url()).pathname}`",
    },
    {
      name: "a refused WebSocket left to open",
      find: "      await ws.close({ code: 1006 });\n",
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
    // What a page sends as it is left, which no route sees, and fetchLater.
    {
      name: "the page's pagehide handlers run as it is left",
      find: '  scope.addEventListener("pagehide", stop, true);\n',
      replace: "",
    },
    {
      name: "the page's unload handlers run as it is left",
      find: '  scope.addEventListener("unload", stop, true);\n',
      replace: "",
    },
    {
      name: "the page's visibilitychange handlers run as it is left",
      find: '  scope.addEventListener("visibilitychange", (e) => scope.document.visibilityState === "hidden" && stop(e), true);\n',
      replace: "",
    },
    {
      name: "visibilitychange stopped while the page is visible (its handlers never run while it is open)",
      find: '(e) => scope.document.visibilityState === "hidden" && stop(e)',
      replace: "(e) => stop(e)",
    },
    {
      name: "the page's own events stopped too (its handlers never run while it is open)",
      find: "    if (e.isTrusted) e.stopImmediatePropagation();\n",
      replace: "    e.stopImmediatePropagation();\n",
    },
    {
      name: "the page's other handlers of the window still run (propagation stopped, not the window's listeners)",
      find: "    if (e.isTrusted) e.stopImmediatePropagation();\n",
      replace: "    if (e.isTrusted) e.stopPropagation();\n",
    },
    {
      name: "pagehide stopped in the bubbling phase (after a handler of the page in the capture phase)",
      find: '  scope.addEventListener("pagehide", stop, true);',
      replace: '  scope.addEventListener("pagehide", stop);',
    },
    {
      name: "visibilitychange stopped in the bubbling phase (after the document's handlers)",
      find: '"hidden" && stop(e), true);',
      replace: '"hidden" && stop(e));',
    },
    {
      name: "fetchLater kept on the window",
      find: "  delete scope.fetchLater;\n",
      replace: "",
    },
    {
      name: "fetchLater kept on the window's prototype",
      find: "  if (scope.Window) delete scope.Window.prototype.fetchLater;\n",
      replace: "",
    },
    {
      name: "fetchLater left on in the browser",
      find: '(guarded ? ["--disable-blink-features=FetchLaterAPI"] : [])',
      replace: "(guarded ? [] : [])",
    },
    {
      name: "fetchLater turned off by --disable-features (Playwright's own list of features replaced)",
      find: '(guarded ? ["--disable-blink-features=FetchLaterAPI"] : [])',
      replace: '(guarded ? ["--disable-features=FetchLaterAPI"] : [])',
    },
  ],
};
