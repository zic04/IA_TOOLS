// Fixture: a Next.js `pages/api` handler (legacy style), for the `api` facts source.
export default function handler(req, res) {
  if (req.method === "GET") return res.status(200).json({ ok: true });
  if (req.method === "POST") return res.status(201).json({ ok: true });
  return res.status(405).end();
}
