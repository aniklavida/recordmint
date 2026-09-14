"use client";

import { useEffect, useRef } from "react";

export interface VideoPlayerProps {
  src: string;
  poster?: string | null;
  captionsSrc?: string | null;
  title: string;
}

/**
 * Plyr (MIT) wrapping a native `<video>` (SPEC.md §9/§16). Plyr is loaded
 * dynamically inside the effect rather than imported at module scope: it
 * touches `document` at construction time, which does not exist during
 * this component's server-side render pass.
 *
 * Range-request seeking is not this component's job — it works or it
 * does not depending on the URL it is given, which packages/storage's
 * `presignRead` already proves serves real 206 responses.
 */
export function VideoPlayer({ src, poster, captionsSrc, title }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let plyrInstance: { destroy: () => void } | undefined;
    let cancelled = false;

    void import("plyr").then(({ default: Plyr }) => {
      if (cancelled || !videoRef.current) return;
      plyrInstance = new Plyr(videoRef.current, {
        captions: { active: Boolean(captionsSrc), update: true },
      });
    });

    return () => {
      cancelled = true;
      plyrInstance?.destroy();
    };
  }, [captionsSrc]);

  return (
    <video ref={videoRef} controls playsInline poster={poster ?? undefined} aria-label={title} data-plyr>
      <source src={src} />
      {captionsSrc ? <track kind="captions" src={captionsSrc} default /> : null}
    </video>
  );
}
