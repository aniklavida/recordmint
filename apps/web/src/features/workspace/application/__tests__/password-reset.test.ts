import { generateId } from "@recordmint/shared";
import { createSession, createUser, findUserById, getSessionWithUser } from "@recordmint/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "../../../../auth/password.js";
import { getDb } from "../../../../lib/db.js";
import { CapturingMailTransport } from "../../../../lib/mail.js";
import { confirmPasswordReset, requestPasswordReset } from "../password-reset.js";

/**
 * Runs against a real, throwaway Postgres (skipped without DATABASE_URL,
 * matching every other DB-backed suite in this repository) and a real,
 * in-memory `CapturingMailTransport` — never a live SMTP relay, per this
 * card's own instruction that no test may send real email.
 */
describe.skipIf(!process.env.DATABASE_URL)("password reset", () => {
  const userId = generateId();
  const email = `pwreset-${userId}@example.test`;
  const originalPassword = "correcthorsebattery1";

  beforeAll(async () => {
    const db = getDb();
    await createUser(db.orm, {
      id: userId,
      email,
      passwordHash: await hashPassword(originalPassword),
      name: "Reset Flow User",
    });
  });

  afterAll(async () => {
    const db = getDb();
    await db.sql`DELETE FROM users WHERE id = ${userId}`;
    await db.sql.end();
  });

  function extractToken(text: string): string {
    const match = /token=([^\s&]+)/.exec(text);
    if (!match) throw new Error("No token found in mail body");
    return decodeURIComponent(match[1]!);
  }

  it("sends a reset email only for an email that actually has an account", async () => {
    const mailTransport = new CapturingMailTransport();

    await requestPasswordReset({ email }, { mailTransport });
    expect(mailTransport.sent).toHaveLength(1);
    expect(mailTransport.sent[0]!.to).toBe(email);

    await requestPasswordReset({ email: "nobody-at-all@example.test" }, { mailTransport });
    // Still exactly one message — the second call resolved the same way
    // (silently) without sending anything, which is what makes the route
    // handler's outward response identical either way.
    expect(mailTransport.sent).toHaveLength(1);
  });

  it("never logs the raw token — spied across the whole successful request+confirm flow", async () => {
    const mailTransport = new CapturingMailTransport();
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "info").mockImplementation(() => {}),
    ];

    try {
      await requestPasswordReset({ email }, { mailTransport });
      const token = extractToken(mailTransport.sent.at(-1)!.text);
      await confirmPasswordReset({ token, password: "a-brand-new-password-1" });

      for (const spy of spies) {
        for (const call of spy.mock.calls) {
          const serialized = call.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ");
          expect(serialized).not.toContain(token);
        }
      }
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it("resetting the password: old password stops working, new one works, and every session is revoked", async () => {
    const mailTransport = new CapturingMailTransport();
    const db = getDb();

    const sessionId = generateId();
    await createSession(db.orm, { id: sessionId, userId, expiresAt: new Date(Date.now() + 60_000) });
    expect(await getSessionWithUser(db.orm, sessionId)).not.toBeNull();

    await requestPasswordReset({ email }, { mailTransport });
    const token = extractToken(mailTransport.sent.at(-1)!.text);

    const newPassword = "yet-another-new-password-2";
    await confirmPasswordReset({ token, password: newPassword });

    const user = await findUserById(db.orm, userId);
    expect(await verifyPassword(originalPassword, user!.passwordHash)).toBe(false);
    expect(await verifyPassword(newPassword, user!.passwordHash)).toBe(true);

    expect(await getSessionWithUser(db.orm, sessionId)).toBeNull();
  });

  it("a token is single-use: confirming twice fails the second time", async () => {
    const mailTransport = new CapturingMailTransport();
    await requestPasswordReset({ email }, { mailTransport });
    const token = extractToken(mailTransport.sent.at(-1)!.text);

    await confirmPasswordReset({ token, password: "single-use-password-1" });

    await expect(confirmPasswordReset({ token, password: "another-password-2" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects an expired token", async () => {
    const mailTransport = new CapturingMailTransport();
    const requestedAt = new Date("2026-01-01T00:00:00Z");
    await requestPasswordReset({ email }, { mailTransport, now: requestedAt });
    const token = extractToken(mailTransport.sent.at(-1)!.text);

    const wellAfterExpiry = new Date(requestedAt.getTime() + 2 * 60 * 60 * 1000);
    await expect(
      confirmPasswordReset({ token, password: "too-late-password-1" }, { now: wellAfterExpiry }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("issuing a new reset token invalidates a previous, still-unexpired one", async () => {
    const mailTransport = new CapturingMailTransport();
    await requestPasswordReset({ email }, { mailTransport });
    const firstToken = extractToken(mailTransport.sent[0]!.text);

    await requestPasswordReset({ email }, { mailTransport });
    const secondToken = extractToken(mailTransport.sent.at(-1)!.text);
    expect(secondToken).not.toBe(firstToken);

    await expect(confirmPasswordReset({ token: firstToken, password: "stale-token-password-1" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });

    // The newest token still works.
    await confirmPasswordReset({ token: secondToken, password: "fresh-token-password-2" });
  });

  it("rejects a password under the minimum length before touching the token at all", async () => {
    await expect(confirmPasswordReset({ token: "irrelevant", password: "short" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});
