import { listWorkspacesForUser, recordingVisibilityEnum } from "@recordmint/db";
import Link from "next/link";
import { getCurrentUser } from "../../auth/session";
import { LibraryList } from "../../features/recording/presentation/LibraryList";
import { getDb } from "../../lib/db";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: { workspaceId?: string };
}

/**
 * `/library` — the signed-in library: a viewer's own recordings,
 * searchable, sorted, each linked to its player page.
 */
export default async function LibraryPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <main className="library-container">
        <div className="state-card">
          <h1>Library</h1>
          <p>Sign in to see your recordings.</p>
        </div>
      </main>
    );
  }

  const memberships = await listWorkspacesForUser(getDb().orm, user.id);
  if (memberships.length === 0) {
    return (
      <main className="library-container">
        <div className="state-card">
          <h1>Library</h1>
          <p>You do not belong to a workspace yet.</p>
        </div>
      </main>
    );
  }

  const selected =
    memberships.find((row) => row.workspace.id === searchParams.workspaceId) ?? memberships[0]!;

  return (
    <main className="library-container">
      <div className="page-header">
        <div className="page-title-group">
          <h1>Library</h1>
          <span className="workspace-badge">{selected.workspace.name}</span>
        </div>
        <div className="page-actions">
          <Link href="/record" className="btn btn-primary">
            Record
          </Link>
          <Link href="/settings" className="btn btn-secondary">
            Settings
          </Link>
        </div>
      </div>
      {memberships.length > 1 ? (
        <nav aria-label="Workspaces" className="workspace-nav">
          <ul className="workspace-tabs">
            {memberships.map((row) => (
              <li key={row.workspace.id}>
                {row.workspace.id === selected.workspace.id ? (
                  <strong className="workspace-tab active">{row.workspace.name}</strong>
                ) : (
                  <Link href={`/library?workspaceId=${row.workspace.id}`} className="workspace-tab">
                    {row.workspace.name}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <LibraryList
        workspaceId={selected.workspace.id}
        membershipRole={selected.role}
        currentUserId={user.id}
        initialRetentionDays={selected.workspace.retentionDays}
        visibilityOptions={recordingVisibilityEnum.enumValues}
      />
    </main>
  );
}
