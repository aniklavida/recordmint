"use client";

import { useState } from "react";

/**
 * The one per-user setting this product currently has: whether a
 * comment on the viewer's own recording sends them an email. Reads and
 * writes `/api/notification-settings`, which resolves "whose setting"
 * from the signed-in session, never from anything this form sends — so
 * this control can only ever change the account it is rendered for.
 */
export function NotificationSettingsForm({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleToggle(next: boolean): void {
    setEnabled(next);
    setSaved(false);
    setError(null);
    setSaving(true);
    fetch("/api/notification-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newCommentEmailEnabled: next }),
    })
      .then((response) => {
        if (!response.ok) throw new Error("failed");
        return response.json() as Promise<{ newCommentEmailEnabled: boolean }>;
      })
      .then((settings) => {
        setEnabled(settings.newCommentEmailEnabled);
        setSaved(true);
      })
      .catch(() => {
        setEnabled(!next);
        setError("Could not save that change. Please try again.");
      })
      .finally(() => setSaving(false));
  }

  return (
    <form className="notification-settings" aria-label="Notification settings">
      <label htmlFor="new-comment-email-toggle">
        <input
          id="new-comment-email-toggle"
          type="checkbox"
          checked={enabled}
          disabled={saving}
          onChange={(event) => handleToggle(event.target.checked)}
        />
        Email me when someone comments on my recordings
      </label>
      {saving ? <p>Saving…</p> : null}
      {saved && !saving ? <p role="status">Saved.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
