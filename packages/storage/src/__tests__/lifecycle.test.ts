import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  type S3Client,
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { deleteRecordingObjects, deleteRecordingsObjects } from "../lifecycle.js";
import { recordingKeyPrefix } from "../keys.js";

/** A fake client that serves ListObjectsV2 from an in-memory key set and records DeleteObjects calls. */
function fakeClient(keysByBucket: Record<string, string[]>) {
  const deleteBatches: string[][] = [];
  const send = vi.fn(async (command: unknown) => {
    if (command instanceof ListObjectsV2Command) {
      const { Bucket, Prefix } = command.input;
      const all = (keysByBucket[Bucket as string] ?? []).filter((k) => k.startsWith(Prefix as string));
      return { Contents: all.map((Key) => ({ Key })), IsTruncated: false };
    }
    if (command instanceof DeleteObjectsCommand) {
      const keys = (command.input.Delete?.Objects ?? []).map((o) => o.Key as string);
      deleteBatches.push(keys);
      return {};
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  return { client: { send } as unknown as S3Client, deleteBatches };
}

describe("deleteRecordingObjects", () => {
  it("deletes every key under the recording's prefix and nothing else", async () => {
    const { client, deleteBatches } = fakeClient({
      b: [
        "recordings/abc/original.mp4",
        "recordings/abc/poster.jpg",
        "recordings/other/original.mp4",
      ],
    });
    const count = await deleteRecordingObjects(client, "b", "abc");
    expect(count).toBe(2);
    expect(deleteBatches).toEqual([
      ["recordings/abc/original.mp4", "recordings/abc/poster.jpg"],
    ]);
  });

  it("does nothing and issues no delete call for a recording with no objects", async () => {
    const { client, deleteBatches } = fakeClient({ b: [] });
    const count = await deleteRecordingObjects(client, "b", "empty");
    expect(count).toBe(0);
    expect(deleteBatches).toEqual([]);
  });

  it("never has to know a workspace id — the prefix is exactly keys.ts's own", async () => {
    const { client } = fakeClient({ b: ["recordings/abc/original.mp4"] });
    const count = await deleteRecordingObjects(client, "b", "abc");
    expect(count).toBe(1);
    expect(recordingKeyPrefix("abc")).toBe("recordings/abc/");
  });
});

describe("deleteRecordingsObjects (workspace sweep)", () => {
  it("deletes objects across every recording id handed to it", async () => {
    const { client, deleteBatches } = fakeClient({
      b: [
        "recordings/r1/original.mp4",
        "recordings/r2/original.webm",
        "recordings/r2/poster.jpg",
        "recordings/r3/original.mp4",
      ],
    });
    const count = await deleteRecordingsObjects(client, "b", ["r1", "r2"]);
    expect(count).toBe(3);
    expect(deleteBatches.flat().sort()).toEqual(
      ["recordings/r1/original.mp4", "recordings/r2/original.webm", "recordings/r2/poster.jpg"].sort(),
    );
  });

  it("batches deletes at 1000 keys, S3's own DeleteObjects limit", async () => {
    const manyKeys = Array.from({ length: 1500 }, (_, i) => `recordings/big/${i}.part`);
    const { client, deleteBatches } = fakeClient({ b: manyKeys });
    const count = await deleteRecordingsObjects(client, "b", ["big"]);
    expect(count).toBe(1500);
    expect(deleteBatches).toHaveLength(2);
    expect(deleteBatches[0]).toHaveLength(1000);
    expect(deleteBatches[1]).toHaveLength(500);
  });
});
