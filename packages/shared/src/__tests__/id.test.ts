import { describe, expect, it } from "vitest";
import { generatePublicId, generateId, generateSecureToken } from "../id.js";

describe("generatePublicId", () => {
  it("produces a 12-character URL-safe id", () => {
    const id = generatePublicId();
    expect(id).toHaveLength(12);
    expect(id).toMatch(/^[A-Za-z2-9]+$/);
  });

  it("never repeats across a large sample", () => {
    const ids = new Set(Array.from({ length: 5000 }, () => generatePublicId()));
    expect(ids.size).toBe(5000);
  });
});

describe("generateId", () => {
  it("produces a 20-character lowercase id distinct from public ids", () => {
    const id = generateId();
    expect(id).toHaveLength(20);
    expect(id).toMatch(/^[a-z0-9]+$/);
  });
});

describe("generateSecureToken", () => {
  it("produces a base64url string carrying 32 bytes of entropy", () => {
    const token = generateSecureToken();
    // base64url of 32 bytes is 43 characters (no padding).
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("never repeats across a large sample", () => {
    const tokens = new Set(Array.from({ length: 5000 }, () => generateSecureToken()));
    expect(tokens.size).toBe(5000);
  });
});
