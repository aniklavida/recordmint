# Contributing

RecordMint is pre-implementation. The specification, architecture and structure exist; working code does not yet.

**Implementation contributions are not being accepted until the foundation is complete.** Issues and discussion about the specification are welcome now — especially real-world browser capture results, which is the area where evidence is worth the most.

## When contributions open

1. Read [`AGENTS.md`](AGENTS.md) first — it is the contract for humans and agents alike.
2. **The browser records.** Nothing native enters this repository. A change that adds a desktop capture path will not be merged.
3. **Video bytes never pass through the app server.** A change that proxies media through the application will not be merged.
4. **Nothing in the worker may be required for a share link to work.** If stopping the worker breaks recording, upload, sharing or playback, the change is wrong.
5. Every new dependency needs a licence audit in the pull request. See the dependency rules in `AGENTS.md`.
6. Run the tests from a clean checkout before opening a pull request.

## Reporting browser behaviour

The most useful contribution right now is evidence. If capture, audio or seeking behaves differently for you, say so with specifics: browser and version, operating system, capture source (screen, window or tab), what you expected, and what happened.

**Reports that capture does not work somewhere are as valuable as reports that it does.** The support table has to reflect reality, and a wrong table costs a user a recording.

## Commit messages

Describe what changed and why. If the change alters what the product claims to support, say so explicitly — the documentation and the support table move together.
