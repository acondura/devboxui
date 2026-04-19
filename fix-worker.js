const fs = require('fs');
const path = require('path');

const filesToFix = [
  path.join(process.cwd(), '.open-next', 'worker.js'),
  path.join(process.cwd(), '.open-next', 'server-functions', 'default', 'handler.mjs')
];

const coreModules = [
  'buffer', 'events', 'crypto', 'util', 'stream', 'path', 'querystring', 
  'url', 'string_decoder', 'punycode', 'http', 'https', 'zlib', 'fs', 
  'os', 'tls', 'net', 'dns', 'vm', 'async_hooks', 'perf_hooks', 'process'
];

filesToFix.forEach(file => {
  if (!fs.existsSync(file)) return;

  console.log(`Patching ${file}...`);
  let content = fs.readFileSync(file, 'utf8');

  // 1. Inject Shims at the top of the file to prevent "undefined" errors
  const shims = `
// Cloudflare Compatibility Shims
globalThis.fs = globalThis.fs || {};
globalThis.os = globalThis.os || { platform: () => 'linux', release: () => '1.0.0', arch: () => 'x64' };
globalThis.path = globalThis.path || { join: (...args) => args.join('/'), resolve: (...args) => args[0] };
globalThis.process = globalThis.process || { env: {}, nextTick: (f) => setTimeout(f, 0) };
`;
  
  if (!content.includes('Cloudflare Compatibility Shims')) {
    content = shims + content;
  }

  // 2. Patch require calls: require("http") -> require("node:http")
  content = content.replace(
    /require\(['"](buffer|events|crypto|util|stream|path|querystring|url|string_decoder|punycode|http|https|zlib|fs|os|tls|net|dns|vm|async_hooks|perf_hooks|process)['"]\)/g,
    'require("node:$1")'
  );

  // 3. Patch ESM imports: from "http" -> from "node:http"
  content = content.replace(
    /from\s+['"](buffer|events|crypto|util|stream|path|querystring|url|string_decoder|punycode|http|https|zlib|fs|os|tls|net|dns|vm|async_hooks|perf_hooks|process)['"]/g,
    'from "node:$1"'
  );

  // 4. Critical: Fix Dynamic Requires that fail in ESM
  // Instead of require("node:fs"), use the global shim or an empty object.
  // We use a negative lookbehind to ensure we don't break property access like st.require()
  coreModules.forEach(mod => {
    const regex = new RegExp(`(?<!\\.)require\\(['"]node:${mod}['"]\\)`, 'g');
    content = content.replace(regex, `(globalThis.${mod} || {})`);
  });

  fs.writeFileSync(file, content);
  console.log(`✅ Fixed ${file}`);
});

console.log('✨ Proactive worker patching complete.');
