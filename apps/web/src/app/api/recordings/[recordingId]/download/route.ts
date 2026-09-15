import { AppError } from "@recordmint/shared";
import { getMembership, getRecordingForMember } from "@recordmint/db";
import { presignRead } from "@recordmint/storage";
import { requireUser } from "../../../../../auth/guards";
import { getDb } from "../../../../../lib/db";
import { toErrorResponse } from "../../../../../lib/error-response";
import { getStorageClient, getStorageConfig } from "../../../../../lib/storage";

export const dynamic = "force-dynamic";

function safeFilename(title: string, container: string | null): string {
  const base = title.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "recording";
  return `${base}.${container ?? "mp4"}`;
}

/**
 * SPEC.md §6 lists "download the original file" as its own capability,
 * separate from playback — and the original file is exactly the object
 * already sitting in the bucket, so this is a presigned read with a
 * different disposition rather than a separate export pipeline. Responds
 * with a redirect rather than the bytes themselves, so the app server
 * still never proxies media — the browser follows the redirect straight
 * to storage.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ recordingId: string }> }): Promise<Response> {
  try {
    const { recordingId } = await params;
    const user = await requireUser();
    const db = getDb();
    const recording = await getRecordingForMember(db.orm, { recordingId, userId: user.id });
    if (!recording) {
      throw new AppError("NOT_FOUND", "Recording not found.");
    }
    const membership = await getMembership(db.orm, { workspaceId: recording.workspaceId, userId: user.id });
    if (!membership) {
      throw new AppError("NOT_FOUND", "Recording not found.");
    }

    const config = getStorageConfig();
    const filename = safeFilename(recording.title, recording.container);
    const url = await presignRead(getStorageClient(), {
      bucket: config.bucket,
      key: recording.objectKey,
      authorize: () => true, // membership already checked above
      responseContentDisposition: `attachment; filename="${filename}"`,
    });
    return Response.redirect(url, 302);
  } catch (error) {
    return toErrorResponse(error);
  }
}
