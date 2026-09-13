import { describe, expect, it } from "vitest";
import { checkSupport, type SupportGlobals } from "../capture/support.js";

const supported: SupportGlobals = {
  isSecureContext: true,
  hasGetDisplayMedia: true,
  mediaRecorderCtor: { isTypeSupported: (mime) => mime.startsWith("video/mp4") },
};

describe("checkSupport", () => {
  it("passes when every capability is present", () => {
    expect(checkSupport(supported)).toEqual({ supported: true, reasons: [] });
  });

  it("flags an insecure context", () => {
    const result = checkSupport({ ...supported, isSecureContext: false });
    expect(result.supported).toBe(false);
    expect(result.reasons).toContain("insecure-context");
  });

  it("flags a missing getDisplayMedia", () => {
    const result = checkSupport({ ...supported, hasGetDisplayMedia: false });
    expect(result.reasons).toContain("missing-display-media");
  });

  it("flags a browser with no usable MediaRecorder mime type", () => {
    const result = checkSupport({
      ...supported,
      mediaRecorderCtor: { isTypeSupported: () => false },
    });
    expect(result.reasons).toContain("missing-mime-type");
  });

  it("flags a missing MediaRecorder constructor entirely", () => {
    const result = checkSupport({ ...supported, mediaRecorderCtor: undefined });
    expect(result.reasons).toContain("missing-media-recorder");
  });
});
