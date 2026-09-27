import { AppError } from "@recordmint/shared";
import { getRecordingForMember, transitionRecordingStatus } from "@recordmint/db";
import { completeMultipartUpload } from "@recordmint/storage";
import { requireUser } from "../../../../../auth/guards";
import { getDb } from "../../../../../lib/db";
import { getStorageClient, getStorageConfig } from "../../../../../lib/storage";
import { toErrorResponse } from "../../../../../lib/error-response";
import { enqueueTranscript } from "../../../../../features/recording/application/transcript";

export async function POST(request: Request, { params }: { params: Promise<{ recordingId: string }> }): Promise<Response> {
  try {
    const { recordingId } = await params;
    const user = await requireUser();
    const body = await request.json();
    const parts = body.parts;
    
    if (!Array.isArray(parts)) {
      throw new AppError("VALIDATION_ERROR", "parts must be an array.");
    }
    
    const db = getDb();
    const recording = await getRecordingForMember(db.orm, { recordingId, userId: user.id });
    
    if (!recording) {
      throw new AppError("NOT_FOUND", "Recording not found.");
    }
    
    if (recording.status !== "uploading" || !recording.uploadId) {
      throw new AppError("CONFLICT", "Recording is not in an uploading state.");
    }
    
    await completeMultipartUpload(getStorageClient(), {
      bucket: getStorageConfig().bucket,
      key: recording.objectKey,
      uploadId: recording.uploadId,
      parts,
      authorize: async () => true, // getRecordingForMember already checked membership
    });
    
    await transitionRecordingStatus(db.orm, {
      recordingId,
      from: "uploading",
      to: "ready",
      container: body.container,
      codecs: body.codecs,
      durationSeconds: body.durationSeconds,
      sizeBytes: body.sizeBytes,
    });

    await enqueueTranscript(recordingId);

    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
