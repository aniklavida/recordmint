import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { recordings } from "./recordings.js";

/**
 * Transcription is optional, can be disabled entirely, and its failure is
 * non-fatal to the recording — which is why it is its own table rather
 * than a column group on `recordings`:
 * a recording with no transcript row, or one stuck at "failed", is still
 * a completely normal, playable recording.
 */
export const transcriptStatusEnum = pgEnum("transcript_status", ["pending", "ready", "failed"]);

export const transcripts = pgTable("transcripts", {
  id: text("id").primaryKey(),
  recordingId: text("recording_id")
    .notNull()
    .unique()
    .references(() => recordings.id, { onDelete: "cascade" }),
  status: transcriptStatusEnum("status").notNull().default("pending"),
  language: text("language"),
  /** packages/storage's `transcriptKey(recordingId)`, once the WebVTT file exists. */
  objectKey: text("object_key"),
  /**
   * Plain concatenated text of every cue, written alongside the WebVTT
   * file. This is what the recording library's search matches against —
   * search *within* one recording instead parses the WebVTT cues on
   * demand for their timestamps, so this column only has to answer
   * "does this recording mention X", not "where".
   */
  text: text("text"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
