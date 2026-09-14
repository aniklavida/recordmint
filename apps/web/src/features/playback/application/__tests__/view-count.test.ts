import { generateId, generatePublicId } from "@recordmint/shared";
import { recordView } from "@recordmint/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../../../../lib/db.js";
import { getViewCountForMember } from "../view-count.js";

/**
 * The view count is a workspace-members-only surface: an anonymous
 * share-link viewer must never receive it, and neither may a signed-in
 * user who simply belongs to a different workspace. Both refusals return
 * `null` rather than throwing, since the caller (the player page, the
 * library route) treats "may not see this" as "don't render it," not as
 * an error condition to report.
 */
describe.skipIf(!process.env.DATABASE_URL)("view count — members only", () => {
  const workspaceId = generateId();
  const otherWorkspaceId = generateId();
  const memberUserId = generateId();
  const outsiderUserId = generateId();
  const recordingId = generateId();

  beforeAll(async () => {
    const db = getDb();
    await db.sql`INSERT INTO workspaces (id, name, slug) VALUES (${workspaceId}, 'W', ${"w-" + workspaceId})`;
    await db.sql`INSERT INTO workspaces (id, name, slug) VALUES (${otherWorkspaceId}, 'Other', ${"w-" + otherWorkspaceId})`;
    await db.sql`INSERT INTO users (id, email, password_hash, name) VALUES (${memberUserId}, ${memberUserId + "@example.test"}, 'x', 'Member')`;
    await db.sql`INSERT INTO users (id, email, password_hash, name) VALUES (${outsiderUserId}, ${outsiderUserId + "@example.test"}, 'x', 'Outsider')`;
    await db.sql`INSERT INTO memberships (id, workspace_id, user_id, role) VALUES (${generateId()}, ${workspaceId}, ${memberUserId}, 'member')`;
    await db.sql`INSERT INTO memberships (id, workspace_id, user_id, role) VALUES (${generateId()}, ${otherWorkspaceId}, ${outsiderUserId}, 'owner')`;
    await db.sql`
      INSERT INTO recordings (id, public_id, workspace_id, creator_id, title, status, object_key)
      VALUES (${recordingId}, ${generatePublicId()}, ${workspaceId}, ${memberUserId}, 'Viewed recording', 'ready', ${"recordings/" + recordingId + "/original.mp4"})
    `;
    await recordView(db.orm, { id: generateId(), recordingId, viewerUserId: memberUserId });
    await recordView(db.orm, { id: generateId(), recordingId, viewerUserId: null });
    await recordView(db.orm, { id: generateId(), recordingId, viewerUserId: null });
  });

  afterAll(async () => {
    const db = getDb();
    await db.sql`DELETE FROM workspaces WHERE id IN (${workspaceId}, ${otherWorkspaceId})`;
    await db.sql`DELETE FROM users WHERE id IN (${memberUserId}, ${outsiderUserId})`;
    await db.sql.end();
  });

  it("returns the real count for a member of the recording's own workspace", async () => {
    const count = await getViewCountForMember({ workspaceId, recordingId, viewerUserId: memberUserId });
    expect(count).toBe(3);
  });

  it("refuses an anonymous guest — never even queries the database, just returns null", async () => {
    const count = await getViewCountForMember({ workspaceId, recordingId, viewerUserId: null });
    expect(count).toBeNull();
  });

  it("refuses a signed-in user who belongs to a different workspace", async () => {
    const count = await getViewCountForMember({ workspaceId, recordingId, viewerUserId: outsiderUserId });
    expect(count).toBeNull();
  });
});
