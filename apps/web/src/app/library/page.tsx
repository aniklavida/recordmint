import { listWorkspacesForUser, recordingVisibilityEnum } from "@recordmint/db";
import { getCurrentUser } from "../../auth/session";
import { LibraryList } from "../../features/recording/presentation/LibraryList";
import { getDb } from "../../lib/db";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: { workspaceId?: string };
}

/**
 * `/library` — the signed-in library (SPEC.md §6): a viewer's own
 * recordings, searchable, sorted, each linked to its player page. There
 * is no login page in this repository yet (only the API routes exist),
 * so an unauthenticated visitor gets a plain, honest message rather than
 * a broken or silently empty page.
 */
export default async function LibraryPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <main>
        <h1>Library</h1>
        <p>Sign in to see your recordings.</p>
      </main>
    );
  }

  const memberships = await listWorkspacesForUser(getDb().orm, user.id);
  if (memberships.length === 0) {
    return (
      <main>
        <h1>Library</h1>
        <p>You do not belong to a workspace yet.</p>
      </main>
    );
  }

  const selected =
    memberships.find((row) => row.workspace.id === searchParams.workspaceId) ?? memberships[0]!;

  return (
    <main>
      <h1>Library</h1>
      {memberships.length > 1 ? (
        <nav aria-label="Workspaces">
          <ul>
            {memberships.map((row) => (
              <li key={row.workspace.id}>
                {row.workspace.id === selected.workspace.id ? (
                  <strong>{row.workspace.name}</strong>
                ) : (
                  <a href={`/library?workspaceId=${row.workspace.id}`}>{row.workspace.name}</a>
                )}
              </li>
            ))}
          </ul>
        </nav>
      ) : (
        <p>{selected.workspace.name}</p>
      )}
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
