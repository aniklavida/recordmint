import { generateId } from "@recordmint/shared";
import { createUser } from "@recordmint/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hashPassword } from "../../../../auth/password.js";
import { getDb } from "../../../../lib/db.js";
import { login } from "../login.js";

// `login()`'s success path calls `startSession`, which calls Next.js's
// `cookies()` — real only inside a request scope, which a plain unit
// test has none of. A tiny in-memory stand-in lets this test exercise
// the real `login()` function end to end (including a genuinely
// successful login once the lockout window passes) instead of stopping
// short at the failure paths the way `signup.test.ts` does.
const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

/**
 * Integration-level proof, one layer up from `packages/db`'s own
 * `login-lockout.test.ts`: that `login()` itself refuses even a
 * **correct** password while locked, and lets the real owner in again
 * the instant the fixed lockout window passes — the end-to-end version of
 * "cannot be used to lock a victim out forever."
 */
describe.skipIf(!process.env.DATABASE_URL)("login lockout integration", () => {
  const userId = generateId();
  const email = `lockout-login-${userId}@example.test`;
  const correctPassword = "the-real-password-1";

  beforeAll(async () => {
    const db = getDb();
    await createUser(db.orm, {
      id: userId,
      email,
      passwordHash: await hashPassword(correctPassword),
      name: "Lockout Login User",
    });
  });

  afterAll(async () => {
    const db = getDb();
    await db.sql`DELETE FROM users WHERE id = ${userId}`;
    await db.sql.end();
  });

  it("locks the account after five failed attempts, refuses even the correct password while locked, then admits it once the window passes", async () => {
    const t0 = new Date("2026-05-01T00:00:00Z");

    for (let i = 0; i < 5; i++) {
      await expect(login({ email, password: "wrong-password" }, { now: new Date(t0.getTime() + i * 1000) })).rejects.toMatchObject({
        code: "INVALID_CREDENTIALS",
      });
    }

    // Locked now — even the genuinely correct password is refused, with
    // the identical error a wrong password gets (no lockout-detection
    // oracle).
    const duringLockout = new Date(t0.getTime() + 6000);
    await expect(login({ email, password: correctPassword }, { now: duringLockout })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });

    // The attacker keeps hammering it during the lockout window — must
    // not push the lock further into the future.
    for (let i = 0; i < 5; i++) {
      await expect(
        login({ email, password: "wrong-password" }, { now: new Date(t0.getTime() + 6000 + i * 1000) }),
      ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    }

    // 15 minutes after the failure that tripped the lock (t0 + 4000ms),
    // the lock has expired — the real owner gets in with the correct
    // password, proving this cannot be used to lock a victim out forever.
    const afterWindow = new Date(t0.getTime() + 4000 + 15 * 60 * 1000 + 1000);
    const { user } = await login({ email, password: correctPassword }, { now: afterWindow });
    expect(user.id).toBe(userId);
  });

  it("gives the same error for a wrong password and a nonexistent account — not an enumeration oracle", async () => {
    const t0 = new Date("2026-06-01T00:00:00Z");
    const wrongPassword = await login({ email, password: "definitely-wrong" }, { now: t0 }).catch((e: unknown) => e);
    const noSuchAccount = await login(
      { email: "nobody-registered@example.test", password: "anything" },
      { now: t0 },
    ).catch((e: unknown) => e);

    expect(wrongPassword).toMatchObject({ code: "INVALID_CREDENTIALS", message: expect.any(String) });
    expect(noSuchAccount).toMatchObject({ code: "INVALID_CREDENTIALS", message: expect.any(String) });
    expect((wrongPassword as Error).message).toBe((noSuchAccount as Error).message);
  });
});
