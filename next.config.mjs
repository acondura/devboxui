import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Enable calling `getCloudflareContext()` in `next dev`.
initOpenNextCloudflareForDev();

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ['ssh2'],
};

export default nextConfig;
