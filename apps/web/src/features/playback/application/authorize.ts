import { getMembership, getRecordingByPublicId } from "@recordmint/db";
import { verifyPassword } from "../../../auth/password";
import { getDb } from "../../../lib/db";

export type ViewerAuthorization =
  | { ok: true; recording: NonNullable<Awaited<ReturnType<typeof getRecordingByPublicId>>> }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "password_required" | "incorrect_password"; title: string };

/**
 * The same visibility rule set SPEC.md §11 describes for playback, factored
 * out so the comments surface — which SPEC.md §13 requires to follow the
 * recording's visibility rather than a separate looser rule — checks
 * identical rules rather than a second, hand-rolled copy of them.
 */
export async function authorizeViewerForRecording(params: {
  publicId: string;
  viewerUserId?: string | null;
  password?: string;
}): Promise<ViewerAuthorization> {
  const db = getDb();
  const recording = await getRecordingByPublicId(db.orm, params.publicId);
  if (!recording) {
    return { ok: false, reason: "not_found" };
  }

  if (recording.visibility === "private") {
    const membership = params.viewerUserId
      ? await getMembership(db.orm, { workspaceId: recording.workspaceId, userId: params.viewerUserId })
      : null;
    if (!membership) {
      return { ok: false, reason: "not_found" };
    }
  }

  if (recording.visibility === "expiring" && recording.expiresAt && recording.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "not_found" };
  }

  if (recording.visibility === "password") {
    if (!params.password) {
      return { ok: false, reason: "password_required", title: recording.title };
    }
    const valid = recording.passwordHash ? await verifyPassword(params.password, recording.passwordHash) : false;
    if (!valid) {
      return { ok: false, reason: "incorrect_password", title: recording.title };
    }
  }

  return { ok: true, recording };
}
