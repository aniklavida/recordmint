import { generateId, generatePublicId } from "@recordmint/shared";
import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { getDb } from "../../../../lib/db.js";
import { listLibrary } from "../library.js";

/**
 * The library page (built this session) calls `listLibrary` directly with
 * whatever `workspaceId` is in the URL — a workspace switcher is just a
 * link with a different query parameter, and nothing stops a browser from
 * typing one in by hand. This proves the function itself, not just
 * `packages/db`'s `listRecordingsForMember` in isolation, never returns a
 * recording from a workspace the caller does not belong to — the same
 * property `packages/db`'s own `visibility.test.ts` proves one layer
 * down, checked again here at the layer the new page actually calls.
 */
describe.skipIf(!process.env.DATABASE_URL)("library cross-workspace isolation", () => {
  const ownWorkspaceId = generateId();
  const otherWorkspaceId = generateId();
  const userId = generateId();
  const ownRecordingId = generateId();
  const otherRecordingId = generateId();

  beforeAll(async () => {
    const db = getDb();
    await db.sql`INSERT INTO workspaces (id, name, slug) VALUES (${ownWorkspaceId}, 'Mine', ${"mine-" + ownWorkspaceId})`;
    await db.sql`INSERT INTO workspaces (id, name, slug) VALUES (${otherWorkspaceId}, 'Someone else''s', ${"theirs-" + otherWorkspaceId})`;
    await db.sql`INSERT INTO users (id, email, password_hash, name) VALUES (${userId}, ${userId + "@example.test"}, 'x', 'Library User')`;
    await db.sql`INSERT INTO memberships (id, workspace_id, user_id, role) VALUES (${generateId()}, ${ownWorkspaceId}, ${userId}, 'owner')`;
    // Deliberately no membership row for `otherWorkspaceId` — this user has never been invited there.
    await db.sql`
      INSERT INTO recordings (id, public_id, workspace_id, creator_id, title, status, object_key)
      VALUES (${ownRecordingId}, ${generatePublicId()}, ${ownWorkspaceId}, ${userId}, 'A recording in my own workspace', 'ready', ${"recordings/" + ownRecordingId + "/original.mp4"})
    `;
    await db.sql`
      INSERT INTO recordings (id, public_id, workspace_id, creator_id, title, status, object_key)
      VALUES (${otherRecordingId}, ${generatePublicId()}, ${otherWorkspaceId}, ${userId}, 'A recording that belongs to a workspace I am not in', 'ready', ${"recordings/" + otherRecordingId + "/original.mp4"})
    `;
  });

  afterAll(async () => {
    const db = getDb();
    await db.sql`DELETE FROM workspaces WHERE id IN (${ownWorkspaceId}, ${otherWorkspaceId})`;
    await db.sql`DELETE FROM users WHERE id = ${userId}`;
    await db.sql.end();
  });

  it("returns this workspace's recording when the caller is a member", async () => {
    const recordings = await listLibrary({ workspaceId: ownWorkspaceId, userId });
    expect(recordings.map((r) => r.id)).toContain(ownRecordingId);
  });

  it("never returns a recording from a workspace the caller does not belong to, even though the row exists and its creator matches", async () => {
    const recordings = await listLibrary({ workspaceId: otherWorkspaceId, userId });
    expect(recordings).toHaveLength(0);
    expect(recordings.map((r) => r.id)).not.toContain(otherRecordingId);
  });

  it("holds under a search query too, not only the unfiltered list", async () => {
    const recordings = await listLibrary({ workspaceId: otherWorkspaceId, userId, query: "workspace" });
    expect(recordings).toHaveLength(0);
  });
});
