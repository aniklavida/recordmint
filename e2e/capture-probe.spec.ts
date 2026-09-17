import { expect, test } from "@playwright/test";

// A comment stating the fake device cannot exercise the real picker or real system audio, so a green CI run is not a substitute for the human matrix.
test.describe("Capture capabilities (Probe)", () => {
  test("getUserMedia works via the fake capture device", async ({ page }) => {
    // Note: The fake device cannot exercise the real OS screen picker or real system audio.
    // A green CI run here is NOT a substitute for testing the human matrix (manual cross-browser testing).
    
    await page.goto("/");

    const trackInfo = await page.evaluate(async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();
      const result = {
        hasVideo: videoTracks.length > 0,
        hasAudio: audioTracks.length > 0,
      };
      stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
      return result;
    });

    expect(trackInfo.hasVideo).toBe(true);
    expect(trackInfo.hasAudio).toBe(true);
  });
});
