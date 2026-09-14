import { generateId, generatePublicId } from "@recordmint/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../client.js";
import { runMigrations } from "../migrate.js";
import {
  deleteRecordingRow,
  searchRecordingsForMember,
  updateRecordingMetadata,
} from "../queries/recordings.js";
import { listAbandonedUploads, listRecordingsPastRetention } from "../queries/retention.js";
import * as schema from "../schema/index.js";

describe.skipIf(!process.env.DATABASE_URL)("retention and library search", () => {
  let db: Db;
  const workspaceRetained = generateId(); // retentionDays = 1, has an old recording
  const workspaceForever = generateId(); // retentionDays = null, has an equally old recording
  const userId = generateId();
  const oldRecordingId = generateId();
  const foreverRecordingId = generateId();
  const abandonedRecordingId = generateId();
  const searchableRecordingId = generateId();

  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    db = createDb({ connectionString: process.env.DATABASE_URL! });
    await runMigrations();

    await db.orm.insert(schema.workspaces).values([
      { id: workspaceRetained, name: "Retained", slug: `retained-${workspaceRetained}`, retentionDays: 1 },
      { id: workspaceForever, name: "Forever", slug: `forever-${workspaceForever}` },
    ]);
    await db.orm
      .insert(schema.users)
      .values({ id: userId, email: `search-${userId}@example.test`, passwordHash: "x", name: "Searcher" });
    await db.orm.insert(schema.memberships).values({
      id: generateId(),
      workspaceId: workspaceRetained,
      userId,
      role: "owner",
    });

    await db.orm.insert(schema.recordings).values([
      {
        id: oldRecordingId,
        publicId: generatePublicId(),
        workspaceId: workspaceRetained,
        creatorId: userId,
        title: "Old recording past its workspace's retention",
        objectKey: `recordings/${oldRecordingId}/original.mp4`,
        status: "ready",
        createdAt: twoDaysAgo,
      },
      {
        id: foreverRecordingId,
        publicId: generatePublicId(),
        workspaceId: workspaceForever,
        creatorId: userId,
        title: "Equally old, but its workspace keeps forever",
        objectKey: `recordings/${foreverRecordingId}/original.mp4`,
        status: "ready",
        createdAt: twoDaysAgo,
      },
      {
        id: abandonedRecordingId,
        publicId: generatePublicId(),
        workspaceId: workspaceRetained,
        creatorId: userId,
        title: "Never finished uploading",
        objectKey: `recordings/${abandonedRecordingId}/original.mp4`,
        status: "uploading",
        uploadId: "abandoned-multipart-upload-id",
        createdAt: twoDaysAgo,
      },
      {
        id: searchableRecordingId,
        publicId: generatePublicId(),
        workspaceId: workspaceRetained,
        creatorId: userId,
        title: "Quarterly planning walkthrough",
        objectKey: `recordings/${searchableRecordingId}/original.mp4`,
        status: "ready",
      },
    ]);

    await db.orm.insert(schema.transcripts).values({
      id: generateId(),
      recordingId: searchableRecordingId,
      status: "ready",
      objectKey: `recordings/${searchableRecordingId}/transcript.vtt`,
      text: "let's talk about the roadmap for next quarter",
    });
  });

  afterAll(async () => {
    await db.orm.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceRetained));
    await db.orm.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceForever));
    await db.orm.delete(schema.users).where(eq(schema.users.id, userId));
    await db.sql.end();
  });

  it("finds only the recording whose workspace has a retention policy it has outlived", async () => {
    const overdue = await listRecordingsPastRetention(db.orm);
    const ids = overdue.map((r) => r.id);
    expect(ids).toContain(oldRecordingId);
    expect(ids).not.toContain(foreverRecordingId);
  });

  it("finds the abandoned upload and nothing that finished or never started", async () => {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000); // older than 1 hour
    const abandoned = await listAbandonedUploads(db.orm, cutoff);
    const ids = abandoned.map((r) => r.id);
    expect(ids).toContain(abandonedRecordingId);
    expect(ids).not.toContain(oldRecordingId); // status "ready", not "uploading"
  });

  it("deletes a recording row", async () => {
    await deleteRecordingRow(db.orm, oldRecordingId);
    const remaining = await db.orm.select().from(schema.recordings).where(eq(schema.recordings.id, oldRecordingId));
    expect(remaining).toHaveLength(0);
  });

  it("renames a recording and changes its visibility", async () => {
    const updated = await updateRecordingMetadata(db.orm, searchableRecordingId, {
      title: "Renamed",
      visibility: "private",
    });
    expect(updated?.title).toBe("Renamed");
    expect(updated?.visibility).toBe("private");
  });

  it("searches the library by title", async () => {
    const results = await searchRecordingsForMember(db.orm, {
      workspaceId: workspaceRetained,
      userId,
      query: "Renamed",
    });
    expect(results.map((r) => r.id)).toContain(searchableRecordingId);
  });

  it("searches the library by transcript text when title does not match", async () => {
    const results = await searchRecordingsForMember(db.orm, {
      workspaceId: workspaceRetained,
      userId,
      query: "roadmap",
    });
    expect(results.map((r) => r.id)).toContain(searchableRecordingId);
  });

  it("finds nothing for a query that matches neither title nor transcript", async () => {
    const results = await searchRecordingsForMember(db.orm, {
      workspaceId: workspaceRetained,
      userId,
      query: "nonexistent-search-term-xyz",
    });
    expect(results).toHaveLength(0);
  });
});
