"use client";

import { useState, type FormEvent } from "react";

export interface RecordingSettingsUpdate {
  title?: string;
  visibility?: string;
  hasPassword?: boolean;
  expiresAt?: string | null;
}

const VISIBILITY_LABEL: Record<string, string> = {
  private: "Private — workspace members only",
  unlisted: "Unlisted — anyone with the link",
  password: "Password protected — link plus a shared password",
  expiring: "Expiring link — anyone with the link, until it expires",
};

/**
 * How openly each visibility level admits a viewer with no extra proof,
 * read against `authorizeViewerForRecording`'s own rules: `private`
 * requires a workspace membership, `password` requires the shared
 * secret, and `expiring`/`unlisted` both admit anyone holding the link —
 * `expiring` only until its cutoff, `unlisted` forever, which is why it
 * ranks as the most open of the four. An option this component has never
 * seen ranks as maximally open on purpose, so an unrecognised value
 * always triggers the warning rather than silently skipping it.
 */
const VISIBILITY_OPENNESS: Record<string, number> = {
  private: 0,
  password: 1,
  expiring: 2,
  unlisted: 3,
};

function opennessOf(visibility: string): number {
  return visibility in VISIBILITY_OPENNESS ? VISIBILITY_OPENNESS[visibility]! : Number.POSITIVE_INFINITY;
}

function warningFor(target: string): string {
  switch (target) {
    case "unlisted":
      return "Anyone who has the link will be able to watch it — indefinitely, with no password or expiry.";
    case "expiring":
      return "Anyone who has the link will be able to watch it until the expiry you set below.";
    case "password":
      return "Anyone who has the link and the password will be able to watch it.";
    default:
      return "This change makes the recording reachable by more people than it is today.";
  }
}

/**
 * Rename and visibility, in one control, for whoever is allowed to touch
 * this recording — the recording's creator or a workspace owner, the
 * same rule the delete action already enforces server-side. This
 * component only ever renders for a caller the page has already decided
 * may edit; the PATCH endpoint re-checks the same rule regardless, since
 * a client-side render decision is never the access-control boundary.
 */
export function RecordingSettings({
  recordingId,
  title,
  visibility,
  hasPassword,
  expiresAt,
  visibilityOptions,
  onUpdated,
}: {
  recordingId: string;
  title: string;
  visibility: string;
  hasPassword: boolean;
  expiresAt: string | null;
  visibilityOptions: readonly string[];
  onUpdated: (update: RecordingSettingsUpdate) => void;
}) {
  const [titleDraft, setTitleDraft] = useState(title);
  const [savingTitle, setSavingTitle] = useState(false);

  const [visibilityDraft, setVisibilityDraft] = useState(visibility);
  const [passwordInput, setPasswordInput] = useState("");
  const [expiresAtInput, setExpiresAtInput] = useState("");
  const [confirmingVisibility, setConfirmingVisibility] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);

  const [error, setError] = useState<string | null>(null);

  function patchRecording(body: Record<string, unknown>): Promise<{ recording: Record<string, unknown> }> {
    return fetch(`/api/recordings/${recordingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((response) => {
      if (!response.ok) throw new Error("failed");
      return response.json() as Promise<{ recording: Record<string, unknown> }>;
    });
  }

  function handleTitleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setError("A recording needs a title.");
      return;
    }
    setError(null);
    setSavingTitle(true);
    patchRecording({ title: trimmed })
      .then(({ recording }) => onUpdated({ title: recording.title as string }))
      .catch(() => setError("Could not rename that recording."))
      .finally(() => setSavingTitle(false));
  }

  function submitVisibility(): void {
    setError(null);
    if (visibilityDraft === "password" && !hasPassword && !passwordInput.trim()) {
      setError("A password is required to switch to password protection.");
      return;
    }
    if (visibilityDraft === "expiring" && !expiresAt && !expiresAtInput) {
      setError("An expiry date and time is required to switch to an expiring link.");
      return;
    }

    const becomingMorePermissive = visibilityDraft !== visibility && opennessOf(visibilityDraft) > opennessOf(visibility);
    if (becomingMorePermissive && !confirmingVisibility) {
      setConfirmingVisibility(true);
      return;
    }

    const body: Record<string, unknown> = { visibility: visibilityDraft };
    if (passwordInput.trim()) body.password = passwordInput.trim();
    if (visibilityDraft === "expiring" && expiresAtInput) body.expiresAt = new Date(expiresAtInput).toISOString();

    setSavingVisibility(true);
    patchRecording(body)
      .then(({ recording }) => {
        onUpdated({
          visibility: recording.visibility as string,
          hasPassword: recording.hasPassword as boolean,
          expiresAt: recording.expiresAt as string | null,
        });
        setConfirmingVisibility(false);
        setPasswordInput("");
      })
      .catch(() => setError("Could not update visibility."))
      .finally(() => setSavingVisibility(false));
  }

  function handleVisibilitySubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submitVisibility();
  }

  function handleCancelConfirmation(): void {
    setConfirmingVisibility(false);
    setVisibilityDraft(visibility);
  }

  return (
    <div className="recording-settings">
      <form onSubmit={handleTitleSubmit} aria-label="Rename recording">
        <label htmlFor={`title-${recordingId}`}>Title</label>
        <input
          id={`title-${recordingId}`}
          type="text"
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.target.value)}
        />
        <button type="submit" disabled={savingTitle || titleDraft.trim() === title}>
          {savingTitle ? "Saving…" : "Rename"}
        </button>
      </form>

      <form onSubmit={handleVisibilitySubmit} aria-label="Change visibility">
        <label htmlFor={`visibility-${recordingId}`}>Visibility</label>
        <select
          id={`visibility-${recordingId}`}
          value={visibilityDraft}
          onChange={(event) => {
            setVisibilityDraft(event.target.value);
            setConfirmingVisibility(false);
          }}
        >
          {visibilityOptions.map((option) => (
            <option key={option} value={option}>
              {VISIBILITY_LABEL[option] ?? option}
            </option>
          ))}
        </select>

        {visibilityDraft === "password" ? (
          <>
            <label htmlFor={`password-${recordingId}`}>
              {hasPassword ? "New password (leave blank to keep the current one)" : "Password"}
            </label>
            <input
              id={`password-${recordingId}`}
              type="password"
              value={passwordInput}
              onChange={(event) => setPasswordInput(event.target.value)}
            />
          </>
        ) : null}

        {visibilityDraft === "expiring" ? (
          <>
            <label htmlFor={`expires-${recordingId}`}>
              {expiresAt ? "New expiry (leave blank to keep the current one)" : "Expires at"}
            </label>
            <input
              id={`expires-${recordingId}`}
              type="datetime-local"
              value={expiresAtInput}
              onChange={(event) => setExpiresAtInput(event.target.value)}
            />
          </>
        ) : null}

        {confirmingVisibility ? (
          <div className="recording-settings-warning" role="alert">
            <p>{warningFor(visibilityDraft)} This takes effect as soon as you confirm.</p>
            <button type="submit" disabled={savingVisibility}>
              {savingVisibility ? "Saving…" : "Yes, change visibility"}
            </button>
            <button type="button" onClick={handleCancelConfirmation} disabled={savingVisibility}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="submit" disabled={savingVisibility || visibilityDraft === visibility}>
            {savingVisibility ? "Saving…" : "Save visibility"}
          </button>
        )}
      </form>

      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
