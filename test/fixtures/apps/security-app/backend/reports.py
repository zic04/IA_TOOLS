# Fixture: builds a SQL statement by interpolating a value, then runs it — a SQL-injection risk.
def search_orders(conn, status):
    query = f"SELECT * FROM orders WHERE status = '{status}'"
    return conn.execute(query)
