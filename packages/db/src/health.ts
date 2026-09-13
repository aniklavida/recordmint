import type { Sql } from "postgres";

export interface DbHealth {
  reachable: boolean;
  error?: string;
}

/** Used by the web app's /api/health route. A failure here must not throw — it must report. */
export async function checkDbReachable(sql: Sql): Promise<DbHealth> {
  try {
    await sql`select 1`;
    return { reachable: true };
  } catch (error) {
    return { reachable: false, error: error instanceof Error ? error.message : String(error) };
  }
}
