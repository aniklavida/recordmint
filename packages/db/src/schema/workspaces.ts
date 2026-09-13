import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * The tenant boundary. Every recording, comment and transcript hangs off
 * exactly one workspace, and `memberships` is the only path a query is
 * allowed to use to decide whether a caller may see into one — see
 * `../queries/recordings.ts` for the enforcement.
 */
export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
