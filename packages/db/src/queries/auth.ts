import { and, eq, gt, isNull, lt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema/index.js";

type OrmClient = PostgresJsDatabase<typeof schema>;

/**
 * Own auth (SPEC.md §12): a session row, an httpOnly `SameSite=Lax`
 * cookie, Argon2id hashing. This file never hashes or verifies a
 * password itself — `apps/web/src/auth` owns that — it only stores and
 * reads the rows the session model needs.
 */

export interface NewUser {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
}

export async function createUser(orm: OrmClient, user: NewUser) {
  const rows = await orm.insert(schema.users).values(user).returning();
  return rows[0]!;
}

export async function findUserByEmail(orm: OrmClient, email: string) {
  const rows = await orm.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  return rows[0] ?? null;
}

export async function findUserById(orm: OrmClient, id: string) {
  const rows = await orm.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface NewSession {
  id: string;
  userId: string;
  expiresAt: Date;
}

export async function createSession(orm: OrmClient, session: NewSession) {
  const rows = await orm.insert(schema.sessions).values(session).returning();
  return rows[0]!;
}

/**
 * The one read the auth guard performs on every request: is this session
 * id still live, and who does it belong to. An expired session returns
 * `null` exactly like a nonexistent one — the caller does not get to
 * distinguish "expired" from "never existed" from this function, which is
 * the point: neither should extend trust.
 */
export async function getSessionWithUser(
  orm: OrmClient,
  sessionId: string,
  now: Date = new Date(),
) {
  const rows = await orm
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, sessionId), gt(schema.sessions.expiresAt, now)))
    .limit(1);

  return rows[0] ?? null;
}

export async function deleteSession(orm: OrmClient, sessionId: string): Promise<void> {
  await orm.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
}

/** Called by the worker's retention sweep — a lapsed session row is not a secret worth keeping. */
export async function deleteExpiredSessions(orm: OrmClient, now: Date = new Date()): Promise<number> {
  const rows = await orm.delete(schema.sessions).where(lt(schema.sessions.expiresAt, now)).returning();
  return rows.length;
}

/** Called by a completed password reset: revokes every session for the account, not just the one that requested it — a stolen cookie must not survive a reset the real owner just performed. */
export async function deleteSessionsForUser(orm: OrmClient, userId: string): Promise<void> {
  await orm.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

export async function updateUserPassword(orm: OrmClient, userId: string, passwordHash: string): Promise<void> {
  await orm.update(schema.users).set({ passwordHash, updatedAt: new Date() }).where(eq(schema.users.id, userId));
}

export interface NewPasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export async function createPasswordResetToken(orm: OrmClient, token: NewPasswordResetToken) {
  const rows = await orm.insert(schema.passwordResetTokens).values(token).returning();
  return rows[0]!;
}

/**
 * Looks a reset token up by the SHA-256 hash of its raw value — the raw
 * token itself never reaches this package. A row that has already been
 * used, or has expired, is treated exactly like one that never existed:
 * the caller gets a single "invalid or expired" outcome either way, never
 * a way to tell the two apart.
 */
export async function findValidPasswordResetToken(orm: OrmClient, tokenHash: string, now: Date = new Date()) {
  const rows = await orm
    .select()
    .from(schema.passwordResetTokens)
    .where(
      and(
        eq(schema.passwordResetTokens.tokenHash, tokenHash),
        isNull(schema.passwordResetTokens.usedAt),
        gt(schema.passwordResetTokens.expiresAt, now),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function markPasswordResetTokenUsed(orm: OrmClient, id: string, now: Date = new Date()): Promise<void> {
  await orm.update(schema.passwordResetTokens).set({ usedAt: now }).where(eq(schema.passwordResetTokens.id, id));
}

/** Issuing a fresh reset token invalidates every other outstanding one for the account, so an old, still-unexpired link stops working the moment a new one is requested. */
export async function invalidateOutstandingPasswordResetTokens(orm: OrmClient, userId: string): Promise<void> {
  await orm.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.userId, userId));
}

export interface LoginLockoutStatus {
  locked: boolean;
  lockedUntil: Date | null;
}

/** A read-only check — call before verifying a password, so a locked account never pays for an Argon2id verify it cannot use anyway. */
export async function getLoginLockoutStatus(
  orm: OrmClient,
  email: string,
  now: Date = new Date(),
): Promise<LoginLockoutStatus> {
  const rows = await orm.select().from(schema.loginLockouts).where(eq(schema.loginLockouts.email, email)).limit(1);
  const row = rows[0];
  const locked = Boolean(row?.lockedUntil) && row!.lockedUntil!.getTime() > now.getTime();
  return { locked, lockedUntil: locked ? row!.lockedUntil : null };
}

export interface LoginLockoutPolicy {
  maxFailedAttempts: number;
  windowMs: number;
}

/**
 * Records one failed login attempt for `email` and returns whether the
 * account is now locked.
 *
 * If a lock from a previous call is still in force, this returns it
 * completely unchanged — no counter increments, no new `lockedUntil`.
 * That is the one line that stops the mechanism from being usable to
 * lock a victim out forever: a lock always expires `policy.windowMs`
 * after the attempt that tripped it, regardless of how many more
 * attempts an attacker makes while it is in force. Once it has expired,
 * the next failure starts an entirely fresh window.
 */
export async function recordFailedLogin(
  orm: OrmClient,
  email: string,
  policy: LoginLockoutPolicy,
  now: Date = new Date(),
): Promise<LoginLockoutStatus> {
  const rows = await orm.select().from(schema.loginLockouts).where(eq(schema.loginLockouts.email, email)).limit(1);
  const row = rows[0];

  if (row?.lockedUntil && row.lockedUntil.getTime() > now.getTime()) {
    return { locked: true, lockedUntil: row.lockedUntil };
  }

  const streakIsFresh = Boolean(row?.firstFailedAt) && now.getTime() - row!.firstFailedAt!.getTime() < policy.windowMs;
  const firstFailedAt = streakIsFresh ? row!.firstFailedAt! : now;
  const failedCount = (streakIsFresh ? row!.failedCount : 0) + 1;
  const locked = failedCount >= policy.maxFailedAttempts;
  const lockedUntil = locked ? new Date(now.getTime() + policy.windowMs) : null;

  await orm
    .insert(schema.loginLockouts)
    .values({ email, failedCount, firstFailedAt, lockedUntil, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.loginLockouts.email,
      set: { failedCount, firstFailedAt, lockedUntil, updatedAt: now },
    });

  return { locked, lockedUntil };
}

/** Called on a successful login and after a completed password reset — a clean slate for an email that just proved it owns the account. */
export async function clearLoginLockout(orm: OrmClient, email: string): Promise<void> {
  await orm.delete(schema.loginLockouts).where(eq(schema.loginLockouts.email, email));
}
