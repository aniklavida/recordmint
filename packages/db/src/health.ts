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
    return { reachable: false, error: describeError(error) };
  }
}

/**
 * `error.message` is empty for the `AggregateError` postgres.js throws on
 * connection refused — the real reason lives in `error.errors[]`. Falls
 * back to `error.message` for every other error shape.
 */
function describeError(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    return error.errors.map((e) => (e instanceof Error ? e.message : String(e))).join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}
