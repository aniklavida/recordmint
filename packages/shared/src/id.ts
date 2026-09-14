import { randomBytes } from "node:crypto";
import { customAlphabet } from "nanoid";

/**
 * URL-safe alphabet with ambiguous characters removed (no 0/O, 1/l/I).
 * Used for anything that ends up in a link, so a person can read it aloud
 * without guessing at a character.
 */
const PUBLIC_ID_ALPHABET =
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const nanoidPublicId = customAlphabet(PUBLIC_ID_ALPHABET, 12);

/**
 * Generates a public identifier, e.g. a share link's `publicId`.
 *
 * This is deliberately not a sequential row id: an unlisted link's whole
 * security property is that it cannot be guessed or enumerated. Every
 * caller in the codebase must go through this function so the format
 * changes in exactly one place if it ever needs to.
 */
export function generatePublicId(): string {
  return nanoidPublicId();
}

const nanoidInternalId = customAlphabet(
  "0123456789abcdefghijklmnopqrstuvwxyz",
  20,
);

/**
 * Generates an internal identifier for rows that are never exposed in a
 * URL (e.g. primary keys referenced only server-side). Not a security
 * boundary — use `generatePublicId` for anything link-shaped, or
 * `generateSecureToken` for anything that is itself a credential.
 */
export function generateId(): string {
  return nanoidInternalId();
}

/**
 * Generates a high-entropy token for something that *is* a credential —
 * a session cookie value, an invitation link's token. 32 bytes
 * (256 bits) of `crypto.randomBytes`, base64url-encoded so it drops
 * straight into a cookie or a URL with no escaping.
 *
 * Deliberately a different function from `generatePublicId`: a
 * recording's `publicId` only has to be hard to enumerate, while a
 * session id or invitation token is the entire proof of identity behind
 * it and is held to the higher bar every authentication credential needs.
 */
export function generateSecureToken(): string {
  return randomBytes(32).toString("base64url");
}
