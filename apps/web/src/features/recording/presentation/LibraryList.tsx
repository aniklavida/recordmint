"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { RecordingSettings, type RecordingSettingsUpdate } from "./RecordingSettings";

export interface LibraryRecording {
  id: string;
  publicId: string;
  creatorId: string;
  title: string;
  description: string | null;
  status: "uploading" | "ready" | "failed";
  failureReason: string | null;
  visibility: "private" | "unlisted" | "password" | "expiring";
  hasPassword: boolean;
  expiresAt: string | null;
  durationSeconds: number | null;
  createdAt: string;
  /**
   * The workspace's own view count for this recording — always present
   * because `GET /api/recordings` only ever returns rows to a caller it
   * has already proven is a workspace member (SPEC.md §6's per-recording
   * view log, surfaced as a plain count). There is no anonymous path
   * through this component at all.
   */
  viewCount: number;
}

type SortKey = "newest" | "oldest" | "title" | "duration";

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function statusLabel(recording: LibraryRecording): string {
  if (recording.status === "uploading") return "In progress";
  if (recording.status === "failed") return recording.failureReason ? `Failed — ${recording.failureReason}` : "Failed";
  return "Ready";
}

function sortRecordings(recordings: LibraryRecording[], sortKey: SortKey): LibraryRecording[] {
  const copy = [...recordings];
  switch (sortKey) {
    case "oldest":
      return copy.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "title":
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case "duration":
      return copy.sort((a, b) => (b.durationSeconds ?? -1) - (a.durationSeconds ?? -1));
    case "newest":
    default:
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

/**
 * The signed-in library (SPEC.md §6): a workspace member's own
 * workspace's recordings, searchable and sortable, each linking to its
 * player page. Retention and delete are the only two actions added here
 * — the ones the API already permits (`PATCH .../retention` for an
 * owner, `DELETE /api/recordings/:id` for a creator or owner) — nothing
 * this page cannot actually carry out server-side.
 */
export function LibraryList({
  workspaceId,
  membershipRole,
  currentUserId,
  initialRetentionDays,
  visibilityOptions,
}: {
  workspaceId: string;
  membershipRole: "owner" | "member" | "viewer";
  currentUserId: string;
  initialRetentionDays: number | null;
  /** The recording_visibility enum's own values, read from the schema by the server page — never a second, hand-kept list. */
  visibilityOptions: readonly string[];
}) {
  const [recordings, setRecordings] = useState<LibraryRecording[] | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [retentionDays, setRetentionDays] = useState<number | null>(initialRetentionDays);
  const [retentionInput, setRetentionInput] = useState(initialRetentionDays?.toString() ?? "");
  const [savingRetention, setSavingRetention] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ workspaceId });
    if (query.trim()) params.set("q", query.trim());
    fetch(`/api/recordings?${params.toString()}`, { signal: controller.signal })
      .then((response) => response.json() as Promise<{ recordings: LibraryRecording[] }>)
      .then((result) => setRecordings(result.recordings ?? []))
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError("Could not load the library.");
      });
    return () => controller.abort();
  }, [workspaceId, query]);

  const sorted = useMemo(() => sortRecordings(recordings ?? [], sortKey), [recordings, sortKey]);

  /** The same rule the PATCH/DELETE endpoints enforce server-side: the recording's creator, or a workspace owner. */
  function canEditRecording(recording: LibraryRecording): boolean {
    return membershipRole === "owner" || recording.creatorId === currentUserId;
  }

  function handleSettingsUpdated(recordingId: string, update: RecordingSettingsUpdate): void {
    setRecordings((previous) =>
      (previous ?? []).map((recording) =>
        recording.id === recordingId
          ? {
              ...recording,
              ...(update.title !== undefined ? { title: update.title } : {}),
              ...(update.visibility !== undefined
                ? { visibility: update.visibility as LibraryRecording["visibility"] }
                : {}),
              ...(update.hasPassword !== undefined ? { hasPassword: update.hasPassword } : {}),
              ...(update.expiresAt !== undefined ? { expiresAt: update.expiresAt } : {}),
            }
          : recording,
      ),
    );
  }

  function handleDelete(recording: LibraryRecording): void {
    if (!window.confirm(`Delete "${recording.title}"? This removes it and its file permanently.`)) return;
    setDeletingId(recording.id);
    setError(null);
    fetch(`/api/recordings/${recording.id}`, { method: "DELETE" })
      .then((response) => {
        if (!response.ok) throw new Error("failed");
        setRecordings((previous) => (previous ?? []).filter((r) => r.id !== recording.id));
      })
      .catch(() => setError("Could not delete that recording."))
      .finally(() => setDeletingId(null));
  }

  function handleRetentionSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = retentionInput.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed <= 0)) {
      setError("Retention must be a whole number of days, or left blank to keep forever.");
      return;
    }
    setSavingRetention(true);
    setError(null);
    fetch(`/api/workspaces/${workspaceId}/retention`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retentionDays: parsed }),
    })
      .then((response) => {
        if (!response.ok) throw new Error("failed");
        return response.json() as Promise<{ workspace: { retentionDays: number | null } }>;
      })
      .then((result) => setRetentionDays(result.workspace.retentionDays))
      .catch(() => setError("Could not update retention."))
      .finally(() => setSavingRetention(false));
  }

  return (
    <div className="library">
      <form
        className="library-controls"
        onSubmit={(event) => event.preventDefault()}
        role="search"
      >
        <label htmlFor="library-search">Search</label>
        <input
          id="library-search"
          type="search"
          placeholder="Search by title or transcript"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <label htmlFor="library-sort">Sort by</label>
        <select id="library-sort" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="title">Title</option>
          <option value="duration">Duration</option>
        </select>
      </form>

      {membershipRole === "owner" ? (
        <form className="library-retention" onSubmit={handleRetentionSubmit}>
          <label htmlFor="retention-days">Retention (days, blank = keep forever)</label>
          <input
            id="retention-days"
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="Keep forever"
            value={retentionInput}
            onChange={(event) => setRetentionInput(event.target.value)}
          />
          <button type="submit" disabled={savingRetention}>
            {savingRetention ? "Saving…" : "Save retention"}
          </button>
          <p>Current: {retentionDays ? `${retentionDays} days` : "Keep forever"}</p>
        </form>
      ) : null}

      {error ? <p role="alert">{error}</p> : null}

      {recordings === null ? (
        <p>Loading…</p>
      ) : sorted.length === 0 ? (
        <p>No recordings match yet.</p>
      ) : (
        <ul className="library-list">
          {sorted.map((recording) => (
            <li key={recording.id}>
              <a href={`/v/${recording.publicId}`}>{recording.title}</a>
              <p>
                {statusLabel(recording)} · {formatDuration(recording.durationSeconds)} · {recording.visibility} ·{" "}
                {formatDate(recording.createdAt)} · {recording.viewCount} view{recording.viewCount === 1 ? "" : "s"}
              </p>
              {canEditRecording(recording) ? (
                <>
                  <details>
                    <summary>Edit</summary>
                    <RecordingSettings
                      recordingId={recording.id}
                      title={recording.title}
                      visibility={recording.visibility}
                      hasPassword={recording.hasPassword}
                      expiresAt={recording.expiresAt}
                      visibilityOptions={visibilityOptions}
                      onUpdated={(update) => handleSettingsUpdated(recording.id, update)}
                    />
                  </details>
                  <button type="button" onClick={() => handleDelete(recording)} disabled={deletingId === recording.id}>
                    {deletingId === recording.id ? "Deleting…" : "Delete"}
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
