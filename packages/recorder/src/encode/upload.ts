/**
 * The transport interface for uploading chunks.
 * Pluggable so it can be tested without a real backend or browser fetch.
 */
export interface UploadTransport {
  signPart: (partNumber: number) => Promise<{ url: string }>;
  putPart: (url: string, blob: Blob) => Promise<{ eTag: string }>;
  completeUpload: (parts: { partNumber: number; eTag: string }[]) => Promise<void>;
}

export interface ChunkedUploader {
  addChunk: (chunk: Blob) => void;
  retryFailedParts: () => void;
  complete: () => Promise<void>;
  getState: () => UploaderState;
}

export interface UploaderState {
  bufferedBytes: number;
  uploadingParts: number[];
  failedParts: number[];
  completedParts: number[];
  isRecoverable: boolean;
}

const MIN_PART_SIZE = 5 * 1024 * 1024; // 5 MiB (S3 minimum)

/**
 * Buffers incoming chunks and uploads them via the provided transport.
 * Ensures parts are at least 5 MiB unless it is the final part.
 * Failed parts are retained and can be retried.
 */
export function createChunkedUploader(transport: UploadTransport): ChunkedUploader {
  let buffer: Blob[] = [];
  let currentSize = 0;
  let partNumber = 1;

  const completedParts: { partNumber: number; eTag: string }[] = [];
  const uploadingParts = new Map<number, { blob: Blob; promise: Promise<void> }>();
  const failedParts = new Map<number, Blob>();

  const doUploadPart = async (currentPartNumber: number, blob: Blob) => {
    try {
      const { url } = await transport.signPart(currentPartNumber);
      const { eTag } = await transport.putPart(url, blob);
      completedParts.push({ partNumber: currentPartNumber, eTag });
      uploadingParts.delete(currentPartNumber);
    } catch {
      uploadingParts.delete(currentPartNumber);
      failedParts.set(currentPartNumber, blob);
    }
  };

  const uploadPart = (currentPartNumber: number, blob: Blob) => {
    const promise = doUploadPart(currentPartNumber, blob);
    uploadingParts.set(currentPartNumber, { blob, promise });
  };

  const processBuffer = (isFinal = false) => {
    while (currentSize >= MIN_PART_SIZE || (isFinal && currentSize > 0)) {
      let partSize = 0;
      const partBlobs: Blob[] = [];
      let i = 0;
      
      for (; i < buffer.length; i++) {
        const item = buffer[i]!;
        partBlobs.push(item);
        partSize += item.size;
        if (partSize >= MIN_PART_SIZE && !isFinal) {
          i++;
          break;
        }
      }

      buffer = buffer.slice(i);
      currentSize -= partSize;

      const partBlob = new Blob(partBlobs, { type: partBlobs[0]?.type || "application/octet-stream" });
      const currentPartNumber = partNumber++;

      uploadPart(currentPartNumber, partBlob);
    }
  };

  return {
    addChunk: (chunk: Blob) => {
      buffer.push(chunk);
      currentSize += chunk.size;
      processBuffer();
    },
    retryFailedParts: () => {
      const retries = Array.from(failedParts.entries());
      failedParts.clear();
      for (const [pNum, blob] of retries) {
        uploadPart(pNum, blob);
      }
    },
    complete: async () => {
      processBuffer(true);

      // Wait for all ongoing uploads to finish (either succeed or fail)
      const promises = Array.from(uploadingParts.values()).map((u) => u.promise);
      await Promise.allSettled(promises);

      if (failedParts.size > 0) {
        throw new Error("Cannot complete upload: there are failed parts.");
      }

      completedParts.sort((a, b) => a.partNumber - b.partNumber);
      await transport.completeUpload(completedParts);
    },
    getState: () => {
      return {
        bufferedBytes: currentSize,
        uploadingParts: Array.from(uploadingParts.keys()),
        failedParts: Array.from(failedParts.keys()),
        completedParts: completedParts.map((p) => p.partNumber),
        isRecoverable: failedParts.size > 0 || uploadingParts.size > 0 || currentSize > 0 || buffer.length > 0,
      };
    },
  };
}
