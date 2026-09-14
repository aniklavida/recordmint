import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * One row per user, created lazily the first time a user changes a
 * setting away from its default. A missing row is not an unknown state —
 * it means the default applies. The default itself lives in exactly one
 * place, `../queries/notification-settings.ts`'s
 * `DEFAULT_NEW_COMMENT_EMAIL_ENABLED`, not duplicated here and in the
 * application layer.
 *
 * `newCommentEmailEnabled` only ever governs mail sent to a recording's
 * own creator about comments other people left on it — nobody else is
 * ever a candidate recipient for this setting, so there is no "notify
 * the whole workspace" mode hiding behind the same column.
 */
export const notificationSettings = pgTable("notification_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  newCommentEmailEnabled: boolean("new_comment_email_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
