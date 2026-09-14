import { spawn } from "node:child_process";

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
