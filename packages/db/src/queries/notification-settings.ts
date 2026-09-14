import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema/index.js";

type OrmClient = PostgresJsDatabase<typeof schema>;

/**
 * The one place the new-comment-email default lives. On by default, and
 * only for a recording's own creator — nobody else is ever a candidate
 * recipient, so this default never needs to consider a broader audience.
 * A row in `notification_settings` only exists once a user has changed
 * it away from this value; a missing row means the default still
 * applies, checked by `isNewCommentEmailEnabled` below rather than by
 * every call site re-deciding what "no row" means.
 */
export const DEFAULT_NEW_COMMENT_EMAIL_ENABLED = true;

export async function getNotificationSettings(orm: OrmClient, userId: string) {
  const rows = await orm
    .select()
    .from(schema.notificationSettings)
    .where(eq(schema.notificationSettings.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function isNewCommentEmailEnabled(orm: OrmClient, userId: string): Promise<boolean> {
  const settings = await getNotificationSettings(orm, userId);
  return settings?.newCommentEmailEnabled ?? DEFAULT_NEW_COMMENT_EMAIL_ENABLED;
}

/**
 * Upserts the one column this table has. `updatedAt` is set explicitly
 * rather than relying on a trigger, matching how every other table in
 * this package tracks it.
 */
export async function setNewCommentEmailEnabled(
  orm: OrmClient,
  userId: string,
  enabled: boolean,
): Promise<void> {
  await orm
    .insert(schema.notificationSettings)
    .values({ userId, newCommentEmailEnabled: enabled })
    .onConflictDoUpdate({
      target: schema.notificationSettings.userId,
      set: { newCommentEmailEnabled: enabled, updatedAt: new Date() },
    });
}
