export type AtsName = "greenhouse" | "lever" | "workday" | "icims" | "unknown";
export type MailKind = "verification" | "confirmation" | "interview" | "rejection" | "other";

export type InboundEmail = {
  to: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
  messageId?: string | null;
  receivedAt?: Date | null;
};

export type ExtractedMail = {
  ats: AtsName;
  kind: MailKind;
  employer: string | null;
  code: string | null;
  verifyUrl: string | null;
};

const CODE =
  /(?:verification code|one-time passcode|one time passcode|passcode|security code|enter this code|your code)(?:\s+is|\s*:)?\s*([0-9]{4,8})\b/i;

const CONFIRMATION =
  /thank you for applying|application (?:was|has been) (?:submitted|received)|we received your application|successfully submitted your application|your application has been received/i;

export function detectAts(from: string, text: string): AtsName {
  const blob = `${from}\n${text}`.toLowerCase();
  if (blob.includes("greenhouse.io") || blob.includes("greenhouse-mail")) return "greenhouse";
  if (blob.includes("lever.co")) return "lever";
  if (blob.includes("myworkday.com") || blob.includes("workday.com")) return "workday";
  if (blob.includes("icims.com")) return "icims";
  return "unknown";
}

export function extractCode(text: string): string | null {
  const match = CODE.exec(text);
  return match?.[1] ?? null;
}

export function extractVerifyUrl(text: string): string | null {
  const links = text.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  let best: { url: string; score: number } | null = null;
  for (const raw of links) {
    const url = raw.replace(/[),.;]+$/, "");
    const lowered = url.toLowerCase();
    let score = 0;
    if (/verify|confirm|activate|validation|one-time|otp/.test(lowered)) score += 3;
    if (/token=|code=/.test(lowered)) score += 2;
    if (/greenhouse|lever\.co|myworkday|icims/.test(lowered)) score += 1;
    if (score === 0) continue;
    if (!best || score > best.score) best = { url, score };
  }
  return best?.url ?? null;
}

export function extractEmployer(subject: string, text: string): string | null {
  const blob = `${subject}\n${text}`;
  const patterns = [
    /applying to .+?\bat\s+([A-Za-z0-9][A-Za-z0-9&.'’ -]{1,60})/i,
    /application to the .+?\brole at\s+([A-Za-z0-9][A-Za-z0-9&.'’ -]{1,60})/i,
    /applying to\s+([A-Za-z0-9][A-Za-z0-9&.'’ -]{1,60})/i,
    /candidate account(?:\s+for|\s+at)\s+([A-Za-z0-9][A-Za-z0-9&.'’ -]{1,60})/i,
    /your application to\s+([A-Za-z0-9][A-Za-z0-9&.'’ -]{1,60})/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(blob);
    const employer = cleanEmployer(match?.[1] ?? "");
    if (employer) return employer;
  }
  return null;
}

function cleanEmployer(value: string): string | null {
  const cleaned = value.replace(/\s+(role|position|job|team)$/i, "").replace(/[.\s]+$/, "").trim();
  if (cleaned.length < 2) return null;
  if (/^(the|your|this|email|account)$/i.test(cleaned)) return null;
  return cleaned;
}

export function extractApplicationMail(input: { from: string; subject: string; text: string; html?: string }): ExtractedMail {
  const text = `${input.subject}\n${input.text}\n${stripHtml(input.html ?? "")}`;
  const code = extractCode(text);
  const verifyUrl = extractVerifyUrl(`${input.text}\n${input.html ?? ""}`);
  const confirmation = CONFIRMATION.test(text);
  const rejection = /unfortunately|not moving forward|other candidates|not be proceeding|regret to inform|application was not selected|we won't be moving forward/i.test(text);
  const interview = /invite you to (?:an )?interview|schedule (?:an )?interview|phone screen|interview invitation/i.test(text);
  const kind: MailKind = rejection ? "rejection" : interview ? "interview" : code || (verifyUrl && !confirmation) ? "verification" : confirmation ? "confirmation" : "other";
  return {
    ats: detectAts(input.from, text),
    kind,
    employer: extractEmployer(input.subject, input.text),
    code,
    verifyUrl,
  };
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseRawEmail(raw: string): InboundEmail {
  const splitAt = raw.search(/\r?\n\r?\n/);
  const headerBlock = splitAt >= 0 ? raw.slice(0, splitAt) : raw;
  const body = splitAt >= 0 ? raw.slice(splitAt).replace(/^\r?\n\r?\n/, "") : "";
  const headers = unfoldHeaders(headerBlock);
  return {
    from: headers.get("from") ?? "",
    to: headers.get("to") ?? "",
    subject: headers.get("subject") ?? "",
    messageId: headers.get("message-id"),
    text: body.trim(),
  };
}

function unfoldHeaders(block: string): Map<string, string> {
  const lines = block.replace(/\r\n/g, "\n").split("\n");
  const folded: string[] = [];
  for (const line of lines) {
    if (/^\s/.test(line) && folded.length) folded[folded.length - 1] += ` ${line.trim()}`;
    else folded.push(line);
  }
  const headers = new Map<string, string>();
  for (const line of folded) {
    const index = line.indexOf(":");
    if (index < 0) continue;
    headers.set(line.slice(0, index).trim().toLowerCase(), line.slice(index + 1).trim());
  }
  return headers;
}

export function normalizeWebhookPayload(body: unknown): InboundEmail | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const mail = record.mail && typeof record.mail === "object" ? (record.mail as Record<string, unknown>) : record;
  const to = stringField(mail.to) ?? stringField(mail.recipient);
  const from = stringField(mail.from) ?? stringField(mail.sender);
  if (!to || !from) return null;
  return {
    to,
    from,
    subject: stringField(mail.subject) ?? "",
    text: stringField(mail.text) ?? stringField(mail.textBody) ?? stringField(mail.plain) ?? "",
    html: stringField(mail.html) ?? undefined,
    messageId: stringField(mail.messageId) ?? stringField(mail.message_id),
    receivedAt: parseDate(mail.receivedAt ?? mail.date),
  };
}

function stringField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function applicationAddress(name: string, domain = process.env.INBOX_DOMAIN): string | null {
  const host = domain?.trim().replace(/^@/, "");
  if (!host) return null;
  const local = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".");
  return `${local || "profile"}@${host}`;
}
