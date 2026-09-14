import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema/index.js";

type OrmClient = PostgresJsDatabase<typeof schema>;
type TranscriptStatus = (typeof schema.transcriptStatusEnum.enumValues)[number];

/** A recording with no transcript row, or one still `pending`/`failed`, is a completely normal, playable recording — this returns `null` for all three rather than distinguishing them for the caller. */
export async function getTranscriptForRecording(orm: OrmClient, recordingId: string) {
  const rows = await orm.select().from(schema.transcripts).where(eq(schema.transcripts.recordingId, recordingId)).limit(1);
  return rows[0] ?? null;
}

export interface UpsertTranscriptInput {
  id: string;
  recordingId: string;
  status: TranscriptStatus;
  language?: string | null;
  objectKey?: string | null;
  text?: string | null;
  errorMessage?: string | null;
}

/**
 * `recordingId` is unique on this table, so the transcript job can call
 * this at every stage of its own lifecycle (pending on enqueue, then
 * ready or failed on completion) without first checking whether a row
 * already exists.
 */
export async function upsertTranscript(orm: OrmClient, input: UpsertTranscriptInput) {
  const rows = await orm
    .insert(schema.transcripts)
    .values(input)
    .onConflictDoUpdate({
      target: schema.transcripts.recordingId,
      set: {
        status: input.status,
        language: input.language ?? null,
        objectKey: input.objectKey ?? null,
        text: input.text ?? null,
        errorMessage: input.errorMessage ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return rows[0]!;
}
