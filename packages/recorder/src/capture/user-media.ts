export interface UserMediaGlobals {
  getUserMedia: (constraints?: MediaStreamConstraints) => Promise<MediaStream>;
}

export function readUserMediaGlobals(): UserMediaGlobals {
  return {
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  };
}

/**
 * Captures user media (camera and/or microphone).
 */
export async function captureUserMedia(
  constraints: MediaStreamConstraints,
  globals: UserMediaGlobals = readUserMediaGlobals(),
): Promise<MediaStream> {
  return globals.getUserMedia(constraints);
}
