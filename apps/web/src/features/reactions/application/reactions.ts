import { AppError, generateId } from "@recordmint/shared";
import {
  REACTION_EMOJIS,
  countReactionsByReactorSince,
  createReaction,
  listReactionsForRecording,
  resolveReactorKey,
  type ReactionEmoji,
} from "@recordmint/db";
import { getDb } from "../../../lib/db";
import { authorizeViewerForRecording } from "../../playback/application/authorize";

/**
 * `[assumed]`: at most 20 reactions from the same viewer, on the same
 * recording, per rolling minute. Generous enough that a viewer genuinely
 * reacting through a recording never notices it, tight enough to stop a
 * script from hammering the endpoint.
 */
const RATE_LIMIT_MAX_REACTIONS = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

function isReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(value);
}

export interface AddReactionInput {
  publicId: string;
  viewerUserId?: string | null;
  password?: string;
  emoji: string;
  timestampSeconds: number;
  /** Resolved by the route layer from the request's source address — see `../../../app/api/public/recordings/[publicId]/reactions/route.ts`. */
  guestIp?: string | null;
  now?: Date;
}

export interface ReactionDTO {
  id: string;
  emoji: ReactionEmoji;
  timestampSeconds: number;
  createdAt: Date;
}

/**
 * SPEC.md §13's comment access rule, reused rather than re-derived: the
 * same two checks `addComment` runs — the recording's own visibility,
 * then `guestCommentingEnabled` for anyone without a session — plus the
 * rules specific to a reaction: the emoji must be one of the fixed set,
 * one of each emoji per timestamp window per viewer (enforced by
 * `createReaction`'s own unique constraint, not repeated here), and a
 * rate limit per viewer per recording.
 */
export async function addReaction(input: AddReactionInput): Promise<ReactionDTO> {
  const authorization = await authorizeViewerForRecording(input);
  if (!authorization.ok) {
    throw new AppError(
      authorization.reason === "not_found" ? "NOT_FOUND" : "VALIDATION_ERROR",
      authorization.reason === "not_found" ? "Recording not found." : "A password is required to react to this recording.",
    );
  }
  const recording = authorization.recording;

  if (!input.viewerUserId && !recording.guestCommentingEnabled) {
    throw new AppError("INSUFFICIENT_ROLE", "Guest reactions are not enabled for this recording.");
  }

  if (!isReactionEmoji(input.emoji)) {
    throw new AppError("VALIDATION_ERROR", `emoji must be one of: ${REACTION_EMOJIS.join(" ")}.`);
  }
  if (!Number.isFinite(input.timestampSeconds) || input.timestampSeconds < 0) {
    throw new AppError("VALIDATION_ERROR", "timestampSeconds must be a non-negative number.");
  }

  const db = getDb();
  const reactorKey = resolveReactorKey({ viewerUserId: input.viewerUserId, guestIp: input.guestIp });
  const now = input.now ?? new Date();

  const recentCount = await countReactionsByReactorSince(db.orm, {
    recordingId: recording.id,
    reactorKey,
    since: new Date(now.getTime() - RATE_LIMIT_WINDOW_MS),
  });
  if (recentCount >= RATE_LIMIT_MAX_REACTIONS) {
    throw new AppError("RATE_LIMITED", "Too many reactions from this viewer recently — try again in a moment.");
  }

  const created = await createReaction(db.orm, {
    id: generateId(),
    recordingId: recording.id,
    emoji: input.emoji,
    timestampSeconds: input.timestampSeconds,
    reactorUserId: input.viewerUserId ?? null,
    reactorKey,
  });
  if (!created) {
    throw new AppError("CONFLICT", "This viewer already reacted with that emoji at this moment.");
  }

  return { id: created.id, emoji: created.emoji, timestampSeconds: created.timestampSeconds, createdAt: created.createdAt };
}

export interface ListReactionsInput {
  publicId: string;
  viewerUserId?: string | null;
  password?: string;
}

export async function listReactions(input: ListReactionsInput): Promise<ReactionDTO[]> {
  const authorization = await authorizeViewerForRecording(input);
  if (!authorization.ok) {
    throw new AppError(
      authorization.reason === "not_found" ? "NOT_FOUND" : "VALIDATION_ERROR",
      authorization.reason === "not_found" ? "Recording not found." : "A password is required to view reactions on this recording.",
    );
  }
  return listReactionsForRecording(getDb().orm, authorization.recording.id);
}
