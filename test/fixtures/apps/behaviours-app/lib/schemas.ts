import { z } from "zod";

export const OrderInput = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email().optional(),
  quantity: z.number().int().positive().default(1),
  status: z.enum(["Open", "Shipped", "Cancelled"]),
});

export const Region = z.enum(["North", "South", "Zq8vN3kT6wP1xR4mY7bLc2Hd"]);

export type Channel = "web" | "phone" | "store";

export enum Priority {
  Low = "LOW",
  High = "HIGH",
}
