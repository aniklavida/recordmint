import { getCurrentUser } from "../../../../../../auth/session";
import { addComment, listComments } from "../../../../../../features/comments/application/comments";
import { toErrorResponse } from "../../../../../../lib/error-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ publicId: string }> }): Promise<Response> {
  try {
    const { publicId } = await params;
    const user = await getCurrentUser();
    const password = new URL(request.url).searchParams.get("password") ?? undefined;
    const rows = await listComments({ publicId, viewerUserId: user?.id ?? null, password });
    return Response.json({
      comments: rows.map((row) => ({
        id: row.comment.id,
        parentCommentId: row.comment.parentCommentId,
        timestampSeconds: row.comment.timestampSeconds,
        body: row.comment.body,
        authorName: row.author?.name ?? row.comment.guestName,
        isGuest: row.author === null,
        createdAt: row.comment.createdAt,
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ publicId: string }> }): Promise<Response> {
  try {
    const { publicId } = await params;
    const user = await getCurrentUser();
    const body = (await request.json()) as {
      password?: unknown;
      timestampSeconds?: unknown;
      body?: unknown;
      guestName?: unknown;
    };
    const comment = await addComment({
      publicId,
      viewerUserId: user?.id ?? null,
      password: typeof body.password === "string" ? body.password : undefined,
      timestampSeconds: Number(body.timestampSeconds ?? 0),
      body: String(body.body ?? ""),
      guestName: typeof body.guestName === "string" ? body.guestName : undefined,
    });
    return Response.json({ comment }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
