import type { AnswerRecord, ProfileRecord } from "@/lib/domain";

export type PacketJob = {
  title: string;
  companyName: string;
  applyUrl: string;
  skillTags: string[];
  locationRaw: string | null;
};

export type AnswerPacket = {
  text: string;
  whyThisRole: string;
  answers: { key: string; question: string; answer: string }[];
};

export function buildAnswerPacket(input: {
  job: PacketJob;
  profile: Pick<ProfileRecord, "name" | "skills" | "prefersC2c">;
  answers: AnswerRecord[];
  whyThisRole?: string;
}): AnswerPacket {
  const matched = input.job.skillTags.filter((tag) =>
    input.profile.skills.some((skill) => skill.toLowerCase() === tag.toLowerCase()),
  );
  const skillSentence =
    matched.length > 0
      ? `The posting overlaps with skills I already use: ${matched.slice(0, 8).join(", ")}.`
      : "I can speak to the parts of the posting that match the experience on my resume.";
  const engagement = input.profile.prefersC2c
    ? "I am looking for a corp-to-corp engagement."
    : "I am open to the engagement type posted for this role.";
  const why =
    input.whyThisRole?.trim() ||
    `I am applying for the ${input.job.title} role at ${input.job.companyName}. ${skillSentence} I am authorized to work in the United States without sponsorship and I am available immediately. ${engagement}`;

  const lines = [
    `${input.job.title} at ${input.job.companyName}`,
    input.job.locationRaw ? `Location: ${input.job.locationRaw}` : null,
    `Apply: ${input.job.applyUrl}`,
    "",
    "Saved answers",
    ...input.answers.map((answer) => `${answer.question}\n${answer.answer}`),
    "",
    "Note for this role",
    why,
    "",
    "Resume facts (titles, employers, and dates) are unchanged. This note only uses saved answers and overlapping skills.",
  ].filter((line): line is string => line != null);

  return {
    text: lines.join("\n"),
    whyThisRole: why,
    answers: input.answers.map((answer) => ({
      key: answer.key,
      question: answer.question,
      answer: answer.answer,
    })),
  };
}
