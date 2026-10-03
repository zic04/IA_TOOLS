# Agent instructions — Acme Orders (web)

- Always validate input with Zod before writing to the database.
- Never commit `.env`; only `.env.example` is tracked.
- Prefer server components; only mark a component `"use client"` when it needs interactivity.
