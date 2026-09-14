import { signup } from "../../../../features/workspace/application/signup";
import { toErrorResponse } from "../../../../lib/error-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown; name?: unknown };
    const { user, workspace } = await signup({
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
      name: String(body.name ?? ""),
    });
    return Response.json(
      { user: { id: user.id, email: user.email, name: user.name }, workspace: { id: workspace.id, slug: workspace.slug } },
      { status: 201 },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
