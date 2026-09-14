import { AppError } from "@recordmint/shared";
import { countViewsForRecordings } from "@recordmint/db";
import { requireMembership, requireUser } from "../../../auth/guards";
import { listLibrary } from "../../../features/recording/application/library";
import { toRecordingDTO } from "../../../features/recording/presentation/dto";
import { getDb } from "../../../lib/db";
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
