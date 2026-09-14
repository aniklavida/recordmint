import { getCurrentUser } from "../../../../auth/session";
import { toErrorResponse } from "../../../../lib/error-response";

export const dynamic = "force-dynamic";

/** Read by the client shell on load to decide whether to show the library or the sign-in form. */
export async function GET(): Promise<Response> {
  try {
    const user = await getCurrentUser();
    return Response.json({ user: user ? { id: user.id, email: user.email, name: user.name } : null });
  } catch (error) {
    return toErrorResponse(error);
  }
}
