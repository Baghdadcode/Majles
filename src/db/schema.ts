import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const now = () => new Date();

export const advisors = sqliteTable(
  "advisors",
  {
    id: text("id").notNull(),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    method: text("method").notNull(),
    alwaysAsks: text("always_asks", { mode: "json" }).$type<string[]>().notNull(),
    mayIgnore: text("may_ignore").notNull(),
    sections: text("sections", { mode: "json" }).$type<string[]>().notNull(),
    model: text("model").notNull(),
    effort: text("effort").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
  },
  (t) => [primaryKey({ columns: [t.id, t.version] })],
);

export const councils = sqliteTable("councils", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
});

export const councilSeats = sqliteTable(
  "council_seats",
  {
    councilId: text("council_id").notNull(),
    advisorId: text("advisor_id").notNull(),
    advisorVersion: integer("advisor_version").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.councilId, t.advisorId] })],
);

export const briefs = sqliteTable("briefs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  question: text("question").notNull(),
  councilId: text("council_id").notNull(),
  briefId: text("brief_id"),
  /** Snapshot so a session keeps the brief it actually saw, and when that brief was last edited. */
  briefContent: text("brief_content"),
  briefUpdatedAt: integer("brief_updated_at", { mode: "timestamp_ms" }),
  mode: text("mode").notNull(),
  effectiveMode: text("effective_mode").notNull(),
  state: text("state").notNull(),
  error: text("error"),
  winnerAnswerId: text("winner_answer_id"),
  marginFraction: real("margin_fraction"),
  closeRace: integer("close_race", { mode: "boolean" }),
  totalCostUsd: real("total_cost_usd").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
});

export const answers = sqliteTable("answers", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  advisorId: text("advisor_id").notNull(),
  advisorVersion: integer("advisor_version").notNull(),
  /** Neutral label the chairman saw (A, B, ...). Null for failed answers. */
  label: text("label"),
  text: text("text"),
  status: text("status").notNull(), // ok | failed
  error: text("error"),
});

export const rankings = sqliteTable("rankings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull(),
  reviewerAdvisorId: text("reviewer_advisor_id").notNull(),
  /** "Reviewer N" as the chairman saw it. */
  reviewerLabel: text("reviewer_label").notNull().default(""),
  answerId: text("answer_id").notNull(),
  label: text("label").notNull(),
  rank: integer("rank").notNull(),
  points: integer("points").notNull(),
  correctness: integer("correctness").notNull(),
  reasoningQuality: integer("reasoning_quality").notNull(),
  usefulness: integer("usefulness").notNull(),
  risksCovered: integer("risks_covered").notNull(),
  reasoning: text("reasoning").notNull(),
});

export const verdicts = sqliteTable("verdicts", {
  sessionId: text("session_id").primaryKey(),
  text: text("text").notNull(),
  chairmanAdvisorId: text("chairman_advisor_id").notNull(),
  mode: text("mode").notNull(),
});

export const usage = sqliteTable("usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull(),
  stage: text("stage").notNull(),
  advisorId: text("advisor_id"),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  cacheReadTokens: integer("cache_read_tokens").notNull(),
  cacheWriteTokens: integer("cache_write_tokens").notNull(),
  costUsd: real("cost_usd").notNull(),
  stopReason: text("stop_reason"),
  fellBack: integer("fell_back", { mode: "boolean" }).notNull(),
});
