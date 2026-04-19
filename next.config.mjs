import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Enable calling `getCloudflareContext()` in `next dev`.
initOpenNextCloudflareForDev();

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['ssh2'],
  },
};

export default nextConfig;
