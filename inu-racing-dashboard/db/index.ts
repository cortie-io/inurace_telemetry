import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (check .env.local)");
}

// Reused as a module-level singleton across route handlers, same pattern as any other
// Next.js app on this box (network-tutor-web included) — Next.js dedupes module instances
// per server process, so this isn't a new connection per request.
export const client = postgres(process.env.DATABASE_URL, { max: 10 });
export const db = drizzle(client, { schema });
