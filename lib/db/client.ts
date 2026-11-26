import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/lib/db/schema";

type Database = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { applykarPool?: Pool };

export function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  if (!globalForDb.applykarPool) {
    globalForDb.applykarPool = new Pool({ connectionString, max: 5 });
  }
  return globalForDb.applykarPool;
}

export function getDb(): Database {
  return drizzle(getPool(), { schema });
}

export async function closeDb(): Promise<void> {
  if (globalForDb.applykarPool) {
    await globalForDb.applykarPool.end();
    globalForDb.applykarPool = undefined;
  }
}
