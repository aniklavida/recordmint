import { requireMembership, requireUser } from "../../../../../auth/guards";
import { setWorkspaceRetention } from "../../../../../features/workspace/application/retention";
import { toErrorResponse } from "../../../../../lib/error-response";

export const dynamic = "force-dynamic";

/** SPEC.md §12: only a workspace owner may change retention. */
export async function PATCH(request: Request, { params }: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  try {
    const { workspaceId } = await params;
    const user = await requireUser();
    await requireMembership({ workspaceId, userId: user.id, minimumRole: "owner" });
    const body = (await request.json()) as { retentionDays: number | null };
    const updated = await setWorkspaceRetention(workspaceId, body.retentionDays);
    return Response.json({ workspace: { id: updated.id, retentionDays: updated.retentionDays } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
