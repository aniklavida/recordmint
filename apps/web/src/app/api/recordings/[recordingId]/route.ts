import { AppError } from "@recordmint/shared";
import { getMembership, getRecordingForMember } from "@recordmint/db";
import { requireUser } from "../../../../auth/guards";
import { deleteRecording, updateRecording } from "../../../../features/recording/application/manage";
import { toRecordingDTO } from "../../../../features/recording/presentation/dto";
import { getDb } from "../../../../lib/db";
import { toErrorResponse } from "../../../../lib/error-response";

export const dynamic = "force-dynamic";

/**
 * Resolves the caller's role for a recording it can already prove
 * membership on. `getRecordingForMember` returning something at all is
 * itself the membership check — a caller with no membership in the
 * recording's workspace gets NOT_FOUND here, not a 403 that would
 * confirm the row exists.
 */
async function resolveRole(recordingId: string, userId: string) {
  const db = getDb();
  const recording = await getRecordingForMember(db.orm, { recordingId, userId });
  if (!recording) {
    throw new AppError("NOT_FOUND", "Recording not found.");
  }
  const membership = await getMembership(db.orm, { workspaceId: recording.workspaceId, userId });
  if (!membership) {
    throw new AppError("NOT_FOUND", "Recording not found.");
  }
  return membership.role;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ recordingId: string }> }): Promise<Response> {
  try {
    const { recordingId } = await params;
    const user = await requireUser();
    const membershipRole = await resolveRole(recordingId, user.id);
    const body = (await request.json()) as Record<string, unknown>;
    const updated = await updateRecording({
      recordingId,
      userId: user.id,
      membershipRole,
      ...(typeof body.title === "string" ? { title: body.title } : {}),
      ...(body.description === null || typeof body.description === "string" ? { description: body.description as string | null } : {}),
      ...(typeof body.visibility === "string" ? { visibility: body.visibility as "private" | "unlisted" | "password" | "expiring" } : {}),
      ...(typeof body.password === "string" ? { password: body.password } : {}),
      ...(body.expiresAt === null || typeof body.expiresAt === "string" ? { expiresAt: body.expiresAt ? new Date(body.expiresAt as string) : null } : {}),
      ...(typeof body.guestCommentingEnabled === "boolean" ? { guestCommentingEnabled: body.guestCommentingEnabled } : {}),
    });
    return Response.json({ recording: toRecordingDTO(updated) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ recordingId: string }> }): Promise<Response> {
  try {
    const { recordingId } = await params;
    const user = await requireUser();
    const membershipRole = await resolveRole(recordingId, user.id);
    const result = await deleteRecording({ recordingId, userId: user.id, membershipRole });
    return Response.json({ ok: true, deletedObjectCount: result.deletedObjectCount });
  } catch (error) {
    return toErrorResponse(error);
  }
}
