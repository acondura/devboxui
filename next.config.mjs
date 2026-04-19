import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Enable calling `getCloudflareContext()` in `next dev`.
initOpenNextCloudflareForDev();

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['ssh2'],
  experimental: {
    turbo: {
      resolveAlias: {
        'cpu-features': './src/lib/shims/empty.js',
      },
    },
  },
};

export default nextConfig;
