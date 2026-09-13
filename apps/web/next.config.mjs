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
};

export default nextConfig;
