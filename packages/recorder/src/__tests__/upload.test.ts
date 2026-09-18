import { describe, it, expect, vi, beforeEach } from "vitest";
import { createChunkedUploader, UploadTransport } from "../encode/upload.js";

const MIN_PART_SIZE = 5 * 1024 * 1024;

describe("ChunkedUploader", () => {
  let mockTransport: UploadTransport;

  beforeEach(() => {
    mockTransport = {
      signPart: vi.fn().mockResolvedValue({ url: "https://fake-url" }),
      putPart: vi.fn().mockResolvedValue({ eTag: "fake-etag" }),
      completeUpload: vi.fn().mockResolvedValue(undefined),
    };
  });

  const createBlob = (size: number) => new Blob([new Uint8Array(size)], { type: "video/webm" });

  it("buffers chunks until they reach 5 MiB before uploading", async () => {
    const uploader = createChunkedUploader(mockTransport);

    // Add 2 MiB
    uploader.addChunk(createBlob(2 * 1024 * 1024));
    expect(mockTransport.signPart).not.toHaveBeenCalled();

    // Add another 3 MiB -> total 5 MiB
    uploader.addChunk(createBlob(3 * 1024 * 1024));
    
    // It should immediately trigger upload for part 1
    expect(mockTransport.signPart).toHaveBeenCalledTimes(1);
    expect(mockTransport.signPart).toHaveBeenCalledWith(1);
    
    // Wait for macro-task or promises to clear if needed
    await new Promise((r) => setTimeout(r, 0));
    
    expect(mockTransport.putPart).toHaveBeenCalledTimes(1);
    // the blob passed to putPart should be 5 MiB
    const passedBlob = vi.mocked(mockTransport.putPart).mock.calls[0]![1];
    expect(passedBlob.size).toBe(5 * 1024 * 1024);
  });

  it("flushes remaining tail on stop (complete)", async () => {
    const uploader = createChunkedUploader(mockTransport);

    // Add 1 MiB (under 5 MiB)
    uploader.addChunk(createBlob(1 * 1024 * 1024));
    expect(mockTransport.signPart).not.toHaveBeenCalled();

    await uploader.complete();

    // Final part should be uploaded
    expect(mockTransport.signPart).toHaveBeenCalledTimes(1);
    expect(mockTransport.signPart).toHaveBeenCalledWith(1);
    
    expect(mockTransport.putPart).toHaveBeenCalledTimes(1);
    const passedBlob2 = vi.mocked(mockTransport.putPart).mock.calls[0]![1];
    expect(passedBlob2.size).toBe(1 * 1024 * 1024);
    
    expect(mockTransport.completeUpload).toHaveBeenCalledTimes(1);
    expect(mockTransport.completeUpload).toHaveBeenCalledWith([{ partNumber: 1, eTag: "fake-etag" }]);
  });

  it("retries failed part without restarting from 1", async () => {
    const uploader = createChunkedUploader(mockTransport);

    // Fail the first part
    vi.mocked(mockTransport.putPart).mockRejectedValueOnce(new Error("Network Error"));

    uploader.addChunk(createBlob(MIN_PART_SIZE));
    
    // Wait for the failure to propagate
    await new Promise((r) => setTimeout(r, 0));

    expect(mockTransport.signPart).toHaveBeenCalledTimes(1);
    expect(mockTransport.putPart).toHaveBeenCalledTimes(1);
    
    const state = uploader.getState();
    expect(state.failedParts).toEqual([1]);
    expect(state.uploadingParts).toEqual([]);
    expect(state.completedParts).toEqual([]);
    
    // Fix transport and retry
    vi.mocked(mockTransport.putPart).mockResolvedValueOnce({ eTag: "fake-etag-retried" });
    
    uploader.retryFailedParts();
    
    await new Promise((r) => setTimeout(r, 0));
    
    // It should have signed and put part 1 again
    expect(mockTransport.signPart).toHaveBeenCalledTimes(2);
    expect(mockTransport.signPart).toHaveBeenLastCalledWith(1);
    expect(mockTransport.putPart).toHaveBeenCalledTimes(2);
    
    const newState = uploader.getState();
    expect(newState.failedParts).toEqual([]);
    expect(newState.completedParts).toEqual([1]);
  });
  
  it("maintains correct state machine for tab close reporting", async () => {
    const uploader = createChunkedUploader(mockTransport);
    
    // Initially not recoverable (nothing to recover)
    expect(uploader.getState().isRecoverable).toBe(false);

    // Buffer but don't upload yet
    uploader.addChunk(createBlob(1024));
    
    // Now there is buffered data, so it's recoverable
    expect(uploader.getState().isRecoverable).toBe(true);
    
    // Trigger upload
    uploader.addChunk(createBlob(MIN_PART_SIZE));
    
    // While uploading, it's recoverable
    expect(uploader.getState().isRecoverable).toBe(true);
    
    await new Promise((r) => setTimeout(r, 0));
    
    // Completed, no buffer, no failed, no uploading -> not recoverable
    expect(uploader.getState().isRecoverable).toBe(false);
  });
});
