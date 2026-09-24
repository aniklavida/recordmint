import { generateId, generatePublicId } from "@recordmint/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../../../../lib/db.js";
import { requestTrim } from "../trim.js";

const workspaceId = generateId();
const otherWorkspaceId = generateId();
const creatorId = generateId();
const ownerId = generateId();
const memberId = generateId();
const outsiderId = generateId();

async function makeRecording(): Promise<string> {
  const id = generateId();
  await getDb().sql`
    INSERT INTO recordings (id, public_id, workspace_id, creator_id, title, status, object_key, container, duration_seconds)
    VALUES (${id}, ${generatePublicId()}, ${workspaceId}, ${creatorId}, 'Trim target', 'ready', ${`recordings/${id}/original.mp4`}, 'mp4', 10)
  `;
  return id;
}

describe.skipIf(!process.env.DATABASE_URL)("trim permission rules", () => {
  beforeAll(async () => {
    const db = getDb();
    await db.sql`INSERT INTO workspaces (id, name, slug) VALUES (${workspaceId}, 'W', ${`w-${workspaceId}`})`;
    await db.sql`INSERT INTO workspaces (id, name, slug) VALUES (${otherWorkspaceId}, 'Other', ${`w-${otherWorkspaceId}`})`;
    for (const [id, name] of [[creatorId, "Creator"], [ownerId, "Owner"], [memberId, "Member"], [outsiderId, "Outsider"]] as const) {
      await db.sql`INSERT INTO users (id, email, password_hash, name) VALUES (${id}, ${`${id}@example.test`}, 'x', ${name})`;
    }
    await db.sql`INSERT INTO memberships (id, workspace_id, user_id, role) VALUES (${generateId()}, ${workspaceId}, ${creatorId}, 'member')`;
    await db.sql`INSERT INTO memberships (id, workspace_id, user_id, role) VALUES (${generateId()}, ${workspaceId}, ${ownerId}, 'owner')`;
    await db.sql`INSERT INTO memberships (id, workspace_id, user_id, role) VALUES (${generateId()}, ${workspaceId}, ${memberId}, 'member')`;
    await db.sql`INSERT INTO memberships (id, workspace_id, user_id, role) VALUES (${generateId()}, ${otherWorkspaceId}, ${outsiderId}, 'owner')`;
  });

  afterAll(async () => {
    const db = getDb();
    await db.sql`DELETE FROM workspaces WHERE id IN (${workspaceId}, ${otherWorkspaceId})`;
    await db.sql`DELETE FROM users WHERE id IN (${creatorId}, ${ownerId}, ${memberId}, ${outsiderId})`;
    await db.sql.end();
  });

  it("lets the creator request a trim", async () => {
    const recordingId = await makeRecording();
    await expect(requestTrim({ recordingId, userId: creatorId, membershipRole: "member", startSeconds: 1, endSeconds: 5 })).resolves.toMatchObject({ trimStatus: "pending" });
  });

  it("lets a workspace owner request a trim for another creator's recording", async () => {
    const recordingId = await makeRecording();
    await expect(requestTrim({ recordingId, userId: ownerId, membershipRole: "owner", startSeconds: 1, endSeconds: 5 })).resolves.toMatchObject({ trimStatus: "pending" });
  });

  it("refuses a same-workspace member who is neither the creator nor an owner", async () => {
    const recordingId = await makeRecording();
    await expect(requestTrim({ recordingId, userId: memberId, membershipRole: "member", startSeconds: 1, endSeconds: 5 })).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
  });

  it("returns NOT_FOUND to a user from another workspace", async () => {
    const recordingId = await makeRecording();
    await expect(requestTrim({ recordingId, userId: outsiderId, membershipRole: "owner", startSeconds: 1, endSeconds: 5 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
