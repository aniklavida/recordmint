import { DeleteObjectsCommand, ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3";
import { recordingKeyPrefix } from "./keys.js";

/** S3's own limit on how many keys one DeleteObjects call may carry. */
const DELETE_BATCH_SIZE = 1000;

async function listAllKeysUnderPrefix(client: S3Client, bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken }),
    );
    for (const object of page.Contents ?? []) {
      if (object.Key) keys.push(object.Key);
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

async function deleteKeysInBatches(client: S3Client, bucket: string, keys: string[]): Promise<number> {
  let deletedCount = 0;
  for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
    const batch = keys.slice(i, i + DELETE_BATCH_SIZE);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    deletedCount += batch.length;
  }
  return deletedCount;
}

/**
 * Deletes every object under one recording's prefix — list, then batch
 * delete. This is the whole implementation of "delete a recording and
 * every object behind it" (SPEC.md §6): because `keys.ts` is the only
 * place that builds a recording's object paths, listing its prefix can
 * never miss a key that lives somewhere else.
 *
 * Returns the number of objects deleted, so a caller can confirm a
 * nonexistent or already-empty recording did nothing rather than error.
 */
export async function deleteRecordingObjects(
  client: S3Client,
  bucket: string,
  recordingId: string,
): Promise<number> {
  const keys = await listAllKeysUnderPrefix(client, bucket, recordingKeyPrefix(recordingId));
  return deleteKeysInBatches(client, bucket, keys);
}

/**
 * Deletes every object belonging to a set of recordings — the storage half
 * of "per-workspace deletion straightforward" (Notion card 6). The object
 * layout has no workspace segment (SPEC.md §11, `docs/ARCHITECTURE.md`:
 * "the object key layout is defined in exactly one file"), so a workspace
 * delete is resolved in two steps rather than one prefix delete: the
 * caller looks up the workspace's recording ids from `packages/db`
 * (`recordings.workspaceId` is already indexed there), then hands the
 * list here. That keeps the one-file object-layout rule intact — this
 * function still only ever knows about recording ids and the per-recording
 * prefix — while making a workspace sweep a single call.
 */
export async function deleteRecordingsObjects(
  client: S3Client,
  bucket: string,
  recordingIds: string[],
): Promise<number> {
  const keysByRecording = await Promise.all(
    recordingIds.map((recordingId) => listAllKeysUnderPrefix(client, bucket, recordingKeyPrefix(recordingId))),
  );
  return deleteKeysInBatches(client, bucket, keysByRecording.flat());
}
