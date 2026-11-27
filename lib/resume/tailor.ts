/**
 * Tailors a structured resume to one job description. Truthful by construction:
 *  - the rules engine only reorders (summary lines, skill categories and skills, bullets, projects) so the most
 *    relevant real experience comes first, and lists JD keywords that are already in the resume;
 *  - the AI engine (AI Gateway) may rephrase summary lines and bullets, but every rewrite is checked: a rewrite that
 *    introduces a tool / technology / number that is not already in the resume is discarded and the original kept.
 * Companies, titles, dates, education and certifications are never changed.
 */
import { SKILL_DICTIONARY } from "@/lib/enrich/skills";
import { chat } from "@/lib/ai/gateway";
import type { ResumeData, TailoredResume, TailoringChange } from "@/lib/resume/types";

export type JobForTailoring = { title: string; companyName: string; description: string; skillTags?: string[] };

/** Common skills / practices phrased the way JDs phrase them (in addition to the resume's own skill list). */
const EXTRA_TERMS = [
  "agents", "agentic workflows", "AI agents", "LLMs", "RAG", "retrieval", "knowledge bases", "embeddings", "vector search", "prompt engineering",
  "evaluations", "benchmarks", "fine-tuning", "RLHF", "reinforcement learning", "machine learning", "deep learning", "NLP", "computer vision",
  "PyTorch", "TensorFlow", "scikit-learn", "NumPy", "pandas", "Jupyter", "LangChain", "LangGraph", "LlamaIndex", "OpenAI", "Hugging Face",
  "Ray", "Spark", "Airflow", "dbt", "ETL", "data pipelines", "streaming", "Kafka", "RabbitMQ", "Redis", "Elasticsearch", "Celery",
  "REST APIs", "GraphQL", "gRPC", "microservices", "distributed systems", "event-driven", "async", "WebSockets", "OAuth2", "JWT",
  "Docker", "Kubernetes", "Terraform", "CI/CD", "GitHub Actions", "Jenkins", "AWS", "Azure", "GCP", "Lambda", "serverless", "observability",
  "unit testing", "PyTest", "TDD", "code review", "Agile", "Scrum", "Git", "Linux", "Bash", "SQL", "NoSQL", "PostgreSQL", "MongoDB",
  "HIPAA", "HL7", "FHIR", "security", "performance tuning", "scalability", "system design", "Claude Code", "Codex", "Copilot",
];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function corpus(resume: ResumeData): string {
  return norm(
    [
      resume.personalInformation.title,
      resume.personalInformation.summary,
      ...resume.skillCategories.flatMap((c) => c.skills),
      ...resume.workExperience.flatMap((w) => [w.role, ...w.responsibilities, ...(w.technologies ?? [])]),
      ...resume.projects.flatMap((p) => [p.title, ...p.details, ...(p.technologies ?? [])]),
    ]
      .filter(Boolean)
      .join(" \n "),
  );
}

