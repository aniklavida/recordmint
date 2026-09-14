import { QUEUE_NAMES } from "@recordmint/db";
import { generateId, generatePublicId } from "@recordmint/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../../../../lib/db.js";
import { addComment } from "../comments.js";

/**
 * Runs against a real, throwaway Postgres (skipped without DATABASE_URL,
 * matching every other DB-backed suite in this repository). This proves
 * `addComment`'s enqueue side: a comment from someone other than the
 * recording's creator lands exactly one job in the existing pg-boss
 * queue no matter how many such comments arrive close together — the
 * batching guarantee is a real database unique constraint pg-boss owns
 * (`singletonKey` + `singletonSeconds`), not application bookkeeping —
 * and a comment from the creator on their own recording never enqueues
 * anything at all.
 */
describe.skipIf(!process.env.DATABASE_URL)("new-comment notification enqueue", () => {
  const workspaceId = generateId();
  const creatorId = generateId();
  const memberId = generateId();
  const secondMemberId = generateId();
  const recordingId = generateId();
  let publicId: string;

  beforeAll(async () => {
    const db = getDb();
    publicId = generatePublicId();
    await db.sql`INSERT INTO workspaces (id, name, slug) VALUES (${workspaceId}, 'W', ${"w-" + workspaceId})`;
    await db.sql`INSERT INTO users (id, email, password_hash, name) VALUES (${creatorId}, ${creatorId + "@example.test"}, 'x', 'Creator')`;
    await db.sql`INSERT INTO users (id, email, password_hash, name) VALUES (${memberId}, ${memberId + "@example.test"}, 'x', 'Member One')`;
    await db.sql`INSERT INTO users (id, email, password_hash, name) VALUES (${secondMemberId}, ${secondMemberId + "@example.test"}, 'x', 'Member Two')`;
    await db.sql`INSERT INTO memberships (id, workspace_id, user_id, role) VALUES (${generateId()}, ${workspaceId}, ${creatorId}, 'owner')`;
    await db.sql`INSERT INTO memberships (id, workspace_id, user_id, role) VALUES (${generateId()}, ${workspaceId}, ${memberId}, 'member')`;
    await db.sql`INSERT INTO memberships (id, workspace_id, user_id, role) VALUES (${generateId()}, ${workspaceId}, ${secondMemberId}, 'member')`;
    await db.sql`
      INSERT INTO recordings (id, public_id, workspace_id, creator_id, title, status, visibility, object_key)
      VALUES (${recordingId}, ${publicId}, ${workspaceId}, ${creatorId}, 'Enqueue test', 'ready', 'unlisted', ${"recordings/" + recordingId + "/original.mp4"})
    `;
  });

  afterAll(async () => {
    const db = getDb();
    await db.sql`DELETE FROM workspaces WHERE id = ${workspaceId}`;
    await db.sql`DELETE FROM users WHERE id IN (${creatorId}, ${memberId}, ${secondMemberId})`;
    await db.sql.end();
  });

  async function countNotificationJobs(): Promise<number> {
    const db = getDb();
    const rows = await db.sql`
      SELECT id FROM pgboss.job WHERE name = ${QUEUE_NAMES.commentNotification} AND singleton_key = ${recordingId}
    `;
    return rows.length;
  }

  it("enqueues exactly one notification job for a burst of comments from different people on the same recording", async () => {
    await addComment({ publicId, viewerUserId: memberId, timestampSeconds: 1, body: "first" });
    await addComment({ publicId, viewerUserId: secondMemberId, timestampSeconds: 2, body: "second" });
    await addComment({ publicId, viewerUserId: memberId, timestampSeconds: 3, body: "third" });

    expect(await countNotificationJobs()).toBe(1);
  });

  it("never enqueues an additional job for the recording creator's own comment", async () => {
    const before = await countNotificationJobs();
    await addComment({ publicId, viewerUserId: creatorId, timestampSeconds: 4, body: "my own note" });
    expect(await countNotificationJobs()).toBe(before);
  });
});
