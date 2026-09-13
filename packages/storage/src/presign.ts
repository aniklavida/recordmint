import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** [assumed] SPEC.md §11 — long enough that a long recording never cuts off mid-watch. */
export const DEFAULT_READ_URL_TTL_SECONDS = 6 * 60 * 60;

const DEFAULT_UPLOAD_URL_TTL_SECONDS = 15 * 60;

export interface PresignReadOptions {
  bucket: string;
  key: string;
  expiresInSeconds?: number;
}

/** Mints a short-lived, unguessable GET url. The bucket itself is never public. */
export async function presignRead(
  client: S3Client,
  options: PresignReadOptions,
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: options.bucket, Key: options.key });
  return getSignedUrl(client, command, {
    expiresIn: options.expiresInSeconds ?? DEFAULT_READ_URL_TTL_SECONDS,
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
    expiresIn: options.expiresInSeconds ?? DEFAULT_UPLOAD_URL_TTL_SECONDS,
  });
}
