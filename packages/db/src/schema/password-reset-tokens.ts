import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * A password reset link is a credential exactly like a session cookie —
 * single-use, short-lived, and stored hashed rather than in the clear, so
 * reading this table never hands out something a reader could reset an
 * account with. `tokenHash` is a SHA-256 digest of the raw token; the raw
 * value exists only in memory for the moment it is generated and inside
 * the email sent to the user. The reset flow looks a row up by hash,
 * never by the raw token, and this package never receives the raw value
 * at all.
 *
 * `usedAt` makes the token single-use: once set, `findValidPasswordResetToken`
 * (../queries/auth.ts) never returns the row again, even before `expiresAt`.
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("password_reset_tokens_user_id_idx").on(table.userId),
  }),
);
