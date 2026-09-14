import { generateId, generatePublicId } from "@recordmint/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../client.js";
import { runMigrations } from "../migrate.js";
import { getRecordingById, setRecordingPosterKey } from "../queries/recordings.js";
import { getTranscriptForRecording, upsertTranscript } from "../queries/transcripts.js";
import * as schema from "../schema/index.js";

describe.skipIf(!process.env.DATABASE_URL)("worker-facing queries: poster key and transcript upsert", () => {
  let db: Db;
  const workspaceId = generateId();
  const userId = generateId();
  const recordingId = generateId();

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
      title: "A recording the worker processes",
      objectKey: `recordings/${recordingId}/original.mp4`,
    });
  });

  afterAll(async () => {
    await db.orm.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
    await db.orm.delete(schema.users).where(eq(schema.users.id, userId));
    await db.sql.end();
  });

  it("sets a recording's poster key without touching anything else", async () => {
    const before = await getRecordingById(db.orm, recordingId);
    expect(before?.posterKey).toBeNull();

    const updated = await setRecordingPosterKey(db.orm, recordingId, `recordings/${recordingId}/poster.jpg`);
    expect(updated?.posterKey).toBe(`recordings/${recordingId}/poster.jpg`);
    expect(updated?.title).toBe(before?.title); // untouched
  });

  it("upserts a transcript through its whole lifecycle: pending, then ready", async () => {
    expect(await getTranscriptForRecording(db.orm, recordingId)).toBeNull();

    const pending = await upsertTranscript(db.orm, { id: generateId(), recordingId, status: "pending" });
    expect(pending.status).toBe("pending");

    const ready = await upsertTranscript(db.orm, {
      id: generateId(), // ignored on conflict — the row keeps its original id
      recordingId,
      status: "ready",
      language: "en",
      objectKey: `recordings/${recordingId}/transcript.vtt`,
      text: "hello world",
    });
    expect(ready.id).toBe(pending.id);
    expect(ready.status).toBe("ready");
    expect(ready.text).toBe("hello world");

    const fetched = await getTranscriptForRecording(db.orm, recordingId);
    expect(fetched?.status).toBe("ready");
  });

  it("upserts a failure state without throwing — a missing transcription binary is not a database error", async () => {
    const failed = await upsertTranscript(db.orm, {
      id: generateId(),
      recordingId,
      status: "failed",
      errorMessage: "transcription binary not found",
    });
    expect(failed.status).toBe("failed");
    expect(failed.errorMessage).toBe("transcription binary not found");
  });
});
