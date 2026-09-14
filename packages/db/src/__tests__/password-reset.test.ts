import { generateId } from "@recordmint/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../client.js";
import { runMigrations } from "../migrate.js";
import {
  createPasswordResetToken,
  createUser,
  deleteSessionsForUser,
  findValidPasswordResetToken,
  invalidateOutstandingPasswordResetTokens,
  markPasswordResetTokenUsed,
  updateUserPassword,
} from "../queries/auth.js";
import * as schema from "../schema/index.js";

/**
 * The token model under test: single-use, short-lived, hashed at
 * rest. This package only ever sees `tokenHash` — the raw token is
 * generated and hashed one layer up, in
 * `apps/web/src/features/workspace/application/password-reset.ts` — so
 * these tests exercise the storage guarantees directly: a valid hash
 * resolves, a used or expired one does not, and issuing a new token
 * retires every older one for the same account.
 */
describe.skipIf(!process.env.DATABASE_URL)("password reset token queries", () => {
  let db: Db;
  const userId = generateId();
  const email = `reset-${userId}@example.test`;

  beforeAll(async () => {
    db = createDb({ connectionString: process.env.DATABASE_URL! });
    await runMigrations();
    await createUser(db.orm, {
      id: userId,
      email,
      passwordHash: "argon2id$test-fixture-not-a-real-hash",
      name: "Reset Test User",
    });
  });

  afterAll(async () => {
    await db.orm.delete(schema.users).where(eq(schema.users.id, userId));
    await db.sql.end();
  });

  it("resolves a token by its hash while it is valid", async () => {
    const id = generateId();
    await createPasswordResetToken(db.orm, {
      id,
      userId,
      tokenHash: "hash-a",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const found = await findValidPasswordResetToken(db.orm, "hash-a");
    expect(found?.id).toBe(id);
    expect(found?.userId).toBe(userId);
  });

  it("never resolves a token by the wrong hash", async () => {
    await createPasswordResetToken(db.orm, {
      id: generateId(),
      userId,
      tokenHash: "hash-b",
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(await findValidPasswordResetToken(db.orm, "not-the-real-hash")).toBeNull();
  });

  it("treats an expired token exactly like a nonexistent one", async () => {
    await createPasswordResetToken(db.orm, {
      id: generateId(),
      userId,
      tokenHash: "hash-expired",
      expiresAt: new Date(Date.now() - 1000),
    });

    expect(await findValidPasswordResetToken(db.orm, "hash-expired")).toBeNull();
  });

  it("is single-use: a token stops resolving the moment it is marked used", async () => {
    const id = generateId();
    await createPasswordResetToken(db.orm, {
      id,
      userId,
      tokenHash: "hash-single-use",
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(await findValidPasswordResetToken(db.orm, "hash-single-use")).not.toBeNull();

    await markPasswordResetTokenUsed(db.orm, id);

    expect(await findValidPasswordResetToken(db.orm, "hash-single-use")).toBeNull();
  });

  it("issuing a fresh token invalidates every other outstanding one for the account", async () => {
    await createPasswordResetToken(db.orm, {
      id: generateId(),
      userId,
      tokenHash: "hash-old-1",
      expiresAt: new Date(Date.now() + 60_000),
    });
    await createPasswordResetToken(db.orm, {
      id: generateId(),
      userId,
      tokenHash: "hash-old-2",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await invalidateOutstandingPasswordResetTokens(db.orm, userId);

    expect(await findValidPasswordResetToken(db.orm, "hash-old-1")).toBeNull();
    expect(await findValidPasswordResetToken(db.orm, "hash-old-2")).toBeNull();
  });

  it("a reset revokes every session for the account, not just the one that requested it", async () => {
    const { createSession, getSessionWithUser } = await import("../queries/auth.js");
    const sessionA = generateId();
    const sessionB = generateId();
    await createSession(db.orm, { id: sessionA, userId, expiresAt: new Date(Date.now() + 60_000) });
    await createSession(db.orm, { id: sessionB, userId, expiresAt: new Date(Date.now() + 60_000) });

    expect(await getSessionWithUser(db.orm, sessionA)).not.toBeNull();
    expect(await getSessionWithUser(db.orm, sessionB)).not.toBeNull();

    await deleteSessionsForUser(db.orm, userId);

    expect(await getSessionWithUser(db.orm, sessionA)).toBeNull();
    expect(await getSessionWithUser(db.orm, sessionB)).toBeNull();
  });

  it("updates the stored password hash", async () => {
    await updateUserPassword(db.orm, userId, "argon2id$a-new-fixture-hash");
    const rows = await db.orm.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    expect(rows[0]?.passwordHash).toBe("argon2id$a-new-fixture-hash");
  });
});
