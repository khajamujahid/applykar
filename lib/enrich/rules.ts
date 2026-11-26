import type { Enrichment, Salary, Seniority, UsScope, Workplace } from "@/lib/domain";
import { extractSkillTags } from "@/lib/enrich/skills";

const SENIORITY_RANK: Seniority[] = [
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
  "director",
  "vp",
  "cxo",
];

const SENIORITY_PATTERNS: { seniority: Seniority; pattern: RegExp }[] = [
  { seniority: "intern", pattern: /\bintern(ship)?\b/i },
  { seniority: "junior", pattern: /\b(junior|jr\.?|entry[- ]level|new grad|associate)\b/i },
  { seniority: "senior", pattern: /\b(senior|sr\.?|lead)\b/i },
  { seniority: "staff", pattern: /\bstaff\b/i },
  { seniority: "principal", pattern: /\bprincipal\b/i },
  { seniority: "director", pattern: /\bdirector\b/i },
  { seniority: "vp", pattern: /\b(vp|vice president|head of)\b/i },
  { seniority: "cxo", pattern: /\b(chief|ceo|cto|cfo|cpo|cio|ciso|coo)\b/i },
];

const US_STATE_NAMES =
  "alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia";

const NON_US_PLACES =
  "united kingdom|england|scotland|wales|london|germany|deutschland|france|paris|india|bangalore|canada|toronto|vancouver|australia|sydney|singapore|japan|tokyo|netherlands|amsterdam|ireland|dublin|brazil|mexico|spain|madrid|italy|sweden|stockholm|norway|denmark|finland|poland|portugal|israel|china|beijing|korea|seoul|taiwan|switzerland|geneva|zurich|europe|european union|uae|dubai|emea|apac|latam|latin america|berlin|munich|amsterdam|bengaluru|hyderabad|pune";

const ISO_NON_US = new Set([
  "gb",
  "uk",
  "fr",
  "de",
  "in",
  "ca",
  "jp",
  "ch",
  "nl",
  "au",
  "sg",
  "br",
  "mx",
  "es",
  "ie",
  "se",
  "no",
  "dk",
  "fi",
  "pl",
  "pt",
  "il",
  "ae",
  "cn",
  "kr",
  "tw",
  "it",
  "be",
  "at",
  "nz",
  "za",
  "eu",
]);

export function detectSeniority(title: string): Seniority {
  let best: Seniority = "unknown";
  let bestRank = -1;
  for (const rule of SENIORITY_PATTERNS) {
    if (!rule.pattern.test(title)) continue;
    const rank = SENIORITY_RANK.indexOf(rule.seniority);
    if (rank > bestRank) {
      best = rule.seniority;
      bestRank = rank;
    }
  }
  if (best !== "unknown") return best;
  if (/\b(engineer|developer|designer|analyst|scientist)\s+(iii|3)\b/i.test(title)) return "senior";
  if (/\b(engineer|developer|designer|analyst|scientist)\s+(ii|2)\b/i.test(title)) return "mid";
  if (/\b(engineer|developer|designer|analyst|scientist)\s+(i|1)\b/i.test(title)) return "junior";
  return "unknown";
}

export function parseYoe(text: string): number | null {
  const mins: number[] = [];
  const collect = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (parsed > 0 && parsed <= 20) mins.push(parsed);
  };
  let remaining = text;
  for (const match of text.matchAll(/(\d+)\s*(?:-|–|—|to)\s*(\d+)\s*(?:years|yrs)\b/gi)) {
    const value = match[1];
    if (value) collect(value);
    remaining = remaining.replace(match[0], " ");
  }
  for (const match of remaining.matchAll(/(\d+)\s*(?:\+|plus)\s*(?:years|yrs)\b/gi)) {
    const value = match[1];
    if (value) collect(value);
  }
  for (const match of remaining.matchAll(/(?:at least|minimum(?: of)?|min\.?)\s*(\d+)\s*(?:years|yrs)\b/gi)) {
    const value = match[1];
    if (value) collect(value);
  }
  for (const match of remaining.matchAll(/(\d+)\s*(?:years|yrs)\s+(?:of\s+)?(?:relevant\s+)?(?:professional\s+)?experience\b/gi)) {
    const value = match[1];
    if (value) collect(value);
  }
  if (mins.length === 0) return null;
  return Math.max(...mins);
}

function amount(raw: string, kilo: boolean): number {
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value)) return Number.NaN;
  return kilo ? value * 1000 : value;
}

