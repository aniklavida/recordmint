export interface CaptureDisplayConstraints extends MediaStreamConstraints {
  systemAudio?: "include" | "exclude";
}

export interface DisplayMediaGlobals {
  getDisplayMedia: (constraints?: CaptureDisplayConstraints) => Promise<MediaStream>;
}

export function readDisplayMediaGlobals(): DisplayMediaGlobals {
  return {
    getDisplayMedia: (constraints) => navigator.mediaDevices.getDisplayMedia(constraints),
  };
}

export type AudioTrackObservation = "audio-track-present" | "no-audio-track";

export interface CaptureDisplayResult {
  stream: MediaStream;
  audioObservation: AudioTrackObservation;
}

/**
 * Captures the display media (screen/window/tab).
 * Requests system audio and measures if it was actually delivered.
 */
export async function captureDisplay(
  globals: DisplayMediaGlobals = readDisplayMediaGlobals(),
): Promise<CaptureDisplayResult> {
  const stream = await globals.getDisplayMedia({
    video: true,
    audio: true,
    systemAudio: "include",
  });

  const audioTracks = stream.getAudioTracks();
  // A missing audio track here is an observation about this capture, not a verdict on the browser.
  const audioObservation: AudioTrackObservation = audioTracks.length > 0 ? "audio-track-present" : "no-audio-track";

  return { stream, audioObservation };
}
