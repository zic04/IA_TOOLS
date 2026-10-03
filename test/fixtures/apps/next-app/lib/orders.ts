// Fixture: order approval, for the `env` facts source and the takeover examples (file:line proofs point here).
const secretKey = process.env.SECRET_KEY;

export function approve(orderId: string, amount: number) {
  if (amount > 10000) return { status: "pending-manager" };
  return { status: "approved", secretKey };
}
