import { getCurrentUser } from "../../../../../../auth/session";
import { addReaction, listReactions } from "../../../../../../features/reactions/application/reactions";
import { toErrorResponse } from "../../../../../../lib/error-response";

export const dynamic = "force-dynamic";

/**
 * A self-hosted deployment is commonly reached through a reverse proxy,
 * which is what would set `X-Forwarded-For`/`X-Real-IP` — Node's own
 * `Request` has no other notion of the caller's address to fall back on.
 * `[assumed]`: good enough for rate-limiting and per-viewer reaction
 * limits, which only need a value that is stable per guest and does not
 * need to be a verified, spoof-proof identity. A direct, proxyless
 * connection (e.g. local development) falls back to a fixed string, so
 * the reactor key still resolves to something stable rather than a
 * different value on every request.
 */
function resolveClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]!.trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function GET(request: Request, { params }: { params: { publicId: string } }): Promise<Response> {
  try {
    const user = await getCurrentUser();
    const password = new URL(request.url).searchParams.get("password") ?? undefined;
    const reactions = await listReactions({ publicId: params.publicId, viewerUserId: user?.id ?? null, password });
    return Response.json({ reactions });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: { publicId: string } }): Promise<Response> {
  try {
    const user = await getCurrentUser();
    const body = (await request.json()) as {
      password?: unknown;
      timestampSeconds?: unknown;
      emoji?: unknown;
    };
    const reaction = await addReaction({
      publicId: params.publicId,
      viewerUserId: user?.id ?? null,
      password: typeof body.password === "string" ? body.password : undefined,
      timestampSeconds: Number(body.timestampSeconds ?? -1),
      emoji: String(body.emoji ?? ""),
      guestIp: user ? null : resolveClientIp(request),
    });
    return Response.json({ reaction }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
