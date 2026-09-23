import { defineConfig, devices } from "@playwright/test";

/**
 * The fake capture device is what lets a recorder be tested in CI at all —
 * `--use-fake-device-for-media-stream` and `--use-fake-ui-for-media-stream`
 * remove the human gesture the real screen picker demands (STRUCTURE.md
 * §10). It cannot exercise the real picker, real system audio, or real
 * cross-browser differences — those stay a documented human matrix.
 */
export default defineConfig({
  testDir: "./",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium-fake-device",
      use: {
        ...devices["Desktop Chrome"],
        permissions: ["camera", "microphone", "clipboard-read", "clipboard-write"],
        launchOptions: {
          args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
        },
      },
    },
  ],
  webServer: {
    command: "pnpm --filter @recordmint/web run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    cwd: "../",
    timeout: 60_000,
  },
});
