import { createStorageClient, loadStorageConfigFromEnv, type StorageConfig } from "@recordmint/storage";

type StorageClient = ReturnType<typeof createStorageClient>;

let client: StorageClient | undefined;
let config: StorageConfig | undefined;

export function getStorageConfig(): StorageConfig {
  config ??= loadStorageConfigFromEnv();
  return config;
}

/** Only this module and `@recordmint/storage` itself know which S3 implementation is behind the client. */
export function getStorageClient(): StorageClient {
  client ??= createStorageClient(getStorageConfig());
  return client;
}
