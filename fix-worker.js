const fs = require('fs');
const path = require('path');

/**
 * Cloudflare Pages requires Node.js built-ins to be prefixed with "node:"
 * (e.g. "node:http" instead of "http"). This script finds and fixes those
 * in the bundled OpenNext output.
 */

const filesToFix = [
  path.join(process.cwd(), '.open-next', 'worker.js'),
  path.join(process.cwd(), '.open-next', 'server-functions', 'default', 'handler.mjs')
];

filesToFix.forEach(file => {
  if (!fs.existsSync(file)) {
    console.log(`Skipping missing file: ${file}`);
    return;
  }

  console.log(`Patching ${file}...`);
  const content = fs.readFileSync(file, 'utf8');

  // List of modules to prefix
  const modules = [
    'buffer', 'events', 'crypto', 'util', 'stream', 'path', 'querystring', 
    'url', 'string_decoder', 'punycode', 'http', 'https', 'zlib', 'fs', 
    'os', 'tls', 'net', 'dns', 'vm', 'async_hooks', 'perf_hooks', 'process'
  ];

  let patched = content;
  
  // 1. Patch require calls: require("http") -> require("node:http")
  patched = patched.replace(
    /require\(['"](buffer|events|crypto|util|stream|path|querystring|url|string_decoder|punycode|http|https|zlib|fs|os|tls|net|dns|vm|async_hooks|perf_hooks|process)['"]\)/g,
    'require("node:$1")'
  );

  // 2. Patch ESM imports: from "http" -> from "node:http"
  patched = patched.replace(
    /from\s+['"](buffer|events|crypto|util|stream|path|querystring|url|string_decoder|punycode|http|https|zlib|fs|os|tls|net|dns|vm|async_hooks|perf_hooks|process)['"]/g,
    'from "node:$1"'
  );

  fs.writeFileSync(file, patched);
  console.log(`✅ Fixed ${file}`);
});

console.log('✨ Worker patching complete.');
