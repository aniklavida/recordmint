import { index, pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { workspaces } from "./workspaces.js";

/**
 * SPEC.md §12: Owner (everything), Member (record/share/comment/delete
 * their own recordings), Viewer (watch and comment, not record).
 */
export const membershipRoleEnum = pgEnum("membership_role", ["owner", "member", "viewer"]);

/**
 * The one row that proves a user may see into a workspace. Every
 * workspace-scoped query joins through this table rather than trusting a
 * `workspaceId` the caller supplies — that join is the visibility model.
 */
export const memberships = pgTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    workspaceUserUnique: unique("memberships_workspace_id_user_id_key").on(
      table.workspaceId,
      table.userId,
    ),
    workspaceIdx: index("memberships_workspace_id_idx").on(table.workspaceId),
    userIdx: index("memberships_user_id_idx").on(table.userId),
  }),
);
