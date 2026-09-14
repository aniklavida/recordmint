import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * The tenant boundary. Every recording, comment and transcript hangs off
 * exactly one workspace, and `memberships` is the only path a query is
 * allowed to use to decide whether a caller may see into one — see
 * `../queries/recordings.ts` for the enforcement.
 *
 * `retentionDays` is a cost control, not a feature (SPEC.md §6, §20):
 * storage is the running cost of a self-hosted video tool, and a sweep
 * that never runs is how that cost quietly becomes unbounded. `null`
 * means "keep forever" — the safe default until an owner opts into a
 * shorter policy. Only a workspace `owner` may change it; enforcement is
 * in the query/route layer, not the schema, the same way role checks
 * work everywhere else in this table set.
 */
export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  retentionDays: integer("retention_days"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
