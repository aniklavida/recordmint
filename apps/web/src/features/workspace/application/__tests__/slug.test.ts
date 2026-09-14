import { describe, expect, it } from "vitest";
import { generateWorkspaceSlug } from "../slug.js";

describe("generateWorkspaceSlug", () => {
  it("lowercases, hyphenates and appends a random suffix", () => {
    const slug = generateWorkspaceSlug("Alice's Workspace");
    expect(slug).toMatch(/^alice-s-workspace-[a-z0-9]{8}$/);
  });

  it("never produces the same slug twice for the same name, since workspaces.slug is unique", () => {
    const slugs = new Set(Array.from({ length: 200 }, () => generateWorkspaceSlug("Team")));
    expect(slugs.size).toBe(200);
  });

  it("falls back to just the suffix when the name has no alphanumeric characters", () => {
    const slug = generateWorkspaceSlug("!!!");
    expect(slug).toMatch(/^[a-z0-9]{8}$/);
  });

  it("truncates a very long name rather than producing an unbounded slug", () => {
    const slug = generateWorkspaceSlug("a".repeat(200));
    // 40-char truncated base + "-" + 8-char suffix
    expect(slug.length).toBe(49);
  });
});
