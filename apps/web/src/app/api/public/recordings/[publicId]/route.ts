import { getCurrentUser } from "../../../../../auth/session";
import { resolveForViewer } from "../../../../../features/playback/application/resolve";
import { toErrorResponse } from "../../../../../lib/error-response";

export const dynamic = "force-dynamic";

/**
 * Used two ways: the player page's own client-side poll while a recording
 * is still `in_progress` ("still recording / finishing up" per SPEC.md
 * §9), and — via POST — the password-gate form submitting a password
 * without ever putting it in a URL or query string.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ publicId: string }> }): Promise<Response> {
  try {
    const { publicId } = await params;
    const user = await getCurrentUser();
    const resolution = await resolveForViewer({ publicId, viewerUserId: user?.id ?? null });
    return Response.json(resolution);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ publicId: string }> }): Promise<Response> {
  try {
    const { publicId } = await params;
    const user = await getCurrentUser();
    const body = (await request.json().catch(() => ({}))) as { password?: unknown };
    const resolution = await resolveForViewer({
      publicId,
      viewerUserId: user?.id ?? null,
      password: typeof body.password === "string" ? body.password : undefined,
    });
    return Response.json(resolution);
  } catch (error) {
    return toErrorResponse(error);
  }
}
