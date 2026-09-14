import { describe, expect, it } from "vitest";
import { toRecordingDTO } from "../dto.js";

const BASE_RECORDING = {
  id: "rec1",
  publicId: "pub1",
  workspaceId: "ws1",
  creatorId: "user1",
  title: "Title",
  description: null,
  status: "ready" as const,
  failureReason: null,
  visibility: "password" as const,
  passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$secret-salt$secret-hash",
  expiresAt: null,
  guestCommentingEnabled: false,
  objectKey: "recordings/rec1/original.mp4",
  container: "mp4",
  codecs: null,
  durationSeconds: null,
  sizeBytes: null,
  uploadId: "s3-upload-id-should-never-leak",
  posterKey: "recordings/rec1/poster.jpg",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("toRecordingDTO", () => {
  it("never includes passwordHash, objectKey or uploadId — this is the only place a recording is serialized to a client", () => {
    const dto = toRecordingDTO(BASE_RECORDING);
    expect(dto).not.toHaveProperty("passwordHash");
    expect(dto).not.toHaveProperty("objectKey");
    expect(dto).not.toHaveProperty("uploadId");
  });

  it("exposes whether a password is set without exposing the hash itself", () => {
    expect(toRecordingDTO(BASE_RECORDING).hasPassword).toBe(true);
    expect(toRecordingDTO({ ...BASE_RECORDING, passwordHash: null }).hasPassword).toBe(false);
  });

  it("exposes whether a poster exists without exposing its storage key", () => {
    expect(toRecordingDTO(BASE_RECORDING).hasPoster).toBe(true);
    expect(toRecordingDTO({ ...BASE_RECORDING, posterKey: null }).hasPoster).toBe(false);
  });

  it("omits viewCount entirely unless the caller supplies one — no default that could look like a real count", () => {
    expect(toRecordingDTO(BASE_RECORDING)).not.toHaveProperty("viewCount");
    expect(toRecordingDTO(BASE_RECORDING, {}).viewCount).toBeUndefined();
    expect(toRecordingDTO(BASE_RECORDING, { viewCount: 7 }).viewCount).toBe(7);
  });
});
