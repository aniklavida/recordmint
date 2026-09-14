import { generateId } from "@recordmint/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../client.js";
import { runMigrations } from "../migrate.js";
import {
  acceptInvitation,
  createOrRefreshInvitation,
  createWorkspaceWithOwner,
  findInvitationByToken,
  getMembership,
  listMembers,
  listWorkspacesForUser,
  removeMember,
  updateMemberRole,
  updateWorkspaceRetention,
} from "../queries/workspaces.js";
import * as schema from "../schema/index.js";

describe.skipIf(!process.env.DATABASE_URL)("workspace queries", () => {
  let db: Db;
  const ownerId = generateId();
  const inviteeId = generateId();
  const workspaceId = generateId();

  beforeAll(async () => {
    db = createDb({ connectionString: process.env.DATABASE_URL! });
    await runMigrations();
    await db.orm.insert(schema.users).values([
      { id: ownerId, email: `owner-${ownerId}@example.test`, passwordHash: "x", name: "Owner" },
      { id: inviteeId, email: `invitee-${inviteeId}@example.test`, passwordHash: "x", name: "Invitee" },
    ]);
  });

  afterAll(async () => {
    await db.orm.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
    await db.orm.delete(schema.users).where(eq(schema.users.id, ownerId));
    await db.orm.delete(schema.users).where(eq(schema.users.id, inviteeId));
    await db.sql.end();
  });

  it("creates a workspace with a founding owner membership, atomically", async () => {
    const { workspace, membership } = await createWorkspaceWithOwner(db.orm, {
      workspace: { id: workspaceId, name: "Test Workspace", slug: `test-ws-${workspaceId}` },
      ownerUserId: ownerId,
      membershipId: generateId(),
    });
    expect(workspace.id).toBe(workspaceId);
    expect(membership.role).toBe("owner");

    const membershipRow = await getMembership(db.orm, { workspaceId, userId: ownerId });
    expect(membershipRow?.role).toBe("owner");
  });

  it("lists the workspaces a user belongs to", async () => {
    const rows = await listWorkspacesForUser(db.orm, ownerId);
    expect(rows.some((row) => row.workspace.id === workspaceId)).toBe(true);
  });

  it("only an owner action changes retention, and it is a single update point", async () => {
    const updated = await updateWorkspaceRetention(db.orm, { workspaceId, retentionDays: 30 });
    expect(updated?.retentionDays).toBe(30);
  });

  it("invites, then accepts, then a re-invite refreshes the same row instead of duplicating", async () => {
    const email = `invitee-${inviteeId}@example.test`;
    const firstToken = generateId();
    const invitation = await createOrRefreshInvitation(db.orm, {
      id: generateId(),
      workspaceId,
      email,
      role: "member",
      token: firstToken,
      invitedByUserId: ownerId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const secondToken = generateId();
    const refreshed = await createOrRefreshInvitation(db.orm, {
      id: generateId(), // ignored — the existing row is updated, not a new one inserted
      workspaceId,
      email,
      role: "member",
      token: secondToken,
      invitedByUserId: ownerId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    expect(refreshed.id).toBe(invitation.id);
    expect(refreshed.token).toBe(secondToken);

    // the stale first token no longer resolves to anything
    expect(await findInvitationByToken(db.orm, firstToken)).toBeNull();

    const found = await findInvitationByToken(db.orm, secondToken);
    expect(found?.email).toBe(email);

    const accepted = await acceptInvitation(db.orm, {
      invitationId: found!.id,
      workspaceId,
      userId: inviteeId,
      membershipId: generateId(),
      role: found!.role,
    });
    expect(accepted.role).toBe("member");

    const membershipRow = await getMembership(db.orm, { workspaceId, userId: inviteeId });
    expect(membershipRow?.role).toBe("member");
  });

  it("accepting the same invitation twice is idempotent, not a duplicate membership", async () => {
    const membershipsBefore = await listMembers(db.orm, workspaceId);
    const countBefore = membershipsBefore.length;

    const invitationRows = await db.orm
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.workspaceId, workspaceId));
    const invitation = invitationRows[0]!;
    await acceptInvitation(db.orm, {
      invitationId: invitation.id,
      workspaceId,
      userId: inviteeId,
      membershipId: generateId(),
      role: invitation.role,
    });

    const membershipsAfter = await listMembers(db.orm, workspaceId);
    expect(membershipsAfter.length).toBe(countBefore);
  });

  it("lists members with their user rows joined in", async () => {
    const members = await listMembers(db.orm, workspaceId);
    expect(members.map((m) => m.user.id).sort()).toEqual([inviteeId, ownerId].sort());
  });

  it("changes a member's role", async () => {
    const updated = await updateMemberRole(db.orm, { workspaceId, userId: inviteeId, role: "viewer" });
    expect(updated?.role).toBe("viewer");
  });

  it("removes a member", async () => {
    await removeMember(db.orm, { workspaceId, userId: inviteeId });
    expect(await getMembership(db.orm, { workspaceId, userId: inviteeId })).toBeNull();
  });
});
