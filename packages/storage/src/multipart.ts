import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertAuthorized, type AuthorizationCheck } from "./authorization.js";
import { resolvePresignTtlSeconds } from "./limits.js";

/** S3's own bounds on a multipart upload's part number (inclusive). */
const MIN_PART_NUMBER = 1;
const MAX_PART_NUMBER = 10_000;

const DEFAULT_UPLOAD_PART_TTL_SECONDS = 15 * 60;

export interface CreateMultipartOptions {
  bucket: string;
  key: string;
  contentType: string;
  authorize: AuthorizationCheck;
}

/**
 * Starts a multipart upload and returns its id, so parts can be signed as
 * they buffer. `authorize` is checked first — a refusal throws before the
 * `CreateMultipartUploadCommand` is sent, so an unauthorised caller never
 * gets an uploadId to sign parts against in the first place.
 */
export async function createMultipartUpload(
  client: S3Client,
  options: CreateMultipartOptions,
): Promise<{ uploadId: string }> {
  await assertAuthorized(options.authorize);
  const result = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: options.bucket,
      Key: options.key,
      ContentType: options.contentType,
    }),
  );
  if (!result.UploadId) {
    throw new Error("S3 did not return an UploadId for CreateMultipartUpload");
  }
  return { uploadId: result.UploadId };
}

export interface SignPartOptions {
  bucket: string;
  key: string;
  uploadId: string;
  partNumber: number;
  expiresInSeconds?: number;
  authorize: AuthorizationCheck;
}

/**
 * Signs one part url. The recorder buffers bytes to part size, then PUTs
 * directly here. `authorize` is checked before the part number is even
 * validated, let alone signed — the caller almost always re-checks the
 * same upload ownership per part it already checked for
 * `createMultipartUpload`, which is deliberate: an upload id living
 * longer than the session that opened it should not become a standing
 * credential.
 */
export async function presignUploadPart(
  client: S3Client,
  options: SignPartOptions,
): Promise<string> {
  await assertAuthorized(options.authorize);
  if (!Number.isInteger(options.partNumber) || options.partNumber < MIN_PART_NUMBER || options.partNumber > MAX_PART_NUMBER) {
    throw new Error(
      `partNumber must be an integer between ${MIN_PART_NUMBER} and ${MAX_PART_NUMBER}, got ${options.partNumber}`,
    );
  }
  const command = new UploadPartCommand({
    Bucket: options.bucket,
    Key: options.key,
    UploadId: options.uploadId,
    PartNumber: options.partNumber,
  });
  return getSignedUrl(client, command, {
    expiresIn: resolvePresignTtlSeconds(options.expiresInSeconds, DEFAULT_UPLOAD_PART_TTL_SECONDS),
  });
}

export interface CompletedPart {
  partNumber: number;
  eTag: string;
}

export interface CompleteMultipartOptions {
  bucket: string;
  key: string;
  uploadId: string;
  parts: CompletedPart[];
  authorize: AuthorizationCheck;
}

export async function completeMultipartUpload(
  client: S3Client,
  options: CompleteMultipartOptions,
): Promise<void> {
  await assertAuthorized(options.authorize);
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: options.bucket,
      Key: options.key,
      UploadId: options.uploadId,
      MultipartUpload: {
        Parts: options.parts
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((part) => ({ PartNumber: part.partNumber, ETag: part.eTag })),
      },
    }),
  );
}

export interface AbortMultipartOptions {
  bucket: string;
  key: string;
  uploadId: string;
  authorize: AuthorizationCheck;
}

/** Called when a recording is abandoned mid-upload, so the bucket does not accumulate orphaned parts. */
export async function abortMultipartUpload(
  client: S3Client,
  options: AbortMultipartOptions,
): Promise<void> {
  await assertAuthorized(options.authorize);
  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: options.bucket,
      Key: options.key,
      UploadId: options.uploadId,
    }),
  );
}
