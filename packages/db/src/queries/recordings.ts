import { and, eq, gt, isNull, ne, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema/index.js";

type OrmClient = PostgresJsDatabase<typeof schema>;

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
