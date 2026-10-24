// Fixture: a tiny Express application, for the `api` facts source. The middleware names exercise the `auth`
// classification of ARCHITECTURE.md §6.13 (engine/facts/guards.mjs): isAuthenticated names a "user" guard by its
// whole name (Passport's), requireAdmin names a "role" guard (its word "admin"), requireAuth is no name the kit
// knows (auth "unknown"), and /health has no guard at all (auth "none").
const express = require("express");

function isAuthenticated(req, res, next) {
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

router.get("/orders", isAuthenticated, (req, res) => res.json([]));
router.post("/orders", requireAdmin, (req, res) => res.status(201).json(req.body));

app.use("/api", router);
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/admin/stats", requireAuth, (req, res) => res.json({ stats: {} }));

module.exports = app;
