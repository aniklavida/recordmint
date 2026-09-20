import { AppError, generateId, generatePublicId } from "@recordmint/shared";
import { countViewsForRecordings, createRecording } from "@recordmint/db";
import { createMultipartUpload, originalKey } from "@recordmint/storage";
import { requireMembership, requireUser } from "../../../auth/guards";
import { listLibrary } from "../../../features/recording/application/library";
import { toRecordingDTO } from "../../../features/recording/presentation/dto";
import { getDb } from "../../../lib/db";
import { getStorageClient, getStorageConfig } from "../../../lib/storage";
import { toErrorResponse } from "../../../lib/error-response";

export const dynamic = "force-dynamic";

/**
 * GET /api/recordings?workspaceId=...&q=... — the library (SPEC.md §6),
 * search included when `q` is present. `requireMembership` runs before
 * anything else, so a view count is only ever attached once the caller
 * has already proven workspace membership — this route is the only place
 * an anonymous or cross-workspace request could reach this data, and it
 * cannot get past the membership check to do so.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId");
    if (!workspaceId) {
      throw new AppError("VALIDATION_ERROR", "workspaceId is required.");
    }
    await requireMembership({ workspaceId, userId: user.id });
    const recordings = await listLibrary({ workspaceId, userId: user.id, query: url.searchParams.get("q") ?? undefined });
    const viewCounts = await countViewsForRecordings(getDb().orm, recordings.map((recording) => recording.id));
    return Response.json({
      recordings: recordings.map((recording) => toRecordingDTO(recording, { viewCount: viewCounts.get(recording.id) ?? 0 })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const body = await request.json();
    const workspaceId = body.workspaceId;
    
    if (!workspaceId) {
      throw new AppError("VALIDATION_ERROR", "workspaceId is required.");
    }
    
    await requireMembership({ workspaceId, userId: user.id });
    
    const recordingId = generateId();
    const publicId = generatePublicId();
    const ext = body.container || "mp4"; // mp4 or webm
    const objectKey = originalKey(recordingId, ext);
    
    const client = getStorageClient();
    const config = getStorageConfig();
    const { uploadId } = await createMultipartUpload(client, {
      bucket: config.bucket,
      key: objectKey,
      contentType: ext === "webm" ? "video/webm" : "video/mp4",
      authorize: async () => true, // Already authorized by requireMembership above
    });
    
    await createRecording(getDb().orm, {
      id: recordingId,
      publicId,
      workspaceId,
      creatorId: user.id,
      title: body.title || "Untitled Recording",
      objectKey,
      uploadId,
    });
    
    return Response.json({ recordingId, publicId, uploadId });
  } catch (error) {
    return toErrorResponse(error);
  }
}
