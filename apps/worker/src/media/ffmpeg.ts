import { spawn } from "node:child_process";

const FFPROBE_BINARY = process.env.FFPROBE_BINARY_PATH ?? "ffprobe";

/**
 * ffmpeg is invoked as a binary, never linked (SPEC.md §15 / §7's licence
 * class rule): a `spawn` call has no bearing on this process's own
 * licence, which is the entire reason ffmpeg — LGPL/GPL depending on
 * build — is fine to depend on here while it would not be fine as an npm
 * package compiled into shipped code.
 */
const FFMPEG_BINARY = process.env.FFMPEG_BINARY_PATH ?? "ffmpeg";

export class FfmpegError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "FfmpegError";
  }
}

function runBinary(binary: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      reject(new FfmpegError(`Could not start ${binary}: ${error.message}`, null, stderr));
    });
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new FfmpegError(`${binary} exited with code ${code}`, code, stderr));
    });
  });
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BINARY, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      reject(new FfmpegError(`Could not start ffmpeg: ${error.message}`, null, stderr));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new FfmpegError(`ffmpeg exited with code ${code}`, code, stderr));
      }
    });
  });
}

/**
 * Extracts one frame at `atSeconds` (default 1s in, so a black opening
 * frame is less likely) as a JPEG poster. `-ss` before `-i` seeks in the
 * demuxer rather than decoding every prior frame, which matters once
 * recordings run long.
 */
export async function extractPosterFrame(inputPath: string, outputPath: string, atSeconds = 1): Promise<void> {
  await runFfmpeg([
    "-y",
    "-ss",
    String(atSeconds),
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    outputPath,
  ]);
}

export async function trimMediaFile(inputPath: string, outputPath: string, startSeconds: number, endSeconds: number): Promise<void> {
  await runFfmpeg([
    "-y",
    "-ss",
    String(startSeconds),
    "-i",
    inputPath,
    "-t",
    String(endSeconds - startSeconds),
    "-map",
    "0:v?",
    "-map",
    "0:a?",
    "-c",
    "copy",
    outputPath,
  ]);
}

export async function probeMediaDuration(inputPath: string): Promise<number> {
  const output = await runBinary(FFPROBE_BINARY, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    inputPath,
  ]);
  const duration = Number(output.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("The trimmed file has no positive duration.");
  }
  return duration;
}

export async function verifyTrimmedMedia(inputPath: string, expectedDurationSeconds: number): Promise<number> {
  await runFfmpeg(["-v", "error", "-i", inputPath, "-map", "0", "-f", "null", "-"]);
  const duration = await probeMediaDuration(inputPath);
  const difference = Math.abs(duration - expectedDurationSeconds);
  if (difference > 1.25) {
    throw new Error("The trimmed file duration does not match the requested trim points.");
  }
  return duration;
}
