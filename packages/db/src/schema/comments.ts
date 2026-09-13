import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { index, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import { recordings } from "./recordings.js";
import { users } from "./users.js";

/**
 * Timestamped against the playhead, threaded one level deep
 * (SPEC.md §13, `[assumed]`). The one-level limit is enforced by the
 * application, not the schema — `parentCommentId` is a plain
 * self-reference so the database does not need to know the rule to store
 * the data correctly.
 *
 * Either `authorUserId` (a workspace member) or `guestName` (a viewer on
 * a shared link with guest commenting enabled) is set, never neither.
 */
export const comments = pgTable(
  "comments",
  {
    id: text("id").primaryKey(),
    recordingId: text("recording_id")
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    parentCommentId: text("parent_comment_id").references((): AnyPgColumn => comments.id, {
      onDelete: "cascade",
    }),
    authorUserId: text("author_user_id").references(() => users.id, { onDelete: "set null" }),
    guestName: text("guest_name"),
    timestampSeconds: real("timestamp_seconds").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    recordingIdx: index("comments_recording_id_idx").on(table.recordingId),
    parentIdx: index("comments_parent_comment_id_idx").on(table.parentCommentId),
  }),
);
