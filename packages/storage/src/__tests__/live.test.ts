import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListMultipartUploadsCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { afterAll, describe, expect, it } from "vitest";
import { createStorageClient, type StorageConfig } from "../client.js";
import { StorageAuthorizationError } from "../authorization.js";
import { originalKey } from "../keys.js";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  presignUploadPart,
  type CompletedPart,
} from "../multipart.js";
import { presignRead } from "../presign.js";

/**
 * Exercises this package's actual claims against a real S3-compatible store.
 * Skipped without S3_ENDPOINT for the same reason packages/db skips its
 * Postgres-dependent tests without DATABASE_URL — CI has no live MinIO —
 * but this file is what was actually run, against a real MinIO container,
 * as the evidence behind those claims. Nothing here prints or persists a
 * signed URL: every assertion reads status codes, headers and bytes,
 * never the URL string itself
 * (this repo's own CI rejects a committed signed-URL query parameter —
 * see `.github/workflows/validate.yml`'s "Reject presigned storage URLs"
 * step — so a signed URL must never be logged, printed or asserted on).
 */
describe.skipIf(!process.env.S3_ENDPOINT)("packages/storage against live S3-compatible storage", () => {
  const config: StorageConfig = {
    endpoint: process.env.S3_ENDPOINT ?? "",
    region: process.env.S3_REGION ?? "us-east-1",
    bucket: process.env.S3_BUCKET ?? "recordmint",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  };
  const client = createStorageClient(config);
  const allow = () => true;
  const createdKeys: string[] = [];

  afterAll(async () => {
    // Best-effort cleanup; a failed test run leaving a few KB of test
    // fixtures in a throwaway local MinIO is not worth failing the suite over.
    for (const key of createdKeys) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
      } catch {
        // ignore
      }
    }
  });

  it("completes a real multipart upload end to end and reads the object back", async () => {
    const recordingId = `live-test-${Date.now()}-multipart`;
    const key = originalKey(recordingId, "bin");
    createdKeys.push(key);

    const { uploadId } = await createMultipartUpload(client, {
      bucket: config.bucket,
      key,
      contentType: "application/octet-stream",
      authorize: allow,
    });
    expect(uploadId).toBeTruthy();

    // S3's minimum part size is 5 MiB for every part but the last.
    const partSize = 5 * 1024 * 1024;
    const part1 = Buffer.alloc(partSize, "a");
    const part2 = Buffer.from("final-part-tail-bytes");

    const parts: CompletedPart[] = [];
    for (const [index, body] of [part1, part2].entries()) {
      const partNumber = index + 1;
      const url = await presignUploadPart(client, {
        bucket: config.bucket,
        key,
        uploadId,
        partNumber,
        authorize: allow,
      });
      const response = await fetch(url, { method: "PUT", body });
      expect(response.status).toBe(200);
      const eTag = response.headers.get("etag");
      expect(eTag).toBeTruthy();
      parts.push({ partNumber, eTag: eTag! });
    }

    await completeMultipartUpload(client, {
      bucket: config.bucket,
      key,
      uploadId,
      parts,
      authorize: allow,
    });

    const readUrl = await presignRead(client, { bucket: config.bucket, key, authorize: allow });
    const readback = await fetch(readUrl);
    expect(readback.status).toBe(200);
    const bytes = Buffer.from(await readback.arrayBuffer());
    expect(bytes.length).toBe(part1.length + part2.length);
    expect(bytes.subarray(0, part1.length).equals(part1)).toBe(true);
    expect(bytes.subarray(part1.length).equals(part2)).toBe(true);
  }, 60_000);

  it("aborting a multipart upload leaves no trace for it to be completed later", async () => {
    const recordingId = `live-test-${Date.now()}-abort`;
    const key = originalKey(recordingId, "bin");
    const { uploadId } = await createMultipartUpload(client, {
      bucket: config.bucket,
      key,
      contentType: "application/octet-stream",
      authorize: allow,
    });
    await abortMultipartUpload(client, { bucket: config.bucket, key, uploadId, authorize: allow });

    const listing = await client.send(new ListMultipartUploadsCommand({ Bucket: config.bucket }));
    const stillOpen = (listing.Uploads ?? []).some((u) => u.UploadId === uploadId);
    expect(stillOpen).toBe(false);
  }, 30_000);

  it("serves a playback presign's byte range as a real 206 with correct bytes", async () => {
    const recordingId = `live-test-${Date.now()}-range`;
    const key = originalKey(recordingId, "bin");
    createdKeys.push(key);

    // A single-shot PUT is enough to exercise range GETs; multipart is
    // covered by the test above. 64 recognizable bytes.
    const body = Buffer.from(Array.from({ length: 64 }, (_, i) => i));
    await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body }));

    const url = await presignRead(client, { bucket: config.bucket, key, authorize: allow });

    // A non-zero-start range, so this cannot be satisfied by coincidence —
    // it proves the store is honouring Range on a URL signed without one.
    const response = await fetch(url, { headers: { Range: "bytes=10-19" } });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(`bytes 10-19/${body.length}`);
    const rangeBytes = Buffer.from(await response.arrayBuffer());
    expect(rangeBytes.equals(body.subarray(10, 20))).toBe(true);

    // And a plain GET against the same URL still returns the whole object.
    const fullResponse = await fetch(url);
    expect(fullResponse.status).toBe(200);
  }, 30_000);

  it("signs a download disposition that the store actually honours", async () => {
    const recordingId = `live-test-${Date.now()}-download`;
    const key = originalKey(recordingId, "bin");
    createdKeys.push(key);
    await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: Buffer.from("original bytes") }));

    const inlineUrl = await presignRead(client, { bucket: config.bucket, key, authorize: allow });
    const inlineResponse = await fetch(inlineUrl);
    expect(inlineResponse.headers.get("content-disposition")).toBeNull();

    const downloadUrl = await presignRead(client, {
      bucket: config.bucket,
      key,
      authorize: allow,
      responseContentDisposition: 'attachment; filename="original.bin"',
    });
    const downloadResponse = await fetch(downloadUrl);
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get("content-disposition")).toBe('attachment; filename="original.bin"');
  }, 30_000);

  it("rejects a presigned URL once it has actually expired", async () => {
    const recordingId = `live-test-${Date.now()}-expiry`;
    const key = originalKey(recordingId, "bin");
    createdKeys.push(key);
    await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: Buffer.from("expires soon") }));

    const url = await presignRead(client, {
      bucket: config.bucket,
      key,
      expiresInSeconds: 1,
      authorize: allow,
    });

    // Confirm it works before it expires, so a later 403 is provably about
    // expiry and not a malformed URL.
    const beforeExpiry = await fetch(url);
    expect(beforeExpiry.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 2500));

    const afterExpiry = await fetch(url);
    expect(afterExpiry.status).toBe(403);
    const bodyText = await afterExpiry.text();
    expect(bodyText).toMatch(/Expired|AccessDenied/i);
  }, 15_000);

  it("rejects an unsigned public read while a presigned read succeeds", async () => {
    const recordingId = `live-test-${Date.now()}-private-bucket`;
    const key = originalKey(recordingId, "txt");
    const body = Buffer.from("private object");
    createdKeys.push(key);
    await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body }));

    const unsignedUrl = new URL(
      `${config.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`,
      `${config.endpoint}/`,
    );
    const unsignedResponse = await fetch(unsignedUrl);
    expect(unsignedResponse.status).toBe(403);

    const presignedUrl = await presignRead(client, { bucket: config.bucket, key, authorize: allow });
    const presignedResponse = await fetch(presignedUrl);
    expect(presignedResponse.status).toBe(200);
    expect(Buffer.from(await presignedResponse.arrayBuffer()).equals(body)).toBe(true);
  }, 30_000);

  it("refuses an unauthorised presign request before any URL is minted", async () => {
    const recordingId = `live-test-${Date.now()}-unauthorized`;
    const key = originalKey(recordingId, "bin");
    const deny = () => false;

    await expect(
      createMultipartUpload(client, {
        bucket: config.bucket,
        key,
        contentType: "application/octet-stream",
        authorize: deny,
      }),
    ).rejects.toBeInstanceOf(StorageAuthorizationError);

    // Prove it not just by the thrown type but by the store's own state:
    // no multipart upload for this key exists, because none was ever
    // opened — the refusal happened before createMultipartUpload touched S3.
    const listing = await client.send(new ListMultipartUploadsCommand({ Bucket: config.bucket }));
    const anyForThisKey = (listing.Uploads ?? []).some((u) => u.Key === key);
    expect(anyForThisKey).toBe(false);

    await expect(
      presignRead(client, { bucket: config.bucket, key, authorize: deny }),
    ).rejects.toBeInstanceOf(StorageAuthorizationError);

    // And GetObject for a key that was never written 404s — reinforcing
    // that no read ever happened either.
    await expect(client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }))).rejects.toThrow();
  }, 30_000);
});
