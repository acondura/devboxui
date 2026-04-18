import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

// Enable calling `getCloudflareContext()` in `next dev`.
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
	/* config options here */
};

export default nextConfig;
