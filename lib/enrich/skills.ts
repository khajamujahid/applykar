export const SKILL_DICTIONARY = [
  "python",
  "sql",
  "typescript",
  "javascript",
  "java",
  "kotlin",
  "swift",
  "ruby",
  "php",
  "rust",
  "scala",
  "c++",
  "c#",
  "golang",
  "react",
  "next.js",
  "node",
  "django",
  "flask",
  "fastapi",
  "spring",
  "rails",
  "postgres",
  "mysql",
  "snowflake",
  "bigquery",
  "redshift",
  "databricks",
  "spark",
  "airflow",
  "dbt",
  "looker",
  "tableau",
  "power bi",
  "excel",
  "aws",
  "gcp",
  "azure",
  "kubernetes",
  "docker",
  "terraform",
  "linux",
  "git",
  "graphql",
  "rest",
  "kafka",
  "redis",
  "elasticsearch",
  "mongodb",
  "pytorch",
  "tensorflow",
  "scikit-learn",
  "pandas",
  "numpy",
  "llm",
  "rag",
  "embeddings",
  "figma",
  "salesforce",
  "hubspot",
  "amplitude",
  "mixpanel",
  "segment",
  "product analytics",
  "a/b testing",
  "statistics",
  "machine learning",
  "data engineering",
  "analytics",
  "etl",
  "ci/cd",
  "security",
  "oauth",
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractSkillTags(text: string, extra: string[] = []): string[] {
  const haystack = text.toLowerCase();
  const found = new Set<string>();
  const candidates = [...SKILL_DICTIONARY, ...extra.map((skill) => skill.trim()).filter(Boolean)];
  for (const skill of candidates) {
    const needle = skill.toLowerCase();
    if (needle.length < 2) continue;
    const pattern = new RegExp(`(?:^|[^a-z0-9+#.])${escapeRegExp(needle)}(?:$|[^a-z0-9+#.])`, "i");
    if (pattern.test(haystack)) found.add(needle);
  }
  return [...found].sort();
}
