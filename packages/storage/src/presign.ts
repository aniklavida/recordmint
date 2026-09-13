import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertAuthorized, type AuthorizationCheck } from "./authorization.js";
import { resolvePresignTtlSeconds } from "./limits.js";

/**
 * `docs/SPEC.md` §11: presigned reads live for six hours — long enough
 * that nobody watching a long recording is cut off mid-way, short enough
 * that a leaked URL expires on its own.
 */
export const DEFAULT_READ_URL_TTL_SECONDS = 6 * 60 * 60;

const DEFAULT_UPLOAD_URL_TTL_SECONDS = 15 * 60;

export interface PresignReadOptions {
  bucket: string;
  key: string;
  expiresInSeconds?: number;
  /**
   * Checked before anything else in this function runs. The caller closes
   * over whatever it needs (link visibility, workspace membership, a
   * password check) and returns whether this specific read is allowed —
   * see authorization.ts for why this lives outside the storage package's
   * own knowledge.
   */
  authorize: AuthorizationCheck;
}

/**
 * Mints a short-lived, unguessable GET url. The bucket itself is never
 * public, so a presigned url is the only way to read the object — but the
 * url is not what grants access. `authorize` is: it is checked first, and
 * a refusal throws before a `GetObjectCommand` is even constructed, let
 * alone signed. Unguessability and the short lifetime limit the damage of
 * a url that escapes; they are never the thing deciding who may watch.
 *
 * Range requests: SigV4 query signing (what `getSignedUrl` produces) signs
 * the method, path and query string, not the `Range` request header, so a
 * player adding `Range: bytes=...` to its `fetch`/`<video>` request against
 * this same URL is unaffected by the signature and the store answers it
 * with a normal 206 Partial Content — the caller does not need a
 * range-specific presign. Verified against a live MinIO instance (see
 * `__tests__/live.test.ts`): a non-zero-start range on a presigned GET
 * returned 206 with the correct `Content-Range` and bytes.
 */
export async function presignRead(
  client: S3Client,
  options: PresignReadOptions,
): Promise<string> {
  await assertAuthorized(options.authorize);
  const command = new GetObjectCommand({ Bucket: options.bucket, Key: options.key });
  return getSignedUrl(client, command, {
    expiresIn: resolvePresignTtlSeconds(options.expiresInSeconds, DEFAULT_READ_URL_TTL_SECONDS),
  });
}

export interface PresignUploadPartOptions {
  bucket: string;
  key: string;
  expiresInSeconds?: number;
  authorize: AuthorizationCheck;
}

/** Mints a short-lived PUT url for a single, non-multipart upload. `authorize` gates it, checked first. */
export async function presignUpload(
  client: S3Client,
  options: PresignUploadPartOptions,
): Promise<string> {
  await assertAuthorized(options.authorize);
  const command = new PutObjectCommand({ Bucket: options.bucket, Key: options.key });
  return getSignedUrl(client, command, {
    expiresIn: resolvePresignTtlSeconds(options.expiresInSeconds, DEFAULT_UPLOAD_URL_TTL_SECONDS),
  });
}
