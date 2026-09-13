import { checkDbReachable, createDb, loadDbConfigFromEnv } from "@recordmint/db";
import {
  checkStorageReachable,
  createStorageClient,
  loadStorageConfigFromEnv,
} from "@recordmint/storage";

export const dynamic = "force-dynamic";

interface ComponentHealth {
  reachable: boolean;
  error?: string;
}

interface HealthResponse {
  status: "ok" | "degraded";
  database: ComponentHealth;
  storage: ComponentHealth;
  transcription: { enabled: boolean };
}

/**
 * Reports database reachability, storage reachability and whether
 * transcription is enabled — the infrastructure card's operator-facing
 * requirement. Every branch below is written to *report* a broken
 * dependency, never to throw past this handler.
 */
export async function GET(): Promise<Response> {
  const [database, storage] = await Promise.all([checkDatabase(), checkStorage()]);
  const transcription = { enabled: process.env.TRANSCRIPTION_ENABLED === "true" };

  const body: HealthResponse = {
    status: database.reachable && storage.reachable ? "ok" : "degraded",
    database,
    storage,
    transcription,
  };

  return Response.json(body, { status: body.status === "ok" ? 200 : 503 });
}

async function checkDatabase(): Promise<ComponentHealth> {
  try {
    const db = createDb(loadDbConfigFromEnv());
    try {
      return await checkDbReachable(db.sql);
    } finally {
      await db.sql.end({ timeout: 1 });
    }
  } catch (error) {
    return { reachable: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function checkStorage(): Promise<ComponentHealth> {
  try {
    const config = loadStorageConfigFromEnv();
    const client = createStorageClient(config);
    return await checkStorageReachable(client, config.bucket);
  } catch (error) {
    return { reachable: false, error: error instanceof Error ? error.message : String(error) };
  }
}
