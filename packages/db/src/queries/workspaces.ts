import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema/index.js";

type OrmClient = PostgresJsDatabase<typeof schema>;
type MembershipRole = (typeof schema.membershipRoleEnum.enumValues)[number];

export interface NewWorkspace {
  id: string;
  name: string;
  slug: string;
}

/**
 * Creates a workspace and its founding `owner` membership in one
 * transaction, so a workspace can never exist without someone who can
 * administer it — the signup flow calls this once per new account, for
 * that account's personal workspace.
 */
export async function createWorkspaceWithOwner(
  orm: OrmClient,
  params: { workspace: NewWorkspace; ownerUserId: string; membershipId: string },
) {
  return orm.transaction(async (tx) => {
    const [workspace] = await tx.insert(schema.workspaces).values(params.workspace).returning();
    const [membership] = await tx
      .insert(schema.memberships)
      .values({
        id: params.membershipId,
        workspaceId: params.workspace.id,
        userId: params.ownerUserId,
        role: "owner",
      })
      .returning();
    return { workspace: workspace!, membership: membership! };
  });
}

export async function listWorkspacesForUser(orm: OrmClient, userId: string) {
  const rows = await orm
    .select({ workspace: schema.workspaces, role: schema.memberships.role })
    .from(schema.memberships)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.memberships.workspaceId))
    .where(eq(schema.memberships.userId, userId));
  return rows;
}

/** The one lookup every authorization check in `apps/web` starts from: does this user belong here, and as what. */
export async function getMembership(
  orm: OrmClient,
  params: { workspaceId: string; userId: string },
) {
  const rows = await orm
    .select()
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.workspaceId, params.workspaceId),
        eq(schema.memberships.userId, params.userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listMembers(orm: OrmClient, workspaceId: string) {
  const rows = await orm
    .select({ membership: schema.memberships, user: schema.users })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.workspaceId, workspaceId));
  return rows;
}

export async function updateMemberRole(
  orm: OrmClient,
  params: { workspaceId: string; userId: string; role: MembershipRole },
) {
  const rows = await orm
    .update(schema.memberships)
    .set({ role: params.role })
    .where(
      and(
        eq(schema.memberships.workspaceId, params.workspaceId),
        eq(schema.memberships.userId, params.userId),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function removeMember(
  orm: OrmClient,
  params: { workspaceId: string; userId: string },
): Promise<void> {
  await orm
    .delete(schema.memberships)
    .where(
      and(
        eq(schema.memberships.workspaceId, params.workspaceId),
        eq(schema.memberships.userId, params.userId),
      ),
    );
}

/** Retention is an owner-only setting (SPEC.md §12); the role check itself belongs to the route/application layer. */
export async function updateWorkspaceRetention(
  orm: OrmClient,
  params: { workspaceId: string; retentionDays: number | null },
) {
  const rows = await orm
    .update(schema.workspaces)
    .set({ retentionDays: params.retentionDays, updatedAt: new Date() })
    .where(eq(schema.workspaces.id, params.workspaceId))
    .returning();
  return rows[0] ?? null;
}

export interface NewInvitation {
  id: string;
  workspaceId: string;
  email: string;
  role: MembershipRole;
  token: string;
  invitedByUserId: string;
  expiresAt: Date;
}

/**
 * Re-inviting the same email to the same workspace updates the existing
 * outstanding row instead of accumulating duplicates — an operator
 * re-sending a link should not mint a second, still-valid token for the
 * same invitation.
 */
export async function createOrRefreshInvitation(orm: OrmClient, invitation: NewInvitation) {
  const existing = await orm
    .select()
    .from(schema.invitations)
    .where(
      and(
        eq(schema.invitations.workspaceId, invitation.workspaceId),
        eq(schema.invitations.email, invitation.email),
        isNull(schema.invitations.acceptedAt),
      ),
    )
    .limit(1);

  if (existing[0]) {
    const rows = await orm
      .update(schema.invitations)
      .set({
        role: invitation.role,
        token: invitation.token,
        invitedByUserId: invitation.invitedByUserId,
        expiresAt: invitation.expiresAt,
      })
      .where(eq(schema.invitations.id, existing[0].id))
      .returning();
    return rows[0]!;
  }

  const rows = await orm.insert(schema.invitations).values(invitation).returning();
  return rows[0]!;
}

export async function findInvitationByToken(orm: OrmClient, token: string) {
  const rows = await orm
    .select()
    .from(schema.invitations)
    .where(eq(schema.invitations.token, token))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Accepting an invitation is a transaction: mark it accepted and create
 * the membership together, so a page reload between the two steps can
 * never leave an accepted invitation with no membership behind it.
 * Accepting an invitation the caller already holds a membership for is a
 * no-op on the membership half — idempotent by design, since the link
 * might be opened twice.
 */
export async function acceptInvitation(
  orm: OrmClient,
  params: { invitationId: string; workspaceId: string; userId: string; membershipId: string; role: MembershipRole; now?: Date },
) {
  return orm.transaction(async (tx) => {
    await tx
      .update(schema.invitations)
      .set({ acceptedAt: params.now ?? new Date() })
      .where(eq(schema.invitations.id, params.invitationId));

    const existingMembership = await tx
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.workspaceId, params.workspaceId),
          eq(schema.memberships.userId, params.userId),
        ),
      )
      .limit(1);

    if (existingMembership[0]) {
      return existingMembership[0];
    }

    const rows = await tx
      .insert(schema.memberships)
      .values({
        id: params.membershipId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        role: params.role,
      })
      .returning();
    return rows[0]!;
  });
}
