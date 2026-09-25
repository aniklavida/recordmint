import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractPosterFrame, FfmpegError, probeMediaDuration, trimMediaFile, verifyTrimmedMedia } from "../ffmpeg.js";

const ffmpegAvailable = spawnSync("ffmpeg", ["-version"]).status === 0;

/**
 * Runs ffmpeg for real — the binary is a required part of this project's
 * own stack (SPEC.md §7: "ffmpeg is still present, but demoted"), not an optional test
 * dependency, so there is no honest way to fake this. Skips only on a
 * machine where ffmpeg genuinely is not installed, matching every other
 * conditionally-skipped live test in this repository.
 */
describe.skipIf(!ffmpegAvailable)("extractPosterFrame", () => {
  let workDir: string;
  let sourceVideoPath: string;
  let trimSourceVideoPath: string;

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), "recordmint-ffmpeg-test-"));
    sourceVideoPath = join(workDir, "source.mp4");
    trimSourceVideoPath = join(workDir, "trim-source.mp4");
    // A synthetic 2-second test pattern — no fixture file needed, and no
    // screen-capture human gesture required (this is a worker media test,
    // not a capture one).
    const result = spawnSync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=2:size=320x240:rate=10",
      "-pix_fmt",
      "yuv420p",
      sourceVideoPath,
    ]);
    if (result.status !== 0) {
      throw new Error(`Failed to generate the test fixture video: ${result.stderr.toString("utf8")}`);
    }
    const trimResult = spawnSync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=duration=6:size=320x240:rate=10",
      "-pix_fmt",
      "yuv420p",
      trimSourceVideoPath,
    ]);
    if (trimResult.status !== 0) {
      throw new Error(`Failed to generate the trim fixture video: ${trimResult.stderr.toString("utf8")}`);
    }
  });

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("extracts a real, non-empty JPEG frame from a real video file", async () => {
    const outputPath = join(workDir, "poster.jpg");
    await extractPosterFrame(sourceVideoPath, outputPath, 1);

    const bytes = await readFile(outputPath);
    expect(bytes.length).toBeGreaterThan(0);
    // JPEG magic bytes (SOI marker) — proves this is genuinely a JPEG,
    // not an empty or corrupt file ffmpeg happened to exit 0 for.
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
  });

  it("trims by copying encoded media and produces a decodable file with the requested duration", async () => {
    const outputPath = join(workDir, "trimmed.mp4");
    const startSeconds = 1.5;
    const endSeconds = 4.25;
    await trimMediaFile(trimSourceVideoPath, outputPath, startSeconds, endSeconds);
    const duration = await verifyTrimmedMedia(outputPath, endSeconds - startSeconds);
    expect(duration).toBeGreaterThan(1.5);
    expect(duration).toBeLessThan(3.5);
    expect(await probeMediaDuration(outputPath)).toBe(duration);
  }, 30_000);
  it("rejects with FfmpegError for a source file that does not exist", async () => {
    await expect(
      extractPosterFrame(join(workDir, "does-not-exist.mp4"), join(workDir, "unused.jpg")),
    ).rejects.toBeInstanceOf(FfmpegError);
  });
});
