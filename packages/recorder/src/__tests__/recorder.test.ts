import { describe, it, expect, vi } from "vitest";
import { createRecorder } from "../encode/recorder.js";
import type { ChunkedUploader } from "../encode/upload.js";

type Callback = (...args: unknown[]) => void;

class FakeMediaRecorder {
  state: "inactive" | "recording" | "paused" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  stream: MediaStream;
  options: unknown;
  listeners: Record<string, Callback[]> = {};

  constructor(stream: MediaStream, options: unknown) {
    this.stream = stream;
    this.options = options;
  }

  start(_timeslice?: number) {
    this.state = "recording";
  }

  pause() {
    this.state = "paused";
  }

  resume() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    if (this.listeners["stop"]) {
      this.listeners["stop"].forEach(cb => cb());
    }
    if (this.onstop) this.onstop();
  }

  addEventListener(event: string, cb: Callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  removeEventListener(event: string, cb: Callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(l => l !== cb);
  }

  // Helper for tests
  emitData(blob: Blob) {
    if (this.ondataavailable) {
      this.ondataavailable({ data: blob });
    }
  }
}

describe("Recorder wrapper", () => {
  it("hands off data available to uploader", () => {
    const mockUploader = {
      addChunk: vi.fn(),
      complete: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChunkedUploader;

    const stream = {} as MediaStream;
    const recorder = createRecorder({
      mediaRecorderCtor: FakeMediaRecorder as unknown as typeof MediaRecorder,
      stream,
      uploader: mockUploader,
      mimeType: "video/webm",
    });

    recorder.start();

    const mediaRecorder = recorder.getMediaRecorder() as unknown as FakeMediaRecorder;
    expect(mediaRecorder.state).toBe("recording");

    mediaRecorder.emitData(new Blob(["test"]));
    
    expect(mockUploader.addChunk).toHaveBeenCalledTimes(1);
    const chunk = vi.mocked(mockUploader.addChunk).mock.calls[0]![0];
    expect(chunk.size).toBe(4);
  });

  it("completes uploader when stopped", async () => {
    const mockUploader = {
      addChunk: vi.fn(),
      complete: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChunkedUploader;

    const recorder = createRecorder({
      mediaRecorderCtor: FakeMediaRecorder as unknown as typeof MediaRecorder,
      stream: {} as MediaStream,
      uploader: mockUploader,
      mimeType: "video/webm",
    });

    recorder.start();
    const stopPromise = recorder.stop();
    
    await stopPromise;
    expect(mockUploader.complete).toHaveBeenCalledTimes(1);
  });
});
