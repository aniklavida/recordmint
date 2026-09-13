import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema/index.js";

type OrmClient = PostgresJsDatabase<typeof schema>;

export type RecordingStatus = (typeof schema.recordingStatusEnum.enumValues)[number];

/**
 * The recording state machine: uploading -> ready | failed, and a
 * recoverable path back to `uploading` from either terminal state so a
 * retry re-enters the same row instead of orphaning it.
 *
 *   uploading -> ready     upload finished, the object is playable
 *   uploading -> failed    upload was abandoned or the server-side
 *                          multipart completion failed
 *   failed    -> uploading a retry starts a fresh upload for the same row
 *   ready     -> failed    the object was found missing/corrupt after
 *                          the fact (e.g. a retention or integrity check)
 *
 * `ready -> uploading` and `failed -> ready` are deliberately absent: a
 * recording never becomes ready except by finishing an upload.
 */
const ALLOWED_TRANSITIONS: Record<RecordingStatus, readonly RecordingStatus[]> = {
  uploading: ["ready", "failed"],
  failed: ["uploading"],
  ready: ["failed"],
};

export function canTransitionRecordingStatus(from: RecordingStatus, to: RecordingStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Applies a status transition, guarded twice: once in code against the
 * table above, and once at the database with a `WHERE status = :from`
 * clause so a second, racing caller who read the same "before" state
 * cannot also apply its transition — the row has already moved by the
 * time its UPDATE runs, so it matches zero rows instead of double-firing.
 *
 * Returns the updated row, or `null` if the transition was rejected or
 * the row was no longer in the `from` state (a lost race, not an error).
 */
export async function transitionRecordingStatus(
  orm: OrmClient,
  params: {
    recordingId: string;
    from: RecordingStatus;
    to: RecordingStatus;
    failureReason?: string;
  },
) {
  if (!canTransitionRecordingStatus(params.from, params.to)) {
    throw new Error(`Invalid recording status transition: ${params.from} -> ${params.to}`);
  }

  const rows = await orm
    .update(schema.recordings)
    .set({
      status: params.to,
      failureReason: params.to === "failed" ? (params.failureReason ?? null) : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.recordings.id, params.recordingId),
        eq(schema.recordings.status, params.from),
      ),
    )
    .returning();

  return rows[0] ?? null;
}
