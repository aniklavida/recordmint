import { listWorkspacesForUser } from "@recordmint/db";
import { getCurrentUser } from "../../auth/session";
import { getDb } from "../../lib/db";
import { RecorderUI } from "../../features/recording/presentation/RecorderUI";

export const dynamic = "force-dynamic";

export default async function RecordPage({ searchParams }: { searchParams: { workspaceId?: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <main>
        <h1>Record</h1>
        <p>Sign in to record.</p>
      </main>
    );
  }

  const memberships = await listWorkspacesForUser(getDb().orm, user.id);
  if (memberships.length === 0) {
    return (
      <main>
        <h1>Record</h1>
        <p>You do not belong to a workspace yet.</p>
      </main>
    );
  }

  const selected =
    memberships.find((row) => row.workspace.id === searchParams.workspaceId) ?? memberships[0]!;

  return (
    <main>
      <div className="page-header">
        <h1>Record</h1>
        <a href="/library">Library</a>
      </div>
      <RecorderUI workspaceId={selected.workspace.id} />
    </main>
  );
}
