import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMembership, getRecordingByPublicId, recordingVisibilityEnum } from "@recordmint/db";
import { getCurrentUser } from "../../../auth/session";
import { getViewCountForMember } from "../../../features/playback/application/view-count";
import { resolveForViewer } from "../../../features/playback/application/resolve";
import { InProgress } from "../../../features/playback/presentation/InProgress";
import { PasswordGate } from "../../../features/playback/presentation/PasswordGate";
import { RecordingViewer } from "../../../features/playback/presentation/RecordingViewer";
import { getDb } from "../../../lib/db";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { publicId: string };
}

/**
 * Emits Open Graph metadata so a pasted link unfurls with a title and a
 * poster — a share link that does not unfurl looks broken, which is why
 * this page is server-rendered at all (docs/ARCHITECTURE.md). Deliberately
 * only ever resolves without a password: an og:image behind a password
 * wall is not something this function should mint a credential for just
 * to render a preview nobody typed a password to see.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolution = await resolveForViewer({ publicId: params.publicId });
  if (resolution.state === "not_found") {
    return { title: "Recording not found — RecordMint" };
  }
  if (resolution.state === "ready") {
    return {
      title: resolution.recording.title,
      description: resolution.recording.description ?? undefined,
      openGraph: {
        title: resolution.recording.title,
        description: resolution.recording.description ?? undefined,
        type: "video.other",
        ...(resolution.posterUrl ? { images: [resolution.posterUrl] } : {}),
      },
    };
  }
  return { title: resolution.title || "RecordMint recording" };
}

/**
 * `/v/<publicId>` — SPEC.md §11's playback path. Server-rendered so it
 * can resolve visibility and mint a read URL before anything reaches the client, and
 * so the metadata above can run without a second round trip.
 */
export default async function PlayerPage({ params }: PageProps) {
  const user = await getCurrentUser();
  const resolution = await resolveForViewer({ publicId: params.publicId, viewerUserId: user?.id ?? null });

  if (resolution.state === "not_found") {
    notFound();
  }

  if (resolution.state === "password_required") {
    return (
      <main>
        <PasswordGate publicId={params.publicId} title={resolution.title} incorrect={resolution.incorrect} isAuthenticated={Boolean(user)} />
      </main>
    );
  }

  if (resolution.state === "in_progress") {
    return (
      <main>
        <InProgress publicId={params.publicId} title={resolution.title} isAuthenticated={Boolean(user)} />
      </main>
    );
  }

  // Beyond this point the recording is "ready" and a full row lookup is
  // cheap to justify: it only ever runs for a signed-in viewer, and only
  // to decide two members-only things — whether this viewer may edit the
  // recording, and whether to show its view count. A guest never reaches
  // this branch, so a guest never causes this query at all.
  let canEdit = false;
  let viewCount: number | null = null;
  let settingsProps: { visibility: string; hasPassword: boolean; expiresAt: string | null } | null = null;

  if (user) {
    const recordingRow = await getRecordingByPublicId(getDb().orm, params.publicId);
    if (recordingRow) {
      const membership = await getMembership(getDb().orm, { workspaceId: recordingRow.workspaceId, userId: user.id });
      canEdit = Boolean(membership && (membership.role === "owner" || recordingRow.creatorId === user.id));
      if (canEdit) {
        settingsProps = {
          visibility: recordingRow.visibility,
          hasPassword: recordingRow.passwordHash !== null,
          expiresAt: recordingRow.expiresAt ? recordingRow.expiresAt.toISOString() : null,
        };
      }
      viewCount = await getViewCountForMember({
        workspaceId: recordingRow.workspaceId,
        recordingId: recordingRow.id,
        viewerUserId: user.id,
      });
    }
  }

  return (
    <main>
      <RecordingViewer
        publicId={params.publicId}
        playUrl={resolution.playUrl}
        posterUrl={resolution.posterUrl}
        captionsSrc={resolution.transcriptUrl}
        title={resolution.recording.title}
        description={resolution.recording.description}
        guestCommentingEnabled={resolution.guestCommentingEnabled}
        isAuthenticated={Boolean(user)}
        viewCount={viewCount}
        settings={
          settingsProps
            ? {
                recordingId: resolution.recording.id,
                visibility: settingsProps.visibility,
                hasPassword: settingsProps.hasPassword,
                expiresAt: settingsProps.expiresAt,
                visibilityOptions: recordingVisibilityEnum.enumValues,
              }
            : null
        }
      />
    </main>
  );
}
