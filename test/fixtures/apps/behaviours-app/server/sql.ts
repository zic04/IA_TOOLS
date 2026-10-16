export const searchOrders = (db, q, limit, offset) =>
  db.query(
    `SELECT id, customer FROM orders WHERE customer ILIKE '%' || $1 || '%' ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [q, limit, offset],
  );
export const fullText = `SELECT id FROM docs WHERE to_tsvector('french', body) @@ plainto_tsquery($1)`;
export const message = "Would you like to order by phone? There is no limit 3 per day.";
