import { generateId } from "@recordmint/shared";
import { createSession, createUser } from "@recordmint/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hashPassword } from "../../../../auth/password.js";
import { SESSION_COOKIE_NAME } from "../../../../auth/session.js";
import { getDb } from "../../../../lib/db.js";
import { getMyNotificationSettings } from "../../../../features/notification-settings/application/notification-settings.js";

/**
 * `requireUser()` calls `getCurrentUser()`, which calls Next.js's
 * `cookies()` — real only inside a request scope, which a plain unit
 * test has none of. Same in-memory stand-in as `login-lockout.test.ts`,
 * so this test drives the actual exported route handlers, not a
 * reimplementation of them.
 */
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

const { GET, PATCH } = await import("../route.js");

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/notification-settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * The core proof this route needs: the signed-in request path can only
 * ever change the caller's own row. `userB`'s id is placed directly in
 * the request body, the same shape a real attacker would send, and the
 * assertion is that it changes nothing for `userB` — only `requireUser()`
 * ever decides whose row this route touches, never the body.
 */
describe.skipIf(!process.env.DATABASE_URL)("PATCH /api/notification-settings", () => {
  const userAId = generateId();
  const userBId = generateId();
  const sessionAId = generateId();

  beforeAll(async () => {
    const db = getDb();
    const passwordHash = await hashPassword("not-a-real-password-1");
    await createUser(db.orm, { id: userAId, email: `route-a-${userAId}@example.test`, passwordHash, name: "User A" });
    await createUser(db.orm, { id: userBId, email: `route-b-${userBId}@example.test`, passwordHash, name: "User B" });
    await createSession(db.orm, { id: sessionAId, userId: userAId, expiresAt: new Date(Date.now() + 60_000) });
  });

  afterAll(async () => {
    const db = getDb();
    await db.sql`DELETE FROM users WHERE id IN (${userAId}, ${userBId})`;
    await db.sql.end();
  });

  it("refuses an anonymous request with no session cookie", async () => {
    cookieJar.delete(SESSION_COOKIE_NAME);
    const response = await PATCH(patchRequest({ newCommentEmailEnabled: false }));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("refuses an anonymous GET the same way", async () => {
    cookieJar.delete(SESSION_COOKIE_NAME);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("changes only the signed-in caller's own setting, even when another user's id is in the request body", async () => {
    cookieJar.set(SESSION_COOKIE_NAME, sessionAId);

    // A real request body an attacker controlling only the HTTP request
    // (not the session cookie) could send: someone else's id, riding
    // along with the field the endpoint actually reads.
    const response = await PATCH(patchRequest({ newCommentEmailEnabled: false, userId: userBId }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { newCommentEmailEnabled: boolean };
    expect(body.newCommentEmailEnabled).toBe(false);

    // The session's own user (A) changed...
    expect(await getMyNotificationSettings(userAId)).toEqual({ newCommentEmailEnabled: false });
    // ...user B, named in the body, did not.
    expect(await getMyNotificationSettings(userBId)).toEqual({ newCommentEmailEnabled: true });
  });
});
