"use client";

import { useEffect, useState } from "react";

interface CommentRow {
  id: string;
  timestampSeconds: number;
  body: string;
  authorName: string | null;
  isGuest: boolean;
  createdAt: string;
}

function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

/**
 * A viewer with a link can comment against a moment in the recording and
 * the author sees it there — this panel is the entire round trip,
 * timestamped against whatever moment the commenter is looking at. Guest
 * commenting only
 * shows a name field when `guestCommentingEnabled` says the recording
 * accepts it; an authenticated viewer never sees that field at all.
 */
export function CommentsPanel({
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
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [body, setBody] = useState("");
  const [guestName, setGuestName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canComment = isAuthenticated || guestCommentingEnabled;

  useEffect(() => {
    fetch(`/api/public/recordings/${publicId}/comments`)
      .then((response) => response.json() as Promise<{ comments: CommentRow[] }>)
      .then((result) => setComments(result.comments ?? []))
      .catch(() => undefined);
  }, [publicId]);

  return (
    <section aria-label="Comments" className="comments-panel">
      <h2>Comments</h2>
      <ol>
        {comments.map((comment) => (
          <li key={comment.id}>
            <button type="button" data-seek-to={comment.timestampSeconds}>
              {formatTimestamp(comment.timestampSeconds)}
            </button>{" "}
            <strong>{comment.authorName ?? "Someone"}</strong>
            {comment.isGuest ? " (guest)" : ""}: {comment.body}
          </li>
        ))}
        {comments.length === 0 ? <li>No comments yet.</li> : null}
      </ol>

      {canComment ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitting(true);
            setError(null);
            fetch(`/api/public/recordings/${publicId}/comments`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                timestampSeconds: currentTimeSeconds,
                body,
                ...(isAuthenticated ? {} : { guestName }),
              }),
            })
              .then((response) => {
                if (!response.ok) throw new Error("failed");
                return response.json() as Promise<{ comment: CommentRow }>;
              })
              .then((result) => {
                setComments((previous) => [...previous, result.comment].sort((a, b) => a.timestampSeconds - b.timestampSeconds));
                setBody("");
                setSubmitting(false);
              })
              .catch(() => {
                setError("Could not post that comment.");
                setSubmitting(false);
              });
          }}
        >
          <p>Commenting at {formatTimestamp(currentTimeSeconds)}</p>
          {!isAuthenticated ? (
            <input
              aria-label="Your name"
              placeholder="Your name"
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
              required
            />
          ) : null}
          <textarea
            aria-label="Comment"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
          />
          <button type="submit" disabled={submitting}>
            {submitting ? "Posting…" : "Comment"}
          </button>
          {error ? <p role="alert">{error}</p> : null}
        </form>
      ) : (
        <p>Commenting is not enabled for this recording.</p>
      )}
    </section>
  );
}
