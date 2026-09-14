import { generateId } from "@recordmint/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../client.js";
import { runMigrations } from "../migrate.js";
import {
  createSession,
  createUser,
  deleteExpiredSessions,
  deleteSession,
  findUserByEmail,
  getSessionWithUser,
} from "../queries/auth.js";
import * as schema from "../schema/index.js";

/**
 * The session model this exercises: a row, an httpOnly cookie value as
 * its id, an expiry — no refresh token anywhere. Run against a real
 * Postgres; skipped without DATABASE_URL, matching every other
 * DB-dependent test in this package.
 */
describe.skipIf(!process.env.DATABASE_URL)("auth queries", () => {
  let db: Db;
  const userId = generateId();
  const email = `auth-${userId}@example.test`;

  beforeAll(async () => {
    db = createDb({ connectionString: process.env.DATABASE_URL! });
    await runMigrations();
    await createUser(db.orm, {
      id: userId,
      email,
      passwordHash: "argon2id$test-fixture-not-a-real-hash",
      name: "Auth Test User",
    });
  });

  afterAll(async () => {
    await db.orm.delete(schema.users).where(eq(schema.users.id, userId));
    await db.sql.end();
  });

  it("finds a user by email", async () => {
    const user = await findUserByEmail(db.orm, email);
    expect(user?.id).toBe(userId);
  });

  it("returns null for an email nobody has", async () => {
    const user = await findUserByEmail(db.orm, "nobody@example.test");
    expect(user).toBeNull();
  });

  it("resolves a live session to its user", async () => {
    const sessionId = generateId();
    await createSession(db.orm, {
      id: sessionId,
      userId,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const resolved = await getSessionWithUser(db.orm, sessionId);
    expect(resolved?.user.id).toBe(userId);

    await deleteSession(db.orm, sessionId);
    expect(await getSessionWithUser(db.orm, sessionId)).toBeNull();
  });

  it("treats an expired session exactly like a nonexistent one", async () => {
    const sessionId = generateId();
    await createSession(db.orm, {
      id: sessionId,
      userId,
      expiresAt: new Date(Date.now() - 1000), // already expired
    });

    const resolved = await getSessionWithUser(db.orm, sessionId);
    expect(resolved).toBeNull();

    const deletedCount = await deleteExpiredSessions(db.orm);
    expect(deletedCount).toBeGreaterThanOrEqual(1);
  });
});
