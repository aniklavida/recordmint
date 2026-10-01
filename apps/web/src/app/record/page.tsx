import { listWorkspacesForUser } from "@recordmint/db";
import Link from "next/link";
import { getCurrentUser } from "../../auth/session";
import { getDb } from "../../lib/db";
import { RecorderUI } from "../../features/recording/presentation/RecorderUI";

export const dynamic = "force-dynamic";

export default async function RecordPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  const { workspaceId } = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    return (
      <main className="record-container">
        <div className="state-card">
          <h1>Record</h1>
          <p>Sign in to record.</p>
        </div>
      </main>
    );
  }

  const memberships = await listWorkspacesForUser(getDb().orm, user.id);
  if (memberships.length === 0) {
    return (
      <main className="record-container">
        <div className="state-card">
          <h1>Record</h1>
          <p>You do not belong to a workspace yet.</p>
        </div>
      </main>
    );
  }

  const selected =
    memberships.find((row) => row.workspace.id === workspaceId) ?? memberships[0]!;

  return (
    <main className="record-container">
      <div className="page-header">
        <h1>Record</h1>
        <Link href="/library" className="btn btn-secondary">Library</Link>
      </div>
      <RecorderUI workspaceId={selected.workspace.id} />
    </main>
  );
}
