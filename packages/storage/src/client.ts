import { S3Client } from "@aws-sdk/client-s3";

export interface StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Self-hosted S3-compatible stores need path-style URLs. */
  forcePathStyle: boolean;
}

export function loadStorageConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): StorageConfig {
  const required = (name: string): string => {
    const value = env[name];
    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
  };

  return {
    endpoint: required("S3_ENDPOINT"),
    region: env.S3_REGION ?? "us-east-1",
    bucket: required("S3_BUCKET"),
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    forcePathStyle: env.S3_FORCE_PATH_STYLE !== "false",
  };
}

/**
 * Constructs the S3 client. This is the only place in the codebase that
 * knows which object store is behind it — every other package and app talks
 * to storage through this package's functions.
 */
export function createStorageClient(config: StorageConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    // The SDK signs an optional trailing checksum into the query string of
    // every presigned PUT by default, carrying a placeholder value it cannot
    // fill in because the browser — not the SDK — will write the body. SeaweedFS
    // reads that placeholder as a real digest and answers the part upload with
    // `400 BadDigest`. `WHEN_REQUIRED` keeps the checksum only where an
    // operation genuinely requires one, which no S3 upload here does.
    // Verified against a live SeaweedFS 4.48 instance: without this, a
    // presigned multipart part PUT returned 400; with it, 200 and an ETag.
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}
