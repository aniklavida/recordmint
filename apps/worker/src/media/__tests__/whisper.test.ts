import { describe, expect, it } from "vitest";
import { isWhisperBinaryAvailable, TranscriptionUnavailableError, transcribeToVtt } from "../whisper.js";

/**
 * This machine genuinely has no whisper.cpp/faster-whisper installed —
 * that is not a test fixture, it is the real, honest state SPEC.md §14
 * describes ("transcription is optional... must be switchable off
 * entirely"). These tests prove the failure path actually produces the
 * documented, catchable error rather than crashing the job or hanging.
 * On a machine that *does* have WHISPER_BINARY_PATH configured and
 * working, this suite is skipped in favour of a real transcription run —
 * there is no meaningful "fake success" version of this test.
 */
describe.skipIf(isWhisperBinaryAvailable())("transcribeToVtt without a transcription binary installed", () => {
  it("reports the binary as unavailable", () => {
    expect(isWhisperBinaryAvailable()).toBe(false);
  });

  it("rejects with TranscriptionUnavailableError rather than hanging or throwing an opaque spawn error", async () => {
    await expect(transcribeToVtt("/tmp/does-not-matter.mp4", "/tmp/does-not-matter.vtt", "base")).rejects.toBeInstanceOf(
      TranscriptionUnavailableError,
    );
  });

  it("names the missing binary and points at the two env vars that fix it", async () => {
    await expect(transcribeToVtt("/tmp/x.mp4", "/tmp/x.vtt", "base")).rejects.toThrow(/WHISPER_BINARY_PATH/);
  });
});
