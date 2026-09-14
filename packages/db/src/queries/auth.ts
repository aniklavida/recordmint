import { and, eq, gt, lt } from "drizzle-orm";
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
