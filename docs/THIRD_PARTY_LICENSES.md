# Third-party licence audit

**Last verified: 2026-09-15.** This inventory is regenerated and re-checked at every release, not trusted from a prior note — see [`scripts/check-licenses.mjs`](../scripts/check-licenses.mjs), which CI runs on every push and pull request.

## Why this file exists

RecordMint's licence is **MIT**, and that is the commercial argument for the whole project: an organisation can run RecordMint inside a closed product without opening its own source. A single copyleft dependency compiled into the shipped code would make that promise false. This file is the evidence that it isn't.

## The two-class rule

| Class | Rule |
|---|---|
| **Compiled into shipped code** | MIT, Apache-2.0 or BSD only. No exceptions, regardless of quality. |
| **Run as a separate process** | Copyleft is acceptable — it never reaches user code. |

Anything reciprocal-for-consumers in the compiled class — RPL, SSPL, RSAL, BSL, or a revenue-gated commercial licence — is rejected regardless of quality, per [`AGENTS.md`](../AGENTS.md#dependencies).

**Browser capture needs no dependency at all.** `getDisplayMedia` and `MediaRecorder` are web platform APIs, not libraries — one reason the compiled list below is short for what the product does.

## Methodology

Every entry was checked against the package's own published metadata or licence file, not an aggregator or memory:

- **npm packages** — resolved from the committed `pnpm-lock.yaml` against the installed `node_modules` tree with `pnpm licenses list --json`, which reads each package's own `package.json` `license` field. The eight direct, most consequential compiled dependencies (`next`, `react`, `react-dom`, `drizzle-orm`, `pg-boss`, `postgres`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `nanoid`) were additionally spot-checked by reading the bundled `LICENSE` file text in `node_modules` directly.
- **Container images** — resolved from the image tag's registry manifest digest (Docker Hub / quay.io API), and the licence read from the project's own `LICENSE` file in its source repository at the corresponding release tag.
- **`(†)`** marks the `@next/swc-*` platform binaries that are optional per-architecture builds of the Next.js compiler. Only the host-matching one (`@next/swc-darwin-arm64` on this development machine) is actually installed; the others were verified directly against their published npm registry metadata, which carries the same MIT licence as the rest of the Next.js release.

## Compiled class — shipped in `apps/web` and `apps/worker`

84 packages, direct and transitive, across every `dependencies` (not `devDependencies`) entry in the six workspace members (`apps/web`, `apps/worker`, `packages/db`, `packages/storage`, `packages/shared`, `packages/recorder`). **All are MIT, MIT-0, Apache-2.0, BSD-3-Clause, ISC, Unlicense, 0BSD, or dual-licensed MIT/CC0-1.0 — every one clears the compiled-class bar.** `caniuse-lite`'s CC-BY-4.0 covers only its bundled browser-compatibility *data* (used at build time by Next.js/`browserslist`, not executed at runtime); see [Attribution](#attribution) below for what that requires. `nodemailer` is the one dependency in this table under **MIT-0** ("MIT No Attribution"): its own bundled `LICENSE` carries the standard MIT text with the attribution/notice-inclusion clause removed, which is strictly more permissive than MIT, not less — verified 14 Sep 2026 by reading `node_modules/nodemailer/LICENSE` directly.

Direct production dependencies, by workspace member:

| Workspace | Dependency | Version (`package.json`) | Licence |
|---|---|---|---|
| `apps/web` | `next` | ^14.2.13 | MIT |
| `apps/web` | `pg-boss` | ^10.1.5 | MIT |
| `apps/web` | `react` | ^18.3.1 | MIT |
| `apps/web` | `react-dom` | ^18.3.1 | MIT |
| `apps/worker` | `pg-boss` | ^10.1.5 | MIT |
| `packages/db` | `drizzle-orm` | ^0.45.2 | Apache-2.0 |
| `packages/db` | `pg-boss` | ^10.1.5 | MIT |
| `packages/db` | `postgres` | ^3.4.4 | Unlicense |
| `packages/storage` | `@aws-sdk/client-s3` | ^3.658.1 | Apache-2.0 |
| `packages/storage` | `@aws-sdk/s3-request-presigner` | ^3.658.1 | Apache-2.0 |
| `packages/shared` | `nanoid` | ^5.0.7 | MIT |
| `packages/shared` | `nodemailer` | ^10.0.9 | MIT-0 |
| `packages/recorder` | *(none — web platform APIs only)* | — | — |

Full transitive compiled-class tree (package, resolved version, licence), verified 2026-09-13:

| Package | Version | Licence |
|---|---|---|
| `@aws-sdk/checksums` | 3.1001.0 | Apache-2.0 |
| `@aws-sdk/client-s3` | 3.1131.0 | Apache-2.0 |
| `@aws-sdk/core` | 3.978.0 | Apache-2.0 |
| `@aws-sdk/credential-provider-env` | 3.972.71 | Apache-2.0 |
| `@aws-sdk/credential-provider-http` | 3.972.73 | Apache-2.0 |
| `@aws-sdk/credential-provider-ini` | 3.973.16 | Apache-2.0 |
| `@aws-sdk/credential-provider-login` | 3.972.78 | Apache-2.0 |
| `@aws-sdk/credential-provider-node` | 3.972.83 | Apache-2.0 |
| `@aws-sdk/credential-provider-process` | 3.972.71 | Apache-2.0 |
| `@aws-sdk/credential-provider-sso` | 3.973.15 | Apache-2.0 |
| `@aws-sdk/credential-provider-web-identity` | 3.972.77 | Apache-2.0 |
| `@aws-sdk/middleware-sdk-s3` | 3.972.76 | Apache-2.0 |
| `@aws-sdk/nested-clients` | 3.997.45 | Apache-2.0 |
| `@aws-sdk/s3-request-presigner` | 3.1131.0 | Apache-2.0 |
| `@aws-sdk/signature-v4-multi-region` | 3.996.46 | Apache-2.0 |
| `@aws-sdk/token-providers` | 3.1129.0 | Apache-2.0 |
| `@aws-sdk/types` | 3.974.5 | Apache-2.0 |
| `@aws-sdk/xml-builder` | 3.972.40 | Apache-2.0 |
| `@aws/lambda-invoke-store` | 0.3.0 | Apache-2.0 |
| `@next/env` | 14.2.35 | MIT |
| `@next/swc-darwin-arm64` | 14.2.33 | MIT |
| `@next/swc-darwin-x64` | 14.2.33 | MIT † |
| `@next/swc-linux-arm64-gnu` | 14.2.33 | MIT † |
| `@next/swc-linux-arm64-musl` | 14.2.33 | MIT † |
| `@next/swc-linux-x64-gnu` | 14.2.33 | MIT † |
| `@next/swc-linux-x64-musl` | 14.2.33 | MIT † |
| `@next/swc-win32-arm64-msvc` | 14.2.33 | MIT † |
| `@next/swc-win32-ia32-msvc` | 14.2.33 | MIT † |
| `@next/swc-win32-x64-msvc` | 14.2.33 | MIT † |
| `@playwright/test` | 1.63.0 | Apache-2.0 |
| `@smithy/core` | 3.34.1 | Apache-2.0 |
| `@smithy/credential-provider-imds` | 4.5.2 | Apache-2.0 |
| `@smithy/fetch-http-handler` | 5.8.0 | Apache-2.0 |
| `@smithy/node-http-handler` | 4.12.1 | Apache-2.0 |
| `@smithy/signature-v4` | 5.7.3 | Apache-2.0 |
| `@smithy/types` | 4.18.0 | Apache-2.0 |
| `@swc/counter` | 0.1.3 | Apache-2.0 |
| `@swc/helpers` | 0.5.5 | Apache-2.0 |
| `@types/prop-types` | 15.7.15 | MIT |
| `@types/react` | 18.3.31 | MIT |
| `bowser` | 2.14.1 | MIT |
| `busboy` | 1.6.0 | MIT |
| `caniuse-lite` | 1.0.30001810 | CC-BY-4.0 |
| `client-only` | 0.0.1 | MIT |
| `cron-parser` | 4.9.0 | MIT |
| `csstype` | 3.2.3 | MIT |
| `drizzle-orm` | 0.45.2 | Apache-2.0 |
| `graceful-fs` | 4.2.11 | ISC |
| `js-tokens` | 4.0.0 | MIT |
| `loose-envify` | 1.4.0 | MIT |
| `luxon` | 3.7.2 | MIT |
| `nanoid` | 3.3.19 | MIT |
| `nanoid` | 5.1.16 | MIT |
| `next` | 14.2.35 | MIT |
| `nodemailer` | 10.0.9 | MIT-0 |
| `pg` | 8.23.0 | MIT |
| `pg-boss` | 10.4.2 | MIT |
| `pg-cloudflare` | 1.4.0 | MIT |
| `pg-connection-string` | 2.14.0 | MIT |
| `pg-int8` | 1.0.1 | ISC |
| `pg-pool` | 3.14.0 | MIT |
| `pg-protocol` | 1.16.0 | MIT |
| `pg-types` | 2.2.0 | MIT |
| `pgpass` | 1.0.5 | MIT |
| `picocolors` | 1.1.1 | ISC |
| `playwright` | 1.63.0 | Apache-2.0 |
| `playwright-core` | 1.63.0 | Apache-2.0 |
| `postcss` | 8.4.31 | MIT |
| `postgres` | 3.4.9 | Unlicense |
| `postgres-array` | 2.0.0 | MIT |
| `postgres-bytea` | 1.0.1 | MIT |
| `postgres-date` | 1.0.7 | MIT |
| `postgres-interval` | 1.2.0 | MIT |
| `react` | 18.3.1 | MIT |
| `react-dom` | 18.3.1 | MIT |
| `scheduler` | 0.23.2 | MIT |
| `serialize-error` | 8.1.0 | MIT |
| `source-map-js` | 1.2.1 | BSD-3-Clause |
| `split2` | 4.2.0 | ISC |
| `streamsearch` | 1.1.0 | MIT |
| `styled-jsx` | 5.1.1 | MIT |
| `tslib` | 2.8.1 | 0BSD |
| `type-fest` | 0.20.2 | (MIT OR CC0-1.0) |
| `xtend` | 4.0.2 | MIT |

## Build and CI tooling — held to the same bar, because it ships too

**Finding, corrected in this audit:** an earlier version of this file assumed `eslint`, `typescript`, `vitest`, `@playwright/test`'s own harness dependencies, `dependency-cruiser`, `tsx`, `drizzle-kit` and everything they pull in (198 unique packages across all six workspace members' `devDependencies`, transitively) "never enter a built artifact" because they are `devDependencies`. That is false for how this repository actually builds its images: `infra/Dockerfile.web` and `infra/Dockerfile.worker` both run `pnpm install --frozen-lockfile` with no `--prod` flag, then `COPY --from=build /app ./` copies the entire built tree — including the full `node_modules` — into the final `runner` stage. Nothing is pruned. A self-hoster's container image genuinely contains this class, not just the one above.

