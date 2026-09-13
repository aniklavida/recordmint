import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { recordings } from "./recordings.js";
import { users } from "./users.js";

/**
 * A per-recording view log (SPEC.md §6, `[assumed]`), one row per playback
 * session. `viewerUserId` is null for an anonymous viewer on a shared
 * link — that is expected, not an error state, since most viewers of an
 * unlisted link are never authenticated at all.
 */
export const viewEvents = pgTable(
  "view_events",
  {
    id: text("id").primaryKey(),
    recordingId: text("recording_id")
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    viewerUserId: text("viewer_user_id").references(() => users.id, { onDelete: "set null" }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    recordingIdx: index("view_events_recording_id_idx").on(table.recordingId),
  }),
);
