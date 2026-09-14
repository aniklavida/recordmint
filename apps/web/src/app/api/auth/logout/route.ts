import { endSession } from "../../../../auth/session";
import { toErrorResponse } from "../../../../lib/error-response";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  try {
    await endSession();
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
