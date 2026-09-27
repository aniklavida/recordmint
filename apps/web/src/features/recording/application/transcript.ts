import { QUEUE_NAMES } from "@recordmint/db";
import { getQueue } from "../../../lib/queue";

export async function enqueueTranscript(recordingId: string): Promise<void> {
  if (process.env.TRANSCRIPTION_ENABLED !== "true") return;

  try {
    const boss = await getQueue();
    await boss.send(QUEUE_NAMES.transcript, { recordingId });
  } catch (error) {
    console.error("Could not enqueue transcript job:", error);
  }
}
