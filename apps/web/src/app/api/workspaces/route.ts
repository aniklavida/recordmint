import { listWorkspacesForUser } from "@recordmint/db";
import { requireUser } from "../../../auth/guards";
import { getDb } from "../../../lib/db";
import { toErrorResponse } from "../../../lib/error-response";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const user = await requireUser();
    const rows = await listWorkspacesForUser(getDb().orm, user.id);
    return Response.json({
      workspaces: rows.map((row) => ({ id: row.workspace.id, name: row.workspace.name, slug: row.workspace.slug, role: row.role })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
