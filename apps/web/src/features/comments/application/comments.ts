import { AppError, generateId } from "@recordmint/shared";
import { createComment, listCommentsForRecording } from "@recordmint/db";
import { getDb } from "../../../lib/db";
import { authorizeViewerForRecording } from "../../playback/application/authorize";
import { enqueueCommentNotification } from "./notify";

export interface AddCommentInput {
  publicId: string;
  viewerUserId?: string | null;
  password?: string;
  timestampSeconds: number;
  body: string;
  guestName?: string;
}

/**
 * SPEC.md §13: comment permissions follow the recording's visibility,
 * never a separate looser rule. A comment on a shared link is authorized
 * by the exact same check as watching it —
 * `authorizeViewerForRecording` — plus one more rule specific to
 * commenting: an unauthenticated commenter needs the recording's own
 * `guestCommentingEnabled` flag, which is off by default (the most
 * restrictive option) and per-recording.
 */
export async function addComment(input: AddCommentInput) {
  const authorization = await authorizeViewerForRecording(input);
  if (!authorization.ok) {
    throw new AppError(
      authorization.reason === "not_found" ? "NOT_FOUND" : "VALIDATION_ERROR",
      authorization.reason === "not_found" ? "Recording not found." : "A password is required to comment on this recording.",
    );
  }
  const recording = authorization.recording;

  if (!input.viewerUserId) {
    if (!recording.guestCommentingEnabled) {
      throw new AppError("INSUFFICIENT_ROLE", "Guest commenting is not enabled for this recording.");
    }
    if (!input.guestName?.trim()) {
      throw new AppError("VALIDATION_ERROR", "A display name is required to comment as a guest.");
    }
  }

  const body = input.body.trim();
  if (!body) {
    throw new AppError("VALIDATION_ERROR", "A comment cannot be empty.");
  }
  if (input.timestampSeconds < 0) {
    throw new AppError("VALIDATION_ERROR", "timestampSeconds cannot be negative.");
  }

  const comment = await createComment(getDb().orm, {
    id: generateId(),
    recordingId: recording.id,
    timestampSeconds: input.timestampSeconds,
    body,
    ...(input.viewerUserId ? { authorUserId: input.viewerUserId } : { guestName: input.guestName!.trim() }),
  });

  // Never notify the recording's creator about their own comment — the
  // one case this skips outright rather than leaving to the worker job's
  // own filter, so a self-comment never even creates a queue entry.
  // Enqueueing (a database insert pg-boss owns) is deliberately never
  // allowed to fail the comment itself: sending the actual email happens
  // only in the worker, but even scheduling that job is best-effort here.
  if (input.viewerUserId !== recording.creatorId) {
    try {
      await enqueueCommentNotification(recording.id);
    } catch (error) {
      console.error(
        "Failed to enqueue a new-comment notification:",
        error instanceof Error ? error.name : "unknown error",
      );
    }
  }

  return comment;
}

export interface ListCommentsInput {
  publicId: string;
  viewerUserId?: string | null;
  password?: string;
}

export async function listComments(input: ListCommentsInput) {
  const authorization = await authorizeViewerForRecording(input);
  if (!authorization.ok) {
    throw new AppError(
      authorization.reason === "not_found" ? "NOT_FOUND" : "VALIDATION_ERROR",
      authorization.reason === "not_found" ? "Recording not found." : "A password is required to view comments on this recording.",
    );
  }
  return listCommentsForRecording(getDb().orm, authorization.recording.id);
}
