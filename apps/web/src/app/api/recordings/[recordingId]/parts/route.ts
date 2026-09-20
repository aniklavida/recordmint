import { AppError } from "@recordmint/shared";
import { getRecordingForMember } from "@recordmint/db";
import { presignUploadPart } from "@recordmint/storage";
import { requireUser } from "../../../../../auth/guards";
import { getDb } from "../../../../../lib/db";
import { getStorageClient, getStorageConfig } from "../../../../../lib/storage";
import { toErrorResponse } from "../../../../../lib/error-response";

export async function POST(request: Request, { params }: { params: Promise<{ recordingId: string }> }): Promise<Response> {
  try {
    const { recordingId } = await params;
    const user = await requireUser();
    
    // Read the partNumber and uploadId from body
    const body = await request.json();
    const partNumber = body.partNumber;
    
    if (!Number.isInteger(partNumber)) {
      throw new AppError("VALIDATION_ERROR", "partNumber is required and must be an integer.");
    }
    
    const db = getDb();
    const recording = await getRecordingForMember(db.orm, { recordingId, userId: user.id });
    
    if (!recording) {
      throw new AppError("NOT_FOUND", "Recording not found.");
    }
    
    if (recording.status !== "uploading" || !recording.uploadId) {
      throw new AppError("CONFLICT", "Recording is not in an uploading state.");
    }
    
    const url = await presignUploadPart(getStorageClient(), {
      bucket: getStorageConfig().bucket,
      key: recording.objectKey,
      uploadId: recording.uploadId,
      partNumber,
      authorize: async () => true, // getRecordingForMember already checked membership
    });
    
    return Response.json({ url });
  } catch (error) {
    return toErrorResponse(error);
  }
}
