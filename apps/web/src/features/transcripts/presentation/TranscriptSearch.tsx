"use client";

import { useEffect, useState } from "react";
// Imported from the "./vtt" subpath rather than the package root: the
// root barrel also re-exports generateSecureToken/generateId, which pull
// in `node:crypto`. Node builtins are fine in this package's normal
// server-side callers, but this component is "use client" — bundled for
// the browser — where webpack has no `node:` scheme loader at all. This
// subpath has no such dependency, so the client bundle never sees it.
import { parseVtt, searchCues, type VttCue } from "@recordmint/shared/vtt";

function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

/**
 * Search within a recording seeks to the match (SPEC.md §14). The
 * transcript is a WebVTT file already served by the player's own `<track>` element
 * (`RecordingViewer`), so this fetches that exact file again and parses
 * it client-side rather than adding a server search endpoint for what is,
 * for a single recording's transcript, a few kilobytes of text.
 */
export function TranscriptSearch({ transcriptUrl }: { transcriptUrl: string }) {
  const [cues, setCues] = useState<VttCue[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch(transcriptUrl)
      .then((response) => response.text())
      .then((text) => setCues(parseVtt(text)))
      .catch(() => setCues([]));
  }, [transcriptUrl]);

  const results = query.trim() ? searchCues(cues, query) : [];

  return (
    <section aria-label="Transcript search">
      <label htmlFor="transcript-search">Search this recording</label>
      <input
        id="transcript-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search the transcript"
      />
      <ul>
        {results.map((cue, index) => (
          <li key={`${cue.startSeconds}-${index}`}>
            <button type="button" data-seek-to={cue.startSeconds}>
              {formatTimestamp(cue.startSeconds)}
            </button>{" "}
            {cue.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
