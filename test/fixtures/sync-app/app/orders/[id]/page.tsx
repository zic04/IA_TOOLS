import { load } from "../../../lib/orders";

export default async function OrderDetailPage({ params }) {
  const order = await load(params.id);
  return <div>{order.id}</div>;
}
