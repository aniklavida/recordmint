import { and, eq, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema/index.js";

type OrmClient = PostgresJsDatabase<typeof schema>;

/**
 * Retention is a cost control (SPEC.md §6, §20): a workspace with a
 * `retentionDays` policy loses `ready` recordings older than that many
 * days. A `null` policy (the default) never matches — "keep forever" is
 * not expressed as a very large number, it is expressed as no row coming
 * back at all.
 */
export async function listRecordingsPastRetention(orm: OrmClient, now: Date = new Date()) {
  const rows = await orm
    .select({ recording: schema.recordings })
    .from(schema.recordings)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.recordings.workspaceId))
    .where(
      and(
        eq(schema.recordings.status, "ready"),
        sql`${schema.workspaces.retentionDays} is not null`,
        sql`${schema.recordings.createdAt} < ${now.toISOString()}::timestamptz - (${schema.workspaces.retentionDays} || ' days')::interval`,
      ),
    );
  return rows.map((row) => row.recording);
}

/**
 * An upload nobody finished. The browser never came back to complete the
 * multipart upload — a closed tab, a lost network, a crashed recorder —
 * and the row is still sitting in `uploading` with an open `uploadId`
 * long after any real upload would have finished. `olderThan` is the
 * cutoff timestamp; the caller (the worker) decides how old is abandoned.
 */
export async function listAbandonedUploads(orm: OrmClient, olderThan: Date) {
  const rows = await orm
    .select()
    .from(schema.recordings)
    .where(and(eq(schema.recordings.status, "uploading"), lt(schema.recordings.createdAt, olderThan)));
  return rows;
}
