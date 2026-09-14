import { and, asc, eq, gte, isNull, ne, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema/index.js";

type OrmClient = PostgresJsDatabase<typeof schema>;

/**
 * Either `authorUserId` or `guestName` is set, never neither — enforced
 * here rather than only in the schema comment, because this is the one
 * function that ever inserts a comment row.
 */
export interface NewComment {
  id: string;
  recordingId: string;
  parentCommentId?: string | null;
  authorUserId?: string | null;
  guestName?: string | null;
  timestampSeconds: number;
  body: string;
}

export async function createComment(orm: OrmClient, comment: NewComment) {
  if (!comment.authorUserId && !comment.guestName) {
    throw new Error("A comment needs either authorUserId or guestName.");
  }
  const rows = await orm.insert(schema.comments).values(comment).returning();
  return rows[0]!;
}

/**
 * Ordered by playhead position, not creation time — that is the order a
 * viewer scrubbing the timeline expects markers to appear in.
 */
export async function listCommentsForRecording(orm: OrmClient, recordingId: string) {
  const rows = await orm
    .select({ comment: schema.comments, author: schema.users })
    .from(schema.comments)
    .leftJoin(schema.users, eq(schema.users.id, schema.comments.authorUserId))
    .where(eq(schema.comments.recordingId, recordingId))
    .orderBy(asc(schema.comments.timestampSeconds), asc(schema.comments.createdAt));
  return rows;
}

/**
 * The new-comment-notification digest's own query: every comment on a
 * recording created at or after `since`, excluding whatever a given
 * author (the recording's own creator) wrote — a self-comment is never
 * itself a reason to notify that same creator. `ne` alone would silently
 * drop every guest comment too, since SQL's `author_user_id <> $1` is
 * `NULL`, not true, for a guest's `NULL` `author_user_id`; the explicit
 * `isNull` branch is what keeps guest comments in the result.
 */
export async function listCommentsForRecordingSince(
  orm: OrmClient,
  recordingId: string,
  since: Date,
  excludeAuthorUserId: string,
) {
  const rows = await orm
    .select({ comment: schema.comments, author: schema.users })
    .from(schema.comments)
    .leftJoin(schema.users, eq(schema.users.id, schema.comments.authorUserId))
    .where(
      and(
        eq(schema.comments.recordingId, recordingId),
        gte(schema.comments.createdAt, since),
        or(isNull(schema.comments.authorUserId), ne(schema.comments.authorUserId, excludeAuthorUserId)),
      ),
    )
    .orderBy(asc(schema.comments.timestampSeconds), asc(schema.comments.createdAt));
  return rows;
}
