import { AppError } from "@recordmint/shared";
import { findUserByEmail } from "@recordmint/db";
import { verifyPassword } from "../../../auth/password";
import { startSession } from "../../../auth/session";
import { getDb } from "../../../lib/db";

export interface LoginInput {
  email: string;
  password: string;
}

/**
 * Deliberately the same error for "no such account" and "wrong password"
 * — telling the two apart from the response is how a login form becomes
 * an account-enumeration oracle.
 */
export async function login(input: LoginInput) {
  const email = input.email.trim().toLowerCase();
  const user = await findUserByEmail(getDb().orm, email);
  const valid = user ? await verifyPassword(input.password, user.passwordHash) : false;

  if (!user || !valid) {
    throw new AppError("INVALID_CREDENTIALS", "Incorrect email or password.");
  }

  await startSession(user.id);
  return { user };
}
