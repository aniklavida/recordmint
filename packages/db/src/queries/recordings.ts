import { and, eq, gt, ilike, isNull, ne, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema/index.js";

type OrmClient = PostgresJsDatabase<typeof schema>;
type RecordingVisibility = (typeof schema.recordingVisibilityEnum.enumValues)[number];

/**
 * The visibility model, enforced here rather than in the UI: a query must
 * not be able to return a recording the caller is not entitled to see,
 * even if the UI asks for it.
 *
 * Every function below decides what a caller may see by joining against
 * `memberships` (or the recording's own visibility columns for a public
 * link) inside the query itself. There is no function here that accepts
 * a `workspaceId` on faith and filters by it after the fact — a caller
 * that passes the wrong id, or a UI that requests a recording it has no
 * business rendering, gets zero rows back, not someone else's recording.
 */

/**
 * Returns a recording only if `userId` holds a membership in the
 * workspace that owns it. `params.recordingId` alone is not enough to
 * see anything; the membership join is the access-control boundary.
 */
export async function getRecordingForMember(
  orm: OrmClient,
  params: { recordingId: string; userId: string },
) {
  const rows = await orm
    .select({ recording: schema.recordings })
    .from(schema.recordings)
    .innerJoin(
      schema.memberships,
      eq(schema.memberships.workspaceId, schema.recordings.workspaceId),
    )
    .where(
      and(
        eq(schema.recordings.id, params.recordingId),
        eq(schema.memberships.userId, params.userId),
      ),
    )
    .limit(1);

  return rows[0]?.recording ?? null;
}

/**
 * Lists the recordings in a workspace, but only when `userId` is a member
 * of that exact workspace. A caller who is a member of a different
 * workspace and passes this one's id gets an empty list, not an error
 * that would confirm the workspace exists.
 */
export async function listRecordingsForMember(
  orm: OrmClient,
  params: { workspaceId: string; userId: string },
) {
  const rows = await orm
    .select({ recording: schema.recordings })
    .from(schema.recordings)
    .innerJoin(
      schema.memberships,
      eq(schema.memberships.workspaceId, schema.recordings.workspaceId),
    )
    .where(
      and(
        eq(schema.recordings.workspaceId, params.workspaceId),
        eq(schema.memberships.userId, params.userId),
      ),
    );

  return rows.map((row) => row.recording);
}

/**
 * Resolves a recording for an unauthenticated share-link viewer
 * (SPEC.md §11 "playback path"). No membership is required or possible
 * here, so the query instead excludes exactly what a public viewer must
 * never see: a `private` recording, or an `expiring` one past its
 * `expiresAt`. A `password`-visibility recording is still returned —
 * checking the supplied password against `passwordHash` is the caller's
 * job, because it is not a database-shaped question.
 */
export async function getRecordingForPublicLink(
  orm: OrmClient,
  params: { publicId: string; now?: Date },
) {
  const now = params.now ?? new Date();

  const rows = await orm
    .select()
    .from(schema.recordings)
    .where(
      and(
        eq(schema.recordings.publicId, params.publicId),
        ne(schema.recordings.visibility, "private"),
        or(isNull(schema.recordings.expiresAt), gt(schema.recordings.expiresAt, now)),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * A plain lookup by internal id, no visibility or membership rule
 * applied — for trusted, non-request-driven callers only (the worker's
 * own jobs, which run with no caller identity to check against). Never
 * expose this to anything reachable from an HTTP request.
 */
export async function getRecordingById(orm: OrmClient, recordingId: string) {
  const rows = await orm.select().from(schema.recordings).where(eq(schema.recordings.id, recordingId)).limit(1);
  return rows[0] ?? null;
}

/**
 * The one unfiltered lookup by public id — no visibility rule applied.
 * Exists for the player page's own authorization logic, which has to
 * treat `private` differently for a workspace member than for an
 * anonymous visitor and so cannot use `getRecordingForPublicLink`'s
 * blanket exclusion. Callers of this function are themselves the
 * access-control boundary; it does not double as one.
 */
export async function getRecordingByPublicId(orm: OrmClient, publicId: string) {
  const rows = await orm.select().from(schema.recordings).where(eq(schema.recordings.publicId, publicId)).limit(1);
  return rows[0] ?? null;
}

/**
 * The recording library's search: title, or — when transcription produced
 * one — the transcript's plain text. A workspace with transcription
 * switched off simply never matches on the second clause, since
 * `transcripts.text` is never populated; the query does not need a
 * feature flag of its own to degrade correctly.
 *
 * Still membership-gated exactly like `listRecordingsForMember` — search
 * is a filter on top of "what this caller may already see", never a way
 * around it.
 */
export async function searchRecordingsForMember(
  orm: OrmClient,
  params: { workspaceId: string; userId: string; query: string },
) {
  const pattern = `%${params.query}%`;
  const rows = await orm
    .select({ recording: schema.recordings })
    .from(schema.recordings)
    .innerJoin(
      schema.memberships,
      eq(schema.memberships.workspaceId, schema.recordings.workspaceId),
    )
    .leftJoin(schema.transcripts, eq(schema.transcripts.recordingId, schema.recordings.id))
    .where(
      and(
        eq(schema.recordings.workspaceId, params.workspaceId),
        eq(schema.memberships.userId, params.userId),
        or(ilike(schema.recordings.title, pattern), ilike(schema.transcripts.text, pattern)),
      ),
    );
  return rows.map((row) => row.recording);
}

export interface RecordingMetadataPatch {
  title?: string;
  description?: string | null;
  visibility?: RecordingVisibility;
  passwordHash?: string | null;
  expiresAt?: Date | null;
  guestCommentingEnabled?: boolean;
}

/**
 * Renames, re-visibilities or otherwise edits a recording's metadata.
 * Authorization (is this caller a member, do they own the row or hold
 * the `owner` role) is the route/application layer's job — every caller
 * here has already resolved the row via `getRecordingForMember` and knows
 * it is allowed to touch it.
 */
export async function updateRecordingMetadata(
  orm: OrmClient,
  recordingId: string,
  patch: RecordingMetadataPatch,
) {
  const rows = await orm
    .update(schema.recordings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.recordings.id, recordingId))
    .returning();
  return rows[0] ?? null;
}

/**
 * Deletes the row only. Removing the objects behind it is
 * `packages/storage`'s `deleteRecordingObjects` — the caller (the route
 * handler or the retention job) is expected to delete the objects first
 * and the row second, so a crash between the two leaves an orphaned row
 * pointing at nothing rather than an orphaned object nothing points at;
 * the former is detectable by re-running the delete, the latter is not.
 */
export async function deleteRecordingRow(orm: OrmClient, recordingId: string): Promise<void> {
  await orm.delete(schema.recordings).where(eq(schema.recordings.id, recordingId));
}

/** Worker-only: records where the poster frame the thumbnail job produced actually landed. Not part of `RecordingMetadataPatch` — a viewer never sets this directly. */
export async function setRecordingPosterKey(orm: OrmClient, recordingId: string, posterKey: string) {
  const rows = await orm
    .update(schema.recordings)
    .set({ posterKey, updatedAt: new Date() })
    .where(eq(schema.recordings.id, recordingId))
    .returning();
  return rows[0] ?? null;
}

export async function requestRecordingTrim(
  orm: OrmClient,
  params: { recordingId: string; startSeconds: number; endSeconds: number },
) {
  const rows = await orm
    .update(schema.recordings)
    .set({
      trimStatus: "pending",
      trimStartSeconds: params.startSeconds,
      trimEndSeconds: params.endSeconds,
      trimFailureReason: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.recordings.id, params.recordingId),
        eq(schema.recordings.status, "ready"),
        ne(schema.recordings.trimStatus, "pending"),
        ne(schema.recordings.trimStatus, "processing"),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function setTrimProcessing(orm: OrmClient, recordingId: string) {
  const rows = await orm
    .update(schema.recordings)
    .set({ trimStatus: "processing", updatedAt: new Date() })
    .where(eq(schema.recordings.id, recordingId))
    .returning();
  return rows[0] ?? null;
}

export async function setTrimReady(
  orm: OrmClient,
  params: { recordingId: string; objectKey: string; durationSeconds: number },
) {
  const rows = await orm
    .update(schema.recordings)
    .set({
      trimStatus: "ready",
      trimmedObjectKey: params.objectKey,
      trimmedDurationSeconds: params.durationSeconds,
      trimFailureReason: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.recordings.id, params.recordingId))
    .returning();
  return rows[0] ?? null;
}

export async function setTrimFailed(orm: OrmClient, params: { recordingId: string; reason: string }) {
  const rows = await orm
    .update(schema.recordings)
    .set({ trimStatus: "failed", trimFailureReason: params.reason, updatedAt: new Date() })
    .where(eq(schema.recordings.id, params.recordingId))
    .returning();
  return rows[0] ?? null;
}

export interface CreateRecordingParams {
  id: string;
  publicId: string;
  workspaceId: string;
  creatorId: string;
  title: string;
  objectKey: string;
  uploadId?: string;
}

/**
 * Creates a new recording in the "uploading" state.
 * Lets visibility and guestCommentingEnabled fall back to their schema defaults.
 */
export async function createRecording(orm: OrmClient, params: CreateRecordingParams) {
  const rows = await orm
    .insert(schema.recordings)
    .values({
      id: params.id,
      publicId: params.publicId,
      workspaceId: params.workspaceId,
      creatorId: params.creatorId,
      title: params.title,
      objectKey: params.objectKey,
      uploadId: params.uploadId,
      status: "uploading",
    })
    .returning();
  return rows[0] ?? null;
}
