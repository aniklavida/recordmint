/**
 * The capability probe. This runs BEFORE the record button is enabled,
 * never after — an unsupported browser has to be found before someone has
 * recorded fifteen minutes they are about to lose (STRUCTURE.md §3).
 *
 * Capture, encoding and upload (roadmap step 2) are not built yet; this
 * card ships the probe alone because it is the one piece of the recorder
 * that has to exist before anything else does.
 */

export type UnsupportedReason =
  | "insecure-context"
  | "missing-display-media"
  | "missing-media-recorder"
  | "missing-mime-type";

export interface SupportResult {
  supported: boolean;
  reasons: UnsupportedReason[];
}

/** Minimal shape of the globals this probe reads, so it can be unit-tested without a real browser. */
export interface SupportGlobals {
  isSecureContext: boolean;
  hasGetDisplayMedia: boolean;
  mediaRecorderCtor: { isTypeSupported?: (mime: string) => boolean } | undefined;
}

const PREFERRED_MIME_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function readSupportGlobals(): SupportGlobals {
  return {
    isSecureContext: typeof window !== "undefined" ? window.isSecureContext : false,
    hasGetDisplayMedia:
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices !== "undefined" &&
      typeof navigator.mediaDevices.getDisplayMedia === "function",
    mediaRecorderCtor: typeof MediaRecorder !== "undefined" ? MediaRecorder : undefined,
  };
}

/**
 * Pure function over an explicit globals object, so support logic is
 * testable in Node/Vitest and exercisable by the Playwright fake-device
 * harness without either one mocking the DOM.
 */
export function checkSupport(globals: SupportGlobals): SupportResult {
  const reasons: UnsupportedReason[] = [];

  if (!globals.isSecureContext) {
    reasons.push("insecure-context");
  }
  if (!globals.hasGetDisplayMedia) {
    reasons.push("missing-display-media");
  }
  if (!globals.mediaRecorderCtor) {
    reasons.push("missing-media-recorder");
  } else if (
    typeof globals.mediaRecorderCtor.isTypeSupported === "function" &&
    !PREFERRED_MIME_TYPES.some((mime) => globals.mediaRecorderCtor?.isTypeSupported?.(mime))
  ) {
    reasons.push("missing-mime-type");
  }

  return { supported: reasons.length === 0, reasons };
}

/** Convenience wrapper for call sites in the browser. */
export function checkBrowserSupport(): SupportResult {
  return checkSupport(readSupportGlobals());
}

export function preferredMimeType(
  mediaRecorderCtor: { isTypeSupported?: (mime: string) => boolean } | undefined,
): string | undefined {
  if (!mediaRecorderCtor?.isTypeSupported) {
    return PREFERRED_MIME_TYPES[0];
  }
  return PREFERRED_MIME_TYPES.find((mime) => mediaRecorderCtor.isTypeSupported?.(mime));
}
