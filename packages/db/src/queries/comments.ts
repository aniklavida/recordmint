import { asc, eq } from "drizzle-orm";
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
