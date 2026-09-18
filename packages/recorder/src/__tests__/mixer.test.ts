import { describe, expect, it, vi } from "vitest";
import { mixStreams, MultipleVideoTracksError, type MixerGlobals } from "../capture/mixer.js";

function createMockTrack(kind: "audio" | "video", id: string): MediaStreamTrack {
  return { kind, id } as unknown as MediaStreamTrack;
}

class MockMediaStream {
  tracks: MediaStreamTrack[] = [];
  constructor(initialTracks: MediaStreamTrack[] = []) {
    this.tracks = [...initialTracks];
  }
  addTrack(track: MediaStreamTrack) {
    this.tracks.push(track);
  }
  getAudioTracks() {
    return this.tracks.filter(t => t.kind === "audio");
  }
  getVideoTracks() {
    return this.tracks.filter(t => t.kind === "video");
  }
}
(global as unknown as { MediaStream: typeof MockMediaStream }).MediaStream = MockMediaStream;

describe("mixStreams", () => {
  it("combines a single audio track directly", () => {
    const stream1 = new MockMediaStream([createMockTrack("audio", "a1")]);
    const result = mixStreams([stream1 as unknown as MediaStream]);
    expect(result.getAudioTracks().length).toBe(1);
    expect(result.getAudioTracks()[0]?.id).toBe("a1");
  });

  it("merges multiple audio tracks using AudioContext", () => {
    const stream1 = new MockMediaStream([createMockTrack("audio", "a1")]);
    const stream2 = new MockMediaStream([createMockTrack("audio", "a2")]);
    
    const mockConnect = vi.fn();
    const mockCreateMediaStreamSource = vi.fn().mockReturnValue({ connect: mockConnect });
    const mockDestStream = new MockMediaStream([createMockTrack("audio", "merged")]);
    const mockCreateMediaStreamDestination = vi.fn().mockReturnValue({ stream: mockDestStream });

    class MockAudioContext {
      createMediaStreamSource = mockCreateMediaStreamSource;
      createMediaStreamDestination = mockCreateMediaStreamDestination;
    }

    const globals: MixerGlobals = { AudioContext: MockAudioContext as unknown as typeof window.AudioContext };
    const result = mixStreams([stream1, stream2] as unknown as MediaStream[], globals);

    expect(mockCreateMediaStreamSource).toHaveBeenCalledTimes(2);
    expect(mockConnect).toHaveBeenCalledTimes(2);
    
    expect(result.getAudioTracks().length).toBe(1);
    expect(result.getAudioTracks()[0]?.id).toBe("merged");
  });

  it("throws if multiple video tracks are provided", () => {
    const stream1 = new MockMediaStream([createMockTrack("video", "v1")]);
    const stream2 = new MockMediaStream([createMockTrack("video", "v2")]);
    
    expect(() => {
      mixStreams([stream1, stream2] as unknown as MediaStream[]);
    }).toThrow(MultipleVideoTracksError);
  });
});
