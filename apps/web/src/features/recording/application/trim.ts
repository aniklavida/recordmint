import { AppError } from "@recordmint/shared";
import { QUEUE_NAMES, getRecordingForMember, requestRecordingTrim, setTrimFailed } from "@recordmint/db";
import { getDb } from "../../../lib/db";
import { getQueue } from "../../../lib/queue";

export interface RequestTrimInput {
  recordingId: string;
  userId: string;
  membershipRole: "owner" | "member" | "viewer";
  startSeconds: number;
  endSeconds: number;
}

export async function requestTrim(input: RequestTrimInput) {
  const db = getDb();
  const recording = await getRecordingForMember(db.orm, {
    recordingId: input.recordingId,
    userId: input.userId,
  });
  if (!recording) {
    throw new AppError("NOT_FOUND", "Recording not found.");
  }
  const isOwner = input.membershipRole === "owner";
  if (!isOwner && recording.creatorId !== input.userId) {
    throw new AppError("INSUFFICIENT_ROLE", "Only the recording's creator or a workspace owner may change it.");
  }
  if (recording.status !== "ready" || recording.durationSeconds === null) {
    throw new AppError("CONFLICT", "Only a completed recording with a known duration can be trimmed.");
  }
  if (recording.trimStatus === "pending" || recording.trimStatus === "processing") {
    throw new AppError("CONFLICT", "This recording is already being trimmed.");
  }
  if (
    !Number.isFinite(input.startSeconds) ||
    !Number.isFinite(input.endSeconds) ||
    input.startSeconds < 0 ||
    input.endSeconds <= input.startSeconds ||
    input.endSeconds > recording.durationSeconds + 0.25
  ) {
    throw new AppError("VALIDATION_ERROR", "Trim points must be within the recording and end after they begin.");
  }

  const updated = await requestRecordingTrim(db.orm, {
    recordingId: recording.id,
    startSeconds: input.startSeconds,
    endSeconds: input.endSeconds,
  });
  if (!updated) {
    throw new AppError("CONFLICT", "This recording can no longer be trimmed.");
  }

  try {
    const boss = await getQueue();
    await boss.send(QUEUE_NAMES.trim, {
      recordingId: recording.id,
      startSeconds: input.startSeconds,
      endSeconds: input.endSeconds,
    });
  } catch (error) {
    await setTrimFailed(db.orm, {
      recordingId: recording.id,
      reason: error instanceof Error ? error.message : "Could not enqueue trim job.",
    });
    throw error;
  }

  return updated;
}
