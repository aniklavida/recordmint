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

interface TranscriptionHealth {
  enabled: boolean;
  error?: string;
}

interface HealthResponse {
  status: "ok" | "degraded";
  database: ComponentHealth;
  storage: ComponentHealth;
  transcription: TranscriptionHealth;
}

/**
 * Reports database reachability, storage reachability and whether
 * transcription is enabled. This is the endpoint an operator points a
 * monitor at (`docs/ROADMAP.md` step 7), so every branch below is written
 * to *report* a broken dependency, never to throw past this handler.
 */
export async function GET(): Promise<Response> {
  const [database, storage] = await Promise.all([checkDatabase(), checkStorage()]);
  const transcription = checkTranscriptionConfiguration(process.env);

  const body: HealthResponse = {
    status:
      database.reachable && storage.reachable && transcription.error === undefined
        ? "ok"
        : "degraded",
    database,
    storage,
    transcription,
  };

  return Response.json(body, { status: body.status === "ok" ? 200 : 503 });
}

function checkTranscriptionConfiguration(env: NodeJS.ProcessEnv): TranscriptionHealth {
  if (env.TRANSCRIPTION_ENABLED === undefined || env.TRANSCRIPTION_ENABLED === "false") {
    return { enabled: false };
  }
  if (env.TRANSCRIPTION_ENABLED === "true") {
    return { enabled: true };
  }
  return {
    enabled: false,
    error: "TRANSCRIPTION_ENABLED must be either true or false.",
  };
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
