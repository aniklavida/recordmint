import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface CreateMultipartOptions {
  bucket: string;
  key: string;
  contentType: string;
}

/** Starts a multipart upload and returns its id, so parts can be signed as they buffer. */
export async function createMultipartUpload(
  client: S3Client,
  options: CreateMultipartOptions,
): Promise<{ uploadId: string }> {
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
}

/** Signs one part url. The recorder buffers bytes to part size, then PUTs directly here. */
export async function presignUploadPart(
  client: S3Client,
  options: SignPartOptions,
): Promise<string> {
  const command = new UploadPartCommand({
    Bucket: options.bucket,
    Key: options.key,
    UploadId: options.uploadId,
    PartNumber: options.partNumber,
  });
  return getSignedUrl(client, command, { expiresIn: options.expiresInSeconds ?? 15 * 60 });
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
}

export async function completeMultipartUpload(
  client: S3Client,
  options: CompleteMultipartOptions,
): Promise<void> {
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
}

/** Called when a recording is abandoned mid-upload, so the bucket does not accumulate orphaned parts. */
export async function abortMultipartUpload(
  client: S3Client,
  options: AbortMultipartOptions,
): Promise<void> {
  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: options.bucket,
      Key: options.key,
      UploadId: options.uploadId,
    }),
  );
}
