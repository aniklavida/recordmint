# v1.0 release checklist

## Truth

- [ ] Every public claim has working evidence or is clearly labelled planned.
- [ ] The specification, the documentation and the implementation agree.
- [ ] The browser support table matches what was actually tested, including everywhere capture does not work.

## Product

- [ ] `docker compose up` on a clean machine brings up every service with no manual steps.
- [ ] A first-time operator records and shares a video without reading the documentation.
- [ ] Screen, window and tab capture each produce a playable recording in every supported browser.
- [ ] Camera and microphone capture work, alone and combined with screen capture.
- [ ] A ten-minute recording finishes uploading within five seconds of the user pressing stop.
- [ ] The share link resolves for a logged-out viewer, in a clean profile, on a different machine.
- [ ] The link unfurls with a title and a poster where it is pasted.
- [ ] The player seeks correctly forwards and backwards in every supported browser.
- [ ] A timestamped comment appears on the timeline and seeks when clicked.
- [ ] A transcript renders as captions and is searchable within the recording.
- [ ] Disabling transcription leaves every other capability working.
- [ ] An unsupported browser is detected and refused before the user records anything.
- [ ] A recording interrupted by a closed tab or a lost network either recovers or fails visibly.

## Security

- [ ] The storage bucket rejects unsigned public reads.
- [ ] `private` links are refused to a logged-out viewer, `password` links without the password, and `expiring` links after expiry.
- [ ] Presigned read URLs expire, and expiry is verified rather than assumed.
- [ ] No credential is stored in browser local storage.
- [ ] Deleting a recording removes every object under its prefix, verified against the bucket.

## Engineering

- [ ] A recording plays end to end with the app server stopped after the read URL was minted.
- [ ] Unit, end-to-end and dependency-direction checks all run green from a clean checkout, in CI.
- [ ] Migrations apply cleanly to an empty database and to the previous release's database.
- [ ] The health endpoint reports storage, database and transcription status correctly when each is broken.

## Repository

- [ ] Every shipped dependency is listed with its licence and passes the class rule.
- [ ] README, specification, architecture, structure and self-hosting documentation are complete.
- [ ] Security policy, code of conduct and contributor instructions are complete.
- [ ] Repository description, topics and homepage are set.
- [ ] CI and release workflows pass.
- [ ] The working tree is clean and local `HEAD` matches the remote.

## Launch

- [ ] A 90-second demo proves record, share and watch.
- [ ] Release notes and changelog are accurate.
- [ ] The tag is created only after every box above is ticked.
