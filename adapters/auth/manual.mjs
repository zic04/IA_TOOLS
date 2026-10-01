// Default authentication adapter. `connect` opens the application in a visible browser; the person signs in
// (SSO and MFA work: it is a real browser), then presses Enter in the terminal. Before a capture, the session is
// valid when the application does not send the browser to a sign-in page: another origin (identity provider)
// or a path matching the `loginPattern` option (default "login|signin|sign-in|oauth|authorize").
//   auth: { adapter: "manual", loginPattern: "/login|/oauth2/", start: "/" }
export default {
  name: "manual",
  options: {},
  browser: "chromium",
  detects: false,
  async session(page, options, { appUrl, isSignInUrl }) {
    return isSignInUrl(page.url(), appUrl, options.loginPattern) ? null : { who: null };
  },
};
