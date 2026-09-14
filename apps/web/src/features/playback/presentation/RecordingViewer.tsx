"use client";

import { useEffect, useRef, useState } from "react";
import { CommentsPanel } from "../../comments/presentation/CommentsPanel";
import { ReactionBar } from "../../reactions/presentation/ReactionBar";
import { TranscriptSearch } from "../../transcripts/presentation/TranscriptSearch";
import { VideoPlayer } from "./VideoPlayer";

/**
 * Combines the player and the comments panel so a comment marker can seek
 * the video and a new comment is timestamped against whatever moment is
 * currently playing — commenting at a moment and a marker seeking back to
 * it only make sense wired together.
 */
export function RecordingViewer({
  publicId,
  playUrl,
  posterUrl,
  captionsSrc,
  title,
  guestCommentingEnabled,
  isAuthenticated,
}: {
  publicId: string;
  playUrl: string;
  posterUrl: string | null;
  captionsSrc: string | null;
  title: string;
  guestCommentingEnabled: boolean;
  isAuthenticated: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const video = container.querySelector("video");
    const onTimeUpdate = (): void => setCurrentTimeSeconds(video?.currentTime ?? 0);
    video?.addEventListener("timeupdate", onTimeUpdate);

    const onSeekClick = (event: Event): void => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-seek-to]");
      if (!target || !video) return;
      video.currentTime = Number(target.dataset.seekTo);
      void video.play();
    };
    container.addEventListener("click", onSeekClick);

    return () => {
      video?.removeEventListener("timeupdate", onTimeUpdate);
      container.removeEventListener("click", onSeekClick);
    };
  }, []);

  return (
    <div ref={containerRef} className="recording-viewer">
      <VideoPlayer src={playUrl} poster={posterUrl} captionsSrc={captionsSrc} title={title} />
      <ReactionBar
        publicId={publicId}
        guestCommentingEnabled={guestCommentingEnabled}
        isAuthenticated={isAuthenticated}
        currentTimeSeconds={currentTimeSeconds}
      />
      {captionsSrc ? <TranscriptSearch transcriptUrl={captionsSrc} /> : null}
      <CommentsPanel
        publicId={publicId}
        guestCommentingEnabled={guestCommentingEnabled}
        isAuthenticated={isAuthenticated}
        currentTimeSeconds={currentTimeSeconds}
      />
    </div>
  );
}
