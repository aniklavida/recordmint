import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

/**
 * Direct, unsigned-URL reads and writes for trusted server-side code —
 * the worker downloading a recording to run ffmpeg or whisper against it,
 * then uploading the poster frame or transcript it produced. These never
 * hand a credential to a browser, which is the entire reason
 * `presign.ts`'s functions require an `authorize` callback and these do
 * not: that gate exists for a URL that leaves the server, not for a
 * same-process S3 SDK call a self-hosted operator's own worker makes.
 */

export async function getObjectStream(client: S3Client, bucket: string, key: string): Promise<Readable> {
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  // The AWS SDK v3 Node runtime always returns a Node Readable here, not
  // a browser ReadableStream/Blob — this package only ever runs server-side.
  return result.Body as Readable;
}

export async function putObject(
  client: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
  contentType?: string,
): Promise<void> {
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}
