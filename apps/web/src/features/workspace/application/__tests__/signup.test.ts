import { AppError } from "@recordmint/shared";
import { describe, expect, it } from "vitest";
import { signup } from "../signup.js";

/**
 * Every case here is rejected before `signup` ever calls `getDb()` — the
 * function validates email, password length and name in that order
 * before touching the database — so this runs with no DATABASE_URL and
 * no live Postgres, unlike the equivalent database-backed assertions in
 * packages/db's own test suite.
 */
describe("signup validation", () => {
  it("rejects an invalid email before touching the database", async () => {
    await expect(signup({ email: "not-an-email", password: "correcthorsebattery", name: "A" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects a password under the minimum length", async () => {
    await expect(signup({ email: "a@example.test", password: "short", name: "A" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects a blank name", async () => {
    await expect(signup({ email: "a@example.test", password: "correcthorsebattery", name: "   " })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("throws AppError instances, not plain errors, so the route layer's error mapping applies", async () => {
    try {
      await signup({ email: "bad", password: "x", name: "x" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
    }
  });
});
