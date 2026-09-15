import { requireUser } from "../../../../../auth/guards";
import { acceptInvite } from "../../../../../features/workspace/application/invite";
import { toErrorResponse } from "../../../../../lib/error-response";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  try {
    const { token } = await params;
    const user = await requireUser();
    const membership = await acceptInvite({ token, userId: user.id, userEmail: user.email });
    return Response.json({ membership: { workspaceId: membership.workspaceId, role: membership.role } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
