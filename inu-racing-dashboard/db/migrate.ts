import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set (check .env.local)");

  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql);

  console.log("Running drizzle migrations (users/devices/sessions/bookmarks)...");
  await migrate(db, { migrationsFolder: "./db/migrations" });

  console.log("Applying telemetry_samples partitioned-table schema...");
  const telemetrySql = fs.readFileSync(path.join(process.cwd(), "db/telemetry-schema.sql"), "utf8");
  await sql.unsafe(telemetrySql);

  console.log("Migrations complete.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
