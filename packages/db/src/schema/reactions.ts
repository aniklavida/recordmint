import { index, integer, pgEnum, pgTable, real, text, timestamp, unique } from "drizzle-orm/pg-core";
import { recordings } from "./recordings.js";
import { users } from "./users.js";

/**
 * A small fixed set, deliberately not free-form — an open emoji picker
 * turns a quick reaction into a second comment box with none of a
 * comment's accountability. Five common reactions (`[assumed]`) is
 * enough to say "I saw this" without becoming a second discussion
 * surface; the enum is the enforcement, not a client-side allow list
 * that a direct API call could bypass.
 */
export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "👏"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];
export const reactionEmojiEnum = pgEnum("reaction_emoji", REACTION_EMOJIS);

/**
 * Reactions are timestamped against the playhead like comments, but
 * bucketed into a short window rather than stored to the millisecond —
 * limiting a viewer to one of each emoji per moment is meaningless
 * against a raw float, since two clicks a frame apart would never
 * collide. `[assumed]` at 5 seconds: long enough that a viewer
 * reacting twice to the same moment is almost certainly the same
 * reaction repeated, short enough that it never merges two different
 * moments a viewer meant to mark separately.
 */
export const REACTION_TIMESTAMP_WINDOW_SECONDS = 5;

export function reactionTimestampWindow(timestampSeconds: number): number {
  return Math.floor(timestampSeconds / REACTION_TIMESTAMP_WINDOW_SECONDS);
}

/**
 * One row per (recording, emoji, timestamp window, reactor) — the unique
 * constraint below is what actually enforces "one of each emoji per
 * timestamp window per viewer," not application-level discipline that a
 * second concurrent request could race past.
 *
 * `reactorKey` is the one identity reactions need that comments do not:
 * a comment's guest is identified by the display name it carries on the
 * row itself, but a reaction carries no name to show, so per-viewer
 * limiting and rate-limiting need something to key on regardless of
 * whether the viewer is a member. For a signed-in viewer that is
 * `user:<userId>`; for a guest — a reaction has no password or account
 * to prove identity with — it is `guest:<sha256 of the request's source
 * IP>` (`../queries/reactions.ts`), hashed rather than stored raw so this
 * table never holds a plain IP address at rest. `reactorUserId` is kept
 * alongside only so a cascading user deletion cleans up correctly; it is
 * never read back to display who reacted — reactions are anonymous
 * markers, not attributed the way a comment is.
 */
export const reactions = pgTable(
  "reactions",
  {
    id: text("id").primaryKey(),
    recordingId: text("recording_id")
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    emoji: reactionEmojiEnum("emoji").notNull(),
    timestampSeconds: real("timestamp_seconds").notNull(),
    timestampWindow: integer("timestamp_window").notNull(),
    reactorUserId: text("reactor_user_id").references(() => users.id, { onDelete: "set null" }),
    reactorKey: text("reactor_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    recordingIdx: index("reactions_recording_id_idx").on(table.recordingId),
    reactorKeyIdx: index("reactions_reactor_key_idx").on(table.reactorKey),
    onePerWindowPerReactor: unique("reactions_recording_emoji_window_reactor_key").on(
      table.recordingId,
      table.emoji,
      table.timestampWindow,
      table.reactorKey,
    ),
  }),
);
