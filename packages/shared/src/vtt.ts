export interface VttCue {
  startSeconds: number;
  endSeconds?: number;
  text: string;
}

const TIMESTAMP_PATTERN = /(\d{2}:)?(\d{2}):(\d{2})\.(\d{3})/;

function parseTimestamp(raw: string): number | null {
  const match = TIMESTAMP_PATTERN.exec(raw);
  if (!match) return null;
  const hours = match[1] ? Number(match[1].replace(":", "")) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(match[4]);
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

/**
 * A minimal WebVTT cue parser and writer — just enough to answer "what
 * does this recording's transcript say, and when" for in-recording
 * search and a copyable transcript pane, and to write what the
 * transcription job produces. Not a general WebVTT library: cue settings
 * (position, alignment) are ignored on parse and never emitted on write,
 * because nothing here re-renders styled cues — the player's own
 * `<track>` element does that from the file directly. Lives in
 * `packages/shared` because both `apps/web` (search, playback) and
 * `apps/worker` (writing the file transcription produced) need it.
 */
export function parseVtt(content: string): VttCue[] {
  const cues: VttCue[] = [];
  const blocks = content.replace(/\r\n/g, "\n").split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim().length > 0);
    const cueLineIndex = lines.findIndex((line) => line.includes("-->"));
    if (cueLineIndex === -1) continue; // WEBVTT header, NOTE block, or a blank block

    const cueLine = lines[cueLineIndex]!;
    const [startRaw, endRaw] = cueLine.split("-->").map((part) => part?.trim());
    if (!startRaw) continue;
    const startSeconds = parseTimestamp(startRaw);
    if (startSeconds === null) continue;
    const endSeconds = endRaw ? (parseTimestamp(endRaw) ?? undefined) : undefined;

    const text = lines
      .slice(cueLineIndex + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "") // strip any inline VTT markup tags
      .trim();
    if (!text) continue;

    cues.push({ startSeconds, endSeconds, text });
  }

  return cues;
}

export function searchCues(cues: VttCue[], query: string): VttCue[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return cues.filter((cue) => cue.text.toLowerCase().includes(needle));
}

function formatTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const millis = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
  const pad = (value: number, width = 2): string => String(value).padStart(width, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
}

/** Writes cues back out as a WebVTT file — the transcript job's output format. */
export function formatVtt(cues: VttCue[]): string {
  const body = cues
    .map((cue) => `${formatTimestamp(cue.startSeconds)} --> ${formatTimestamp(cue.endSeconds ?? cue.startSeconds + 2)}\n${cue.text}`)
    .join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}

/** The plain-text concatenation stored on `transcripts.text` for the library's title/transcript search. */
export function cuesToPlainText(cues: VttCue[]): string {
  return cues.map((cue) => cue.text).join(" ");
}
