import { config } from "dotenv";
import { ensureCompanies } from "../lib/ingest/run";

config({ path: ".env.local" });
config({ path: ".env" });

ensureCompanies()
  .then((count) => {
    console.log(`Seeded ${count} companies`);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
