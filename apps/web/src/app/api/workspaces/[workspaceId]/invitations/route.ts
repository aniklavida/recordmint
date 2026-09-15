import { AppError } from "@recordmint/shared";
import { requireMembership, requireUser } from "../../../../../auth/guards";
import { invite } from "../../../../../features/workspace/application/invite";
import { toErrorResponse } from "../../../../../lib/error-response";

export const dynamic = "force-dynamic";

const VALID_ROLES = new Set(["owner", "member", "viewer"]);

/**
 * Inviting requires at least the `member` role — a `viewer` cannot grow
 * the workspace. The invitation token is returned in the response body
 * rather than emailed: this repository has no mail provider wired up, so
 * the operator's own UI is responsible for surfacing the link until one
 * exists.
 */
export async function POST(request: Request, { params }: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  try {
    const { workspaceId } = await params;
    const user = await requireUser();
    await requireMembership({ workspaceId, userId: user.id, minimumRole: "member" });
    const body = (await request.json()) as { email?: unknown; role?: unknown };
    const role = String(body.role ?? "member");
    if (!VALID_ROLES.has(role)) {
      throw new AppError("VALIDATION_ERROR", `role must be one of ${[...VALID_ROLES].join(", ")}.`);
    }
    const { invitation, token } = await invite({
      workspaceId,
      email: String(body.email ?? ""),
      role: role as "owner" | "member" | "viewer",
      invitedByUserId: user.id,
    });
    return Response.json(
      { invitation: { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt }, token },
      { status: 201 },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
