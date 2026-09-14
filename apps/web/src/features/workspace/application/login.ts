import { AppError } from "@recordmint/shared";
import { clearLoginLockout, findUserByEmail, getLoginLockoutStatus, recordFailedLogin } from "@recordmint/db";
import { verifyPassword } from "../../../auth/password";
import { startSession } from "../../../auth/session";
import { getDb } from "../../../lib/db";

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginDeps {
  now?: Date;
}

/**
 * [assumed] Five failed attempts within a fifteen-minute window locks the
 * *email* (not the account — see `packages/db/src/schema/login-lockouts.ts`
 * for why) for fifteen minutes. The lock is a fixed point in time set once
 * it trips; further failures made while it is in force never push it
 * later (`recordFailedLogin`'s own guarantee), which is what stops this
 * from being usable to lock a victim out forever — see
 * `login-lockout.test.ts`.
 */
const LOCKOUT_POLICY = { maxFailedAttempts: 5, windowMs: 15 * 60 * 1000 };

/**
 * Deliberately the same error for "no such account", "wrong password" and
 * "locked out" — telling any of these apart from the response is how a
 * login form becomes an account-enumeration oracle or a lockout-detection
 * oracle. The lockout check runs *before* `verifyPassword` so a locked
 * email never pays for (or benefits an attacker probing via the timing
 * of) an Argon2id verify it cannot use anyway.
 */
export async function login(input: LoginInput, deps: LoginDeps = {}) {
  const email = input.email.trim().toLowerCase();
  const now = deps.now ?? new Date();
  const db = getDb();

  const lockout = await getLoginLockoutStatus(db.orm, email, now);
  if (lockout.locked) {
    throw new AppError("INVALID_CREDENTIALS", "Incorrect email or password.");
  }

  const user = await findUserByEmail(db.orm, email);
  const valid = user ? await verifyPassword(input.password, user.passwordHash) : false;

  if (!user || !valid) {
    await recordFailedLogin(db.orm, email, LOCKOUT_POLICY, now);
    throw new AppError("INVALID_CREDENTIALS", "Incorrect email or password.");
  }

  await clearLoginLockout(db.orm, email);
  await startSession(user.id);
  return { user };
}
