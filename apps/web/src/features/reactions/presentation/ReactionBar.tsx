"use client";

import { useEffect, useState } from "react";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "👏"] as const;

interface ReactionRow {
  id: string;
  emoji: string;
  timestampSeconds: number;
  createdAt: string;
}

function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

/**
 * One tap logs a reaction at whatever moment is currently playing —
 * anonymous markers on the timeline, not a second comment thread. Access
 * follows the exact same rule `CommentsPanel` does: a guest only sees the
 * picker when this recording's `guestCommentingEnabled` is on.
 */
export function ReactionBar({
  publicId,
  guestCommentingEnabled,
  isAuthenticated,
  currentTimeSeconds,
}: {
  publicId: string;
  guestCommentingEnabled: boolean;
  isAuthenticated: boolean;
  currentTimeSeconds: number;
}) {
  const [reactions, setReactions] = useState<ReactionRow[]>([]);
  const [pendingEmoji, setPendingEmoji] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canReact = isAuthenticated || guestCommentingEnabled;

  useEffect(() => {
    fetch(`/api/public/recordings/${publicId}/reactions`)
      .then((response) => response.json() as Promise<{ reactions: ReactionRow[] }>)
      .then((result) => setReactions(result.reactions ?? []))
      .catch(() => undefined);
  }, [publicId]);

  function react(emoji: string): void {
    setPendingEmoji(emoji);
    setError(null);
    fetch(`/api/public/recordings/${publicId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji, timestampSeconds: currentTimeSeconds }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
          throw new Error(body?.error?.message ?? "Could not add that reaction.");
        }
        return response.json() as Promise<{ reaction: ReactionRow }>;
      })
      .then((result) => {
        setReactions((previous) => [...previous, result.reaction].sort((a, b) => a.timestampSeconds - b.timestampSeconds));
        setPendingEmoji(null);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Could not add that reaction.");
        setPendingEmoji(null);
      });
  }

  const counts = new Map<string, number>();
  for (const reaction of reactions) {
    counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
  }

  return (
    <section aria-label="Reactions" className="reaction-bar">
      {canReact ? (
        <div className="reaction-bar-picker">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              disabled={pendingEmoji !== null}
              aria-label={`React with ${emoji} at ${formatTimestamp(currentTimeSeconds)}`}
              onClick={() => react(emoji)}
            >
              {emoji}
              {counts.get(emoji) ? <span> {counts.get(emoji)}</span> : null}
            </button>
          ))}
        </div>
      ) : (
        <p>Reactions are not enabled for this recording.</p>
      )}
      {error ? <p role="alert">{error}</p> : null}
      {reactions.length > 0 ? (
        <ul aria-label="Reaction timeline">
          {reactions.map((reaction) => (
            <li key={reaction.id}>
              <button type="button" data-seek-to={reaction.timestampSeconds}>
                {formatTimestamp(reaction.timestampSeconds)}
              </button>{" "}
              {reaction.emoji}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
