import { AppError } from "@recordmint/shared";
import { deleteRecordingRow, getRecordingForMember, updateRecordingMetadata } from "@recordmint/db";
import { deleteRecordingObjects } from "@recordmint/storage";
import { hashPassword } from "../../../auth/password";
import { getDb } from "../../../lib/db";
import { getStorageClient, getStorageConfig } from "../../../lib/storage";

type MembershipRole = "owner" | "member" | "viewer";

/**
 * SPEC.md §10 / §12: a member may change their own recordings, an owner
 * may change any of them. Resolved once, here, so rename, re-visibility
 * and delete cannot drift into different rules for "may I touch this row."
 */
async function resolveEditable(params: { recordingId: string; userId: string; membershipRole: MembershipRole }) {
  const recording = await getRecordingForMember(getDb().orm, { recordingId: params.recordingId, userId: params.userId });
  if (!recording) {
    throw new AppError("NOT_FOUND", "Recording not found.");
  }
  const isOwner = params.membershipRole === "owner";
  const isCreator = recording.creatorId === params.userId;
  if (!isOwner && !isCreator) {
    throw new AppError("INSUFFICIENT_ROLE", "Only the recording's creator or a workspace owner may change it.");
  }
  return recording;
}

export interface UpdateRecordingInput {
  recordingId: string;
  userId: string;
  membershipRole: MembershipRole;
  title?: string;
  description?: string | null;
  visibility?: "private" | "unlisted" | "password" | "expiring";
  /** Plaintext — hashed here, never stored or returned as-is. Required (and only meaningful) when visibility is "password". */
  password?: string;
  expiresAt?: Date | null;
  guestCommentingEnabled?: boolean;
}

export async function updateRecording(input: UpdateRecordingInput) {
  const recording = await resolveEditable(input);

  if (input.visibility === "password" && !input.password && !recording.passwordHash) {
    throw new AppError("VALIDATION_ERROR", "A password is required to set this recording's visibility to 'password'.");
  }
  if (input.visibility === "expiring" && !input.expiresAt && !recording.expiresAt) {
    throw new AppError("VALIDATION_ERROR", "An expiry date is required to set this recording's visibility to 'expiring'.");
  }

  const updated = await updateRecordingMetadata(getDb().orm, recording.id, {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
    ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
    ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    ...(input.guestCommentingEnabled !== undefined ? { guestCommentingEnabled: input.guestCommentingEnabled } : {}),
  });
  if (!updated) {
    throw new AppError("NOT_FOUND", "Recording not found.");
  }
  return updated;
}

/**
 * Deletes the storage objects first, the row second (SPEC.md §10: "deletion
 * that actually removes the object from storage, not just the row"). If
 * the process dies between the two steps, the leftover row is detectable
 * and this function is safe to call again — `deleteRecordingObjects`
 * against an already-empty prefix does nothing and reports zero deleted.
 */
export async function deleteRecording(params: { recordingId: string; userId: string; membershipRole: MembershipRole }) {
  const recording = await resolveEditable(params);
  const config = getStorageConfig();
  const deletedObjectCount = await deleteRecordingObjects(getStorageClient(), config.bucket, recording.id);
  await deleteRecordingRow(getDb().orm, recording.id);
  return { deletedObjectCount };
}
