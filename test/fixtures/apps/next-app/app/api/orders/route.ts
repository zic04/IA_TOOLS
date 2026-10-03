// Fixture: a Next.js App Router route handler, for the `api` facts source and the `api` option of
// adapters/coverage/next-app-router.mjs. GET has no guard (auth "none"); POST checks the session's role
// (ARCHITECTURE.md §6.13: a "role" guard, checked first, even next to the "user"-matching session call).
import { databaseUrl } from "../../../lib/db";

async function getServerSession() {
  return { role: "admin" };
}

export async function GET() {
  return Response.json({ url: databaseUrl, orders: [] });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (session.role !== "admin") return Response.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json();
  return Response.json({ created: body }, { status: 201 });
}
