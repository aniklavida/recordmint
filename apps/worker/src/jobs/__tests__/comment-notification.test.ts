import { createDb, runMigrations, setNewCommentEmailEnabled } from "@recordmint/db";
import * as schema from "@recordmint/db";
import { generateId, generatePublicId } from "@recordmint/shared";
import { CapturingMailTransport } from "@recordmint/shared/mail";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCommentNotificationJob } from "../comment-notification.js";

/**
 * Runs against a real, throwaway Postgres (skipped without DATABASE_URL,
 * matching every other DB-backed suite in this repository) and a real,
 * in-memory `CapturingMailTransport` — never a live SMTP relay, per this
 * work's own instruction that no test may send real email.
 *
 * Each `it` block gets its own freshly seeded recording and creator, so
 * the digest window (`createdAt >= enqueuedAt`) never has to account for
 * another test's comments.
 */
describe.skipIf(!process.env.DATABASE_URL)("runCommentNotificationJob", () => {
  let db: ReturnType<typeof createDb>;
  const workspaceId = generateId();
  const userIds: string[] = [];

  beforeAll(async () => {
    db = createDb({ connectionString: process.env.DATABASE_URL! });
    await runMigrations();
    await db.orm.insert(schema.workspaces).values({ id: workspaceId, name: "W", slug: `w-${workspaceId}` });
  });

  afterAll(async () => {
    await db.orm.delete(schema.recordings).where(eq(schema.recordings.workspaceId, workspaceId));
    for (const id of userIds) {
      await db.orm.delete(schema.users).where(eq(schema.users.id, id));
    }
    await db.orm.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
    await db.sql.end();
  });

  async function seedRecording(title: string): Promise<{ recordingId: string; creatorId: string; creatorEmail: string; publicId: string }> {
    const creatorId = generateId();
    const creatorEmail = `${creatorId}@example.test`;
    const recordingId = generateId();
    const publicId = generatePublicId();
    userIds.push(creatorId);
    await db.orm.insert(schema.users).values({ id: creatorId, email: creatorEmail, passwordHash: "x", name: "Creator" });
    await db.orm.insert(schema.recordings).values({
      id: recordingId,
      publicId,
      workspaceId,
      creatorId,
      title,
      objectKey: `recordings/${recordingId}/original.mp4`,
    });
    return { recordingId, creatorId, creatorEmail, publicId };
  }

  async function insertComment(params: {
    recordingId: string;
    timestampSeconds: number;
    authorUserId?: string;
    guestName?: string;
    createdAt: Date;
  }): Promise<void> {
    await db.orm.insert(schema.comments).values({
      id: generateId(),
      recordingId: params.recordingId,
      timestampSeconds: params.timestampSeconds,
      body: "a comment",
      authorUserId: params.authorUserId,
      guestName: params.guestName,
      createdAt: params.createdAt,
    });
  }

  it("batches every qualifying comment in the window into one email, excluding the creator's own", async () => {
    const { recordingId, creatorId, creatorEmail, publicId } = await seedRecording("Quarterly update");
    const memberId = generateId();
    userIds.push(memberId);
    await db.orm.insert(schema.users).values({ id: memberId, email: `${memberId}@example.test`, passwordHash: "x", name: "Priya Patel" });

    const windowStart = new Date(Date.now() - 1000);
    await insertComment({ recordingId, timestampSeconds: 84, authorUserId: creatorId, createdAt: windowStart }); // excluded: the creator's own
    await insertComment({ recordingId, timestampSeconds: 12, authorUserId: memberId, createdAt: new Date(windowStart.getTime() + 10) });
    await insertComment({ recordingId, timestampSeconds: 130, guestName: "Ignored Free Text Name", createdAt: new Date(windowStart.getTime() + 20) });

    const mailTransport = new CapturingMailTransport();
    await runCommentNotificationJob(
      { recordingId, enqueuedAt: windowStart.toISOString() },
      { mailTransport, publicBaseUrl: "https://example.test" },
    );

    expect(mailTransport.sent).toHaveLength(1); // one email, not three — the batching guarantee
    const mail = mailTransport.sent[0]!;
    expect(mail.to).toBe(creatorEmail);
    expect(mail.subject).toContain("2 new comments");
    expect(mail.subject).toContain("Quarterly update");
    expect(mail.text).toContain("Priya Patel at 0:12"); // member's real display name
    expect(mail.text).toContain("a guest at 2:10"); // guest's free-text name is never echoed
    expect(mail.text).not.toContain("Ignored Free Text Name");
    expect(mail.text).toContain(`https://example.test/v/${publicId}`);
  });

  it("never sends anything when the only comment in the window is the creator's own", async () => {
    const { recordingId, creatorId } = await seedRecording("Solo notes");
    const windowStart = new Date(Date.now() - 1000);
    await insertComment({ recordingId, timestampSeconds: 5, authorUserId: creatorId, createdAt: windowStart });

    const mailTransport = new CapturingMailTransport();
    await runCommentNotificationJob({ recordingId, enqueuedAt: windowStart.toISOString() }, { mailTransport });

    expect(mailTransport.sent).toHaveLength(0);
  });

  it("respects the creator's own opt-out — on by default, off once they turn it off", async () => {
    const { recordingId, creatorId } = await seedRecording("Opt-out check");
    const memberId = generateId();
    userIds.push(memberId);
    await db.orm.insert(schema.users).values({ id: memberId, email: `${memberId}@example.test`, passwordHash: "x", name: "Sam Reviewer" });
    const windowStart = new Date(Date.now() - 1000);
    await insertComment({ recordingId, timestampSeconds: 1, authorUserId: memberId, createdAt: windowStart });

    await setNewCommentEmailEnabled(db.orm, creatorId, false);
    const mailTransport = new CapturingMailTransport();
    await runCommentNotificationJob({ recordingId, enqueuedAt: windowStart.toISOString() }, { mailTransport });
    expect(mailTransport.sent).toHaveLength(0); // opted out — nothing sent

    await setNewCommentEmailEnabled(db.orm, creatorId, true);
    await runCommentNotificationJob({ recordingId, enqueuedAt: windowStart.toISOString() }, { mailTransport });
    expect(mailTransport.sent).toHaveLength(1); // same window's comment, now allowed through
  });

  it("never puts a presigned storage URL, a session or reset token, or the commenter's email address in the mail it sends", async () => {
    const { recordingId, creatorEmail } = await seedRecording("Forbidden content check");
    const memberId = generateId();
    userIds.push(memberId);
    const memberEmail = `${memberId}@example.test`;
    await db.orm.insert(schema.users).values({ id: memberId, email: memberEmail, passwordHash: "x", name: "Devon Commenter" });
    const windowStart = new Date(Date.now() - 1000);
    await insertComment({ recordingId, timestampSeconds: 42, authorUserId: memberId, createdAt: windowStart });

    const mailTransport = new CapturingMailTransport();
    await runCommentNotificationJob(
      { recordingId, enqueuedAt: windowStart.toISOString() },
      { mailTransport, publicBaseUrl: "https://example.test" },
    );

    expect(mailTransport.sent).toHaveLength(1);
    const mail = mailTransport.sent[0]!;
    const combined = `${mail.subject}\n${mail.text}`;

    // No presigned storage URL of any kind.
    expect(combined).not.toContain(`recordings/${recordingId}`);
    expect(combined.toLowerCase()).not.toContain("x-amz-");
    expect(combined.toLowerCase()).not.toContain("signature=");
    expect(combined).not.toMatch(/https?:\/\/[^\s]*\.s3[.-]/i);

    // No session or reset token.
    expect(combined.toLowerCase()).not.toContain("session");
    expect(combined.toLowerCase()).not.toContain("token");
    expect(combined).not.toMatch(/\?[a-z0-9_-]*=/i); // the player link carries no query string at all

    // Never the commenter's email address — nor, for good measure, the recipient's own.
    expect(combined).not.toContain(memberEmail);
    expect(combined).not.toContain(creatorEmail);

    // What it *does* carry, spelled out so the assertions above aren't
    // trivially satisfied by sending nothing useful: the commenter's
    // name and timestamp, and a bare player link with no query string.
    expect(mail.text).toContain("Devon Commenter at 0:42");
    expect(mail.text).toMatch(/See it in the player: https:\/\/example\.test\/v\/[A-Za-z0-9]+$/m);
  });
});
