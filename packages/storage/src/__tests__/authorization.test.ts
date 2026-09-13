import type { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { assertAuthorized, StorageAuthorizationError } from "../authorization.js";
import { createMultipartUpload } from "../multipart.js";
import { presignRead } from "../presign.js";

describe("assertAuthorized", () => {
  it("resolves silently when the check allows", async () => {
    await expect(assertAuthorized(() => true)).resolves.toBeUndefined();
    await expect(assertAuthorized(async () => true)).resolves.toBeUndefined();
  });

  it("throws StorageAuthorizationError when the check refuses", async () => {
    await expect(assertAuthorized(() => false)).rejects.toBeInstanceOf(StorageAuthorizationError);
  });

  it("wraps a throwing check instead of letting it escape uncaught", async () => {
    await expect(
      assertAuthorized(() => {
        throw new Error("membership lookup failed");
      }),
    ).rejects.toThrow(/membership lookup failed/);
  });
});

/**
 * The authorisation requirement in its most literal form: an unauthorised
 * request must be refused *before any URL is minted*. A client that throws
 * the instant it is asked to do anything proves the guard runs first — if the
 * authorization check ran after building/signing, this fake would have
 * been invoked and the test would fail with the fake's error instead of
 * StorageAuthorizationError.
 */
function neverCalledClient(): S3Client {
  return {
    send: vi.fn(() => {
      throw new Error("S3Client.send must not be called for a refused request");
    }),
  } as unknown as S3Client;
}

describe("authorization gates every credential-minting function", () => {
  it("presignRead refuses before signing anything", async () => {
    const client = neverCalledClient();
    await expect(
      presignRead(client, { bucket: "b", key: "recordings/x/original.mp4", authorize: () => false }),
    ).rejects.toBeInstanceOf(StorageAuthorizationError);
    expect(client.send).not.toHaveBeenCalled();
  });

  it("createMultipartUpload refuses before contacting S3", async () => {
    const client = neverCalledClient();
    await expect(
      createMultipartUpload(client, {
        bucket: "b",
        key: "recordings/x/original.mp4",
        contentType: "video/mp4",
        authorize: () => false,
      }),
    ).rejects.toBeInstanceOf(StorageAuthorizationError);
    expect(client.send).not.toHaveBeenCalled();
  });
});
