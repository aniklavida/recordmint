import { AppError } from "@recordmint/shared";
import { StorageAuthorizationError } from "@recordmint/storage";
import { describe, expect, it } from "vitest";
import { toErrorResponse } from "../error-response.js";

describe("toErrorResponse", () => {
  it("maps a known AppError code to its documented HTTP status", async () => {
    const response = toErrorResponse(new AppError("NOT_A_MEMBER", "nope"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "NOT_A_MEMBER", message: "nope" } });
  });

  it("maps an unrecognised AppError code to 400 rather than throwing", async () => {
    const response = toErrorResponse(new AppError("SOMETHING_NEW", "nope"));
    expect(response.status).toBe(400);
  });

  it("maps a storage authorization refusal to 403 without leaking why", async () => {
    const response = toErrorResponse(new StorageAuthorizationError("internal reason nobody should see"));
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).not.toContain("internal reason");
  });

  it("maps an unrecognised error to a 500 that never echoes the original message", async () => {
    const response = toErrorResponse(new Error("a stack trace or a secret might be in here"));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).not.toContain("secret");
  });
});
