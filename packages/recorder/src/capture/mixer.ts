export interface MixerGlobals {
  AudioContext: typeof window.AudioContext | undefined;
}

export function readMixerGlobals(): MixerGlobals {
  return {
    AudioContext: typeof window !== "undefined" ? (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext) : undefined,
  };
}

export class MultipleVideoTracksError extends Error {
  constructor() {
    super("Multiple video tracks provided. MediaRecorder can only record one video track.");
    this.name = "MultipleVideoTracksError";
  }
}

/**
 * Combines multiple media streams into a single stream.
 * Specifically handles merging multiple audio tracks using Web Audio API,
 * since MediaRecorder only records the first audio track.
 */
export function mixStreams(
  streams: MediaStream[],
  globals: MixerGlobals = readMixerGlobals(),
): MediaStream {
  const outStream = new MediaStream();
  const audioTracks: MediaStreamTrack[] = [];

  let videoTrackAdded = false;
  for (const stream of streams) {
    for (const track of stream.getVideoTracks()) {
      if (videoTrackAdded) {
        throw new MultipleVideoTracksError();
      }
      outStream.addTrack(track);
      videoTrackAdded = true;
    }
    for (const track of stream.getAudioTracks()) {
      audioTracks.push(track);
    }
  }

  if (audioTracks.length === 0) {
    return outStream;
  }

  if (audioTracks.length === 1 && audioTracks[0]) {
    outStream.addTrack(audioTracks[0]);
    return outStream;
  }

  // 2+ audio tracks: merge using Web Audio
  if (!globals.AudioContext) {
    throw new Error("AudioContext is required to mix multiple audio tracks, but it is not available.");
  }

  const ctx = new globals.AudioContext();
  const dest = ctx.createMediaStreamDestination();

  for (const track of audioTracks) {
    // Create a temporary stream for each track to create a MediaStreamAudioSourceNode
    const tempStream = new MediaStream([track]);
    const source = ctx.createMediaStreamSource(tempStream);
    source.connect(dest);
  }

  // Add the merged audio track to the output stream
  for (const mergedTrack of dest.stream.getAudioTracks()) {
    outStream.addTrack(mergedTrack);
  }

  return outStream;
}
