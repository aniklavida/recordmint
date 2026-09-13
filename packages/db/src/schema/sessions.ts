import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * The session row is the entire auth story: a session table, an httpOnly
 * `SameSite=Lax` cookie and Argon2id hashing, with no access/refresh
 * token pair anywhere in the design.
 *
 * `id` is the opaque, high-entropy value handed to the browser as the
 * cookie itself. There is no separate refresh token and no JWT anywhere
 * in this table — issuing a session is one insert, ending it is one
 * delete, and there is nothing to rotate.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("sessions_user_id_idx").on(table.userId),
  }),
);
