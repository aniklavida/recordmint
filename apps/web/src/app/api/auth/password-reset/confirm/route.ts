import { confirmPasswordReset } from "../../../../../features/workspace/application/password-reset";
import { toErrorResponse } from "../../../../../lib/error-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { token?: unknown; password?: unknown };
    await confirmPasswordReset({ token: String(body.token ?? ""), password: String(body.password ?? "") });
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
