import { generateId } from "@recordmint/shared";

/**
 * `workspaces.slug` is unique, so a slug derived purely from a
 * user-chosen name will eventually collide — this always appends a short
 * random suffix rather than retrying on a unique-constraint violation,
 * trading a slightly uglier slug for a function with no failure path.
 */
export function generateWorkspaceSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = generateId().slice(0, 8);
  return base ? `${base}-${suffix}` : suffix;
}
