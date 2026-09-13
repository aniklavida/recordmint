import { describe, expect, it } from "vitest";
import { canTransitionRecordingStatus } from "../queries/recording-state.js";

describe("canTransitionRecordingStatus", () => {
  it("allows uploading to move to ready or failed", () => {
    expect(canTransitionRecordingStatus("uploading", "ready")).toBe(true);
    expect(canTransitionRecordingStatus("uploading", "failed")).toBe(true);
  });

  it("allows a retry to bring a failed recording back to uploading", () => {
    expect(canTransitionRecordingStatus("failed", "uploading")).toBe(true);
  });

  it("allows a ready recording to be marked failed if the object turns out to be bad", () => {
    expect(canTransitionRecordingStatus("ready", "failed")).toBe(true);
  });

  it("rejects a ready recording jumping straight back to uploading", () => {
    expect(canTransitionRecordingStatus("ready", "uploading")).toBe(false);
  });

  it("rejects a failed recording becoming ready without going through uploading again", () => {
    expect(canTransitionRecordingStatus("failed", "ready")).toBe(false);
  });

  it("rejects a no-op transition to the same state", () => {
    expect(canTransitionRecordingStatus("uploading", "uploading")).toBe(false);
    expect(canTransitionRecordingStatus("ready", "ready")).toBe(false);
    expect(canTransitionRecordingStatus("failed", "failed")).toBe(false);
  });
});
