import { AppError } from "@recordmint/shared";
import { isNewCommentEmailEnabled, setNewCommentEmailEnabled } from "@recordmint/db";
import { getDb } from "../../../lib/db";

/**
 * Reads the signed-in caller's own new-comment email setting. There is no
 * "whose settings" input beyond `callerId` — this function has no way to
 * be asked for anyone else's row. The route that calls it is what
 * decides which id that is, and it always uses the session's own user,
 * never a value a request supplied.
 */
export async function getMyNotificationSettings(callerId: string) {
  const newCommentEmailEnabled = await isNewCommentEmailEnabled(getDb().orm, callerId);
  return { newCommentEmailEnabled };
}

export interface SetMyNotificationSettingsInput {
  /** The authenticated caller's own id, from `requireUser()` — the only account this call is ever allowed to change. */
  callerId: string;
  newCommentEmailEnabled: unknown;
}

/**
 * Updates the signed-in caller's own setting, and only that caller's.
 * `callerId` must come from the session, never from request input; this
 * function has no separate "target user" field, which is what makes
 * changing someone else's row structurally impossible here rather than
 * merely checked elsewhere.
 */
export async function setMyNotificationSettings(input: SetMyNotificationSettingsInput) {
  if (typeof input.newCommentEmailEnabled !== "boolean") {
    throw new AppError("VALIDATION_ERROR", "newCommentEmailEnabled must be a boolean.");
  }
  await setNewCommentEmailEnabled(getDb().orm, input.callerId, input.newCommentEmailEnabled);
  return { newCommentEmailEnabled: input.newCommentEmailEnabled };
}
