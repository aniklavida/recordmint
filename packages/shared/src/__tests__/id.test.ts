import { describe, expect, it } from "vitest";
import { generatePublicId, generateId } from "../id.js";

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
