import type { OpenNextConfig } from "@opennextjs/cloudflare";

const config: OpenNextConfig = {
  default: {
    override: {
      wrapper: "cloudflare",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },
  edgeExternals: [
    "node:async_hooks",
    "node:buffer",
    "node:crypto",
    "node:events",
    "node:fs",
    "node:http",
    "node:https",
    "node:net",
    "node:os",
    "node:path",
    "node:stream",
    "node:tls",
    "node:url",
    "node:util",
    "node:vm",
    "node:zlib",
    "async_hooks",
    "buffer",
    "crypto",
    "events",
    "fs",
    "http",
    "https",
    "net",
    "os",
    "path",
    "stream",
    "tls",
    "url",
    "util",
    "vm",
    "zlib"
  ],
  middleware: {
    external: true,
    override: {
      wrapper: "cloudflare-edge",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },
};

export default config;
