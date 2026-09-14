import { requestPasswordReset } from "../../../../../features/workspace/application/password-reset";

export const dynamic = "force-dynamic";

/**
 * Always answers `{ ok: true }`, whether or not the email belongs to an
 * account — `requestPasswordReset` itself resolves the same way in both
 * cases, so there is nothing here to branch on. If sending fails
 * unexpectedly (a misconfigured or unreachable SMTP relay), the failure
 * is logged server-side by error name only — never the underlying error
 * object, which could in principle echo back message content this route
 * must not risk printing — and the response stays identical, so a mail
 * outage cannot be used to distinguish accounts either.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { email?: unknown };
    await requestPasswordReset({ email: String(body.email ?? "") });
  } catch (error) {
    console.error("Password reset request failed:", error instanceof Error ? error.name : "unknown error");
  }
  return Response.json({ ok: true });
}
