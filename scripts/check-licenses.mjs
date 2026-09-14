#!/usr/bin/env node
// Licence-audit gate. See docs/THIRD_PARTY_LICENSES.md for the full inventory
// and methodology this script enforces automatically on every push and pull
// request.
//
// RecordMint's MIT licence is the entire commercial argument for the
// project: an organisation can run it inside a closed product without
// opening its own source. A single copyleft dependency compiled into this
// repository's own build would make that promise false — and because this
// is a pnpm workspace whose Docker images copy the built tree wholesale
// (see infra/Dockerfile.web, infra/Dockerfile.worker), that includes the
// toolchain that builds it, not only what a route handler imports at
// runtime. So every npm package this workspace resolves, direct or
// transitive, `dependencies` or `devDependencies`, is held to the same
// permissive-licence bar.
//
// A container image started by infra/compose.yaml is a different case: it
// runs as its own operating-system process and is never linked into this
// code, so copyleft is acceptable there (AGPL-3.0 MinIO is the reason this
// split exists at all). That class is instead checked for two things: the
// image is pinned to an exact tag and digest (a floating tag can resolve to
// a different, unaudited licence tomorrow — see the finding below), and its
// audited licence isn't one of the reciprocal-for-consumers licences that
// are rejected regardless of which class they land in.
//
// Zero runtime dependencies — Node built-ins only, so this check never needs
// its own licence audit.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...parts) => path.join(rootDir, ...parts);

// Every npm licence accepted anywhere in the resolved tree. MIT / Apache-2.0
// / BSD are the named rule; the rest are permissive licences with materially
// the same terms (public-domain-equivalent, or attribution-only with no
// reciprocal obligation) that packages in this tree actually carry.
const PERMISSIVE_NPM = new Set([
  'MIT',
  // MIT-0 ("MIT No Attribution") is the same text as MIT with the
  // attribution/notice-inclusion clause removed — strictly more
  // permissive, not less. Verified 14 Sep 2026 against nodemailer@10.0.9's
  // own bundled LICENSE file, which carries this SPDX id.
  'MIT-0',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'Unlicense',
  'Python-2.0',
  'BlueOak-1.0.0',
  'CC0-1.0',
]);

// Rejected everywhere, regardless of class — a container image found under
// one of these is exactly as disqualifying as an npm package: these are
// "source available" or revenue-gated licences designed to restrict exactly
// the self-hosting-as-a-service use this compose file exists for, not
// ordinary copyleft. (Found in the wild: a floating `redis:7-alpine` tag
// resolved to Redis 7.4, RSAL/SSPL, after nobody had re-audited what the tag
// now pointed to — the reason images are pinned by digest below, not just a
// tag.)
const BANNED_SUBSTRINGS = [
  'rpl',
  'sspl',
  'rsal',
  'bsl',
  'business source license',
  'commons clause',
  'elastic license',
  'proprietary',
  'revenue-gated',
  'revenue gated',
  'employee-count-gated',
];

let failures = [];
let notes = [];

function fail(msg) {
  failures.push(msg);
}

