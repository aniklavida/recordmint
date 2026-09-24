import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route.js";

const live = Boolean(process.env.DATABASE_URL && process.env.S3_ENDPOINT);
const expectedFailure = process.env.RECORDMINT_EXPECT_HEALTH_FAILURE;

interface HealthBody {
  status: "ok" | "degraded";
  database: { reachable: boolean; error?: string };
  storage: { reachable: boolean; error?: string };
  transcription: { enabled: boolean; error?: string };
}

async function health(): Promise<{ status: number; body: HealthBody }> {
  const response = await GET();
  return { status: response.status, body: (await response.json()) as HealthBody };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.skipIf(!live)("GET /api/health against real dependencies", () => {
  it("reports database, storage and disabled transcription healthy", async () => {
    vi.stubEnv("TRANSCRIPTION_ENABLED", "false");
    const result = await health();

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      status: "ok",
      database: { reachable: true },
      storage: { reachable: true },
      transcription: { enabled: false },
    });
  }, 30_000);

  it.skipIf(expectedFailure !== "database")(
    "names the database when PostgreSQL is stopped",
    async () => {
      vi.stubEnv("TRANSCRIPTION_ENABLED", "false");
      const result = await health();

      expect(result.status).toBe(503);
      expect(result.body.status).toBe("degraded");
      expect(result.body.database.reachable).toBe(false);
      expect(result.body.database.error).toBeTruthy();
      expect(result.body.storage).toEqual({ reachable: true });
    },
    30_000,
  );

  it.skipIf(expectedFailure !== "storage")(
    "names storage when MinIO is stopped",
    async () => {
      vi.stubEnv("TRANSCRIPTION_ENABLED", "false");
      const result = await health();

      expect(result.status).toBe(503);
      expect(result.body.status).toBe("degraded");
      expect(result.body.database).toEqual({ reachable: true });
      expect(result.body.storage.reachable).toBe(false);
      expect(result.body.storage.error).toBeTruthy();
    },
    30_000,
  );

  it("names a misconfigured transcription toggle without hiding healthy core dependencies", async () => {
    vi.stubEnv("TRANSCRIPTION_ENABLED", "misconfigured");
    const result = await health();

    expect(result.status).toBe(503);
    expect(result.body.status).toBe("degraded");
    expect(result.body.database).toEqual({ reachable: true });
    expect(result.body.storage).toEqual({ reachable: true });
    expect(result.body.transcription).toEqual({
      enabled: false,
      error: "TRANSCRIPTION_ENABLED must be either true or false.",
    });
  }, 30_000);
});
