import { findUserById, getRecordingById, isNewCommentEmailEnabled, listCommentsForRecordingSince } from "@recordmint/db";
import { getMailTransport, type MailTransport } from "@recordmint/shared/mail";
import { getDb } from "../lib/db.js";

export interface CommentNotificationJobData {
  recordingId: string;
  /**
   * Set by `apps/web`'s `enqueueCommentNotification` at the moment the
   * batch's first qualifying comment was posted. This job reads every
   * comment created at or after this timestamp — not just the one that
   * happened to trigger the enqueue — which is what turns a burst of
   * comments into a single email even though only one `send()` call in
   * the window ever actually inserted a job row.
   */
  enqueuedAt: string;
}

export interface CommentNotificationDeps {
  mailTransport?: MailTransport;
  publicBaseUrl?: string;
}

/**
 * `MM:SS`, or `H:MM:SS` past the first hour — the same shape a video
 * player's own scrubber uses, so the number in the email matches what a
 * click into the player would show.
 */
function formatVideoTimestamp(totalSeconds: number): string {
  const wholeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;
  const secondsLabel = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${secondsLabel}`;
  }
  return `${minutes}:${secondsLabel}`;
}

/**
 * Nothing here is on the critical path to a share link — the same rule
 * every other worker job follows. Never notifies a recording's creator
 * about their own comment (`listCommentsForRecordingSince` excludes them
 * at the query, a second layer under `apps/web`'s own skip on enqueue),
 * never sends when the creator has switched the setting off, and never
 * sends an empty digest.
 *
 * The email body is deliberately narrow: recording title, each
 * commenter's display name (or "a guest" for an unauthenticated one —
 * a guest's own free-text display name is never echoed into another
 * person's inbox), the comment's timestamp in the video, and a plain
 * link to the player page. No presigned storage URL, no session or
 * reset token, no viewer's email address — the player page itself is
 * where a recipient goes to actually read a comment, so nothing more
 * sensitive than "something was posted, and where to look" ever needs to
 * leave this function.
 */
export async function runCommentNotificationJob(
  data: CommentNotificationJobData,
  deps: CommentNotificationDeps = {},
): Promise<void> {
  try {
    const db = getDb();
    const recording = await getRecordingById(db.orm, data.recordingId);
    if (!recording) return; // deleted before the job ran

    const creator = await findUserById(db.orm, recording.creatorId);
    if (!creator) return; // account deleted before the job ran

    const enabled = await isNewCommentEmailEnabled(db.orm, creator.id);
    if (!enabled) return;

    const since = new Date(data.enqueuedAt);
    const rows = await listCommentsForRecordingSince(db.orm, recording.id, since, recording.creatorId);
    if (rows.length === 0) return; // every comment in the window turned out to be the creator's own

    const baseUrl = deps.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
    const playerUrl = `${baseUrl.replace(/\/$/, "")}/v/${recording.publicId}`;

    const lines = rows.map((row) => {
      const name = row.author?.name ?? "a guest";
      return `${name} at ${formatVideoTimestamp(row.comment.timestampSeconds)}`;
    });

    const subject =
      rows.length === 1
        ? `New comment on "${recording.title}"`
        : `${rows.length} new comments on "${recording.title}"`;

    const text = [
      rows.length === 1
        ? `Someone commented on your recording "${recording.title}":`
        : `${rows.length} people commented on your recording "${recording.title}":`,
      "",
      ...lines,
      "",
      `See it in the player: ${playerUrl}`,
    ].join("\n");

    const mailTransport = deps.mailTransport ?? getMailTransport();
    await mailTransport.send({ to: creator.email, subject, text });
  } catch (error) {
    console.error("Comment notification failed:", error instanceof Error ? error.name : "unknown error");
    throw error; // let pg-boss's own retry/backoff and dead-letter queue handle it
  }
}
