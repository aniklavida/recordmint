import { createStorageClient, loadStorageConfigFromEnv, type StorageConfig } from "@recordmint/storage";

type StorageClient = ReturnType<typeof createStorageClient>;

let client: StorageClient | undefined;
let config: StorageConfig | undefined;

export function getStorageConfig(): StorageConfig {
  config ??= loadStorageConfigFromEnv();
  return config;
}

export function getStorageClient(): StorageClient {
  client ??= createStorageClient(getStorageConfig());
  return client;
}
