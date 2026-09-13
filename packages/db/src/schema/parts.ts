import { bigint, index, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { recordings } from "./recordings.js";

/**
 * One row per uploaded multipart part (packages/storage's
 * `multipart.ts` lifecycle: create, sign parts, complete, abort). This is
 * what makes an interrupted upload recoverable rather than just
 * detectable: on reconnect, the client asks which part numbers already
 * have a row here and resumes after the highest one instead of
 * re-uploading a recording from byte zero.
 */
export const recordingParts = pgTable(
  "recording_parts",
  {
    id: text("id").primaryKey(),
    recordingId: text("recording_id")
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    partNumber: integer("part_number").notNull(),
    /** Returned by the storage provider once the part PUT completes. */
    etag: text("etag").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    recordingPartUnique: unique("recording_parts_recording_id_part_number_key").on(
      table.recordingId,
      table.partNumber,
    ),
    recordingIdx: index("recording_parts_recording_id_idx").on(table.recordingId),
  }),
);
