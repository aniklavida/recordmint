import { AppError, generateId } from "@recordmint/shared";
import { createUser, createWorkspaceWithOwner, findUserByEmail } from "@recordmint/db";
import { hashPassword } from "../../../auth/password";
import { startSession } from "../../../auth/session";
import { getDb } from "../../../lib/db";
import { generateWorkspaceSlug } from "./slug";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export interface SignupInput {
  email: string;
  password: string;
  name: string;
}

/**
 * A self-hosted product that needs a vendor to log in is not self-hosted
 * (SPEC.md §12), so signup is the entire identity story: create the
 * account, create a personal workspace with that account as its owner,
 * and start a session — no email verification step, because there is no
 * mail provider configured by default and a self-hoster should not need
 * one to use their own instance.
 */
export async function signup(input: SignupInput) {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new AppError("VALIDATION_ERROR", "Enter a valid email address.");
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError("VALIDATION_ERROR", `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (!input.name.trim()) {
    throw new AppError("VALIDATION_ERROR", "Enter a name.");
  }

  const db = getDb();
  const existing = await findUserByEmail(db.orm, email);
  if (existing) {
    throw new AppError("CONFLICT", "An account with this email already exists.");
  }

  const passwordHash = await hashPassword(input.password);
  const userId = generateId();
  const user = await createUser(db.orm, { id: userId, email, passwordHash, name: input.name.trim() });

  const { workspace } = await createWorkspaceWithOwner(db.orm, {
    workspace: {
      id: generateId(),
      name: `${user.name}'s workspace`,
      slug: generateWorkspaceSlug(user.name),
    },
    ownerUserId: user.id,
    membershipId: generateId(),
  });

  await startSession(user.id);

  return { user, workspace };
}
