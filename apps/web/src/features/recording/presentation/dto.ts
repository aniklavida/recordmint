import type { recordings } from "@recordmint/db";

type RecordingRow = typeof recordings.$inferSelect;

/**
 * The library and rename/visibility endpoints must never echo
 * `passwordHash` or the raw `objectKey`/`uploadId` back to a client —
 * none of the three is something a browser needs, and the first is a
 * credential. Every route that returns a recording to the client goes
 * through this rather than serializing the row directly.
 *
 * `viewCount` is opt-in per call: it is only ever meaningful once the
 * caller has already proven the requester is a workspace member (the
 * library route does this before calling in), so a caller with no count
 * to offer — or no right to offer one — simply omits the second
 * argument rather than this function guessing at a default.
 */
export function toRecordingDTO(recording: RecordingRow, extra?: { viewCount?: number }) {
  return {
    id: recording.id,
    publicId: recording.publicId,
    workspaceId: recording.workspaceId,
    creatorId: recording.creatorId,
    title: recording.title,
    description: recording.description,
    status: recording.status,
    failureReason: recording.failureReason,
    visibility: recording.visibility,
    hasPassword: recording.passwordHash !== null,
    expiresAt: recording.expiresAt,
    guestCommentingEnabled: recording.guestCommentingEnabled,
    container: recording.container,
    durationSeconds: recording.durationSeconds,
    sizeBytes: recording.sizeBytes,
    hasPoster: recording.posterKey !== null,
    trimStatus: recording.trimStatus,
    createdAt: recording.createdAt,
    updatedAt: recording.updatedAt,
    ...(extra?.viewCount !== undefined ? { viewCount: extra.viewCount } : {}),
  };
}
