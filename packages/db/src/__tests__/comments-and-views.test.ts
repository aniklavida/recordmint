import { generateId, generatePublicId } from "@recordmint/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../client.js";
import { runMigrations } from "../migrate.js";
import { createComment, listCommentsForRecording } from "../queries/comments.js";
import { countViewsForRecording, countViewsForRecordings, recordView } from "../queries/views.js";
import * as schema from "../schema/index.js";

describe.skipIf(!process.env.DATABASE_URL)("comments and view events", () => {
  let db: Db;
  const workspaceId = generateId();
  const userId = generateId();
  const recordingId = generateId();
  const secondRecordingId = generateId();

  beforeAll(async () => {
    db = createDb({ connectionString: process.env.DATABASE_URL! });
    await runMigrations();
    await db.orm.insert(schema.workspaces).values({ id: workspaceId, name: "W", slug: `w-${workspaceId}` });
    await db.orm.insert(schema.users).values({ id: userId, email: `u-${userId}@example.test`, passwordHash: "x", name: "U" });
    await db.orm.insert(schema.recordings).values({
      id: recordingId,
      publicId: generatePublicId(),
      workspaceId,
      creatorId: userId,
      title: "A recording with comments",
      objectKey: `recordings/${recordingId}/original.mp4`,
    });
    await db.orm.insert(schema.recordings).values({
      id: secondRecordingId,
      publicId: generatePublicId(),
      workspaceId,
      creatorId: userId,
      title: "A second recording, never viewed",
      objectKey: `recordings/${secondRecordingId}/original.mp4`,
    });
  });

  afterAll(async () => {
    await db.orm.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
    await db.orm.delete(schema.users).where(eq(schema.users.id, userId));
    await db.sql.end();
  });

  it("refuses a comment with neither an author nor a guest name", async () => {
    await expect(
      createComment(db.orm, { id: generateId(), recordingId, timestampSeconds: 1, body: "orphan" }),
    ).rejects.toThrow();
  });

  it("stores a member comment and a guest comment, ordered by playhead position", async () => {
    await createComment(db.orm, {
      id: generateId(),
      recordingId,
      authorUserId: userId,
      timestampSeconds: 42,
      body: "at 0:42",
    });
    await createComment(db.orm, {
      id: generateId(),
      recordingId,
      guestName: "A Guest",
      timestampSeconds: 5,
      body: "at 0:05",
    });

    const comments = await listCommentsForRecording(db.orm, recordingId);
    expect(comments.map((c) => c.comment.timestampSeconds)).toEqual([5, 42]);
    expect(comments[0]!.comment.guestName).toBe("A Guest");
    expect(comments[0]!.author).toBeNull();
    expect(comments[1]!.author?.id).toBe(userId);
  });

  it("threads a reply one level deep via parentCommentId", async () => {
    const parent = await createComment(db.orm, {
      id: generateId(),
      recordingId,
      authorUserId: userId,
      timestampSeconds: 10,
      body: "parent",
    });
    const reply = await createComment(db.orm, {
      id: generateId(),
      recordingId,
      parentCommentId: parent.id,
      authorUserId: userId,
      timestampSeconds: 10,
      body: "reply",
    });
    expect(reply.parentCommentId).toBe(parent.id);
  });

  it("counts view events without exposing anything beyond a count", async () => {
    expect(await countViewsForRecording(db.orm, recordingId)).toBe(0);
    await recordView(db.orm, { id: generateId(), recordingId, viewerUserId: userId });
    await recordView(db.orm, { id: generateId(), recordingId, viewerUserId: null }); // anonymous share-link viewer
    expect(await countViewsForRecording(db.orm, recordingId)).toBe(2);
  });

  it("counts multiple recordings in one grouped query, for the library list's per-row view count", async () => {
    const counts = await countViewsForRecordings(db.orm, [recordingId, secondRecordingId]);
    expect(counts.get(recordingId)).toBe(2); // from the previous test's two recorded views
    expect(counts.has(secondRecordingId)).toBe(false); // never viewed — no row, not a zero row
    expect(await countViewsForRecordings(db.orm, [])).toEqual(new Map());
  });
});
