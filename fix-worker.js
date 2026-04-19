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

  // 1. Inject Comprehensive Shims at the top of the file
  const shims = `
// Cloudflare Compatibility Shims
(function() {
  const noop = () => {};
  const noopPromise = () => Promise.resolve({});
  
  globalThis.fs = globalThis.fs || {
    readFile: noop, readFileSync: () => "",
    writeFile: noop, writeFileSync: noop,
    stat: noop, statSync: () => ({ isDirectory: () => false, size: 0 }),
    mkdir: noop, mkdirSync: noop,
    readdir: noop, readdirSync: () => [],
    access: noop, accessSync: noop,
    watch: () => ({ close: noop }),
    promises: {
      readFile: noopPromise, writeFile: noopPromise,
      stat: noopPromise, mkdir: noopPromise,
      readdir: noopPromise, access: noopPromise
    }
  };
  
  globalThis.os = globalThis.os || { 
    platform: () => 'linux', release: () => '1.0.0', arch: () => 'x64',
    homedir: () => '/tmp', tmpdir: () => '/tmp', hostname: () => 'cloudflare'
  };
  
  globalThis.path = globalThis.path || { 
    join: (...args) => args.filter(Boolean).join('/'), 
    resolve: (...args) => args[args.length - 1],
    dirname: (p) => p.split('/').slice(0, -1).join('/') || '.',
    basename: (p) => p.split('/').pop(),
    extname: (p) => p.includes('.') ? '.' + p.split('.').pop() : ''
  };
})();
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
  coreModules.forEach(mod => {
    const regex = new RegExp(`(?<!\\.)require\\(['"]node:${mod}['"]\\)`, 'g');
    content = content.replace(regex, `(globalThis.${mod} || {})`);
  });

  fs.writeFileSync(file, content);
  console.log(`✅ Fixed ${file}`);
});

console.log('✨ Comprehensive worker patching complete.');
