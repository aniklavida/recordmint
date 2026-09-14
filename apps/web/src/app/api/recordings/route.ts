import { AppError } from "@recordmint/shared";
import { requireMembership, requireUser } from "../../../auth/guards";
import { listLibrary } from "../../../features/recording/application/library";
import { toRecordingDTO } from "../../../features/recording/presentation/dto";
import { toErrorResponse } from "../../../lib/error-response";

export const dynamic = "force-dynamic";

/** GET /api/recordings?workspaceId=...&q=... — the library (SPEC.md §6), search included when `q` is present. */
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
    return Response.json({ recordings: recordings.map(toRecordingDTO) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
