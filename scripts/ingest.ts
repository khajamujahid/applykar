import { config } from "dotenv";
import { ingestBatch, isBoardSource } from "../lib/ingest/run";

config({ path: ".env.local" });
config({ path: ".env" });

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

async function main() {
  const slugs = arg("slugs")?.split(",").filter(Boolean);
  const sources = arg("sources")
    ?.split(",")
    .filter(isBoardSource);
  const limit = Number(arg("limit") ?? "6");
  const stats = await ingestBatch({
    slugs,
    sources,
    limitCompanies: Number.isFinite(limit) ? limit : 6,
    includeOptional: arg("optional") === "1",
  });
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
