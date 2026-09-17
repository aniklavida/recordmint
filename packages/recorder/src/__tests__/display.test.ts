import { describe, expect, it, vi } from "vitest";
import { captureDisplay, type DisplayMediaGlobals } from "../capture/display.js";

function createMockStream(audioTracks: unknown[], videoTracks: unknown[]): MediaStream {
  return {
    getAudioTracks: () => audioTracks,
    getVideoTracks: () => videoTracks,
  } as unknown as MediaStream;
}

describe("captureDisplay", () => {
  it("reports audio-track-present when stream has audio tracks", async () => {
    const globals: DisplayMediaGlobals = {
      getDisplayMedia: vi.fn().mockResolvedValue(createMockStream([{}], [{}])),
    };
    const result = await captureDisplay(globals);
    expect(result.audioObservation).toBe("audio-track-present");
  });

  it("reports no-audio-track when stream has no audio tracks", async () => {
    const globals: DisplayMediaGlobals = {
      getDisplayMedia: vi.fn().mockResolvedValue(createMockStream([], [{}])),
    };
    const result = await captureDisplay(globals);
    expect(result.audioObservation).toBe("no-audio-track");
  });
});
