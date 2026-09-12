# Folder structure

## The naming rule

**Use the words engineers already know.** A reader should not have to learn a private dialect before they can find anything, and a structure nobody recognises is a structure nobody adopts.

Four words carry the layout:

| Word | Meaning |
|---|---|
| `apps/` | Something you deploy and run. It has a process. |
| `packages/` | Something that is imported. It has no process. |
| `infra/` | How it runs on a machine. |
| `docs/` | What it is and why. |

**`apps/web` and `apps/worker`, not `server` and `jobs`** — the pair tells you immediately that one serves requests and one does not.

## The repository

```
recordmint/
├── apps/
│   ├── web/                  Next.js — UI, app API, player page
│   └── worker/               background jobs: transcript, thumbnail, retention
├── packages/
│   ├── recorder/             capture + chunked upload. Framework-free
│   ├── db/                   schema, migrations, queries
│   ├── storage/              S3 client, presigning, multipart
│   └── shared/               types, IDs, validation, errors
├── infra/
│   ├── compose.yaml          web · worker · postgres · minio
│   ├── Dockerfile.web
│   ├── Dockerfile.worker
│   └── minio/                bucket bootstrap
├── docs/
├── .github/
└── e2e/                      Playwright, driving a fake capture device
```

Two apps, four packages, one compose file.

## `packages/recorder` — the core

**This is the part that is actually hard.** Everything else is a normal web application. It is deliberately isolated from the UI framework so it can be tested in a browser harness, changed when browser behaviour shifts, and reused later without dragging a framework along.

```
packages/recorder/src/
├── capture/
│   ├── display.ts            getDisplayMedia — screen, window, tab
│   ├── user-media.ts         getUserMedia — camera, mic
│   ├── mixer.ts              combine tracks into one stream
│   └── support.ts            capability probe; runs BEFORE the record button
├── encode/
│   ├── mime.ts               MP4 H.264+AAC preferred, WebM fallback
│   └── recorder.ts           MediaRecorder lifecycle: start/pause/resume/stop
├── upload/
│   ├── multipart.ts          buffer chunks to part size, upload to presigned URLs
│   ├── retry.ts              backoff, resume, part-level recovery
│   └── queue.ts              ordered, bounded in-flight parts
├── session.ts                the state machine: idle → recording → finalising → done
└── index.ts                  the only public surface
```

### Why four folders and not one file

They are the four things that fail independently. Capture fails when a browser lacks an API or a user cancels the picker. Encoding fails when a mime type is unsupported. Upload fails when the network goes away. The session fails when the user closes the tab.

Keeping them apart is what makes each failure recoverable and legible, instead of producing one opaque "recording failed".

**`support.ts` runs before the record button is enabled, not after.** An unsupported browser must be detected before someone has recorded fifteen minutes they are about to lose. That ordering is a structural decision, which is why the probe is its own module rather than a line inside `start()`.

**`session.ts` is a real state machine**, because "is it still uploading?" is a question the recorder UI, the player page and the recovery path all need to answer the same way.

## `apps/web`

```
apps/web/src/
├── app/                      App Router — thin route entry points only
│   ├── (marketing)/          landing, self-host instructions
│   ├── (app)/                authenticated: library, settings, workspace
│   ├── record/               the recorder page
│   ├── v/[publicId]/         THE PLAYER PAGE — server-rendered, public
│   └── api/                  route handlers
├── features/
│   ├── recording/            domain/ application/ data/ presentation/
│   ├── playback/
│   ├── comments/
│   ├── transcripts/
│   ├── sharing/
│   └── workspace/
├── auth/                     sessions, password hashing, guards
└── ui/                       components, tokens, layout
```

**`app/` holds route entry points and nothing else.** The real code lives in `features/`. This avoids the failure mode where business logic accretes inside route files until it is untestable and impossible to move.

### The four layers, in every feature

| Layer | Folder | Talks to |
|---|---|---|
| Models and rules | `domain/` | nothing |
| Use cases | `application/` | `domain/` |
| Data access | `data/` | the database and storage packages |
| Delivery | `presentation/` | components and route handlers |

The dependency direction is one-way: **`domain` knows nothing. `application` knows `domain`. `data` and `presentation` know `application`. Nothing points inward from the edge.**

For a small feature, `application/` may be a single file. That is fine — one thin folder is cheaper than business logic leaking into a component.

