const fs = require('fs');
const path = require('path');

/**
 * Recursively find all JS files in a directory
 */
function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      if (file.endsWith('.js') || file.endsWith('.mjs')) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });

  return arrayOfFiles;
}

const openNextDir = path.join(process.cwd(), '.open-next');
if (!fs.existsSync(openNextDir)) {
  console.error("Error: .open-next directory not found!");
  process.exit(1);
}

const filesToFix = getAllFiles(openNextDir);
const coreModules = [
  'buffer', 'events', 'crypto', 'util', 'stream', 'path', 'querystring', 
  'url', 'string_decoder', 'punycode', 'http', 'https', 'zlib', 'fs', 
  'os', 'tls', 'net', 'dns', 'vm', 'async_hooks', 'perf_hooks', 'process'
];

filesToFix.forEach(file => {
  console.log(`Patching ${file}...`);
  let content = fs.readFileSync(file, 'utf8');

  // 1. Inject Comprehensive Shims at the top of EVERY file
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
  
  globalThis.http = globalThis.http || {
    IncomingMessage: class { on() { return this; } setEncoding() { return this; } },
    ServerResponse: class { on() { return this; } end() { return this; } setHeader() { return this; } },
    request: noop, get: noop, Agent: class {}
  };

  globalThis.https = globalThis.https || {
    IncomingMessage: class { on() { return this; } setEncoding() { return this; } },
    ServerResponse: class { on() { return this; } end() { return this; } setHeader() { return this; } },
    request: noop, get: noop, Agent: class {}
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

  // 2. Patch require calls
  content = content.replace(
    /require\(['"](buffer|events|crypto|util|stream|path|querystring|url|string_decoder|punycode|http|https|zlib|fs|os|tls|net|dns|vm|async_hooks|perf_hooks|process)['"]\)/g,
    'require("node:$1")'
  );

  // 3. Patch ESM imports
  content = content.replace(
    /from\s+['"](buffer|events|crypto|util|stream|path|querystring|url|string_decoder|punycode|http|https|zlib|fs|os|tls|net|dns|vm|async_hooks|perf_hooks|process)['"]/g,
    'from "node:$1"'
  );

  // 4. Critical: Force use of our global shims for problematic modules
  coreModules.forEach(mod => {
    const regex = new RegExp(`(?<!\\.)require\\(['"]node:${mod}['"]\\)`, 'g');
    content = content.replace(regex, `(globalThis.${mod} || {})`);
  });

  fs.writeFileSync(file, content);
});

console.log('✨ Universal worker patching complete.');
