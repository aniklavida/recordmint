# RecordMint — contributor and agent instructions

The canonical guide for humans and coding agents working in this repository. Tool-neutral: Claude, Codex, Cursor, Gemini CLI and others read this file.

## What this repository is

Free, self-hosted, open-source video messaging. The browser records with `getDisplayMedia` and `MediaRecorder`, uploads directly to S3-compatible storage while recording, and hands back a share link.

**Status: pre-implementation.** The specification, architecture and structure exist. Working code does not yet.

## The three rules that matter

**1 · The browser records. Nothing native ever enters this repository.**

Capture is web platform APIs only. No native capture path, no desktop shell, no per-OS build. Every complaint about a browser limitation will point toward a native app; the answer is no. That boundary is why this project is finishable.

**2 · Video bytes never pass through the app server.**

The browser gets a presigned URL and uploads straight to the bucket. The server signs URLs, records metadata and serves HTML. A change that proxies media through the application will not be merged.

**3 · Nothing in `apps/worker` may be required for a share link to work.**

Transcripts, thumbnails and retention are improvements to a recording that is already playable and already shared. With the worker stopped, recording, upload, sharing and playback must still work.

## Structure

```
apps/
├── web/          Next.js — UI, app API, player page
└── worker/       transcripts, thumbnails, retention
packages/
├── recorder/     capture + chunked upload. Framework-free
├── db/           schema, migrations, queries
├── storage/      S3 client, presigning, multipart
└── shared/       types, IDs, validation, errors
infra/            compose.yaml · minio/ · postgres/
e2e/              Playwright
```

Every feature in `apps/web` carries four layers:

| Layer | Folder | Talks to |
|---|---|---|
| Models and rules | `domain/` | nothing |
| Use cases | `application/` | `domain/` |
| Data access | `data/` | the database and storage packages |
| Delivery | `presentation/` | components and route handlers |

**Nothing points inward from the edge.** `domain` knows nothing; `application` knows `domain`; `data` and `presentation` know `application`.

Two rules enforced by tests in CI:

- **A feature never imports another feature's internals** — only its public surface. This is what keeps features removable.
- **`shared/` and `ui/` never import a feature.** The moment they do, they stop being shared.

## Conventions

1. **`packages/recorder` imports no UI framework.** Web platform APIs and TypeScript only. It has to be testable in a browser harness and changeable when browser behaviour shifts.
2. **`app/` holds route entry points and nothing else.** Real code lives in `features/`.
3. **The object key layout lives in exactly one file**, `packages/storage/src/keys.ts`. Build a key anywhere else and deletion starts leaving orphans.
4. **Feature names are identical everywhere they appear** — `recordings` in the app is `recordings` in the schema and `recordings/` in the bucket. Casing follows the language; the word does not change.
5. **Migrations are committed SQL, reviewed as code.** A migration is the one thing an operator cannot undo by redeploying.
6. **Secrets stay out of the repository.** `.env.example` carries names and safe defaults; `.env` is never committed.

## Working on the recorder

This is the part most likely to break, and the part hardest to test.

- **Capability detection runs before the record button is enabled**, never after. An unsupported browser must be found before someone has recorded fifteen minutes they are about to lose.
- **Capture, encoding, upload and session state fail independently.** Keep them in their own modules so each failure is recoverable and legible, instead of one opaque "recording failed".
- **Never lose a recording silently.** An interrupted recording either recovers or fails visibly. Producing an unplayable file without saying so is the worst outcome this product has.
- **Test with a browser's fake capture device** in CI. It is the only way to exercise a recorder without a human gesture. What it cannot cover — the real picker, real system audio, real cross-browser differences — stays a documented human matrix. Do not let a green CI run stand in for that matrix.

## Dependencies

**Every dependency shipped here is inherited by every user.** Audit the licence before adding one.

| Class | Rule |
|---|---|
| Compiled into shipped code | **MIT, Apache or BSD only** |
| Run as a separate process | Copyleft acceptable — it never reaches user code |

MinIO and ffmpeg are the second kind: MinIO is started as a service, ffmpeg is spawned as a binary. **Neither may become a linked library**, because the MIT promise is the commercial reason this project exists and a compiled copyleft dependency would take it away.

Anything reciprocal-for-consumers, or revenue-gated, is rejected regardless of quality.

## Truthfulness

Every public claim is one of: **implemented and tested**, **experimental**, **planned**, or **unsupported**. Never describe a planned capability as working.

Two specific claims are held to a higher bar, because they are the ones a user would be hurt by:

- **Browser and audio support.** The support table reflects what was clicked through by a human, including everywhere capture does not work. Never widen it on the strength of documentation.
- **Seeking.** `MediaRecorder` emits fragmented MP4, and seeking behaviour across browsers is an open question. No claim about seeking goes in the documentation until it has been tested in every supported browser.

## Tests

Unit tests with Vitest, end-to-end with Playwright, and dependency-direction checks in CI. Run them from a clean checkout before claiming a change works.
