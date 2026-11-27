/** Parses public board lists (CSV / TSV / JSON / JSONL / Markdown) into board refs plus company names. */
import type { BoardSource } from "@/lib/domain";
import { BOARD_SOURCES } from "@/lib/domain";
import { extractBoards, normaliseSlug, type BoardRef } from "@/lib/discovery/extract";

const ALIASES: Record<string, BoardSource> = {
  greenhouse: "greenhouse", greenhouseio: "greenhouse", gh: "greenhouse", g: "greenhouse",
  lever: "lever", leverco: "lever", l: "lever",
  ashby: "ashby", ashbyhq: "ashby", a: "ashby",
  smartrecruiters: "smartrecruiters", smartrecruiter: "smartrecruiters", sr: "smartrecruiters", s: "smartrecruiters",
  workable: "workable", w: "workable",
  workday: "workday", myworkdayjobs: "workday",
  icims: "icims", recruitee: "recruitee", bamboohr: "bamboohr", bamboo: "bamboohr",
  breezy: "breezy", breezyhr: "breezy", rippling: "rippling", jazzhr: "jazzhr", applytojob: "jazzhr", jazz: "jazzhr",
};
const SOURCE_KEYS = ["ats", "ats_vendor", "vendor", "source", "platform", "provider", "ats_type", "ats_name", "ats_provider", "system"];
const SLUG_KEYS = ["slug", "board_slug", "board", "board_token", "token", "company_slug", "identifier", "handle", "board_id", "tenant", "ats_slug", "ats_id"];
const NAME_KEYS = ["name", "company", "company_name", "companyname", "organization", "org", "employer"];

export type ParsedList = { refs: BoardRef[]; names: string[] };

function alias(value: unknown): BoardSource | null {
  if (typeof value !== "string") return null;
  return ALIASES[value.toLowerCase().replace(/[^a-z]/g, "")] ?? null;
}

function fromFields(get: (keys: string[]) => unknown, fileSource: BoardSource | null): { ref?: BoardRef; name?: string } {
  const nameValue = get(NAME_KEYS);
  const name = typeof nameValue === "string" && nameValue.length >= 2 && nameValue.length <= 120 ? nameValue.trim() : undefined;
  const source = alias(get(SOURCE_KEYS)) ?? fileSource;
  const slugValue = get(SLUG_KEYS);
  if (!source || typeof slugValue !== "string") return { name };
  if (source === "workday" && !/^[a-z0-9-]+\.wd\d+\/[A-Za-z0-9_-]+$/.test(slugValue)) return { name };
  const slug = normaliseSlug(source, slugValue);
  return slug ? { ref: { source, slug, name }, name } : { name };
}

function csvRow(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) out.push(cur), (cur = "");
    else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

/** fileSource: the ATS a file is about (from its name), or "names" when it lists companies on an ATS we don't read. */
export function parseList(text: string, path: string): ParsedList {
  const base = path.split("/").pop()!.toLowerCase().replace(/\.(gz)$/, "");
  const stem = base.replace(/\.[a-z]+$/, "");
  const fileSource = alias(stem);
  const refs = new Map<string, BoardRef>();
  const names = new Set<string>();
  const add = (r: { ref?: BoardRef; name?: string }) => {
    if (r.ref) refs.set(`${r.ref.source}\t${r.ref.slug}`, r.ref);
    if (r.name) names.add(r.name);
  };
  for (const ref of extractBoards(text)) refs.set(`${ref.source}\t${ref.slug}`, ref);

  if (/\.(csv|tsv)$/.test(base)) {
    const lines = text.split(/\r?\n/);
    const sep = base.endsWith(".tsv") || (lines[0] ?? "").includes("\t") ? "\t" : ",";
    const header = csvRow(lines[0] ?? "", sep).map((h) => h.toLowerCase().replace(/[^a-z_]/g, ""));
    const idx = (keys: string[]) => header.findIndex((h) => keys.includes(h));
    const cols = { source: idx(SOURCE_KEYS), slug: idx(SLUG_KEYS), name: idx(NAME_KEYS) };
    if (cols.slug >= 0 || cols.name >= 0) {
      for (const line of lines.slice(1)) {
        if (!line) continue;
        const row = csvRow(line, sep);
        add(fromFields((keys) => {
          const kind = keys === SOURCE_KEYS ? cols.source : keys === SLUG_KEYS ? cols.slug : cols.name;
          return kind >= 0 ? row[kind] : undefined;
        }, fileSource));
      }
    }
  } else if (/\.(json|jsonl|ndjson)$/.test(base)) {
    const docs: unknown[] = [];
    try {
      docs.push(JSON.parse(text));
    } catch {
      for (const line of text.split("\n")) {
        try {
          if (line.trim()) docs.push(JSON.parse(line));
        } catch {
          /* skip */
        }
      }
    }
    let budget = 3_000_000;
    const walk = (node: unknown) => {
      if (budget-- <= 0 || node === null || typeof node !== "object") return;
      if (Array.isArray(node)) {
        // compact form: ["g", "Company", "slug"]
        if (node.length === 3 && typeof node[0] === "string" && node[0].length <= 2 && typeof node[2] === "string") {
          const source = alias(node[0]);
          if (source) return add(fromFields((keys) => (keys === SOURCE_KEYS ? source : keys === SLUG_KEYS ? node[2] : node[1]), source));
        }
        for (const item of node) walk(item);
        return;
      }
      const obj = node as Record<string, unknown>;
      const lower = new Map(Object.keys(obj).map((k) => [k.toLowerCase(), k]));
      const get = (keys: string[]) => {
        for (const key of keys) if (lower.has(key)) return obj[lower.get(key)!];
        return undefined;
      };
      if (get(SLUG_KEYS) !== undefined || get(NAME_KEYS) !== undefined) add(fromFields(get, fileSource));
      for (const value of Object.values(obj)) if (value && typeof value === "object") walk(value);
    };
    docs.forEach(walk);
  }
  return { refs: [...refs.values()].filter((r) => (BOARD_SOURCES as readonly string[]).includes(r.source)), names: [...names] };
}
