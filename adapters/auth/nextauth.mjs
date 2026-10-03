// Authentication adapter of a NextAuth / Auth.js application: the session is read at /api/auth/session (the
// `endpoint` option), which answers { user, expires } when signed in and {} otherwise. `connect` detects the
// sign-in by itself (no need to press Enter).
//   auth: { adapter: "nextauth", endpoint: "/api/auth/session" }
export default {
  name: "nextauth",
  options: {
    endpoint: { type: "string", minLength: 1, default: "/api/auth/session" },
  },
  browser: "chromium",
  detects: true,
  async session(page, options, { appUrl, isSignInUrl }) {
    if (isSignInUrl(page.url(), appUrl, options.loginPattern)) return null;
    const s = await page.evaluate(async (endpoint) => {
      const r = await fetch(endpoint, { credentials: "include", headers: { accept: "application/json" } });
      return r.ok ? r.json() : null;
    }, options.endpoint);
    if (!s || !s.user) return null;
    const u = s.user;
    const roles = [].concat(u.roles ?? u.role ?? []).filter(Boolean);
    return {
      who: u.name || u.email || null,
      details: roles.length ? roles.join(", ") : null,
      expires: s.expires || null,
    };
  },
};
