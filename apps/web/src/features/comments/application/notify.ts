import { QUEUE_NAMES } from "@recordmint/db";
import { getQueue } from "../../../lib/queue";

/**
 * How long a burst of comments on the same recording is batched into a
 * single email, stated plainly here because it is the one number that
 * decides whether ten comments in a minute produce ten emails or one.
 * Five minutes: long enough that a short back-and-forth in the comments
 * lands in one message, short enough that "someone commented" is still
 * timely news by the time it arrives.
 *
 * The window is a fixed clock-time slot (pg-boss's own `singletonSeconds`
 * mechanics — see `enqueueCommentNotification` below), not a rolling
 * window measured from the first comment, so the actual delay before a
 * batched email goes out can be anywhere from just under a moment to just
 * under this many seconds depending on where in the slot the first
 * comment lands.
 */
export const COMMENT_NOTIFICATION_WINDOW_SECONDS = 5 * 60;

export interface CommentNotificationJobData {
  recordingId: string;
  /**
   * The moment the batch's first comment triggered this job. The worker
   * reads every comment created at or after this timestamp when the job
   * finally runs, which is what actually gathers a burst into one email —
   * not the job's own `data`, which only ever reflects whichever single
   * call happened to be the one pg-boss let through.
   */
  enqueuedAt: string;
}

/**
 * One job per recording per `COMMENT_NOTIFICATION_WINDOW_SECONDS` window,
 * not one per comment. The batching itself is a real database unique
 * constraint inside pg-boss (`singletonKey` + `singletonSeconds`), not an
 * application-level debounce that a second concurrent request could race
 * past: only the first call in a window's insert actually lands, and
 * every later call in the same window is a silent no-op by design — see
 * `packages/db`'s `queue.ts` for the shared queue name, and
 * `apps/worker`'s `jobs/comment-notification.ts` for the job that
 * eventually reads the comments back out.
 *
 * Sending mail happens only in the worker, never here — a mail failure
 * enqueuing this job is not possible by construction, since nothing here
 * touches SMTP at all.
 */
export async function enqueueCommentNotification(recordingId: string): Promise<void> {
  const boss = await getQueue();
  const data: CommentNotificationJobData = { recordingId, enqueuedAt: new Date().toISOString() };
  await boss.send(QUEUE_NAMES.commentNotification, data, {
    startAfter: COMMENT_NOTIFICATION_WINDOW_SECONDS,
    singletonKey: recordingId,
    singletonSeconds: COMMENT_NOTIFICATION_WINDOW_SECONDS,
  });
}
