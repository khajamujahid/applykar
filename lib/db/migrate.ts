import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

export async function applyMigrations(connectionString: string): Promise<void> {
  const directory = resolve(process.cwd(), "drizzle");
  const files = readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    for (const file of files) {
      await client.query(readFileSync(resolve(directory, file), "utf8"));
    }
  } finally {
    await client.end();
  }
}
