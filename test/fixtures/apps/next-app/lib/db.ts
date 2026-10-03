// Fixture: a tiny database client, for the `env` and `secrets` facts sources.
export const databaseUrl = process.env.DATABASE_URL;

export function connect() {
  return { url: process.env["DATABASE_URL"] };
}
