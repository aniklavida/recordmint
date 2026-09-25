/**
 * The object layout, defined exactly once.
 *
 * Every recording gets one prefix, so deleting a recording is one prefix
 * delete and a retention sweep is one list-and-delete. Build a key
 * anywhere else in the codebase and deletion starts leaving orphans that
 * nobody notices until the storage bill arrives — so nothing outside this
 * file may concatenate a recording's object path.
 */

function recordingPrefix(recordingId: string): string {
  return `recordings/${recordingId}`;
}

export function originalKey(recordingId: string, ext: string): string {
  return `${recordingPrefix(recordingId)}/original.${ext}`;
}

export function posterKey(recordingId: string): string {
  return `${recordingPrefix(recordingId)}/poster.jpg`;
}

export function trimmedKey(recordingId: string, ext: string): string {
  return `${recordingPrefix(recordingId)}/trimmed.${ext}`;
}

export function transcriptKey(recordingId: string): string {
  return `${recordingPrefix(recordingId)}/transcript.vtt`;
}

/** Every object belonging to a recording lives under this prefix. */
export function recordingKeyPrefix(recordingId: string): string {
  return `${recordingPrefix(recordingId)}/`;
}
