import { AppError } from "@recordmint/shared";
import { getMembership } from "@recordmint/db";
import { getDb } from "../lib/db";
import { getCurrentUser } from "./session";

/** Route handlers call this first and let the thrown AppError propagate to a 401 — see `../lib/error-response.ts`. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new AppError("UNAUTHENTICATED", "Sign in required.");
  }
  return user;
}

type MembershipRole = "owner" | "member" | "viewer";

const ROLE_RANK: Record<MembershipRole, number> = { viewer: 0, member: 1, owner: 2 };

/**
 * Every workspace-scoped route calls this rather than trusting a
 * `workspaceId` path parameter — resolving membership here is what
 * `packages/db`'s query layer expects every caller to have already done.
 */
export async function requireMembership(params: { workspaceId: string; userId: string; minimumRole?: MembershipRole }) {
  const membership = await getMembership(getDb().orm, params);
  if (!membership) {
    throw new AppError("NOT_A_MEMBER", "You are not a member of this workspace.");
  }
  if (params.minimumRole && ROLE_RANK[membership.role] < ROLE_RANK[params.minimumRole]) {
    throw new AppError("INSUFFICIENT_ROLE", `This action requires the '${params.minimumRole}' role.`);
  }
  return membership;
}
