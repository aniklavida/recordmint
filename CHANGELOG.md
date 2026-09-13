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

Nothing records, uploads or plays yet. There is no release.
