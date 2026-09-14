"use client";

import { useState } from "react";
import { RecordingViewer } from "./RecordingViewer";

interface ReadyPayload {
  state: "ready";
  recording: { id: string; title: string; description: string | null };
  playUrl: string;
  posterUrl: string | null;
  transcriptUrl: string | null;
  guestCommentingEnabled: boolean;
}

interface PasswordRequiredPayload {
  state: "password_required";
  title: string;
  incorrect: boolean;
}

type UnlockResponse = ReadyPayload | PasswordRequiredPayload | { state: "not_found" | "in_progress" };

/**
 * A password-visibility recording cannot be server-rendered past this
 * point — the page does not know the password. This client component
 * posts it to the resolver route and swaps itself for the real player
 * once the store confirms it, without ever putting the password in a URL
 * or query string.
 */
export function PasswordGate({
  publicId,
  title,
  incorrect: initiallyIncorrect,
  isAuthenticated,
}: {
  publicId: string;
  title: string;
  incorrect: boolean;
  isAuthenticated: boolean;
}) {
  const [payload, setPayload] = useState<UnlockResponse | null>(null);
  const [incorrect, setIncorrect] = useState(initiallyIncorrect);
  const [submitting, setSubmitting] = useState(false);

  if (payload?.state === "ready") {
    return (
      <RecordingViewer
        publicId={publicId}
        playUrl={payload.playUrl}
        posterUrl={payload.posterUrl}
        captionsSrc={payload.transcriptUrl}
        title={payload.recording.title}
        guestCommentingEnabled={payload.guestCommentingEnabled}
        isAuthenticated={isAuthenticated}
      />
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const password = new FormData(form).get("password");
        setSubmitting(true);
        fetch(`/api/public/recordings/${publicId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        })
          .then((response) => response.json() as Promise<UnlockResponse>)
          .then((result) => {
            setSubmitting(false);
            if (result.state === "password_required") {
              setIncorrect(result.incorrect);
              return;
            }
            setPayload(result);
          })
          .catch(() => setSubmitting(false));
      }}
    >
      <p>{title} is password-protected.</p>
      <label htmlFor="recording-password">Password</label>
      <input id="recording-password" name="password" type="password" required autoFocus />
      <button type="submit" disabled={submitting}>
        {submitting ? "Checking…" : "Watch"}
      </button>
      {incorrect ? <p role="alert">That password is not correct.</p> : null}
    </form>
  );
}
