import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { resolvePresignTtlSeconds } from "./limits.js";

/** [assumed] SPEC.md §11 — long enough that a long recording never cuts off mid-watch. */
export const DEFAULT_READ_URL_TTL_SECONDS = 6 * 60 * 60;

const DEFAULT_UPLOAD_URL_TTL_SECONDS = 15 * 60;

export interface PresignReadOptions {
  bucket: string;
  key: string;
  expiresInSeconds?: number;
}

/**
 * Mints a short-lived, unguessable GET url. The bucket itself is never
 * public (DECISIONS.md) — this presigned url is the only way to read the
 * object, and it is the access-control boundary, not the URL's obscurity.
 *
 * Range requests: SigV4 query signing (what `getSignedUrl` produces) signs
 * the method, path and query string, not the `Range` request header, so a
 * player adding `Range: bytes=...` to its `fetch`/`<video>` request against
 * this same URL is unaffected by the signature and the store answers it
 * with a normal 206 Partial Content — the caller does not need a
 * range-specific presign. Verified against a live MinIO instance
 * (packages/storage's card-6 verification run): a non-zero-start range on
 * a presigned GET returned 206 with the correct `Content-Range` and bytes.
 */
export async function presignRead(
  client: S3Client,
  options: PresignReadOptions,
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: options.bucket, Key: options.key });
  return getSignedUrl(client, command, {
    expiresIn: resolvePresignTtlSeconds(options.expiresInSeconds, DEFAULT_READ_URL_TTL_SECONDS),
  });
}

export interface PresignUploadPartOptions {
  bucket: string;
  key: string;
  expiresInSeconds?: number;
}

/** Mints a short-lived PUT url for a single, non-multipart upload. */
export async function presignUpload(
  client: S3Client,
  options: PresignUploadPartOptions,
): Promise<string> {
  const command = new PutObjectCommand({ Bucket: options.bucket, Key: options.key });
  return getSignedUrl(client, command, {
    expiresIn: resolvePresignTtlSeconds(options.expiresInSeconds, DEFAULT_UPLOAD_URL_TTL_SECONDS),
  });
}
