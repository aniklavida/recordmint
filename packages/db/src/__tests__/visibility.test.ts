import { generateId, generatePublicId } from "@recordmint/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../client.js";
import { getRecordingForMember, getRecordingForPublicLink, listRecordingsForMember } from "../queries/recordings.js";
import { runMigrations } from "../migrate.js";
import * as schema from "../schema/index.js";

/**
 * The card's explicit test: "insert two workspaces, attempt a
 * cross-workspace read, confirm it returns nothing." Runs against a real
 * Postgres — there is no mock here that could hide a query bug, which is
 * the entire point of testing a query that is the access-control boundary.
 *
 * Skipped without DATABASE_URL so `pnpm test` stays green in CI, which
 * has no Postgres service. Run it for real with:
 *   DATABASE_URL=postgres://... pnpm --filter @recordmint/db test
 */
describe.skipIf(!process.env.DATABASE_URL)("recording visibility", () => {
  let db: Db;

  const workspaceAId = generateId();
  const workspaceBId = generateId();
  const aliceId = generateId(); // member of workspace A only
  const recordingAId = generateId(); // lives in workspace A
  const recordingBId = generateId(); // lives in workspace B — Alice must never see this

  beforeAll(async () => {
    db = createDb({ connectionString: process.env.DATABASE_URL! });
    await runMigrations();

    await db.orm.insert(schema.workspaces).values([
      { id: workspaceAId, name: "Workspace A", slug: `workspace-a-${workspaceAId}` },
      { id: workspaceBId, name: "Workspace B", slug: `workspace-b-${workspaceBId}` },
    ]);

    await db.orm.insert(schema.users).values({
      id: aliceId,
      email: `alice-${aliceId}@example.test`,
      passwordHash: "argon2id$test-fixture-not-a-real-hash",
      name: "Alice",
    });

    await db.orm.insert(schema.memberships).values({
      id: generateId(),
      workspaceId: workspaceAId,
      userId: aliceId,
      role: "member",
    });

    await db.orm.insert(schema.recordings).values([
      {
        id: recordingAId,
        publicId: generatePublicId(),
        workspaceId: workspaceAId,
        creatorId: aliceId,
        title: "Alice's own recording",
        objectKey: `recordings/${recordingAId}/original.mp4`,
      },
      {
        id: recordingBId,
        publicId: generatePublicId(),
        workspaceId: workspaceBId,
        creatorId: aliceId,
        title: "A workspace B recording Alice does not belong to",
        objectKey: `recordings/${recordingBId}/original.mp4`,
        visibility: "private",
      },
    ]);
  });

  afterAll(async () => {
    // workspaces cascade into memberships and recordings; users afterwards
    // (recordings.creatorId is ON DELETE RESTRICT, so it must go first).
    await db.orm.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceAId));
    await db.orm.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceBId));
    await db.orm.delete(schema.users).where(eq(schema.users.id, aliceId));
    await db.sql.end();
  });

  it("returns a recording the caller's workspace actually owns", async () => {
    const recording = await getRecordingForMember(db.orm, {
      recordingId: recordingAId,
      userId: aliceId,
    });
    expect(recording?.id).toBe(recordingAId);
  });

  it("returns nothing for a recording in a workspace the caller is not a member of", async () => {
    const recording = await getRecordingForMember(db.orm, {
      recordingId: recordingBId,
      userId: aliceId,
    });
    expect(recording).toBeNull();
  });

  it("never includes a cross-workspace recording when listing by workspace id", async () => {
    // Alice is not a member of workspace B — asking for its list, as if
    // the UI wrongly let her, must come back empty rather than erroring
    // (which would leak that the workspace exists) or returning rows.
    const recordings = await listRecordingsForMember(db.orm, {
      workspaceId: workspaceBId,
      userId: aliceId,
    });
    expect(recordings).toHaveLength(0);
  });

  it("still lists the recordings in a workspace the caller does belong to", async () => {
    const recordings = await listRecordingsForMember(db.orm, {
      workspaceId: workspaceAId,
      userId: aliceId,
    });
    expect(recordings.map((r) => r.id)).toEqual([recordingAId]);
  });

  it("refuses a private recording to an anonymous share-link viewer", async () => {
    const [publicRow] = await db.orm
      .select({ publicId: schema.recordings.publicId })
      .from(schema.recordings)
      .where(eq(schema.recordings.id, recordingBId));
    const resolved = await getRecordingForPublicLink(db.orm, {
      publicId: publicRow!.publicId,
    });
    expect(resolved).toBeNull();
  });

  it("resolves an unlisted recording for an anonymous share-link viewer", async () => {
    const [publicRow] = await db.orm
      .select({ publicId: schema.recordings.publicId })
      .from(schema.recordings)
      .where(eq(schema.recordings.id, recordingAId));
    const resolved = await getRecordingForPublicLink(db.orm, {
      publicId: publicRow!.publicId,
    });
    expect(resolved?.id).toBe(recordingAId);
  });
});
