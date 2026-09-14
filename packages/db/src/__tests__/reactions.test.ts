import { generateId, generatePublicId } from "@recordmint/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../client.js";
import { runMigrations } from "../migrate.js";
import {
  countReactionsByReactorSince,
  createReaction,
  listReactionsForRecording,
  resolveReactorKey,
} from "../queries/reactions.js";
import * as schema from "../schema/index.js";

describe.skipIf(!process.env.DATABASE_URL)("reactions", () => {
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
      title: "A recording with reactions",
      objectKey: `recordings/${recordingId}/original.mp4`,
    });
  });

  afterAll(async () => {
    await db.orm.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
    await db.orm.delete(schema.users).where(eq(schema.users.id, userId));
    await db.sql.end();
  });

  it("hashes a guest IP rather than storing it raw", () => {
    const key = resolveReactorKey({ guestIp: "203.0.113.9" });
    expect(key.startsWith("guest:")).toBe(true);
    expect(key).not.toContain("203.0.113.9");
    // Deterministic: the same IP always resolves to the same key, which is
    // what makes the per-viewer limit below possible at all.
    expect(resolveReactorKey({ guestIp: "203.0.113.9" })).toBe(key);
  });

  it("keys an authenticated reactor by user id, not by any supplied IP", () => {
    expect(resolveReactorKey({ viewerUserId: userId, guestIp: "203.0.113.9" })).toBe(`user:${userId}`);
  });

  it("stores a reaction and lists it back without any reactor identity", async () => {
    const reactorKey = resolveReactorKey({ viewerUserId: userId });
    const created = await createReaction(db.orm, {
      id: generateId(),
      recordingId,
      emoji: "👍",
      timestampSeconds: 12,
      reactorUserId: userId,
      reactorKey,
    });
    expect(created).not.toBeNull();

    const rows = await listReactionsForRecording(db.orm, recordingId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ emoji: "👍", timestampSeconds: 12 });
    // The whole point of the DTO: nothing here answers "who reacted."
    expect(rows[0]).not.toHaveProperty("reactorKey");
    expect(rows[0]).not.toHaveProperty("reactorUserId");
  });

  it("refuses a second identical reaction in the same timestamp window from the same reactor, at the database layer", async () => {
    const reactorKey = resolveReactorKey({ guestIp: "198.51.100.4" });
    const first = await createReaction(db.orm, {
      id: generateId(),
      recordingId,
      emoji: "❤️",
      timestampSeconds: 40,
      reactorKey,
    });
    expect(first).not.toBeNull();

    // 42s is in the same 5-second window as 40s (both floor to window 8).
    const duplicate = await createReaction(db.orm, {
      id: generateId(),
      recordingId,
      emoji: "❤️",
      timestampSeconds: 42,
      reactorKey,
    });
    expect(duplicate).toBeNull();

    // A different emoji at the same moment is a different reaction, not a duplicate.
    const differentEmoji = await createReaction(db.orm, {
      id: generateId(),
      recordingId,
      emoji: "😮",
      timestampSeconds: 40,
      reactorKey,
    });
    expect(differentEmoji).not.toBeNull();

    // The same emoji far enough away (a different window) is allowed again.
    const laterWindow = await createReaction(db.orm, {
      id: generateId(),
      recordingId,
      emoji: "❤️",
      timestampSeconds: 90,
      reactorKey,
    });
    expect(laterWindow).not.toBeNull();
  });

  it("counts only a given reactor's own recent reactions on a given recording — the rate limit's whole basis", async () => {
    const reactorKey = resolveReactorKey({ guestIp: "198.51.100.77" });
    const since = new Date(Date.now() - 60_000);
    expect(await countReactionsByReactorSince(db.orm, { recordingId, reactorKey, since })).toBe(0);

    await createReaction(db.orm, { id: generateId(), recordingId, emoji: "😂", timestampSeconds: 200, reactorKey });
    await createReaction(db.orm, { id: generateId(), recordingId, emoji: "👏", timestampSeconds: 210, reactorKey });

    expect(await countReactionsByReactorSince(db.orm, { recordingId, reactorKey, since })).toBe(2);
    // A different reactor's reactions never count toward this one's limit.
    expect(
      await countReactionsByReactorSince(db.orm, { recordingId, reactorKey: resolveReactorKey({ guestIp: "203.0.113.200" }), since }),
    ).toBe(0);
  });
});
