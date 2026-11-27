import { eq } from "drizzle-orm";
import { SettingsScreen } from "@/components/app/settings-screen";
import { currentProfile } from "@/lib/current";
import { getDb } from "@/lib/db/client";
import { ownerSettings } from "@/lib/db/schema";
import { gatewayToken } from "@/lib/ai/gateway";
import { HIDDEN_ANSWER_KEYS } from "@/lib/profile/answer-catalog";
import { getAnswers } from "@/lib/services/profiles";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { email, profile } = await currentProfile();
  const allAnswers = await getAnswers(profile.id);
  const saved = allAnswers.filter((a) => !HIDDEN_ANSWER_KEYS.has(a.key));
  const hasAtsPassword = allAnswers.some((a) => a.key === "ats_password" && a.answer.trim().length > 0);
  const row = (await getDb().select().from(ownerSettings).where(eq(ownerSettings.id, "owner")).limit(1))[0];
  const base = (process.env.APPLYKAR_URL || process.env.AUTH_URL || "").replace(/\/$/, "");
  return (
    <SettingsScreen
      email={email}
      settings={{
        autoApply: row?.autoApply ?? false,
        dailyLimit: row?.dailyLimit ?? 50,
        batchSize: row?.batchSize ?? 20,
        skipW2Only: row?.skipW2Only ?? true,
        sevenDaysOnly: row?.sevenDaysOnly ?? true,
        notifyEmail: row?.notifyEmail ?? true,
      }}
      mcp={{ url: `${base}/api/mcp`, token: process.env.MCP_BEARER_TOKEN ?? null }}
      answers={{ total: saved.length, blank: saved.filter((a) => !a.answer.trim()).length, hasAtsPassword }}
      ai={{ configured: Boolean(gatewayToken()), model: process.env.AI_GATEWAY_MODEL || "google/gemini-2.5-flash" }}
    />
  );
}
