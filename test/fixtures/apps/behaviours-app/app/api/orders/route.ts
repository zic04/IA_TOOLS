import { prisma } from "../../../lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const page = Number(searchParams.get("page") ?? 1);
  const session = await getSession();
  /* prisma.order.findMany({ where: { hidden: { contains: q } } }) is commented out */
  const orders = await prisma.order.findMany({
    where: { customer: { contains: q, mode: "insensitive" }, status: { in: ["OPEN", "SHIPPED"] }, userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    skip: (page - 1) * 20,
  });
  return Response.json(orders);
}
