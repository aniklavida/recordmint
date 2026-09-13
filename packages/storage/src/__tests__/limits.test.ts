import { describe, expect, it } from "vitest";
import { MAX_PRESIGN_TTL_SECONDS, resolvePresignTtlSeconds } from "../limits.js";

describe("resolvePresignTtlSeconds", () => {
  it("falls back to the default when no TTL is requested", () => {
    expect(resolvePresignTtlSeconds(undefined, 900)).toBe(900);
  });

  it("accepts a requested TTL under the ceiling", () => {
    expect(resolvePresignTtlSeconds(60, 900)).toBe(60);
  });

  it("rejects a TTL past the ceiling — a link that outlives its need is a leak", () => {
    expect(() => resolvePresignTtlSeconds(MAX_PRESIGN_TTL_SECONDS + 1, 900)).toThrow(
      /exceeds the maximum/,
    );
  });

  it("rejects zero and negative TTLs", () => {
    expect(() => resolvePresignTtlSeconds(0, 900)).toThrow(/positive/);
    expect(() => resolvePresignTtlSeconds(-5, 900)).toThrow(/positive/);
  });
});
