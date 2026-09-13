import { describe, expect, it } from "vitest";
import { loadDbConfigFromEnv } from "../client.js";

describe("loadDbConfigFromEnv", () => {
  it("throws when DATABASE_URL is not set", () => {
    expect(() => loadDbConfigFromEnv({})).toThrow("DATABASE_URL");
  });

  it("reads the connection string when set", () => {
    const config = loadDbConfigFromEnv({ DATABASE_URL: "postgres://u:p@host:5432/db" });
    expect(config.connectionString).toBe("postgres://u:p@host:5432/db");
  });
});
