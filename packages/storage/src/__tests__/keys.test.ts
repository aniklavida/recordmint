import { describe, expect, it } from "vitest";
import { originalKey, posterKey, transcriptKey, recordingKeyPrefix } from "../keys.js";

describe("object keys", () => {
  const recordingId = "abc123";

  it("builds every object under the same prefix", () => {
    expect(originalKey(recordingId, "mp4")).toBe("recordings/abc123/original.mp4");
    expect(posterKey(recordingId)).toBe("recordings/abc123/poster.jpg");
    expect(transcriptKey(recordingId)).toBe("recordings/abc123/transcript.vtt");
  });

  it("exposes a single prefix for deletion and retention sweeps", () => {
    const prefix = recordingKeyPrefix(recordingId);
    expect(originalKey(recordingId, "mp4").startsWith(prefix)).toBe(true);
    expect(posterKey(recordingId).startsWith(prefix)).toBe(true);
    expect(transcriptKey(recordingId).startsWith(prefix)).toBe(true);
  });
});