Since nothing here is actually separated from the compiled class by the time it reaches a shipped image, it is audited to the identical rule: MIT, Apache-2.0 or BSD only, no exception for being a `devDependency`. **All 198 are MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, Python-2.0 or BlueOak-1.0.0** — every one already clears the bar, so this correction changes what the file claims, not what a self-hoster is exposed to. [`scripts/check-licenses.mjs`](../scripts/check-licenses.mjs) enforces this directly: it does not distinguish `dependencies` from `devDependencies` at all, and checks every package pnpm actually resolved. Reproduce the human-readable table with `pnpm licenses list --json` from a clean install.

Trimming the final image down to a production-only `node_modules` (so this class stops shipping at all) is a real improvement worth making, but it is an image-size and attack-surface question, not a licence one — every package in it already passes the class rule — so it is left for a separate change rather than folded into this audit.

## Process class — Docker images in `infra/compose.yaml`

Started as separate operating-system processes by `docker compose`. RecordMint never links against these; the worker calls MinIO over the S3 API, and the app talks to Postgres over the wire protocol. Copyleft here does not reach shipped code.

| Image | Pinned tag + digest | Licence | Verified |
|---|---|---|---|
| `postgres` | `16.15-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685` | PostgreSQL Licence (permissive, OSI-approved) | 2026-09-13 |
| `quay.io/minio/minio` | `RELEASE.2025-09-07T16-13-09Z@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e` | AGPL-3.0 — **process only, never linked** | 2026-09-13 |
| `quay.io/minio/mc` | `RELEASE.2025-08-13T08-35-41Z@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727` | AGPL-3.0 — **process only, never linked**, used solely to run the one-shot bucket-bootstrap script | 2026-09-13 |