// package.json declares a licence three ways in the wild: a plain SPDX id
// ("MIT"), an SPDX expression with an OR-choice ("(MIT OR CC0-1.0)") or
// AND-combination ("(MIT AND ISC)"), or the pre-SPDX legacy array/object
// form ("licenses": [{"type": "MIT", "url": "..."}]) that a few older
// packages (e.g. busboy, streamsearch) still carry. Normalise all three to
// a flat list of SPDX-ish names.
function licenseNames(rawLicense) {
  if (!rawLicense) return [];
  if (typeof rawLicense === 'string') {
    return rawLicense
      .replace(/[()]/g, '')
      .split(/\s+(?:OR|AND)\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(rawLicense)) {
    return rawLicense.flatMap((entry) => licenseNames(typeof entry === 'string' ? entry : entry?.type));
  }
  if (typeof rawLicense === 'object' && rawLicense.type) {
    return licenseNames(rawLicense.type);
  }
  return [];
}

// Accept a package only if every alternative its own package.json names is
// itself permissive — an OR-choice is fine because the consumer may pick
// either, an AND-combination or a legacy multi-licence array is fine only
// if every member of it stays permissive.
function isPermissiveNpmLicense(rawLicense, pkgName) {
  // caniuse-lite ships build-time browser-support *data* under CC-BY-4.0 — a
  // data attribution licence, not a code copyleft licence — which is why it
  // is carried in THIRD_PARTY_NOTICES instead of the permissive allow list.
  // Special-cased by exact package name so an unrelated package actually
  // licensed CC-BY-4.0 for its code still fails loudly below.
  if (pkgName === 'caniuse-lite' && rawLicense === 'CC-BY-4.0') return true;
  const names = licenseNames(rawLicense);
  if (names.length === 0) return false;
  return names.every((name) => PERMISSIVE_NPM.has(name));
}

// --- npm packages: walk what pnpm actually resolved ----------------------
// node_modules/.pnpm/<dir>/node_modules/<name>/package.json is pnpm's own
// content-addressable record of every package version this workspace
// resolved, registry or local `file:`/`link:` reference alike — reading it
// directly is checking "the package's own licence file", exactly as the
// audit requires, rather than trusting an aggregator.
const pnpmStore = p('node_modules', '.pnpm');
if (!existsSync(pnpmStore)) {
  console.error(`FAIL: ${pnpmStore} does not exist — run "pnpm install" before this check.`);
  process.exit(1);
}

// A pnpm store directory name is "[<scope>+]<name>@<version-or-ref>", where
// the version segment can carry a peer-dependency suffix after "_" (e.g.
// "next@14.2.35_@playwright+test@1.63.0_react@18.3.1") or be a `file:`
// reference re-encoded with "+" in place of "/" (e.g.
// "tmp-copyleft-demo@file+packages+shared+tmp-copyleft-demo"). Only the
// package *name* needs to be recovered correctly here — the version and
// licence are then read from that package's own package.json, which is
// authoritative.
function packageNameFromStoreDir(dirName) {
  if (dirName.startsWith('@')) {
    const plusIndex = dirName.indexOf('+');
    if (plusIndex === -1) return null;
    const scope = dirName.slice(0, plusIndex);
    const rest = dirName.slice(plusIndex + 1);
    const atIndex = rest.indexOf('@');
    if (atIndex <= 0) return null;
    return `${scope}/${rest.slice(0, atIndex)}`;
  }
  const atIndex = dirName.indexOf('@');
  if (atIndex <= 0) return null;
  return dirName.slice(0, atIndex);
}

const resolved = new Map(); // "name@version" -> { name, version, license }
for (const entry of readdirSync(pnpmStore, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
  const name = packageNameFromStoreDir(entry.name);
  if (!name) continue;
  const pkgJsonPath = p('node_modules', '.pnpm', entry.name, 'node_modules', name, 'package.json');
  if (!existsSync(pkgJsonPath)) continue;
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  } catch {
    fail(`UNREADABLE package.json: ${pkgJsonPath}`);
    continue;
  }
  const version = pkg.version || '(unknown version)';
  const key = `${name}@${version}`;
  if (resolved.has(key)) continue;
  resolved.set(key, { name, version, license: pkg.license ?? pkg.licenses ?? null });
}

if (resolved.size === 0) {
  fail('No packages were found under node_modules/.pnpm — the audit could not check anything. Run "pnpm install" first.');
}

for (const { name, version, license } of resolved.values()) {
  const names = licenseNames(license);
  const licenseText = names.length ? names.join(' / ') : JSON.stringify(license);
  if (names.some((n) => BANNED_SUBSTRINGS.some((s) => n.toLowerCase().includes(s)))) {
    fail(`REJECTED LICENCE: npm package "${name}@${version}" is "${licenseText}" — on the reject-regardless-of-class list.`);
    continue;
  }
  if (!isPermissiveNpmLicense(license, name)) {
    fail(`DISALLOWED LICENCE: npm package "${name}@${version}" is "${licenseText}" — must be MIT, Apache-2.0 or BSD (or an equivalent permissive licence already on this script's allow list). Verify the package's own LICENSE file, then either replace the dependency or update the allow list with the evidence.`);
  }
}

// --- container images: infra/compose.yaml ---------------------------------
// Licences here cannot be read off an installed tree the way npm packages
// can — they are recorded by hand in docs/THIRD_PARTY_LICENSES.md after
// checking the image's own upstream LICENSE file at the pinned release. This
// script only re-checks what compose.yaml itself can prove: that every
// image is pinned by digest (not a floating tag that can point to a
// different, unaudited licence tomorrow), and that the image is one this
// audit actually knows about.
const AUDITED_PROCESS_IMAGES = {
  postgres: { license: 'PostgreSQL Licence' },
  'quay.io/minio/minio': { license: 'AGPL-3.0' },
  'quay.io/minio/mc': { license: 'AGPL-3.0' },
};

const composePath = p('infra', 'compose.yaml');
if (existsSync(composePath)) {
  const text = readFileSync(composePath, 'utf8');
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*image:\s*(\S+)\s*$/);
    if (!match) continue;
    const ref = match[1];
    const atDigest = ref.indexOf('@sha256:');
    if (atDigest === -1) {
      fail(`UNPINNED IMAGE: "${ref}" in infra/compose.yaml has no "@sha256:" digest. A tag alone can silently start resolving to a different, unaudited licence — see the redis:7-alpine finding recorded in docs/THIRD_PARTY_LICENSES.md.`);
      continue;
    }
    const beforeDigest = ref.slice(0, atDigest);
    const colonIndex = beforeDigest.lastIndexOf(':');
    const imageName = colonIndex === -1 ? beforeDigest : beforeDigest.slice(0, colonIndex);
    const tag = colonIndex === -1 ? null : beforeDigest.slice(colonIndex + 1);
    if (!tag || tag === 'latest') {
      fail(`FLOATING TAG: "${ref}" in infra/compose.yaml pins a digest but the tag is "${tag ?? '(none)'}" — pin an exact release tag as well as the digest so the reference stays human-auditable.`);
    }
    const audited = AUDITED_PROCESS_IMAGES[imageName];
    if (!audited) {
      fail(`UNAUDITED IMAGE: "${imageName}" in infra/compose.yaml has no entry in this script's AUDITED_PROCESS_IMAGES — verify its licence against its own upstream LICENSE file, record it in docs/THIRD_PARTY_LICENSES.md, then add it here.`);
      continue;
    }
    if (BANNED_SUBSTRINGS.some((s) => audited.license.toLowerCase().includes(s))) {
      fail(`REJECTED LICENCE: container image "${imageName}" is audited as "${audited.license}" — on the reject-regardless-of-class list even though it only ever runs as a separate process.`);
    }
  }
} else {
  notes.push(`${composePath} not found — skipping the container-image check.`);
}

// --- report -----------------------------------------------------------
console.log(`Checked ${resolved.size} resolved npm packages and infra/compose.yaml's image pins.`);
if (notes.length) {
  console.log('\nNotes:');
  for (const n of notes) console.log(`  - ${n}`);
}
if (failures.length) {
  console.error(`\nFAILED — ${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error('\nSee docs/THIRD_PARTY_LICENSES.md for the audit this check enforces.');
  process.exit(1);
}
console.log('OK — every resolved npm package and pinned container image clears the licence-class rule.');
