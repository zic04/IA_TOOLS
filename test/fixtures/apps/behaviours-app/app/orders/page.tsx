"use client";
// Fixture of the behaviours source (test/unit/facts-behaviours.test.mjs): the orders screen, a search and a filter.
import { useSearchParams } from "next/navigation";
import { useDebounce } from "../../lib/hooks";

export default function Orders({ orders }) {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const term = useDebounce(q, 300);
  const shown = orders.filter((o) => o.customer.toLowerCase().includes(term.toLowerCase()) && o.total >= 0);
  // shown.filter((o) => o.secret.includes(x)) is only a comment
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <input name="q" value={q} onChange={(e) => setQ(e.target.value)} minLength={2} />
      <select name="status">
        <option value="">All</option>
        <option>Open</option>
        <option>Shipped</option>
      </select>
      <ul>{shown.map((o) => <li key={o.id}>{o.customer}</li>)}</ul>
    </form>
  );
}
