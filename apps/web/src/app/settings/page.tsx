import { getCurrentUser } from "../../auth/session";
import { getMyNotificationSettings } from "../../features/notification-settings/application/notification-settings";
import { NotificationSettingsForm } from "../../features/notification-settings/presentation/NotificationSettingsForm";

export const dynamic = "force-dynamic";

/**
 * `/settings` — account-level settings for the signed-in user. Only one
 * setting exists here today: the new-comment email toggle. There is no
 * login page in this repository yet (only the API routes exist, same gap
 * `/library` already documents), so a signed-out visitor gets a plain,
 * honest message rather than a broken or silently empty page.
 */
export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <main>
        <h1>Settings</h1>
        <p>Sign in to change your settings.</p>
      </main>
    );
  }

  const settings = await getMyNotificationSettings(user.id);

  return (
    <main>
      <h1>Settings</h1>
      <section>
        <h2>Notifications</h2>
        <NotificationSettingsForm initialEnabled={settings.newCommentEmailEnabled} />
      </section>
    </main>
  );
}
