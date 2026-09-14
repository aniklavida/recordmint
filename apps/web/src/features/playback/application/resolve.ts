import { getTranscriptForRecording, recordView } from "@recordmint/db";
import { generateId } from "@recordmint/shared";
import { presignRead } from "@recordmint/storage";
import { getDb } from "../../../lib/db";
import { getStorageClient, getStorageConfig } from "../../../lib/storage";
import { authorizeViewerForRecording } from "./authorize";

export type PlaybackResolution =
  | { state: "not_found" }
  | { state: "in_progress"; title: string }
  | { state: "password_required"; title: string; incorrect: boolean }
  | {
      state: "ready";
      recording: {
        id: string;
        title: string;
        description: string | null;
        durationSeconds: number | null;
        createdAt: Date;
      };
      playUrl: string;
      posterUrl: string | null;
      transcriptUrl: string | null;
      guestCommentingEnabled: boolean;
    };

export interface ResolveViewerInput {
  publicId: string;
  password?: string;
  viewerUserId?: string | null;
}

/**
 * SPEC.md §11's whole access-control paragraph, executed in order:
 * resolve the link, apply visibility, and mint a read URL only once every
 * rule has passed. `not_found` is returned — never a 403 — for every
 * refusal that would otherwise confirm a private recording's existence
 * to someone not entitled to know it.
 */
export async function resolveForViewer(input: ResolveViewerInput): Promise<PlaybackResolution> {
  const authorization = await authorizeViewerForRecording(input);
  if (!authorization.ok) {
    if (authorization.reason === "not_found") return { state: "not_found" };
    // A title is safe to show on a password wall — the link itself already
    // proves the requester knows this recording exists.
    return { state: "password_required", title: authorization.title, incorrect: authorization.reason === "incorrect_password" };
  }

  const recording = authorization.recording;

  if (recording.status !== "ready") {
    // SPEC.md §11: the link exists from the moment recording starts, so
    // this page has to render a clear in-progress state rather than a
    // broken player for a recording nobody has finished uploading yet.
    return { state: "in_progress", title: recording.title };
  }

  const db = getDb();
  const config = getStorageConfig();
  const client = getStorageClient();
  const allow = () => true; // every rule above already passed

  const [playUrl, posterUrl] = await Promise.all([
    presignRead(client, { bucket: config.bucket, key: recording.objectKey, authorize: allow }),
    recording.posterKey
      ? presignRead(client, { bucket: config.bucket, key: recording.posterKey, authorize: allow })
      : Promise.resolve(null),
  ]);

  let transcriptUrl: string | null = null;
  const transcript = await getTranscriptForRecording(db.orm, recording.id);
  if (transcript?.status === "ready" && transcript.objectKey) {
    transcriptUrl = await presignRead(client, { bucket: config.bucket, key: transcript.objectKey, authorize: allow });
  }

  await recordView(db.orm, { id: generateId(), recordingId: recording.id, viewerUserId: input.viewerUserId ?? null });

  return {
    state: "ready",
    recording: {
      id: recording.id,
      title: recording.title,
      description: recording.description,
      durationSeconds: recording.durationSeconds,
      createdAt: recording.createdAt,
    },
    playUrl,
    posterUrl,
    transcriptUrl,
    guestCommentingEnabled: recording.guestCommentingEnabled,
  };
}
