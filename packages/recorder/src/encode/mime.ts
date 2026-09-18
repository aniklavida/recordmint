import { preferredMimeType, readSupportGlobals } from "../capture/support.js";

/**
 * Returns the preferred MIME type for encoding.
 * Picks MP4 (H.264+AAC) where the browser reports support, falling back to WebM (VP9 or VP8 + Opus).
 * Relies on the capability probe's list of supported codecs.
 */
export function getEncodingMimeType(mediaRecorderCtor?: { isTypeSupported?: (mime: string) => boolean }): string {
  if (!mediaRecorderCtor) {
    const globals = readSupportGlobals();
    mediaRecorderCtor = globals.mediaRecorderCtor;
  }
  const mime = preferredMimeType(mediaRecorderCtor);
  if (!mime) {
    throw new Error("No supported MIME type found for recording.");
  }
  return mime;
}
