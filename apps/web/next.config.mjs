/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // apps/web is the only app with a public surface; packages compile from
  // source, so they need to be transpiled rather than pre-built here.
  transpilePackages: [
    "@recordmint/db",
    "@recordmint/recorder",
    "@recordmint/shared",
    "@recordmint/storage",
  ],
  // @node-rs/argon2 ships a prebuilt native .node binary (SPEC.md §12's
  // Argon2id hashing) — webpack has no loader for that file type and does
  // not need one, since this package only ever runs server-side. Marking
  // it external tells Next to `require()` it directly from node_modules
  // at runtime instead of trying to bundle the binary into the trace.
  // `serverComponentsExternalPackages` is still under `experimental` in
  // Next 14 (this repository's pinned major version) — it graduated to a
  // top-level `serverExternalPackages` only in Next 15.
  experimental: {
    serverComponentsExternalPackages: ["@node-rs/argon2"],
  },
};

export default nextConfig;