export function parseSalary(text: string): Salary {
  const empty: Salary = { min: null, max: null, currency: null, interval: null };
  if (!text.trim()) return empty;
  const range =
    /(?:\$|usd\s*)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*(?:-|–|—|to)\s*(?:\$|usd\s*)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?/i;
  const single =
    /(?:\$|usd\s*)\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?|(\d[\d,]*(?:\.\d+)?)\s*(k)\b|(\d{5,7})\s*(?:usd|a year|per year)/i;
  const matchedRange = range.exec(text);
  const window = (index: number, length: number) =>
    text.slice(Math.max(0, index - 24), Math.min(text.length, index + length + 24));
  const hourly = (slice: string) => /(?:per\s*hour|\/\s*hr|\/\s*hour|an hour|hourly)/i.test(slice);

  if (matchedRange?.[1] && matchedRange[3]) {
    const slice = window(matchedRange.index, matchedRange[0].length);
    const hour = hourly(slice);
    const min = amount(matchedRange[1], Boolean(matchedRange[2]) && !hour);
    const max = amount(matchedRange[3], Boolean(matchedRange[4]) && !hour);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return empty;
    return {
      min: Math.min(min, max),
      max: Math.max(min, max),
      currency: "USD",
      interval: hour ? "hour" : "year",
    };
  }

  const matched = single.exec(text);
  if (!matched) return empty;
  const raw = matched[1] ?? matched[3] ?? matched[5];
  const kilo = Boolean(matched[2] || matched[4]);
  if (!raw) return empty;
  const slice = window(matched.index, matched[0].length);
  const hour = hourly(slice);
  const value = amount(raw, kilo && !hour);
  if (!Number.isFinite(value)) return empty;
  if (!hour && !kilo && value < 1000) return empty;
  if (hour && value > 1000) return empty;
  return { min: value, max: value, currency: "USD", interval: hour ? "hour" : "year" };
}

export function detectWorkplace(hint: Workplace, text: string): Workplace {
  if (hint !== "unknown") return hint;
  if (/\bhybrid\b/i.test(text)) return "hybrid";
  if (/\bremote\b/i.test(text)) return "remote";
  if (/\bon-?site\b|\bin[- ]office\b|\bin person\b/i.test(text)) return "onsite";
  return "unknown";
}

function hasUsSignal(text: string): boolean {
  if (/\b(united states|u\.s\.a\.|u\.s\.|usa)\b/i.test(text)) return true;
  if (/\bremote\b[^.]{0,24}\b(us|usa|united states)\b/i.test(text)) return true;
  if (new RegExp(`\\b(${US_STATE_NAMES})\\b`, "i").test(text)) return true;
  return /(?:,\s*|\s)(AL|AK|AZ|AR|CA|CO|CT|DC|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b/.test(
    text,
  );
}

function hasNonUsSignal(text: string): boolean {
  return new RegExp(`\\b(${NON_US_PLACES})\\b`, "i").test(text);
}

export function detectUsScope(input: {
  location?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  description?: string | null;
}): UsScope {
  const country = (input.country ?? "").trim().toLowerCase();
  if (country === "us" || country === "usa" || country === "united states" || country === "united states of america") {
    return "us";
  }
  if (ISO_NON_US.has(country) || hasNonUsSignal(country)) return "non_us";

  const place = [input.location, input.city, input.region].filter(Boolean).join(", ");
  const placeUs = place ? hasUsSignal(place) : false;
  const placeNonUs = place ? hasNonUsSignal(place) : false;
  if (placeUs && !placeNonUs) return "us";
  if (placeNonUs && !placeUs) return "non_us";
  if (placeUs && placeNonUs) return "us";

  const description = input.description ?? "";
  if (
    /\b(must be (?:located|based) in the (?:us|usa|united states)|united states only|us only|remote within the united states)\b/i.test(
      description,
    )
  ) {
    return "us";
  }
  return "unknown";
}

export function detectW2Only(text: string): boolean {
  return /\bw-?2 only\b|\bno c2c\b|\bno corp(?:orate)?[- ]to[- ]corp\b|\bno 1099\b|\bw-?2 employees only\b|\bdirect hire only\b/i.test(
    text,
  );
}

export function detectC2cFriendly(text: string): boolean {
  if (/\bno c2c\b|\bno corp(?:orate)?[- ]to[- ]corp\b|\bno 1099\b/i.test(text)) return false;
  return /\bc2c\b|\bcorp(?:orate)?[- ]to[- ]corp\b|\b1099\b|\bcontract(?:or)?[- ]to[- ]hire\b/i.test(text);
}

export function detectNoSponsorship(text: string): boolean {
  if (/\b(visa sponsorship(?: is)? available|will sponsor|sponsorship available|we sponsor)\b/i.test(text)) {
    return false;
  }
  return /\bno (?:visa )?sponsorship\b|\bnot (?:able to |currently )?sponsor\b|\bwithout (?:visa )?sponsorship\b|\bdo not sponsor\b|\bunable to sponsor\b|\bmust be authorized to work\b|\bus citizen(?:ship)? (?:only|required)\b/i.test(
    text,
  );
}

export function enrichJob(input: {
  title: string;
  descriptionText: string;
  locationRaw?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  workplaceHint?: Workplace;
  salary?: Salary | null;
  extraSkills?: string[];
}): Enrichment {
  const blob = `${input.title}\n${input.locationRaw ?? ""}\n${input.descriptionText}`;
  const salary = input.salary?.min != null || input.salary?.max != null ? input.salary : parseSalary(blob);
  return {
    seniority: detectSeniority(input.title),
    yoeMin: parseYoe(input.descriptionText),
    workplace: detectWorkplace(input.workplaceHint ?? "unknown", blob),
    usScope: detectUsScope({
      location: input.locationRaw,
      city: input.city,
      region: input.region,
      country: input.country,
      description: input.descriptionText,
    }),
    salary: salary ?? { min: null, max: null, currency: null, interval: null },
    w2Only: detectW2Only(blob),
    c2cFriendly: detectC2cFriendly(blob),
    noSponsorship: detectNoSponsorship(blob),
    skillTags: extractSkillTags(blob, input.extraSkills ?? []),
  };
}
