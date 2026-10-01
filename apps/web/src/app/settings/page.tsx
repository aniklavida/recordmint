import { getCurrentUser } from "../../auth/session";
import { getMyNotificationSettings } from "../../features/notification-settings/application/notification-settings";
import { NotificationSettingsForm } from "../../features/notification-settings/presentation/NotificationSettingsForm";

export const dynamic = "force-dynamic";

/**
 * `/settings` — account-level settings for the signed-in user.
 */
export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <main className="settings-container">
        <div className="state-card">
          <h1>Settings</h1>
          <p>Sign in to change your settings.</p>
        </div>
      </main>
    );
  }

  const settings = await getMyNotificationSettings(user.id);

  return (
    <main className="settings-container">
      <div className="page-header">
        <h1>Settings</h1>
      </div>
      <section className="settings-section">
        <div className="section-header">
          <h2>Notifications</h2>
          <p className="section-desc">Manage how you receive alerts and updates about your recordings.</p>
        </div>
        <div className="settings-card">
          <NotificationSettingsForm initialEnabled={settings.newCommentEmailEnabled} />
        </div>
      </section>
    </main>
  );
}
