import { config } from "dotenv";
import { applyMigrations } from "../lib/db/migrate";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  await applyMigrations(connectionString);
  console.log("Applied drizzle/0000_init.sql");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
