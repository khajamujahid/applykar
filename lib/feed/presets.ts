import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { filterPresets } from "@/lib/db/schema";

export async function listPresets(profileId: string) {
  return getDb().select().from(filterPresets).where(eq(filterPresets.profileId, profileId)).orderBy(desc(filterPresets.createdAt)).limit(12);
}

export async function savePreset(profileId: string, name: string, query: string) {
  await getDb().insert(filterPresets).values({ profileId, name, query });
}
