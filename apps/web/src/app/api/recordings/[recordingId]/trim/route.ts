import { AppError } from "@recordmint/shared";
import { getMembership, getRecordingForMember } from "@recordmint/db";
import { requireUser } from "../../../../../auth/guards";
import { requestTrim } from "../../../../../features/recording/application/trim";
import { getDb } from "../../../../../lib/db";
import { toErrorResponse } from "../../../../../lib/error-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ recordingId: string }> }): Promise<Response> {
  try {
    const { recordingId } = await params;
    const user = await requireUser();
    const db = getDb();
    const recording = await getRecordingForMember(db.orm, { recordingId, userId: user.id });
    if (!recording) throw new AppError("NOT_FOUND", "Recording not found.");
    const membership = await getMembership(db.orm, { workspaceId: recording.workspaceId, userId: user.id });
    if (!membership) throw new AppError("NOT_FOUND", "Recording not found.");
    const body = (await request.json()) as { startSeconds?: unknown; endSeconds?: unknown };
    if (typeof body.startSeconds !== "number" || typeof body.endSeconds !== "number") {
      throw new AppError("VALIDATION_ERROR", "startSeconds and endSeconds must be numbers.");
    }
    const updated = await requestTrim({
      recordingId,
      userId: user.id,
      membershipRole: membership.role,
      startSeconds: body.startSeconds,
      endSeconds: body.endSeconds,
    });
    return Response.json({ recording: { id: updated.id, trimStatus: updated.trimStatus } }, { status: 202 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
