"use client";

import { useEffect, useRef, useState } from "react";
import { CommentsPanel } from "../../comments/presentation/CommentsPanel";
import { ReactionBar } from "../../reactions/presentation/ReactionBar";
import { RecordingSettings } from "../../recording/presentation/RecordingSettings";
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
  description,
  guestCommentingEnabled,
  isAuthenticated,
  viewCount,
  settings,
}: {
  publicId: string;
  playUrl: string;
  posterUrl: string | null;
  captionsSrc: string | null;
  title: string;
  description: string | null;
  guestCommentingEnabled: boolean;
  isAuthenticated: boolean;
  /** The workspace's view count for this recording, or null when the viewer is not a workspace member — never rendered for a guest. */
  viewCount: number | null;
  /**
   * Present only when this viewer may edit this recording (the creator
   * or a workspace owner) — absent for everyone else, including a
   * guest. Plain data only: a Server Component cannot hand a function
   * prop across to a Client Component, so the update callback is built
   * here rather than passed in from the page.
   */
  settings: {
    recordingId: string;
    visibility: string;
    hasPassword: boolean;
    expiresAt: string | null;
    durationSeconds: number | null;
    trimStatus: string;
    visibilityOptions: readonly string[];
  } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
  const [liveTitle, setLiveTitle] = useState(title);

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
      <h1>{liveTitle}</h1>
      {description ? <p>{description}</p> : null}
      {/* Never rendered for a guest — resolved server-side to null before this component ever mounts for one. */}
      {viewCount !== null ? (
        <p className="recording-view-count">
          {viewCount} view{viewCount === 1 ? "" : "s"}
        </p>
      ) : null}
      <VideoPlayer src={playUrl} poster={posterUrl} captionsSrc={captionsSrc} title={liveTitle} />
      {settings ? (
        <RecordingSettings
          recordingId={settings.recordingId}
          title={liveTitle}
          visibility={settings.visibility}
          hasPassword={settings.hasPassword}
          expiresAt={settings.expiresAt}
          durationSeconds={settings.durationSeconds}
          trimStatus={settings.trimStatus}
          visibilityOptions={settings.visibilityOptions}
          onUpdated={(update) => {
            if (update.title !== undefined) setLiveTitle(update.title);
          }}
        />
      ) : null}
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
