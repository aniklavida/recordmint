export {
  checkSupport,
  checkBrowserSupport,
  readSupportGlobals,
  preferredMimeType,
} from "./capture/support.js";
export type { SupportResult, SupportGlobals, UnsupportedReason, CapabilityState } from "./capture/support.js";

export { captureDisplay, readDisplayMediaGlobals } from "./capture/display.js";
export type { CaptureDisplayResult, DisplayMediaGlobals, AudioTrackObservation, CaptureDisplayConstraints, DisplaySurface, CaptureDisplayOptions } from "./capture/display.js";

export { captureUserMedia, readUserMediaGlobals } from "./capture/user-media.js";
export type { UserMediaGlobals } from "./capture/user-media.js";

export { mixStreams, readMixerGlobals, MultipleVideoTracksError } from "./capture/mixer.js";
export type { MixerGlobals } from "./capture/mixer.js";

export { getEncodingMimeType } from "./encode/mime.js";
export { createChunkedUploader } from "./encode/upload.js";
export type { UploadTransport, ChunkedUploader, UploaderState } from "./encode/upload.js";
export { createRecorder } from "./encode/recorder.js";
export type { RecorderOptions, RecorderResult } from "./encode/recorder.js";
