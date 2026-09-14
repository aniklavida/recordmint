import { countViewsForRecording, getMembership } from "@recordmint/db";
import { getDb } from "../../../lib/db";

/**
 * View events already exist as a plain playback log (SPEC.md §6). This is
 * the one place that log is ever turned into a number a browser can see,
 * and it is deliberately narrow: an anonymous share-link viewer never
 * reaches the database at all — an unauthenticated caller short-circuits
 * to `null` before any query runs — and a signed-in caller still has to
 * hold a real membership in the recording's own workspace, not merely be
 * signed in to some account.
 */
export async function getViewCountForMember(params: {
  workspaceId: string;
  recordingId: string;
  viewerUserId: string | null;
}): Promise<number | null> {
  if (!params.viewerUserId) {
    return null;
  }
  const db = getDb();
  const membership = await getMembership(db.orm, { workspaceId: params.workspaceId, userId: params.viewerUserId });
  if (!membership) {
    return null;
  }
  return countViewsForRecording(db.orm, params.recordingId);
}
