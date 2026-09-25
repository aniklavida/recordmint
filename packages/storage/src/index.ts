export { createStorageClient, loadStorageConfigFromEnv } from "./client.js";
export type { StorageConfig } from "./client.js";
export { MAX_PRESIGN_TTL_SECONDS } from "./limits.js";
export { originalKey, posterKey, trimmedKey, transcriptKey, recordingKeyPrefix } from "./keys.js";
export { listRecordingObjectKeys, deleteRecordingObjects, deleteRecordingsObjects } from "./lifecycle.js";
export { getObjectStream, putObject } from "./objects.js";
export { presignRead, presignUpload, DEFAULT_READ_URL_TTL_SECONDS } from "./presign.js";
export {
  createMultipartUpload,
  presignUploadPart,
  completeMultipartUpload,
  abortMultipartUpload,
} from "./multipart.js";
export type { CompletedPart } from "./multipart.js";
export { checkStorageReachable } from "./health.js";
export type { StorageHealth } from "./health.js";
export { assertAuthorized, StorageAuthorizationError } from "./authorization.js";
export type { AuthorizationCheck } from "./authorization.js";
