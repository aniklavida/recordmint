import { QUEUE_NAMES } from "@recordmint/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getQueue } from "../../../../lib/queue";
import { enqueueTranscript } from "../transcript";

vi.mock("../../../../lib/queue", () => ({ getQueue: vi.fn() }));

describe("enqueueTranscript", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does not connect to the queue when transcription is disabled", async () => {
    vi.stubEnv("TRANSCRIPTION_ENABLED", "false");

    await enqueueTranscript("recording-1");

    expect(getQueue).not.toHaveBeenCalled();
  });

  it("sends the recording id to the transcript queue when enabled", async () => {
    vi.stubEnv("TRANSCRIPTION_ENABLED", "true");
    const send = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getQueue).mockResolvedValue({ send } as unknown as Awaited<ReturnType<typeof getQueue>>);

    await enqueueTranscript("recording-1");

    expect(send).toHaveBeenCalledWith(QUEUE_NAMES.transcript, { recordingId: "recording-1" });
  });

  it("keeps the completed recording playable when enqueueing fails", async () => {
    vi.stubEnv("TRANSCRIPTION_ENABLED", "true");
    vi.mocked(getQueue).mockRejectedValue(new Error("queue unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(enqueueTranscript("recording-1")).resolves.toBeUndefined();
  });
});
