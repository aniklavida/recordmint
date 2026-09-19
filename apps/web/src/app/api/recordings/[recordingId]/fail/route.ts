import { AppError } from "@recordmint/shared";
import { getRecordingForMember, transitionRecordingStatus } from "@recordmint/db";
import { abortMultipartUpload } from "@recordmint/storage";
import { requireUser } from "../../../../../auth/guards";
import { getDb } from "../../../../../lib/db";
import { getStorageClient, getStorageConfig } from "../../../../../lib/storage";
import { toErrorResponse } from "../../../../../lib/error-response";

export async function POST(request: Request, { params }: { params: Promise<{ recordingId: string }> }): Promise<Response> {
  try {
    const { recordingId } = await params;
    const user = await requireUser();
    const body = await request.json();
    
    const db = getDb();
    const recording = await getRecordingForMember(db.orm, { recordingId, userId: user.id });
    
    if (!recording) {
      throw new AppError("NOT_FOUND", "Recording not found.");
    }
    
    if (recording.status !== "uploading" || !recording.uploadId) {
      throw new AppError("CONFLICT", "Recording is not in an uploading state.");
    }
    
    // Attempt to abort the multipart upload
    try {
      await abortMultipartUpload(getStorageClient(), {
        bucket: getStorageConfig().bucket,
        key: recording.objectKey,
        uploadId: recording.uploadId,
        authorize: async () => true,
      });
    } catch (e) {
      // If abort fails, we still want to transition the recording state
      console.warn("Failed to abort multipart upload:", e);
    }
    
    await transitionRecordingStatus(db.orm, {
      recordingId,
      from: "uploading",
      to: "failed",
      failureReason: body.reason || "Client reported failure during upload",
    });
    
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
