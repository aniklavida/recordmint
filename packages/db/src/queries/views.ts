import { count, eq } from "drizzle-orm";
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
