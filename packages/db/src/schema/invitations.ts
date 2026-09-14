import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { membershipRoleEnum } from "./memberships.js";
import { users } from "./users.js";
import { workspaces } from "./workspaces.js";

/**
 * An outstanding invitation to join a workspace. `token` is the value
 * that appears in the invitation link — a `@recordmint/shared`
 * `generatePublicId`, unguessable the same way a share link's `publicId`
 * is — never the row's own `id`, which is never exposed in a URL.
 *
 * `acceptedAt` is set once, by accepting the invitation, at which point a
 * `memberships` row is created for the invited email's account. A row
 * here is never deleted on accept — it stays as the record of who invited
 * whom, and a re-invite of the same email/workspace pair reuses the row
 * (see `../queries/workspaces.ts`) rather than accumulating duplicates.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: membershipRoleEnum("role").notNull().default("member"),
    token: text("token").notNull().unique(),
    invitedByUserId: text("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    workspaceIdx: index("invitations_workspace_id_idx").on(table.workspaceId),
    emailIdx: index("invitations_email_idx").on(table.email),
  }),
);
