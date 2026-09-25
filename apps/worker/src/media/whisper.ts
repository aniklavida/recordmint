import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * whisper.cpp by default, faster-whisper where a GPU exists — both MIT,
 * both run on the host, no third-party API, no key (SPEC.md §14). Model
 * size is configuration, not code: `WHISPER_MODEL` picks the model, and
 * `WHISPER_BINARY_PATH` picks which of the two CLIs is installed, since
 * neither ships with this repository — a self-hoster who wants
 * transcription installs one and points these two variables at it.
 */
const WHISPER_BINARY = process.env.WHISPER_BINARY_PATH ?? "whisper-cpp";

/**
 * Thrown when the configured transcription binary is not present on this
 * host. This is the expected, documented state on a machine that has not
 * installed whisper.cpp/faster-whisper: transcription is optional and
 * disableable, and this repository does not download a multi-hundred-
 * megabyte model as a side effect of running the worker. Every caller of
 * `transcribeToVtt` must treat this as non-fatal to the recording.
 */
export class TranscriptionUnavailableError extends Error {
  constructor(binary: string, cause?: unknown) {
    super(
      `Transcription binary "${binary}" is not available on this host. ` +
        `Install whisper.cpp or faster-whisper and set WHISPER_BINARY_PATH, or leave TRANSCRIPTION_ENABLED unset/false.` +
        (cause instanceof Error ? ` (${cause.message})` : ""),
    );
    this.name = "TranscriptionUnavailableError";
  }
}

export class TranscriptionError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "TranscriptionError";
  }
}

/** A cheap, side-effect-free presence check before committing a job to a binary that probably is not installed. */
export function assertWhisperBinaryAvailable(): void {
  const result = spawnSync(WHISPER_BINARY, ["--help"], { stdio: "ignore" });
  if (result.error !== undefined || result.status !== 0) {
    throw new TranscriptionUnavailableError(WHISPER_BINARY, result.error);
  }
}

export function isWhisperBinaryAvailable(): boolean {
  try {
    assertWhisperBinaryAvailable();
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs the configured whisper binary against an audio/video file and
 * writes WebVTT to `outputVttPath`. The CLI contract this assumes —
 * `-m <model>`, `-f <input>`, `--output-vtt`, writing `<input>.vtt` next
 * to the input — matches whisper.cpp's own `whisper-cli`; a
 * faster-whisper deployment behind the same env vars would need a
 * thin CLI shim presenting the same interface, which is a packaging
 * detail for whoever deploys it, not something this repository ships.
 */
export async function transcribeToVtt(inputPath: string, outputVttPath: string, modelPath: string): Promise<void> {
  assertWhisperBinaryAvailable();

  return new Promise((resolve, reject) => {
    const child = spawn(WHISPER_BINARY, [
      "-m",
      modelPath,
      "-f",
      inputPath,
      "--output-vtt",
      "--output-file",
      outputVttPath.replace(/\.vtt$/, ""),
    ]);
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      reject(new TranscriptionUnavailableError(WHISPER_BINARY, error));
    });
    child.on("close", (code) => {
      if (code === 0 && existsSync(outputVttPath)) {
        resolve();
      } else if (code === 0) {
        reject(new TranscriptionError(`${WHISPER_BINARY} exited without writing ${outputVttPath}`, 0, stderr));
      } else {
        reject(new TranscriptionError(`${WHISPER_BINARY} exited with code ${code}`, code, stderr));
      }
    });
  });
}
