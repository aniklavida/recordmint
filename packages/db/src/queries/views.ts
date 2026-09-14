import { count, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema/index.js";

type OrmClient = PostgresJsDatabase<typeof schema>;

/**
 * One row per playback session (SPEC.md §6, `[assumed]`). This answers
 * "was this watched" and stops there — it is deliberately not a
 * per-viewer analytics table. A self-hosted tool people chose partly for
 * privacy should not grow a surveillance dashboard on its own recordings.
 */
export async function recordView(
  orm: OrmClient,
  params: { id: string; recordingId: string; viewerUserId?: string | null },
) {
  const rows = await orm
    .insert(schema.viewEvents)
    .values({ id: params.id, recordingId: params.recordingId, viewerUserId: params.viewerUserId ?? null })
    .returning();
  return rows[0]!;
}

export async function countViewsForRecording(orm: OrmClient, recordingId: string): Promise<number> {
  const rows = await orm
    .select({ value: count() })
    .from(schema.viewEvents)
    .where(eq(schema.viewEvents.recordingId, recordingId));
  return rows[0]?.value ?? 0;
}

/**
 * The batch form the library list needs: one grouped query for every
 * recording on the page rather than one round trip per row. A recording
 * with zero view events has no row in the result at all — callers default
 * a missing id to 0 rather than treating absence as an error.
 */
export async function countViewsForRecordings(
  orm: OrmClient,
  recordingIds: string[],
): Promise<Map<string, number>> {
  if (recordingIds.length === 0) return new Map();
  const rows = await orm
    .select({ recordingId: schema.viewEvents.recordingId, value: count() })
    .from(schema.viewEvents)
    .where(inArray(schema.viewEvents.recordingId, recordingIds))
    .groupBy(schema.viewEvents.recordingId);
  return new Map(rows.map((row) => [row.recordingId, row.value]));
}
