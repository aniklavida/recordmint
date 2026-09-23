export type DisplaySurface = "monitor" | "window" | "browser";

export interface CaptureDisplayOptions {
  surface?: DisplaySurface;
  systemAudio?: "include" | "exclude";
}

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

function isDisplayMediaGlobals(arg: unknown): arg is DisplayMediaGlobals {
  return typeof arg === "object" && arg !== null && "getDisplayMedia" in arg;
}

/**
 * Captures the display media (screen/window/tab).
 * Requests system audio and measures if it was actually delivered.
 */
export async function captureDisplay(
  optionsOrGlobals?: CaptureDisplayOptions | DisplayMediaGlobals,
  maybeGlobals?: DisplayMediaGlobals,
): Promise<CaptureDisplayResult> {
  let options: CaptureDisplayOptions = {};
  let globals: DisplayMediaGlobals;

  if (isDisplayMediaGlobals(optionsOrGlobals)) {
    globals = optionsOrGlobals;
  } else {
    options = optionsOrGlobals ?? {};
    globals = maybeGlobals ?? readDisplayMediaGlobals();
  }

  const videoConstraints: boolean | MediaTrackConstraints = options.surface
    ? { displaySurface: options.surface }
    : true;

  const stream = await globals.getDisplayMedia({
    video: videoConstraints,
    audio: true,
    systemAudio: options.systemAudio ?? "include",
  });

  const audioTracks = stream.getAudioTracks();
  // A missing audio track here is an observation about this capture, not a verdict on the browser.
  const audioObservation: AudioTrackObservation = audioTracks.length > 0 ? "audio-track-present" : "no-audio-track";

  return { stream, audioObservation };
}
