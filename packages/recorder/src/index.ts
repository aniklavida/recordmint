export {
  checkSupport,
  checkBrowserSupport,
  readSupportGlobals,
  preferredMimeType,
} from "./capture/support.js";
export type { SupportResult, SupportGlobals, UnsupportedReason, CapabilityState } from "./capture/support.js";

export { captureDisplay, readDisplayMediaGlobals } from "./capture/display.js";
export type { CaptureDisplayResult, DisplayMediaGlobals, AudioTrackObservation, CaptureDisplayConstraints } from "./capture/display.js";

export { captureUserMedia, readUserMediaGlobals } from "./capture/user-media.js";
export type { UserMediaGlobals } from "./capture/user-media.js";

export { mixStreams, readMixerGlobals, MultipleVideoTracksError } from "./capture/mixer.js";
export type { MixerGlobals } from "./capture/mixer.js";
