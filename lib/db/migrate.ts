import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

export async function applyMigrations(connectionString: string): Promise<void> {
  const directory = resolve(process.cwd(), "drizzle");
  const files = readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const client = process.env.DB_WS === "1" ? new (require("@neondatabase/serverless").Client)({ connectionString }) : new pg.Client({ connectionString });
  if (process.env.DB_WS === "1") require("@neondatabase/serverless").neonConfig.webSocketConstructor = WebSocket; // eslint-disable-line @typescript-eslint/no-require-imports
  await client.connect();
  try {
    for (const file of files) {
      await client.query(readFileSync(resolve(directory, file), "utf8"));
    }
  } finally {
    await client.end();
  }
}
