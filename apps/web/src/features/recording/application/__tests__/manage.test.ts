import { generateId, generatePublicId } from "@recordmint/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../../../../lib/db.js";
import { updateRecording, deleteRecording } from "../manage.js";

/**
 * Rename and re-visibility share one authorization rule with delete: the
 * recording's creator or the workspace's owner may change it, everyone
 * else is refused. This proves that rule for both actions, for a
 * same-workspace member who is neither the creator nor an owner, and for
 * a user who does not belong to the workspace at all.
 */
describe.skipIf(!process.env.DATABASE_URL)("recording rename and visibility permission rules", () => {
  const workspaceId = generateId();
  const otherWorkspaceId = generateId();
  const creatorUserId = generateId();
  const ownerUserId = generateId();
  const memberUserId = generateId();
  const outsiderUserId = generateId();

  beforeAll(async () => {
    const db = getDb();
    await db.sql`INSERT INTO workspaces (id, name, slug) VALUES (${workspaceId}, 'W', ${"w-" + workspaceId})`;
    await db.sql`INSERT INTO workspaces (id, name, slug) VALUES (${otherWorkspaceId}, 'Other', ${"w-" + otherWorkspaceId})`;
    for (const [id, name] of [
      [creatorUserId, "Creator"],
      [ownerUserId, "Owner"],
      [memberUserId, "Member"],
      [outsiderUserId, "Outsider"],
    ] as const) {
      await db.sql`INSERT INTO users (id, email, password_hash, name) VALUES (${id}, ${id + "@example.test"}, 'x', ${name})`;
    }
    await db.sql`INSERT INTO memberships (id, workspace_id, user_id, role) VALUES (${generateId()}, ${workspaceId}, ${creatorUserId}, 'member')`;
    await db.sql`INSERT INTO memberships (id, workspace_id, user_id, role) VALUES (${generateId()}, ${workspaceId}, ${ownerUserId}, 'owner')`;
    await db.sql`INSERT INTO memberships (id, workspace_id, user_id, role) VALUES (${generateId()}, ${workspaceId}, ${memberUserId}, 'member')`;
    // Deliberately no membership row in `workspaceId` for the outsider — only in a workspace of their own.
    await db.sql`INSERT INTO memberships (id, workspace_id, user_id, role) VALUES (${generateId()}, ${otherWorkspaceId}, ${outsiderUserId}, 'owner')`;
  });

  afterAll(async () => {
    const db = getDb();
    await db.sql`DELETE FROM workspaces WHERE id IN (${workspaceId}, ${otherWorkspaceId})`;
    await db.sql`DELETE FROM users WHERE id IN (${creatorUserId}, ${ownerUserId}, ${memberUserId}, ${outsiderUserId})`;
    await db.sql.end();
  });

  async function makeRecording(title: string): Promise<string> {
    const id = generateId();
    const db = getDb();
    await db.sql`
      INSERT INTO recordings (id, public_id, workspace_id, creator_id, title, status, object_key)
      VALUES (${id}, ${generatePublicId()}, ${workspaceId}, ${creatorUserId}, ${title}, 'ready', ${"recordings/" + id + "/original.mp4"})
    `;
    return id;
  }

  describe("rename", () => {
    it("lets the creator rename their own recording", async () => {
      const recordingId = await makeRecording("Original title");
      const updated = await updateRecording({
        recordingId,
        userId: creatorUserId,
        membershipRole: "member",
        title: "Renamed by creator",
      });
      expect(updated.title).toBe("Renamed by creator");
    });

    it("lets a workspace owner rename a recording they did not create", async () => {
      const recordingId = await makeRecording("Original title");
      const updated = await updateRecording({
        recordingId,
        userId: ownerUserId,
        membershipRole: "owner",
        title: "Renamed by owner",
      });
      expect(updated.title).toBe("Renamed by owner");
    });

    it("THE DELIBERATE-VIOLATION CHECK: refuses a same-workspace member who is neither the creator nor an owner", async () => {
      const recordingId = await makeRecording("Original title");
      await expect(
        updateRecording({
          recordingId,
          userId: memberUserId,
          membershipRole: "member",
          title: "Should never land",
        }),
      ).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
    });

    it("refuses a user from a different workspace entirely — NOT_FOUND, never a 403 that would confirm the row exists", async () => {
      const recordingId = await makeRecording("Original title");
      await expect(
        updateRecording({
          recordingId,
          userId: outsiderUserId,
          membershipRole: "owner",
          title: "Should never land",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("visibility", () => {
    it("lets the creator narrow their own recording to private", async () => {
      const recordingId = await makeRecording("Visibility target");
      const updated = await updateRecording({
        recordingId,
        userId: creatorUserId,
        membershipRole: "member",
        visibility: "private",
      });
      expect(updated.visibility).toBe("private");
    });

    it("lets a workspace owner change visibility on a recording they did not create", async () => {
      const recordingId = await makeRecording("Visibility target");
      const updated = await updateRecording({
        recordingId,
        userId: ownerUserId,
        membershipRole: "owner",
        visibility: "private",
      });
      expect(updated.visibility).toBe("private");
    });

    it("THE DELIBERATE-VIOLATION CHECK: refuses a same-workspace member who is neither the creator nor an owner", async () => {
      const recordingId = await makeRecording("Visibility target");
      await expect(
        updateRecording({
          recordingId,
          userId: memberUserId,
          membershipRole: "member",
          visibility: "unlisted",
        }),
      ).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
    });

    it("refuses a user from a different workspace entirely — NOT_FOUND, never a 403 that would confirm the row exists", async () => {
      const recordingId = await makeRecording("Visibility target");
      await expect(
        updateRecording({
          recordingId,
          userId: outsiderUserId,
          membershipRole: "owner",
          visibility: "unlisted",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // deleteRecording is exercised by its own existing coverage; imported
  // here only so `resolveEditable`'s shared rule reads as one function
  // under test across all three actions, not a coincidence between files.
  it("delete keeps using the identical rule (regression guard for the shared check)", async () => {
    const recordingId = await makeRecording("Delete target");
    await expect(
      deleteRecording({ recordingId, userId: memberUserId, membershipRole: "member" }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
  });
});
