import { createHash } from "node:crypto";
import { AppError, generateId, generateSecureToken } from "@recordmint/shared";
import {
  clearLoginLockout,
  createPasswordResetToken,
  deleteSessionsForUser,
  findUserByEmail,
  findUserById,
  findValidPasswordResetToken,
  invalidateOutstandingPasswordResetTokens,
  markPasswordResetTokenUsed,
  updateUserPassword,
} from "@recordmint/db";
import { getMailTransport, type MailTransport } from "@recordmint/shared/mail";
import { hashPassword } from "../../../auth/password";
import { getDb } from "../../../lib/db";

/**
 * [assumed] One hour — long enough to receive and open an email, short
 * enough that a link sitting unread in an inbox is not a standing
 * credential. Not a value the spec pins to a number.
 */
const RESET_TOKEN_LIFETIME_MS = 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

function hashResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export interface RequestPasswordResetInput {
  email: string;
}

export interface RequestPasswordResetDeps {
  mailTransport?: MailTransport;
  now?: Date;
  publicBaseUrl?: string;
}

/**
 * A reset link is itself a credential, so this function
 * is the only place the raw token is ever computed, and it only ever
 * leaves this function inside the email body. It is never returned to a
 * caller, never included in a thrown `AppError`, and never passed to
 * `console.*` — see `password-reset.test.ts`'s "token is never logged"
 * case, which asserts exactly that against a spy on every console method.
 *
 * Resolves to the same `undefined` whether or not the email belongs to an
 * account. The route handler built on top of this always answers with
 * the same body either way — a reset form must not be usable to test
 * which emails are registered, the same enumeration concern login already
 * treats as load-bearing.
 */
export async function requestPasswordReset(
  input: RequestPasswordResetInput,
  deps: RequestPasswordResetDeps = {},
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const db = getDb();
  const user = await findUserByEmail(db.orm, email);
  if (!user) {
    return;
  }

  const now = deps.now ?? new Date();
  const rawToken = generateSecureToken();
  const tokenHash = hashResetToken(rawToken);

  // Issuing a new token invalidates every other outstanding one for this
  // account first, so an older, still-unexpired link stops working the
  // moment a new reset is requested — there is only ever one live token.
  await invalidateOutstandingPasswordResetTokens(db.orm, user.id);
  await createPasswordResetToken(db.orm, {
    id: generateId(),
    userId: user.id,
    tokenHash,
    expiresAt: new Date(now.getTime() + RESET_TOKEN_LIFETIME_MS),
  });

  const baseUrl = deps.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
  const resetUrl = `${baseUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(rawToken)}`;
  const mailTransport = deps.mailTransport ?? getMailTransport();

  await mailTransport.send({
    to: user.email,
    subject: "Reset your RecordMint password",
    text: [
      "Someone asked to reset the password on this RecordMint account.",
      "",
      `If that was you, open this link within the next hour: ${resetUrl}`,
      "",
      "If you didn't request this, ignore this email — your password will not change.",
    ].join("\n"),
  });
}

export interface ConfirmPasswordResetInput {
  token: string;
  password: string;
}

export interface ConfirmPasswordResetDeps {
  now?: Date;
}

/**
 * Consumes a reset token: verified by the SHA-256 hash of its raw value
 * (never by the raw value itself, which this package never stores),
 * single-use (`usedAt` is set the moment it is spent) and short-lived
 * (`expiresAt`, checked at the query). On success every existing session
 * for the account is revoked — a session cookie stolen before the reset
 * must not survive it — and any lockout on the account's email is
 * cleared, since a successful reset is itself proof of ownership.
 */
export async function confirmPasswordReset(
  input: ConfirmPasswordResetInput,
  deps: ConfirmPasswordResetDeps = {},
): Promise<void> {
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError("VALIDATION_ERROR", `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const now = deps.now ?? new Date();
  const db = getDb();
  const tokenHash = hashResetToken(input.token);
  const record = await findValidPasswordResetToken(db.orm, tokenHash, now);
  if (!record) {
    throw new AppError("VALIDATION_ERROR", "This reset link is invalid or has expired.");
  }

  const passwordHash = await hashPassword(input.password);

  await markPasswordResetTokenUsed(db.orm, record.id, now);
  await updateUserPassword(db.orm, record.userId, passwordHash);
  await deleteSessionsForUser(db.orm, record.userId);

  const user = await findUserById(db.orm, record.userId);
  if (user) {
    await clearLoginLockout(db.orm, user.email);
  }
}
