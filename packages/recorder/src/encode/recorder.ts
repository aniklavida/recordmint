import { ChunkedUploader } from "./upload.js";
import { getEncodingMimeType } from "./mime.js";

export interface RecorderOptions {
  mediaRecorderCtor?: typeof MediaRecorder;
  stream: MediaStream;
  uploader: ChunkedUploader;
  timeslice?: number;
  mimeType?: string;
}

export interface RecorderResult {
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<void>;
  getMediaRecorder: () => MediaRecorder;
}

/**
 * Wraps MediaRecorder lifecycle.
 * Each dataavailable event's chunk is handed off to the upload module.
 */
export function createRecorder({
  mediaRecorderCtor = typeof MediaRecorder !== "undefined" ? MediaRecorder : (undefined as unknown as typeof MediaRecorder),
  stream,
  uploader,
  timeslice = 1000,
  mimeType,
}: RecorderOptions): RecorderResult {
  if (!mediaRecorderCtor) {
    throw new Error("MediaRecorder is not available.");
  }
  
  const resolvedMimeType = mimeType || getEncodingMimeType(mediaRecorderCtor);
  const mediaRecorder = new mediaRecorderCtor(stream, { mimeType: resolvedMimeType });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      uploader.addChunk(event.data);
    }
  };

  return {
    start: () => {
      mediaRecorder.start(timeslice);
    },
    pause: () => {
      mediaRecorder.pause();
    },
    resume: () => {
      mediaRecorder.resume();
    },
    stop: async () => {
      return new Promise<void>((resolve, reject) => {
        const handleStop = async () => {
          try {
            await uploader.complete();
            resolve();
          } catch (e) {
            reject(e);
          } finally {
            mediaRecorder.removeEventListener("stop", handleStop);
          }
        };
        mediaRecorder.addEventListener("stop", handleStop);
        
        // If already inactive, resolve immediately
        if (mediaRecorder.state === "inactive") {
          mediaRecorder.removeEventListener("stop", handleStop);
          uploader.complete().then(resolve).catch(reject);
          return;
        }

        mediaRecorder.stop();
      });
    },
    getMediaRecorder: () => mediaRecorder,
  };
}