**Finding, fixed in this audit:** `infra/compose.yaml` previously pinned `minio/minio:latest` and `minio/mc:latest` on Docker Hub. Both tags — and the entire `minio/minio` and `minio/mc` Docker Hub repositories — return `404 object not found` as of 2026-09-13; MinIO's maintainers discontinued free Docker Hub distribution during 2025. The images are still published to `quay.io/minio/minio` and `quay.io/minio/mc`, where the most recent publicly available release is pinned above by tag and digest. This was a broken/unpinned reference, not a licence problem — AGPL-3.0 remains acceptable for a process-class dependency — and has been corrected directly, since a compose file that cannot pull is not a product decision. Whether to keep depending on a registry that may freeze again, mirror the image ourselves, or evaluate an alternative S3-compatible server long-term is a separate open question and is outside the scope of a licence audit.

`postgres:16-alpine` previously floated across every 16.x patch release; it is now pinned to the exact patch (`16.15`) and digest that `16-alpine` currently resolves to.

### Planned, not yet shipped

`docs/SPEC.md` and `README.md` describe `ffmpeg` (poster frames, optional recompression, optional remux, start/end stream-copy trim) and `whisper.cpp` / `faster-whisper` (transcription) as process-class dependencies. **Neither appears in `infra/Dockerfile.worker`, `infra/compose.yaml`, or any `package.json` today** — there is no `apt-get install ffmpeg` or whisper binary. The worker invokes an operator-provided ffmpeg binary as a separate process, never a linked library; its GPL/LGPL obligations do not reach shipped code. The exact binary version and licence therefore remain an operator deployment concern until a Dockerfile or compose service installs and pins one.

