# Changelog

All notable changes to RecordMint are documented here, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Product specification, architecture, folder structure, roadmap and release checklist.
- Contributor and agent instructions.
- pnpm workspace skeleton: `apps/web` (Next.js), `apps/worker`, and
  `packages/{recorder,db,storage,shared}`. Each package builds, typechecks
  and has real (if minimal) unit tests.
- `infra/compose.yaml` — Postgres, MinIO with bucket bootstrap, and the two
  application processes, all started with `docker compose up`.
- `.env.example` naming every configuration variable.
- CI: build, lint, typecheck, unit tests, a dependency-direction check that
  keeps `packages/recorder` framework-free, and a Playwright job driving a
  fake capture device.
- `/api/health` reporting database reachability, storage reachability and
  whether transcription is enabled.
- `docs/THIRD_PARTY_LICENSES.md` — a licence-and-version inventory of every
  shipped npm package (direct and transitive) and every pinned container
  image, verified against package metadata and licence files rather than
  memory, split by the two-class rule (compiled vs. separate process).
- `THIRD_PARTY_NOTICES` — attribution for shipped MIT/Apache/BSD dependencies.
- `scripts/check-licenses.mjs`, run in CI, which fails the build if a
  dependency with a disallowed licence lands, or if a container image in
  `infra/compose.yaml` is left unpinned.
- Accounts, workspaces and the recording library: email/password signup
  and login with Argon2id hashing, an httpOnly `SameSite=Lax` session
  cookie and no refresh token, workspace invitations, owner-only retention
  settings, and a library that searches by title and (once transcription
  produces one) transcript text.
- The player page at `/v/<publicId>`: server-rendered, resolves link
  visibility (`private`, `unlisted`, `password`, `expiring`) before
  minting a short-lived presigned read, emits Open Graph metadata so a
  pasted link unfurls, and shows an honest "still recording" state for a
  link created before the recording finished uploading. Plyr wraps the
  video; a transcript, when one exists, drives captions and an
  in-recording search panel.
- Timestamped comments, threaded one level deep, from a workspace member
  or — only where a recording's owner has explicitly enabled it — a
  guest supplying a display name. Downloading the original file is a
  presigned read with a different disposition, not a separate export.
- A new-comment email to a recording's own creator, sent through the
  worker's existing queue rather than inline in the comment request, so a
  mail outage never fails a comment. Never sent for the creator's own
  comment; a burst of comments on the same recording within a five-minute
  window lands in one email, not one per comment; on by default and
  togglable per user; carries the recording title, the commenter's name
  (or "a guest"), the comment's timestamp in the video, and a plain link
  to the player page — never a presigned storage URL, a session or reset
  token, or the commenter's email address.
- The worker's thumbnail job (a real `ffmpeg` subprocess extracting a
  poster frame), transcript job (whisper.cpp/faster-whisper on the host;
  a missing binary marks the transcript row `failed` without retrying
  forever, since retrying cannot make an uninstalled binary appear), and
  an hourly retention sweep that deletes recordings past a workspace's
  retention policy and cleans up multipart uploads abandoned mid-flight.
  Every queue has a dead-letter path.
- 109 automated tests across the workspace (103 run, 6 skip cleanly
  without a live S3 endpoint), most run against a real throwaway Postgres
  cluster and, for the worker's media jobs, a real `ffmpeg` subprocess —
  not mocks of either.

### Fixed

- `infra/compose.yaml` pinned `minio/minio:latest` and `minio/mc:latest` on
  Docker Hub. Both tags — and the `minio/minio` and `minio/mc` Docker Hub
  repositories themselves — no longer exist; MinIO discontinued free Docker
  Hub distribution during 2025. Repointed both images to their last publicly
  available `quay.io` releases, pinned by tag and digest. `postgres:16-alpine`
  is now pinned to the exact patch and digest it currently resolves to,
  rather than floating across every 16.x release.

Nothing records or uploads yet, so there is no way to create a recording
through the product itself. There is no release.
