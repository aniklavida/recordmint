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
    return { reachable: false, error: error instanceof Error ? error.message : String(error) };
  }
}
