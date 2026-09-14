import { AppError, generateId, generateSecureToken } from "@recordmint/shared";
import { acceptInvitation, createOrRefreshInvitation, findInvitationByToken } from "@recordmint/db";
import { getDb } from "../../../lib/db";

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface InviteInput {
  workspaceId: string;
  email: string;
  role: "owner" | "member" | "viewer";
  invitedByUserId: string;
}

/**
 * Returns the invitation and its raw token together. The token is only
 * ever available at the moment of creation — `invitations.token` is
 * stored so it can be looked up, but nothing about this function or the
 * route that calls it persists the token anywhere else (a log line, an
 * email queue) that this codebase does not already own.
 */
export async function invite(input: InviteInput) {
  const email = input.email.trim().toLowerCase();
  const token = generateSecureToken();
  const invitation = await createOrRefreshInvitation(getDb().orm, {
    id: generateId(),
    workspaceId: input.workspaceId,
    email,
    role: input.role,
    token,
    invitedByUserId: input.invitedByUserId,
    expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
  });
  return { invitation, token };
}

export interface AcceptInvitationInput {
  token: string;
  userId: string;
  userEmail: string;
}

/**
 * The invited email must match the accepting account's own email —
 * without that check, anyone who obtains the token (a forwarded link, a
 * shared inbox) could join under a different identity than the one
 * actually invited.
 */
export async function acceptInvite(input: AcceptInvitationInput) {
  const db = getDb();
  const invitation = await findInvitationByToken(db.orm, input.token);
  if (!invitation) {
    throw new AppError("NOT_FOUND", "This invitation does not exist.");
  }
  if (invitation.email !== input.userEmail.trim().toLowerCase()) {
    throw new AppError("VALIDATION_ERROR", "This invitation was sent to a different email address.");
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    throw new AppError("VALIDATION_ERROR", "This invitation has expired.");
  }

  return acceptInvitation(db.orm, {
    invitationId: invitation.id,
    workspaceId: invitation.workspaceId,
    userId: input.userId,
    membershipId: generateId(),
    role: invitation.role,
  });
}
