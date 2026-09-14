import { listRecordingsForMember, searchRecordingsForMember } from "@recordmint/db";
import { getDb } from "../../../lib/db";

/** The library: a member's own workspace's recordings, optionally filtered by a title/transcript search (SPEC.md §6). */
export async function listLibrary(params: { workspaceId: string; userId: string; query?: string }) {
  const db = getDb();
  if (params.query && params.query.trim()) {
    return searchRecordingsForMember(db.orm, { workspaceId: params.workspaceId, userId: params.userId, query: params.query.trim() });
  }
  return listRecordingsForMember(db.orm, { workspaceId: params.workspaceId, userId: params.userId });
}
