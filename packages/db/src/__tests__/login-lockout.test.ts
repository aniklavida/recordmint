import { describe, expect, it } from "vitest";
import { createDb, type Db } from "../client.js";
import { runMigrations } from "../migrate.js";
import { clearLoginLockout, getLoginLockoutStatus, recordFailedLogin } from "../queries/auth.js";

const POLICY = { maxFailedAttempts: 5, windowMs: 15 * 60 * 1000 };

/**
 * The property under test, proven directly rather than assumed: this
 * mechanism must not be usable to lock a victim out forever. Every case
 * here drives time explicitly via the `now` parameter rather than real
 * wall-clock waits, so the 15-minute window is exercised in milliseconds.
 */
describe.skipIf(!process.env.DATABASE_URL)("login lockout queries", () => {
  let db: Db;

  const freshEmail = () => `lockout-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;

  const setup = async () => {
    db ??= createDb({ connectionString: process.env.DATABASE_URL! });
    await runMigrations();
    return db;
  };

  it("is not locked before any failure", async () => {
    const database = await setup();
    const email = freshEmail();
    expect((await getLoginLockoutStatus(database.orm, email)).locked).toBe(false);
  });

  it("locks after the policy's failure threshold within the window", async () => {
    const database = await setup();
    const email = freshEmail();
    const t0 = new Date("2026-01-01T00:00:00Z");

    for (let i = 0; i < POLICY.maxFailedAttempts - 1; i++) {
      const result = await recordFailedLogin(database.orm, email, POLICY, new Date(t0.getTime() + i * 1000));
      expect(result.locked).toBe(false);
    }

    const tripped = await recordFailedLogin(
      database.orm,
      email,
      POLICY,
      new Date(t0.getTime() + (POLICY.maxFailedAttempts - 1) * 1000),
    );
    expect(tripped.locked).toBe(true);
    expect(tripped.lockedUntil).not.toBeNull();

    const status = await getLoginLockoutStatus(database.orm, email, new Date(t0.getTime() + POLICY.maxFailedAttempts * 1000));
    expect(status.locked).toBe(true);
  });

  it("does not extend the lockout when an attacker keeps failing while it is in force — the core anti-forever-lockout guarantee", async () => {
    const database = await setup();
    const email = freshEmail();
    const t0 = new Date("2026-02-01T00:00:00Z");

    let lockedUntil: Date | null = null;
    for (let i = 0; i < POLICY.maxFailedAttempts; i++) {
      const result = await recordFailedLogin(database.orm, email, POLICY, new Date(t0.getTime() + i * 1000));
      if (result.locked) lockedUntil = result.lockedUntil;
    }
    expect(lockedUntil).not.toBeNull();
    const originalLockedUntil = lockedUntil!.getTime();

    // The attacker keeps trying every second, well inside the lockout
    // window. None of these attempts may push `lockedUntil` later.
    for (let i = 1; i <= 10; i++) {
      const during = new Date(originalLockedUntil - POLICY.windowMs / 2 + i * 1000);
      const result = await recordFailedLogin(database.orm, email, POLICY, during);
      expect(result.locked).toBe(true);
      expect(result.lockedUntil!.getTime()).toBe(originalLockedUntil);
    }

    // Right up to the boundary, still locked.
    const justBefore = await getLoginLockoutStatus(database.orm, email, new Date(originalLockedUntil - 1));
    expect(justBefore.locked).toBe(true);

    // The instant the fixed window elapses, the account is reachable
    // again — proving the lock self-expires and cannot be held open
    // indefinitely by continued failed attempts.
    const justAfter = await getLoginLockoutStatus(database.orm, email, new Date(originalLockedUntil + 1));
    expect(justAfter.locked).toBe(false);
  });

  it("a failure after the lock has expired starts an entirely fresh window rather than staying locked", async () => {
    const database = await setup();
    const email = freshEmail();
    const t0 = new Date("2026-03-01T00:00:00Z");

    let lockedUntil: Date | null = null;
    for (let i = 0; i < POLICY.maxFailedAttempts; i++) {
      const result = await recordFailedLogin(database.orm, email, POLICY, new Date(t0.getTime() + i * 1000));
      if (result.locked) lockedUntil = result.lockedUntil;
    }
    expect(lockedUntil).not.toBeNull();

    const afterExpiry = new Date(lockedUntil!.getTime() + 1000);
    const first = await recordFailedLogin(database.orm, email, POLICY, afterExpiry);
    expect(first.locked).toBe(false);

    const status = await getLoginLockoutStatus(database.orm, email, afterExpiry);
    expect(status.locked).toBe(false);
  });

  it("clearLoginLockout gives a clean slate — used on a successful login and after a password reset", async () => {
    const database = await setup();
    const email = freshEmail();
    const t0 = new Date("2026-04-01T00:00:00Z");

    for (let i = 0; i < POLICY.maxFailedAttempts; i++) {
      await recordFailedLogin(database.orm, email, POLICY, new Date(t0.getTime() + i * 1000));
    }
    expect((await getLoginLockoutStatus(database.orm, email, t0)).locked).toBe(true);

    await clearLoginLockout(database.orm, email);

    expect((await getLoginLockoutStatus(database.orm, email, t0)).locked).toBe(false);
  });
});
