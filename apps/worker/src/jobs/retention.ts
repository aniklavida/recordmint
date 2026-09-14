import { deleteRecordingRow, listAbandonedUploads, listRecordingsPastRetention } from "@recordmint/db";
import { abortMultipartUpload, deleteRecordingObjects } from "@recordmint/storage";
import { getDb } from "../lib/db.js";
import { getStorageClient, getStorageConfig } from "../lib/storage.js";

/**
 * How long an upload can sit in "uploading" before it counts as
 * abandoned — a closed tab or lost network, not a recording still in
 * progress. `[assumed]`: long enough that a slow multi-hour upload on a
 * bad connection is not mistaken for abandoned, short enough that a
 * genuinely dead upload does not sit in the bucket for weeks.
 */
const ABANDONED_UPLOAD_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export interface RetentionSweepResult {
  expiredCount: number;
  abandonedCount: number;
}

/**
 * SPEC.md §20: "retention policy and optional recompression are the
 * answer, and they ship in v1 rather than being promised." Two
 * independent passes, run every time this job fires (see `main.ts`'s
 * cron schedule):
 *
 * 1. A workspace's `retentionDays` policy has been outlived by a `ready`
 *    recording — delete its objects, then its row (packages/storage's
 *    lifecycle helper first, so a crash mid-sweep leaves a detectable
 *    orphan row rather than an orphan object nobody notices).
 * 2. A recording has sat in `uploading` past the abandoned threshold —
 *    abort whatever multipart upload it opened (best-effort: S3 may have
 *    already expired it on its own) and remove it the same way.
 *
 * A scheduled sweep authorizes itself — there is no per-user request
 * behind it to check membership against, unlike every other caller of
 * `packages/storage`'s presigned functions.
 */
export async function runRetentionSweep(): Promise<RetentionSweepResult> {
  const db = getDb();
  const client = getStorageClient();
  const config = getStorageConfig();
  const allow = () => true;

  let expiredCount = 0;
  for (const recording of await listRecordingsPastRetention(db.orm)) {
    await deleteRecordingObjects(client, config.bucket, recording.id);
    await deleteRecordingRow(db.orm, recording.id);
    expiredCount += 1;
  }

  let abandonedCount = 0;
  const cutoff = new Date(Date.now() - ABANDONED_UPLOAD_THRESHOLD_MS);
  for (const recording of await listAbandonedUploads(db.orm, cutoff)) {
    if (recording.uploadId) {
      try {
        await abortMultipartUpload(client, {
          bucket: config.bucket,
          key: recording.objectKey,
          uploadId: recording.uploadId,
          authorize: allow,
        });
      } catch {
        // The upload may already be gone — aborted once before, completed
        // and the row simply never updated, or past S3's own multipart
        // lifetime. Either way there is nothing left to abort, and the
        // row cleanup below still has to run.
      }
    }
    await deleteRecordingObjects(client, config.bucket, recording.id);
    await deleteRecordingRow(db.orm, recording.id);
    abandonedCount += 1;
  }

  return { expiredCount, abandonedCount };
}
