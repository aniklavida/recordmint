import { login } from "../../../../features/workspace/application/login";
import { toErrorResponse } from "../../../../lib/error-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown };
    const { user } = await login({ email: String(body.email ?? ""), password: String(body.password ?? "") });
    return Response.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
