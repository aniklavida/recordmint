import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "../../../auth/session";
import { resolveForViewer } from "../../../features/playback/application/resolve";
import { InProgress } from "../../../features/playback/presentation/InProgress";
import { PasswordGate } from "../../../features/playback/presentation/PasswordGate";
import { RecordingViewer } from "../../../features/playback/presentation/RecordingViewer";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { publicId: string };
}

/**
 * Emits Open Graph metadata so a pasted link unfurls with a title and a
 * poster (SPEC.md §9's "the link unfurls" acceptance line). Deliberately
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
 * `/v/<publicId>` — SPEC.md §9. Server-rendered so it can resolve
 * visibility and mint a read URL before anything reaches the client, and
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

  return (
    <main>
      <h1>{resolution.recording.title}</h1>
      {resolution.recording.description ? <p>{resolution.recording.description}</p> : null}
      <RecordingViewer
        publicId={params.publicId}
        playUrl={resolution.playUrl}
        posterUrl={resolution.posterUrl}
        captionsSrc={resolution.transcriptUrl}
        title={resolution.recording.title}
        guestCommentingEnabled={resolution.guestCommentingEnabled}
        isAuthenticated={Boolean(user)}
      />
    </main>
  );
}
