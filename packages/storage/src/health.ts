import { HeadBucketCommand, type S3Client } from "@aws-sdk/client-s3";

export interface StorageHealth {
  reachable: boolean;
  error?: string;
}

/** Used by the web app's /api/health route. A failure here must not throw — it must report. */
export async function checkStorageReachable(
  client: S3Client,
  bucket: string,
): Promise<StorageHealth> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return { reachable: true };
  } catch (error) {
    return { reachable: false, error: describeError(error) };
  }
}

/**
 * `error.message` is empty for Node's native-fetch `AggregateError` (the
 * connect-refused case undici throws when the endpoint is down) — the real
 * reason lives in `error.errors[]`. Falls back to `error.message` for every
 * other error shape.
 */
function describeError(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    return error.errors.map((e) => (e instanceof Error ? e.message : String(e))).join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}
