import { cookies } from "next/headers";
import { generateSecureToken } from "@recordmint/shared";
import { createSession, deleteSession, getSessionWithUser } from "@recordmint/db";
import { getDb } from "../lib/db";

/**
 * SPEC.md §12: an httpOnly, `SameSite=Lax` session cookie, nothing
 * resembling a credential in browser-readable storage. There is no
 * access/refresh token pair — the cookie's value is the session row's own
 * id, and that is the entire mechanism.
 */
export const SESSION_COOKIE_NAME = "recordmint_session";

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  expires: Date;
}

/** `secure` only in production — a local `http://localhost` self-host in development must still be able to set the cookie. */
function cookieOptions(expiresAt: Date): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

/**
 * Creates a session row and writes the cookie in one call — every sign-in
 * path (password login, and eventually anything else) goes through this
 * rather than reimplementing cookie options at each call site.
 */
export async function startSession(userId: string): Promise<void> {
  const db = getDb();
  const sessionId = generateSecureToken();
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  await createSession(db.orm, { id: sessionId, userId, expiresAt });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, cookieOptions(expiresAt));
}

/** Ends the session both server-side (the row) and client-side (the cookie) — either alone would leave a way back in. */
export async function endSession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (sessionId) {
    await deleteSession(getDb().orm, sessionId);
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/** Resolves the current request's session cookie to a user, or `null` for a logged-out visitor. Never throws on a missing/expired/bogus cookie. */
export async function getCurrentUser() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) return null;
  const resolved = await getSessionWithUser(getDb().orm, sessionId);
  return resolved?.user ?? null;
}
