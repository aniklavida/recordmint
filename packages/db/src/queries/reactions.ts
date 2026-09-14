import { createHash } from "node:crypto";
import { and, asc, eq, gte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema/index.js";
import { reactionTimestampWindow, type ReactionEmoji } from "../schema/reactions.js";

type OrmClient = PostgresJsDatabase<typeof schema>;

/**
 * `user:<userId>` for a signed-in reactor, `guest:<sha256 of the source
 * IP>` for an anonymous one — see `../schema/reactions.ts` for why a
 * reaction needs this identity when a comment does not. Hashing the IP
 * means this table never holds one in a form that reads back as a plain
 * address.
 */
export function resolveReactorKey(params: { viewerUserId?: string | null; guestIp?: string | null }): string {
  if (params.viewerUserId) {
    return `user:${params.viewerUserId}`;
  }
  const ip = params.guestIp?.trim() || "unknown";
  return `guest:${createHash("sha256").update(ip).digest("hex")}`;
}

export interface NewReaction {
  id: string;
  recordingId: string;
  emoji: ReactionEmoji;
  timestampSeconds: number;
  reactorUserId?: string | null;
  reactorKey: string;
}

/**
 * Inserts a reaction, relying on the schema's own unique constraint
 * (recording, emoji, timestamp window, reactor) to enforce "one of each
 * emoji per timestamp window per viewer" atomically — two concurrent
 * requests from the same reactor can never both succeed, which an
 * application-level "check then insert" could not guarantee. Returns
 * `null` rather than throwing when the row already exists, so the
 * application layer can turn a duplicate into an ordinary, expected
 * refusal instead of an unhandled database error.
 */
export async function createReaction(orm: OrmClient, reaction: NewReaction) {
  const rows = await orm
    .insert(schema.reactions)
    .values({
      id: reaction.id,
      recordingId: reaction.recordingId,
      emoji: reaction.emoji,
      timestampSeconds: reaction.timestampSeconds,
      timestampWindow: reactionTimestampWindow(reaction.timestampSeconds),
      reactorUserId: reaction.reactorUserId ?? null,
      reactorKey: reaction.reactorKey,
    })
    .onConflictDoNothing({
      target: [
        schema.reactions.recordingId,
        schema.reactions.emoji,
        schema.reactions.timestampWindow,
        schema.reactions.reactorKey,
      ],
    })
    .returning();
  return rows[0] ?? null;
}

/**
 * Every reaction on a recording, ordered by playhead position like
 * `listCommentsForRecording` — these render as markers on the timeline.
 * Deliberately does not select `reactorUserId`/`reactorKey`: a reaction
 * is an anonymous marker, not an attributed message, and the identity
 * columns exist only to enforce the per-viewer limit above, never to be
 * read back and displayed.
 */
export async function listReactionsForRecording(orm: OrmClient, recordingId: string) {
  const rows = await orm
    .select({
      id: schema.reactions.id,
      emoji: schema.reactions.emoji,
      timestampSeconds: schema.reactions.timestampSeconds,
      createdAt: schema.reactions.createdAt,
    })
    .from(schema.reactions)
    .where(eq(schema.reactions.recordingId, recordingId))
    .orderBy(asc(schema.reactions.timestampSeconds), asc(schema.reactions.createdAt));
  return rows;
}

/**
 * Rate-limiting's whole implementation: count this reactor's own recent
 * rows on this recording and compare to a policy the application layer
 * owns. No separate counter table and no new dependency — the reactions
 * table is already the ledger, the same way `login_lockouts` is its own
 * ledger rather than routing through a cache this project deliberately
 * has none of (no Redis, one datastore to run and back up).
 */
export async function countReactionsByReactorSince(
  orm: OrmClient,
  params: { recordingId: string; reactorKey: string; since: Date },
): Promise<number> {
  const rows = await orm
    .select({ id: schema.reactions.id })
    .from(schema.reactions)
    .where(
      and(
        eq(schema.reactions.recordingId, params.recordingId),
        eq(schema.reactions.reactorKey, params.reactorKey),
        gte(schema.reactions.createdAt, params.since),
      ),
    );
  return rows.length;
}
