import { expect, test } from "@playwright/test";

/**
 * Proves the fake-device harness itself works, before any capture code is
 * built on top of it. `record.spec.ts` (fake device → share link),
 * `share.spec.ts` and `playback.spec.ts` arrive with the features they
 * test (`docs/ROADMAP.md` steps 2-4) — writing them now against
 * features that do not exist would be exactly the false-positive coverage
 * AGENTS.md's truthfulness rule warns about.
 */
test("the fake capture device delivers a real camera and microphone stream", async ({ page }) => {
  await page.goto("/");

  const track = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const [videoTrack] = stream.getVideoTracks();
    const [audioTrack] = stream.getAudioTracks();
    const result = {
      videoLabel: videoTrack?.label ?? null,
      audioLabel: audioTrack?.label ?? null,
      videoReadyState: videoTrack?.readyState ?? null,
    };
    stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
    return result;
  });

  expect(track.videoReadyState).toBe("live");
  expect(track.videoLabel).toBeTruthy();
  expect(track.audioLabel).toBeTruthy();
});

test("MediaRecorder reports a usable mime type in the harness browser", async ({ page }) => {
  await page.goto("/");

  const supportedMime = await page.evaluate(() => {
    const candidates = [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/webm;codecs=vp9,opus",
      "video/webm",
    ];
    return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? null;
  });

  expect(supportedMime).not.toBeNull();
});
