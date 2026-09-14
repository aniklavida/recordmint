import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // runRetentionSweep has no per-test scope — it scans every workspace's
    // recordings for whichever ones are past retention. Both
    // retention.test.ts (fake storage) and retention.live.test.ts (real
    // storage) call it against the one shared throwaway Postgres this
    // package's DATABASE_URL-gated tests use, so running test files in
    // parallel would let one file's sweep delete rows the other file just
    // inserted. Every other test file here scopes its own rows by a
    // workspace/user id it created, so serializing costs a little wall
    // time and buys freedom from that one genuine cross-file race.
    fileParallelism: false,
  },
});