## Attribution

**No aggregated `THIRD_PARTY_NOTICES` file exists, and this audit records in writing that none is owed beyond what already ships.**

Nothing has been copied or adapted from any dependency in this file — every one is used as an unmodified package installed by pnpm, never vendored or edited. MIT and Apache-2.0 both require the copyright and permission notice to travel with redistributed copies of the software; because `infra/Dockerfile.web` and `infra/Dockerfile.worker` copy the built tree wholesale (see the finding above), every shipped package's own `LICENSE` file ships unmodified, at its own path, inside the image's `node_modules` — the notice is already present in the software being redistributed, which is what both licences require. No file at this repository's root strips or replaces it.

Apache-2.0 additionally requires forwarding any `NOTICE` file the upstream project itself ships. Checked directly against the installed packages, not assumed: of RecordMint's shipped Apache-2.0 dependencies, only `playwright` and `playwright-core` carry one (`node_modules/playwright/NOTICE`, crediting Microsoft Corporation and disclosing derived Puppeteer code, itself Apache-2.0) — the AWS SDK v3 packages, `@smithy/*`, `drizzle-orm` and `@swc/*` do not. Because that `NOTICE` file ships in place inside `node_modules/playwright/` the same way its `LICENSE` does, it is already forwarded by the same unmodified-redistribution reasoning above; no separate copy is needed.

`caniuse-lite`'s CC-BY-4.0 covers its bundled browser-compatibility *data* (read at build time by Next.js/`browserslist`, not executed at runtime); its own `LICENSE` file, which names the attribution, ships the same way as every other package's above.

## CI enforcement

`.github/workflows/ci.yml` runs `node scripts/check-licenses.mjs` on every push and pull request, right after `pnpm install`. It has no runtime dependencies of its own (Node built-ins only) and does two things:

- Walks `node_modules/.pnpm` — pnpm's own record of every package version this workspace actually resolved, `dependencies` and `devDependencies` alike, direct or transitive — reads each one's own `package.json` `license` field directly, and fails the build if any of them falls outside the permissive allow-list above, or matches a reject-regardless-of-class licence.
- Parses every `image:` line in `infra/compose.yaml` and fails if an image has no `@sha256:` digest, no explicit tag alongside that digest, or isn't one of the images this file has audited.

**Proven, not just written:** a real dependency was added under a `GPL-3.0` licence to `packages/shared`, installed with `pnpm install`, and the check failed, printing exactly `DISALLOWED LICENCE: npm package "tmp-copyleft-demo@1.0.0" is "GPL-3.0" …`. The dependency was then removed and `pnpm install --frozen-lockfile` re-run; the check passed again. A dependency with a disallowed licence — `devDependency` or not — cannot land without the check going red first.
