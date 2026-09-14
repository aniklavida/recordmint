import { AppError } from "@recordmint/shared";
import { updateWorkspaceRetention } from "@recordmint/db";
import { getDb } from "../../../lib/db";

/**
 * The route handler has already checked the caller holds the `owner`
 * role (SPEC.md §12: "a workspace owner can change retention; a member
 * cannot") — this function only validates the value itself.
 */
export async function setWorkspaceRetention(workspaceId: string, retentionDays: number | null) {
  if (retentionDays !== null && (!Number.isInteger(retentionDays) || retentionDays < 1)) {
    throw new AppError("VALIDATION_ERROR", "retentionDays must be a positive integer or null (keep forever).");
  }
  const updated = await updateWorkspaceRetention(getDb().orm, { workspaceId, retentionDays });
  if (!updated) {
    throw new AppError("NOT_FOUND", "Workspace not found.");
  }
  return updated;
}
