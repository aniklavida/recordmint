import { generateId, generatePublicId } from "@recordmint/shared";
import { createReaction, resolveReactorKey } from "@recordmint/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../../../../lib/db.js";
import { addReaction, listReactions } from "../reactions.js";

/**
 * Runs against a real, throwaway Postgres (skipped without DATABASE_URL,
 * matching every other DB-backed suite in this repository). This is the
 * permission-rules proof for reactions: access must match comments
 * exactly (visibility, then the guest-commenting toggle), plus the two
 * reaction-specific limits (one of each emoji per timestamp window per
 * viewer, and a rate limit).
 */
describe.skipIf(!process.env.DATABASE_URL)("reaction permission rules", () => {
  const memberUserId = generateId();
  const outsiderUserId = generateId();
  const workspaceId = generateId();
  const outsiderWorkspaceId = generateId();
  const privateRecordingId = generateId();
  const guestsOffRecordingId = generateId();
  const guestsOnRecordingId = generateId();
  const rateLimitRecordingId = generateId();

  beforeAll(async () => {
    const db = getDb();
    await db.sql`INSERT INTO workspaces (id, name, slug) VALUES (${workspaceId}, 'W', ${"w-" + workspaceId})`;
    await db.sql`INSERT INTO workspaces (id, name, slug) VALUES (${outsiderWorkspaceId}, 'Other', ${"w-" + outsiderWorkspaceId})`;
    await db.sql`INSERT INTO users (id, email, password_hash, name) VALUES (${memberUserId}, ${memberUserId + "@example.test"}, 'x', 'Member')`;
    await db.sql`INSERT INTO users (id, email, password_hash, name) VALUES (${outsiderUserId}, ${outsiderUserId + "@example.test"}, 'x', 'Outsider')`;
    await db.sql`INSERT INTO memberships (id, workspace_id, user_id, role) VALUES (${generateId()}, ${workspaceId}, ${memberUserId}, 'owner')`;
    await db.sql`INSERT INTO memberships (id, workspace_id, user_id, role) VALUES (${generateId()}, ${outsiderWorkspaceId}, ${outsiderUserId}, 'owner')`;

    for (const [id, visibility, guestCommentingEnabled] of [
      [privateRecordingId, "private", false],
      [guestsOffRecordingId, "unlisted", false],
      [guestsOnRecordingId, "unlisted", true],
      [rateLimitRecordingId, "unlisted", false],
    ] as const) {
      await db.sql`
        INSERT INTO recordings (id, public_id, workspace_id, creator_id, title, status, visibility, guest_commenting_enabled, object_key)
        VALUES (${id}, ${generatePublicId()}, ${workspaceId}, ${memberUserId}, ${"Recording " + id}, 'ready', ${visibility}, ${guestCommentingEnabled}, ${"recordings/" + id + "/original.mp4"})
      `;
    }
  });

  afterAll(async () => {
    const db = getDb();
    await db.sql`DELETE FROM workspaces WHERE id IN (${workspaceId}, ${outsiderWorkspaceId})`;
    await db.sql`DELETE FROM users WHERE id IN (${memberUserId}, ${outsiderUserId})`;
    await db.sql.end();
  });

  async function publicIdOf(recordingId: string): Promise<string> {
    const db = getDb();
    const rows = await db.sql`SELECT public_id FROM recordings WHERE id = ${recordingId}`;
    return rows[0]!.public_id as string;
  }

  it("lets a workspace member react to their own workspace's private recording", async () => {
    const publicId = await publicIdOf(privateRecordingId);
    const reaction = await addReaction({
      publicId,
      viewerUserId: memberUserId,
      emoji: "👍",
      timestampSeconds: 1,
    });
    expect(reaction.emoji).toBe("👍");
  });

  it("refuses a member of a different workspace, exactly like a comment would — NOT_FOUND, never a 403 that confirms the row exists", async () => {
    const publicId = await publicIdOf(privateRecordingId);
    await expect(
      addReaction({ publicId, viewerUserId: outsiderUserId, emoji: "👍", timestampSeconds: 2 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses an anonymous guest on a private recording", async () => {
    const publicId = await publicIdOf(privateRecordingId);
    await expect(
      addReaction({ publicId, viewerUserId: null, emoji: "👍", timestampSeconds: 3 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("THE DELIBERATE-VIOLATION CHECK: refuses an anonymous guest on an unlisted recording with guest commenting switched off", async () => {
    const publicId = await publicIdOf(guestsOffRecordingId);
    await expect(
      addReaction({ publicId, viewerUserId: null, emoji: "👍", timestampSeconds: 4 }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
  });

  it("lets an anonymous guest react once guest commenting is switched on for that recording", async () => {
    const publicId = await publicIdOf(guestsOnRecordingId);
    const reaction = await addReaction({
      publicId,
      viewerUserId: null,
      emoji: "❤️",
      timestampSeconds: 5,
      guestIp: "203.0.113.1",
    });
    expect(reaction.emoji).toBe("❤️");
    const listed = await listReactions({ publicId, viewerUserId: null });
    expect(listed).toHaveLength(1);
  });

  it("rejects an emoji outside the fixed set", async () => {
    const publicId = await publicIdOf(guestsOnRecordingId);
    await expect(
      addReaction({ publicId, viewerUserId: memberUserId, emoji: "🍕", timestampSeconds: 6 }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("limits a viewer to one of each emoji per timestamp window", async () => {
    const publicId = await publicIdOf(guestsOnRecordingId);
    await addReaction({ publicId, viewerUserId: memberUserId, emoji: "😮", timestampSeconds: 50 });
    // 52s falls in the same 5-second window as 50s.
    await expect(
      addReaction({ publicId, viewerUserId: memberUserId, emoji: "😮", timestampSeconds: 52 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // A different emoji at the same moment is not a duplicate.
    const different = await addReaction({ publicId, viewerUserId: memberUserId, emoji: "👏", timestampSeconds: 50 });
    expect(different.emoji).toBe("👏");
  });

  it("rate-limits a viewer who has already reacted 20 times on this recording in the last minute", async () => {
    const db = getDb();
    const reactorKey = resolveReactorKey({ viewerUserId: memberUserId });
    for (let i = 0; i < 20; i++) {
      const created = await createReaction(db.orm, {
        id: generateId(),
        recordingId: rateLimitRecordingId,
        emoji: "👍",
        timestampSeconds: i * 10,
        reactorUserId: memberUserId,
        reactorKey,
      });
      expect(created).not.toBeNull();
    }

    const publicId = await publicIdOf(rateLimitRecordingId);

    // Blocked even with a fresh emoji and a fresh moment — the limit is
    // per-viewer-per-recording, not per-emoji or per-timestamp-window.
    await expect(
      addReaction({ publicId, viewerUserId: memberUserId, emoji: "👏", timestampSeconds: 5000 }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });

    // The limit is scoped per reactor, not per recording — a different
    // viewer's own attempts on the very same recording are unaffected.
    const fromDifferentViewer = await addReaction({
      publicId,
      viewerUserId: outsiderUserId,
      emoji: "👏",
      timestampSeconds: 5010,
    });
    expect(fromDifferentViewer.emoji).toBe("👏");
  });
});
