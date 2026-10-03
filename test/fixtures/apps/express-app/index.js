// Fixture: a tiny Express application, for the `api` facts source. The middleware names exercise the `auth`
// classification of ARCHITECTURE.md §6.13: requireSession names a "user" guard (DEFAULT_USER_GUARD matches
// "session"), requireAdmin names a "role" guard (DEFAULT_ROLE_GUARD matches "admin"), requireAuth matches neither
// default pattern (auth "unknown"), and /health has no guard at all (auth "none").
const express = require("express");

function requireSession(req, res, next) {
  next();
}

function requireAdmin(req, res, next) {
  next();
}

function requireAuth(req, res, next) {
  next();
}

const app = express();
const router = express.Router();

router.get("/orders", requireSession, (req, res) => res.json([]));
router.post("/orders", requireAdmin, (req, res) => res.status(201).json(req.body));

app.use("/api", router);
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/admin/stats", requireAuth, (req, res) => res.json({ stats: {} }));

module.exports = app;
