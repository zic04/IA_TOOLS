// Fixture: a Next.js App Router route handler with a dynamic segment, for the `api` facts source. GET only calls
// currentUser() (ARCHITECTURE.md §6.13): a lookup in a handler's body gives an anonymous caller nothing and refuses
// him nothing, so auth is "unknown" (`currentUser (body)`) — a guard is present, but not classified.
async function currentUser() {
  return { id: "u1" };
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await currentUser();
  return Response.json({ id: params.id, by: user.id });
}
