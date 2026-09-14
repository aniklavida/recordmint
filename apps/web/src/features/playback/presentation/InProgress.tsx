"use client";

import { useEffect, useState } from "react";
import { RecordingViewer } from "./RecordingViewer";

interface ReadyPayload {
  state: "ready";
  recording: { id: string; title: string; description: string | null };
  playUrl: string;
  posterUrl: string | null;
  transcriptUrl: string | null;
  guestCommentingEnabled: boolean;
}

const POLL_INTERVAL_MS = 4000;

/**
 * SPEC.md §9: the share link exists from the moment recording starts, so
 * this is the honest state for a recording that is not marked ready yet
 * — polling rather than a full page reload is what turns that into "it
 * just starts playing a few seconds after the uploader stops" instead of
 * asking the viewer to keep hitting refresh.
 */
export function InProgress({ publicId, title, isAuthenticated }: { publicId: string; title: string; isAuthenticated: boolean }) {
  const [ready, setReady] = useState<ReadyPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const interval = setInterval(() => {
      fetch(`/api/public/recordings/${publicId}`)
        .then((response) => response.json() as Promise<ReadyPayload | { state: string }>)
        .then((result) => {
          if (!cancelled && result.state === "ready") {
            setReady(result as ReadyPayload);
          }
        })
        .catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [publicId]);

  if (ready) {
    return (
      <RecordingViewer
        publicId={publicId}
        playUrl={ready.playUrl}
        posterUrl={ready.posterUrl}
        captionsSrc={ready.transcriptUrl}
        title={ready.recording.title}
        guestCommentingEnabled={ready.guestCommentingEnabled}
        isAuthenticated={isAuthenticated}
      />
    );
  }

  return (
    <div role="status">
      <p>{title}</p>
      <p>Still recording, or finishing up the upload. This will start playing automatically.</p>
    </div>
  );
}
