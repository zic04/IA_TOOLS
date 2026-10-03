// Fixture: a Next.js App Router route handler with a dynamic segment, for the `api` facts source. GET only calls
// currentUser() (ARCHITECTURE.md §6.13): that guard name matches neither default pattern (no "current_user" with
// an underscore, no "session", no "token"), so auth is "unknown" — a guard is present, but not classified.
async function currentUser() {
  return { id: "u1" };
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await currentUser();
  return Response.json({ id: params.id, by: user.id });
}
