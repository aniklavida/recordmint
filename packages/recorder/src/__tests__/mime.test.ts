import { describe, expect, it } from "vitest";
import { getEncodingMimeType } from "../encode/mime.js";

describe("getEncodingMimeType", () => {
  it("picks MP4 if supported", () => {
    const mockMediaRecorder = {
      isTypeSupported: (mime: string) => mime.includes("mp4"),
    };
    expect(getEncodingMimeType(mockMediaRecorder)).toContain("video/mp4");
  });

  it("falls back to WebM if MP4 is not supported", () => {
    const mockMediaRecorder = {
      isTypeSupported: (mime: string) => mime.includes("webm"),
    };
    expect(getEncodingMimeType(mockMediaRecorder)).toContain("video/webm");
  });

  it("throws if no supported mime is found", () => {
    const mockMediaRecorder = {
      isTypeSupported: () => false,
    };
    expect(() => getEncodingMimeType(mockMediaRecorder)).toThrow(/No supported MIME type/);
  });
});