### Why the player page is server-rendered

`/v/[publicId]` does three things a client-only page cannot: resolve link visibility before anything is minted, emit link-preview metadata so a pasted link unfurls where people paste it, and hand the client a read URL that was never guessable.

## `apps/worker`

```
apps/worker/src/
├── jobs/
│   ├── transcript.ts         whisper.cpp / faster-whisper → WebVTT
│   ├── thumbnail.ts          ffmpeg → poster.jpg
│   ├── remux.ts              ffmpeg faststart, only if seeking needs it
│   └── retention.ts          scheduled: expire and delete by policy
├── media/
│   ├── ffmpeg.ts             spawn wrapper. A binary, never linked
│   └── whisper.ts            spawn wrapper, model selection
└── main.ts                   queue subscriptions
```

**Nothing here is on the critical path to a share link.** Every job improves a recording that is already playable and already shared. With the worker stopped, recordings still work — they just have no transcript or poster yet. Protecting that property is why these live in a separate process.

**`remux.ts` is conditional.** It exists because fragmented-MP4 seeking across browsers is an open question. If testing shows seeking is fine, the job is deleted rather than kept on the strength of a guess.

## `packages/db`

```
packages/db/src/
├── schema/
│   ├── workspaces.ts  users.ts  memberships.ts  sessions.ts
│   ├── recordings.ts  share-links.ts
│   ├── comments.ts    transcripts.ts  views.ts
├── migrations/               generated SQL, committed, reviewed as code
└── client.ts
```

One file per table group. Migrations are plain SQL and are reviewed like any other change, because a migration is the one thing an operator cannot undo by redeploying.

## `packages/storage`

```
packages/storage/src/
├── client.ts                 S3-compatible client construction
├── presign.ts                upload-part URLs, short-lived read URLs
├── multipart.ts              create, sign parts, complete, abort
├── keys.ts                   the object layout, in one place
└── index.ts
```

**`keys.ts` exists so the object layout is defined exactly once:**

```
recordings/<recordingId>/original.<ext>
recordings/<recordingId>/poster.jpg
recordings/<recordingId>/transcript.vtt
```

One prefix per recording, so deletion is one prefix delete and retention is one list-and-delete. The moment a key is assembled by string concatenation somewhere else, deletion starts leaving orphans that nobody notices until the storage bill arrives.

**Nothing outside this package knows which S3 implementation is behind it.** That is what makes MinIO locally and any bucket in production the same code path rather than two.

## `packages/shared`

Types, ID generation, validation schemas and the error envelope. Imported by everything; imports nothing from `apps/` or the other packages.

**Public IDs are generated here.** A share link's `publicId` is a URL-safe random string rather than a sequential row identifier, because an unlisted link's whole property is that it cannot be guessed. Keeping that generator in one place means it cannot be reinvented badly.

## Two rules, enforced by tests

1. **A feature never imports another feature's internals.** Cross-feature use goes through a feature's public surface only. This is what keeps features removable.
2. **`shared/` and `ui/` never import a feature.** The moment they do, they stop being shared and become a hidden dependency pointing the wrong way.

Both are checked in CI. A rule nobody enforces is a rule everybody breaks by month three.

## `e2e/`

Playwright lives at the top level because it exercises the whole system rather than any single app.

```
e2e/
├── record.spec.ts            fake capture device → share link
├── share.spec.ts             visibility rules, logged-out viewer
├── playback.spec.ts          seeking, captions
└── fixtures/
```

**A browser's fake capture device is the only way to test a recorder in CI** — it removes the human gesture that the screen picker otherwise demands. Without it, the most important code in the project would have no automated test at all.

What it cannot test is the real picker, real system audio and real cross-browser differences. Those stay a documented human matrix, and pretending otherwise would be exactly the mistake the specification warns about.

## Conventions

1. **Feature names are identical everywhere they appear** — `recordings` in the web app is `recordings` in the schema and `recordings/` in the bucket. Casing follows the language; the word does not change.
2. **`packages/recorder` imports no UI framework.** Web platform APIs and TypeScript only.
3. **The object key layout lives in exactly one file.**
4. **Nothing in `apps/worker` is required for a share link to work.**
5. **Migrations are committed SQL and reviewed as code.**
6. **Secrets stay out of the repository.** `.env.example` carries names and safe defaults; `.env` is never committed.