function has(text: string, term: string): boolean {
  const t = norm(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${t}(?![a-z0-9])`, "i").test(text);
}

/** Keywords = resume vocabulary + common tech terms that appear in the JD. */
export function jobKeywords(resume: ResumeData, job: JobForTailoring): { keywords: string[]; matched: string[]; missing: string[] } {
  const jd = norm(`${job.title}\n${job.description}\n${(job.skillTags ?? []).join(", ")}`);
  const resumeText = corpus(resume);
  const vocab = new Map<string, string>();
  for (const skill of resume.skillCategories.flatMap((c) => c.skills)) {
    // "AWS (EC2, ECS Fargate, ...)" -> "AWS"; "Large Language Models (LLMs)" -> both forms
    const base = skill.replace(/\(.*?\)/g, "").trim();
    for (const form of [base, ...(skill.match(/\(([^)]+)\)/)?.[1]?.split(/,\s*/) ?? [])])
      if (form.length >= 2 && form.length <= 40) vocab.set(norm(form), form.trim());
  }
  for (const word of [...EXTRA_TERMS, ...(SKILL_DICTIONARY as readonly string[])]) if (!vocab.has(norm(word))) vocab.set(norm(word), word);
  const keywords: string[] = [];
  for (const [key, label] of vocab) if (has(jd, key) || (key.endsWith("s") && has(jd, key.slice(0, -1)))) keywords.push(label);
  const stem = (k: string) => norm(k).replace(/\(.*?\)/g, "").replace(/s$/, "").trim();
  const seen = new Set<string>();
  const unique = keywords.filter((k) => !seen.has(stem(k)) && !!seen.add(stem(k)));
  const inResume = (k: string) => has(resumeText, k) || (norm(k).endsWith("s") && has(resumeText, norm(k).slice(0, -1)));
  const matched = unique.filter(inResume);
  const missing = unique.filter((k) => !inResume(k));
  return { keywords: unique, matched, missing };
}

const score = (text: string, matched: string[]) => matched.reduce((n, k) => n + (has(norm(text), k) ? 1 : 0), 0);

function stableSort<T>(items: T[], key: (item: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index, k: key(item) }))
    .sort((a, b) => b.k - a.k || a.index - b.index)
    .map((x) => x.item);
}

function rulesTailor(resume: ResumeData, matched: string[]): { data: ResumeData; changes: TailoringChange[] } {
  const data: ResumeData = structuredClone(resume);
  const changes: TailoringChange[] = [];
  const p = data.personalInformation;
  if (p.title?.includes("|")) {
    const [first, ...rest] = p.title.split("|").map((s) => s.trim());
    const ordered = stableSort(rest, (t) => score(t, matched));
    if (ordered.join() !== rest.join()) {
      p.title = [first, ...ordered].join(" | ");
      changes.push({ kind: "keywords", title: "Headline reordered", detail: "Put the stack this job asks for first" });
    }
  }
  if (p.summary) {
    const lines = p.summary.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const [first, ...rest] = lines;
    const ordered = stableSort(rest, (l) => score(l, matched));
    if (ordered.join() !== rest.join()) changes.push({ kind: "summary", title: "Summary refocused", detail: "Lines that match the job description moved to the top" });
    p.summary = [first, ...ordered].join("\n\n");
  }
  const before = data.skillCategories.map((c) => c.name).join();
  data.skillCategories = stableSort(
    data.skillCategories.map((c) => ({ ...c, skills: stableSort(c.skills, (s) => score(s, matched)) })),
    (c) => score(c.skills.join(", "), matched),
  ).map((c, i) => ({ ...c, order: i }));
  if (data.skillCategories.map((c) => c.name).join() !== before)
    changes.push({ kind: "skills", title: "Skills prioritised", detail: "Categories and skills that match the job come first" });
  let moved = 0;
  for (const role of data.workExperience) {
    const ordered = stableSort(role.responsibilities, (b) => score(b, matched));
    if (ordered.join() !== role.responsibilities.join()) moved++;
    role.responsibilities = ordered;
  }
  data.projects = stableSort(data.projects, (pr) => score([pr.title, ...pr.details, ...(pr.technologies ?? [])].join(" "), matched));
  if (moved) changes.push({ kind: "bullets", title: "Most relevant bullets first", detail: `Reordered bullets in ${moved} role${moved > 1 ? "s" : ""}` });
  return { data, changes };
}

/** Tokens that would be a factual claim if new: tech-ish words and numbers. */
function claimTokens(text: string): string[] {
  return (text.match(/[A-Za-z][A-Za-z0-9+#.\/-]*[A-Za-z0-9+#]|\d+(?:\.\d+)?%?/g) ?? []).filter(
    (t) => /\d/.test(t) || /[A-Z].*[A-Z]|[+#.]/.test(t) || (SKILL_DICTIONARY as readonly string[]).includes(t.toLowerCase()),
  );
}

function truthful(rewrite: string, original: string, resumeText: string): boolean {
  const allowed = `${norm(original)} ${resumeText}`;
  return claimTokens(rewrite).every((t) => allowed.includes(norm(t)));
}

async function aiRewrite(data: ResumeData, job: JobForTailoring, matched: string[], resumeText: string): Promise<{ rewritten: number; error?: string }> {
  const summary = (data.personalInformation.summary ?? "").split(/\n+/).filter(Boolean);
  const bullets = data.workExperience.map((w) => w.responsibilities.slice(0, 6));
  const result = await chat(
    [
      {
        role: "system",
        content:
          "You tailor resumes. Rephrase lines so they use the job description's wording where it is TRUE for the candidate. " +
          "Never add a technology, tool, metric, employer, title or claim that is not already in the same line or elsewhere in the resume. " +
          "Keep each line about the same length. Return JSON {\"summary\": string[], \"bullets\": string[][]} with the same counts.",
      },
      {
        role: "user",
        content: JSON.stringify({
          job: { title: job.title, company: job.companyName, description: job.description.slice(0, 6000) },
          keywordsAlreadyInResume: matched,
          summary,
          bullets,
        }),
      },
    ],
    { json: true, timeoutMs: 60_000 },
  );
  if (!result.ok) return { rewritten: 0, error: result.error };
  let parsed: { summary?: string[]; bullets?: string[][] };
  try {
    parsed = JSON.parse(result.content.replace(/^```json\s*|```$/g, ""));
  } catch {
    return { rewritten: 0, error: "AI returned invalid JSON" };
  }
  let rewritten = 0;
  const lines = [...summary];
  (parsed.summary ?? []).forEach((line, i) => {
    if (lines[i] && typeof line === "string" && line.trim() && truthful(line, lines[i], resumeText)) (lines[i] = line.trim()), rewritten++;
  });
  data.personalInformation.summary = lines.join("\n\n");
  (parsed.bullets ?? []).forEach((group, r) =>
    (group ?? []).forEach((line, i) => {
      const role = data.workExperience[r];
      if (role?.responsibilities[i] && typeof line === "string" && line.trim() && truthful(line, role.responsibilities[i], resumeText))
        (role.responsibilities[i] = line.trim()), rewritten++;
    }),
  );
  return { rewritten };
}

export async function tailorResume(base: ResumeData, job: JobForTailoring, options: { useAi?: boolean } = {}): Promise<TailoredResume> {
  const { keywords, matched, missing } = jobKeywords(base, job);
  const { data, changes } = rulesTailor(base, matched);
  let engine = "rules";
  if (options.useAi !== false) {
    const ai = await aiRewrite(data, job, matched, corpus(base));
    if (ai.rewritten) {
      engine = "ai-gateway";
      changes.unshift({ kind: "summary", title: "Rewrote lines in the job's language", detail: `${ai.rewritten} summary/bullet lines rephrased, facts unchanged` });
    } else if (ai.error) engine = `rules (AI unavailable: ${ai.error.slice(0, 80)})`;
  }
  if (matched.length)
    changes.unshift({ kind: "keywords", title: `Matched ${matched.slice(0, 3).join(", ")}${matched.length > 3 ? ` +${matched.length - 3}` : ""}`, detail: "Job keywords already in your experience, now emphasised" });
  if (missing.length)
    changes.push({ kind: "keywords", title: "Not added (not in your resume)", detail: missing.slice(0, 8).join(", ") });
  const matchScore = keywords.length ? Math.round((matched.length / keywords.length) * 100) : 0;
  changes.push({ kind: "score", title: `Match score ${matchScore}%`, detail: `${matched.length} of ${keywords.length} job keywords covered` });
  return { data, keywords, matched, changes, matchScore, engine };
}
