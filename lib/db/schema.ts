import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const vector = customType<{ data: number[] | null; driverData: string | null }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value) {
    if (!value) return null;
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    if (!value) return null;
    const inner = value.replace(/^\[/, "").replace(/\]$/, "");
    if (!inner) return [];
    return inner.split(",").map((part) => Number(part));
  },
});

export const jobSource = pgEnum("job_source", [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workable",
  "adzuna",
  "usajobs",
  "jsearch",
  "captured",
]);

export const workplace = pgEnum("workplace", ["remote", "hybrid", "onsite", "unknown"]);
export const seniority = pgEnum("seniority", [
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
  "director",
  "vp",
  "cxo",
  "unknown",
]);
export const usScope = pgEnum("us_scope", ["us", "non_us", "unknown"]);
export const salaryInterval = pgEnum("salary_interval", ["year", "hour"]);
export const applicationStatus = pgEnum("application_status", [
  "queued",
  "ready_for_review",
  "applied",
  "interview",
  "rejected",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
};

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    source: jobSource("source").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    careersUrl: text("careers_url"),
    apiUrl: text("api_url"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: "date" }),
    lastError: text("last_error"),
    createdAt: timestamps.createdAt,
  },
  (table) => [uniqueIndex("companies_source_slug_idx").on(table.source, table.slug)],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    source: jobSource("source").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    companyName: text("company_name").notNull(),
    descriptionText: text("description_text").notNull().default(""),
    locationRaw: text("location_raw"),
    city: text("city"),
    region: text("region"),
    country: text("country"),
    workplace: workplace("workplace").notNull().default("unknown"),
    seniority: seniority("seniority").notNull().default("unknown"),
    usScope: usScope("us_scope").notNull().default("unknown"),
    yoeMin: integer("yoe_min"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryCurrency: text("salary_currency"),
    salaryInterval: salaryInterval("salary_interval"),
    w2Only: boolean("w2_only").notNull().default(false),
    c2cFriendly: boolean("c2c_friendly").notNull().default(false),
    noSponsorship: boolean("no_sponsorship").notNull().default(false),
    skillTags: text("skill_tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    applyUrl: text("apply_url").notNull(),
    sourceUrl: text("source_url"),
    postedAt: timestamp("posted_at", { withTimezone: true, mode: "date" }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    staleAt: timestamp("stale_at", { withTimezone: true, mode: "date" }),
    contentHash: text("content_hash").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    duplicateOf: uuid("duplicate_of"),
    embedding: vector("embedding"),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
  },
  (table) => [
    uniqueIndex("jobs_source_external_idx").on(table.source, table.externalId),
    index("jobs_dedupe_idx").on(table.dedupeKey),
    index("jobs_feed_idx").on(table.staleAt, table.postedAt),
    index("jobs_company_idx").on(table.companyId),
  ],
);

const textArray = (name: string) =>
  text(name)
    .array()
    .notNull()
    .default(sql`'{}'::text[]`);

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  headline: text("headline"),
  skills: textArray("skills"),
  targetTitles: textArray("target_titles"),
  locations: textArray("locations"),
  interests: textArray("interests"),
  seniorityFilters: textArray("seniority_filters"),
  yearsExperience: integer("years_experience"),
  yoeMax: integer("yoe_max"),
  visaStatus: text("visa_status").notNull(),
  needsSponsorship: boolean("needs_sponsorship").notNull().default(false),
  openToRelocate: boolean("open_to_relocate").notNull().default(true),
  salaryMin: integer("salary_min").notNull().default(95000),
  salaryMax: integer("salary_max").notNull().default(120000),
  c2cMinHourly: integer("c2c_min_hourly").notNull().default(65),
  availableImmediately: boolean("available_immediately").notNull().default(true),
  usaOnly: boolean("usa_only").notNull().default(true),
  prefersC2c: boolean("prefers_c2c").notNull().default(true),
  skipW2Only: boolean("skip_w2_only").notNull().default(true),
  includeLeadership: boolean("include_leadership").notNull().default(false),
  resumeFilename: text("resume_filename"),
  resumeText: text("resume_text").notNull().default(""),
  applicationEmail: text("application_email"),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  embedding: vector("embedding"),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
});

export const ownerSettings = pgTable("owner_settings", {
  id: text("id").primaryKey().default("owner"),
  email: text("email"),
  activeProfileId: uuid("active_profile_id").references(() => profiles.id, { onDelete: "set null" }),
  updatedAt: timestamps.updatedAt,
});

export const standardAnswers = pgTable(
  "standard_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    updatedAt: timestamps.updatedAt,
  },
  (table) => [uniqueIndex("standard_answers_profile_key_idx").on(table.profileId, table.key)],
);

export const jobStates = pgTable(
  "job_states",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    saved: boolean("saved").notNull().default(false),
    hidden: boolean("hidden").notNull().default(false),
    updatedAt: timestamps.updatedAt,
  },
  (table) => [primaryKey({ columns: [table.profileId, table.jobId] })],
);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    status: applicationStatus("status").notNull().default("queued"),
    proofNote: text("proof_note"),
    proofUrl: text("proof_url"),
    answerPacket: text("answer_packet"),
    whyThisRole: text("why_this_role"),
    notes: text("notes"),
    appliedAt: timestamp("applied_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (table) => [uniqueIndex("applications_profile_job_idx").on(table.profileId, table.jobId)],
);

export const inboxMessages = pgTable(
  "inbox_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
    recipient: text("recipient").notNull(),
    sender: text("sender").notNull(),
    subject: text("subject").notNull().default(""),
    textBody: text("text_body").notNull().default(""),
    messageId: text("message_id"),
    ats: text("ats").notNull().default("unknown"),
    kind: text("kind").notNull().default("other"),
    employer: text("employer"),
    verificationCode: text("verification_code"),
    verifyUrl: text("verify_url"),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    uniqueIndex("inbox_messages_message_id_idx").on(table.messageId),
    index("inbox_messages_profile_idx").on(table.profileId, table.receivedAt),
  ],
);

export const bulkRuns = pgTable("bulk_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  requested: integer("requested").notNull(),
  status: text("status").notNull().default("queued"),
  createdAt: timestamps.createdAt,
  finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
});

export const bulkItems = pgTable("bulk_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .notNull()
    .references(() => bulkRuns.id, { onDelete: "cascade" }),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  companyName: text("company_name").notNull(),
  title: text("title").notNull(),
  applyUrl: text("apply_url").notNull(),
  source: text("source").notNull(),
  status: text("status").notNull().default("queued"),
  detail: text("detail"),
  proofNote: text("proof_note"),
  missingQuestions: text("missing_questions")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  updatedAt: timestamps.updatedAt,
});

export const mailConnections = pgTable("mail_connections", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  email: text("email"),
  refreshToken: text("refresh_token"),
  accessToken: text("access_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  imapHost: text("imap_host"),
  imapPort: integer("imap_port"),
  imapUser: text("imap_user"),
  imapPassword: text("imap_password"),
  imapTls: boolean("imap_tls").notNull().default(true),
  updatedAt: timestamps.updatedAt,
});

export const filterPresets = pgTable("filter_presets", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  query: text("query").notNull().default(""),
  createdAt: timestamps.createdAt,
});

export const extensionTokens = pgTable("extension_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  label: text("label"),
  createdAt: timestamps.createdAt,
});

export const ingestRuns = pgTable("ingest_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source"),
  companyId: uuid("company_id"),
  status: text("status").notNull(),
  added: integer("added").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  staled: integer("staled").notNull().default(0),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
});
