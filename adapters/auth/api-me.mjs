// Authentication adapter of an application that exposes its signed-in user on a "me" endpoint (`url` option,
// default "/api/me"): signed in when it answers 2xx with JSON holding the `proof` field (default "id"; a dotted
// path such as "user.id" is accepted). `who` names the field shown after `connect` (default "name"). `connect`
// detects the sign-in by itself.
//   auth: { adapter: "api-me", url: "/api/v1/me", proof: "oid", who: "name" }
const get = (o, p) => String(p).split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);

export default {
  name: "api-me",
  options: {
    url: { type: "string", minLength: 1, default: "/api/me" },
    proof: { type: "string", minLength: 1, default: "id" },
    who: { type: "string", minLength: 1, default: "name" },
  },
  browser: "chromium",
  detects: true,
  async session(page, options, { appUrl, isSignInUrl }) {
    if (isSignInUrl(page.url(), appUrl, options.loginPattern)) return null;
    const me = await page.evaluate(async (url) => {
      const r = await fetch(url, { credentials: "include", headers: { accept: "application/json" } });
      return r.ok ? r.json() : null;
    }, options.url);
    if (!me || get(me, options.proof) === undefined || get(me, options.proof) === null || get(me, options.proof) === "") return null;
    const who = get(me, options.who) ?? me.name ?? me.email ?? null;
    return { who: who === null ? null : String(who), details: null, expires: null };
  },
};
