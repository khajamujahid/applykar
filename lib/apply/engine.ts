import { buildAnswerPacket, type AnswerPacket, type PacketJob } from "@/lib/apply/packet";
import type { AnswerRecord, ProfileRecord } from "@/lib/domain";

export type ApplyEngineId = "manual" | "cloud-bot" | "chrome-extension";

export interface ApplyEngine {
  id: ApplyEngineId;
  label: string;
  prepare(input: {
    job: PacketJob;
    profile: Pick<ProfileRecord, "name" | "skills" | "prefersC2c">;
    answers: AnswerRecord[];
  }): Promise<AnswerPacket & { applyUrl: string }>;
}

export const manualApplyEngine: ApplyEngine = {
  id: "manual",
  label: "Open the real apply link and copy saved answers",
  async prepare(input) {
    const packet = buildAnswerPacket(input);
    return { ...packet, applyUrl: input.job.applyUrl };
  },
};

const unavailable = (id: Exclude<ApplyEngineId, "manual">, label: string): ApplyEngine => ({
  id,
  label,
  async prepare() {
    throw new Error(`${label} is not enabled in this build.`);
  },
});

const engines: Record<ApplyEngineId, ApplyEngine> = {
  manual: manualApplyEngine,
  "cloud-bot": unavailable("cloud-bot", "Cloud apply bot"),
  "chrome-extension": unavailable("chrome-extension", "Chrome autofill extension"),
};

export function getApplyEngine(id: ApplyEngineId = "manual"): ApplyEngine {
  return engines[id];
}
