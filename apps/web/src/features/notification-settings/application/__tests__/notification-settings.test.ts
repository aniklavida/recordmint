import { generateId } from "@recordmint/shared";
import { createUser } from "@recordmint/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../../../../auth/password.js";
import { getDb } from "../../../../lib/db.js";
import { getMyNotificationSettings, setMyNotificationSettings } from "../notification-settings.js";

/**
 * The per-user new-comment email setting, one layer above
 * `packages/db`'s own `notification-settings.ts` queries. This proves
 * the default, the round trip, validation, and — the property that
 * matters most — that setting one user's value never touches another's,
 * because `setMyNotificationSettings` has no field for "whose setting"
 * beyond `callerId` itself.
 */
describe.skipIf(!process.env.DATABASE_URL)("notification settings", () => {
  const userAId = generateId();
  const userBId = generateId();

  beforeAll(async () => {
    const db = getDb();
    const passwordHash = await hashPassword("not-a-real-password-1");
    await createUser(db.orm, { id: userAId, email: `notify-a-${userAId}@example.test`, passwordHash, name: "User A" });
    await createUser(db.orm, { id: userBId, email: `notify-b-${userBId}@example.test`, passwordHash, name: "User B" });
  });

  afterAll(async () => {
    const db = getDb();
    await db.sql`DELETE FROM users WHERE id IN (${userAId}, ${userBId})`;
    await db.sql.end();
  });

  it("defaults to enabled for a user who has never changed it", async () => {
    expect(await getMyNotificationSettings(userAId)).toEqual({ newCommentEmailEnabled: true });
  });

  it("round-trips off and back on for the caller who changed it", async () => {
    await setMyNotificationSettings({ callerId: userAId, newCommentEmailEnabled: false });
    expect(await getMyNotificationSettings(userAId)).toEqual({ newCommentEmailEnabled: false });

    await setMyNotificationSettings({ callerId: userAId, newCommentEmailEnabled: true });
    expect(await getMyNotificationSettings(userAId)).toEqual({ newCommentEmailEnabled: true });
  });

  it("rejects a non-boolean value rather than writing it", async () => {
    await expect(
      setMyNotificationSettings({ callerId: userAId, newCommentEmailEnabled: "off" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("changing one user's setting never changes another's", async () => {
    await setMyNotificationSettings({ callerId: userAId, newCommentEmailEnabled: false });

    expect(await getMyNotificationSettings(userAId)).toEqual({ newCommentEmailEnabled: false });
    // User B never called setMyNotificationSettings — still the default.
    expect(await getMyNotificationSettings(userBId)).toEqual({ newCommentEmailEnabled: true });
  });
});
