// A test is never read: this filter must not appear in the facts.
const found = rows.filter((r) => r.reference.includes("x"));
