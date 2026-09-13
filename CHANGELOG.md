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

### Fixed

- `infra/compose.yaml` pinned `minio/minio:latest` and `minio/mc:latest` on
  Docker Hub. Both tags — and the `minio/minio` and `minio/mc` Docker Hub
  repositories themselves — no longer exist; MinIO discontinued free Docker
  Hub distribution during 2025. Repointed both images to their last publicly
  available `quay.io` releases, pinned by tag and digest. `postgres:16-alpine`
  is now pinned to the exact patch and digest it currently resolves to,
  rather than floating across every 16.x release.

Nothing records, uploads or plays yet. There is no release.
