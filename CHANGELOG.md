# Changelog

All notable changes to RecordMint are documented here, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **The S3-compatible object store is now SeaweedFS (Apache-2.0), replacing the archived MinIO (AGPL-3.0), whose images could no longer be pulled and whose download endpoints return `410 Gone`.** The `e2e` CI job failed on every branch because of it, and a self-hoster could not pull the store at all. `infra/compose.yaml` now runs `chrislusf/seaweedfs:4.48`, pinned by tag and digest, as a single-process S3 gateway.

  What the application speaks is unchanged: `packages/storage` still talks
  plain S3, and `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and `S3_FORCE_PATH_STYLE` mean
  exactly what they did.

  **Self-hosters must update their `.env`.** The two bootstrap-only store
  credentials that `.env.example` used to carry at the bottom of the file are
  gone — they were the store's *root* user and password, not S3 credentials.
  Use `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` for the store's own
  identity instead; `git diff` against `.env.example` shows exactly which
  lines went. The compose file's own throwaway development credentials
  changed with them, to `recordmintdev` / `recordmint-dev-secret`, and the
  compose default endpoint is now `http://seaweedfs:8333`.

  One application change was needed to make presigned uploads work: the AWS
  SDK signs an optional trailing checksum into the query string of every
  presigned `PUT`, carrying a placeholder value it cannot fill in because the
  browser — not the SDK — writes the body. SeaweedFS reads that placeholder as
  a real digest and answers a multipart part upload with `400 BadDigest`, so
  `createStorageClient` now sets `requestChecksumCalculation: "WHEN_REQUIRED"`
  and the checksum is only sent where an operation genuinely requires one. No
  S3 operation in this codebase does.

### Added

- `infra/seaweedfs/s3-identity.json` — the store's S3 identity file: one named
  identity holding a throwaway local-development key pair, and **no anonymous
  identity**, which is what keeps the bucket private.
- `infra/seaweedfs/bootstrap-bucket.mjs` — idempotent bucket and CORS setup
  through the plain S3 API (`CreateBucket`, `PutBucketCors`), replacing the
  vendor-specific client script. It exposes `ETag` and allows `GET`/`PUT`/`HEAD`
  for the browser, retries while the store is still starting, and can be
  pointed at any S3-compatible endpoint.
- `S3_CORS_ORIGINS` — comma-separated origins the bucket's CORS policy
  allows. Read only by that bootstrap script. Compose defaults it to `*` for
  local development; a real deployment should set its own `PUBLIC_BASE_URL`.

- Product specification, architecture, folder structure, roadmap and release checklist.
- Contributor and agent instructions.
- pnpm workspace skeleton: `apps/web` (Next.js), `apps/worker`, and
  `packages/{recorder,db,storage,shared}`. Each package builds, typechecks
  and has real (if minimal) unit tests.
- `infra/compose.yaml` — Postgres, an S3-compatible object store with bucket
  bootstrap, and the two application processes, all started with
  `docker compose up`.
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

- `postgres:16-alpine` floated across every 16.x patch release. It is now
  pinned to the exact patch (`16.15`) and digest it currently resolves to,
  rather than a floating tag.

Nothing records or uploads yet, so there is no way to create a recording
through the product itself. There is no release.
