import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST as completeRoute } from "../[recordingId]/complete/route";
import { POST as partsRoute } from "../[recordingId]/parts/route";
import { POST as failRoute } from "../[recordingId]/fail/route";
import { POST as createRoute } from "../route";

import * as db from "@recordmint/db";
import * as storage from "@recordmint/storage";
import * as guards from "../../../../auth/guards";
import * as libDb from "../../../../lib/db";
import * as libStorage from "../../../../lib/storage";

vi.mock("@recordmint/db");
vi.mock("@recordmint/storage");
vi.mock("../../../../auth/guards");
vi.mock("../../../../lib/db");
vi.mock("../../../../lib/storage");

describe("Recording API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(guards.requireUser).mockResolvedValue({ id: "user-123" } as any);
    vi.mocked(libDb.getDb).mockReturnValue({ orm: {} } as any);
    vi.mocked(libStorage.getStorageClient).mockReturnValue({} as any);
    vi.mocked(libStorage.getStorageConfig).mockReturnValue({ bucket: "recordmint" } as any);
  });

  describe("Gap 1.1: Authorization boundary on parts and complete", () => {
    it("refuses complete and does not call storage when getRecordingForMember returns null", async () => {
      vi.mocked(db.getRecordingForMember).mockResolvedValue(null);
      
      const req = new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ parts: [] })
      });
      
      const res = await completeRoute(req, { params: Promise.resolve({ recordingId: "rec-123" }) });
      expect(res.status).toBe(404);
      
      const resData = await res.json();
      expect(resData.error.code).toBe("NOT_FOUND");
      
      expect(storage.completeMultipartUpload).not.toHaveBeenCalled();
    });

    it("refuses parts and does not call storage when getRecordingForMember returns null", async () => {
      vi.mocked(db.getRecordingForMember).mockResolvedValue(null);
      
      const req = new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ partNumber: 1 })
      });
      
      const res = await partsRoute(req, { params: Promise.resolve({ recordingId: "rec-123" }) });
      expect(res.status).toBe(404);
      
      expect(storage.presignUploadPart).not.toHaveBeenCalled();
    });
  });

  describe("Gap 1.2: The failure-path status transition", () => {
    it("calls transitionRecordingStatus with to: 'failed' and exact reason", async () => {
      vi.mocked(db.getRecordingForMember).mockResolvedValue({
        id: "rec-123", status: "uploading", uploadId: "up-123", objectKey: "key", workspaceId: "ws", creatorId: "u"
      } as any);
      
      const req = new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ reason: "custom failure reason" })
      });
      
      const res = await failRoute(req, { params: Promise.resolve({ recordingId: "rec-123" }) });
      expect(res.status).toBe(200);
      
      expect(db.transitionRecordingStatus).toHaveBeenCalledWith(expect.anything(), {
        recordingId: "rec-123",
        from: "uploading",
        to: "failed",
        failureReason: "custom failure reason",
      });
    });

    it("transitions to failed even if abortMultipartUpload throws", async () => {
      vi.mocked(db.getRecordingForMember).mockResolvedValue({
        id: "rec-123", status: "uploading", uploadId: "up-123", objectKey: "key", workspaceId: "ws", creatorId: "u"
      } as any);
      
      vi.mocked(storage.abortMultipartUpload).mockRejectedValue(new Error("Transient S3 error"));
      
      const req = new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ reason: "custom failure reason" })
      });
      
      const res = await failRoute(req, { params: Promise.resolve({ recordingId: "rec-123" }) });
      expect(res.status).toBe(200);
      
      expect(db.transitionRecordingStatus).toHaveBeenCalledWith(expect.anything(), {
        recordingId: "rec-123",
        from: "uploading",
        to: "failed",
        failureReason: "custom failure reason",
      });
    });
  });

  describe("Gap 1.3: createRecording visibility default", () => {
    it("calls createRecording without passing explicit visibility or guestCommentingEnabled", async () => {
      vi.mocked(guards.requireMembership).mockResolvedValue(true as any);
      vi.mocked(storage.createMultipartUpload).mockResolvedValue({ uploadId: "up-123" });
      vi.mocked(storage.originalKey).mockReturnValue("recordings/rec-123/original.mp4");
      
      const req = new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ workspaceId: "ws-123" })
      });
      
      const res = await createRoute(req);
      expect(res.status).toBe(200);
      
      expect(db.createRecording).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(db.createRecording).mock.calls[0]![1] as any;
      
      expect(callArgs.visibility).toBeUndefined();
      expect(callArgs).not.toHaveProperty("guestCommentingEnabled");
    });
  });

  describe("Gap 1.4: complete route transition guard", () => {
    it("rejects a recording not in uploading status", async () => {
      vi.mocked(db.getRecordingForMember).mockResolvedValue({
        id: "rec-123", status: "ready", uploadId: "up-123", objectKey: "key", workspaceId: "ws", creatorId: "u"
      } as any);
      
      const req = new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ parts: [{ eTag: "abc", partNumber: 1 }] })
      });
      
      const res = await completeRoute(req, { params: Promise.resolve({ recordingId: "rec-123" }) });
      expect(res.status).toBe(409); // CONFLICT
      
      expect(storage.completeMultipartUpload).not.toHaveBeenCalled();
      expect(db.transitionRecordingStatus).not.toHaveBeenCalled();
    });

    it("calls completeMultipartUpload with exact parts on happy path", async () => {
      vi.mocked(db.getRecordingForMember).mockResolvedValue({
        id: "rec-123", status: "uploading", uploadId: "up-123", objectKey: "key", workspaceId: "ws", creatorId: "u"
      } as any);
      
      const partsPayload = [{ eTag: "abc", partNumber: 1 }, { eTag: "def", partNumber: 2 }];
      const req = new Request("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ parts: partsPayload })
      });
      
      const res = await completeRoute(req, { params: Promise.resolve({ recordingId: "rec-123" }) });
      expect(res.status).toBe(200);
      
      expect(storage.completeMultipartUpload).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(storage.completeMultipartUpload).mock.calls[0]![1] as any;
      
      expect(callArgs.parts).toEqual(partsPayload);
      expect(db.transitionRecordingStatus).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        from: "uploading",
        to: "ready"
      }));
    });
  });
});
