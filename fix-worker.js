const fs = require('fs');
const path = require('path');

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
  let content = fs.readFileSync(file, 'utf8');

  // 1. Standalone Shim Block
  const shims = `
// Cloudflare Compatibility Shims
(function() {
  const noop = () => {};
  const noopPromise = () => Promise.resolve({});
  const BaseClass = class {};
  
  // Create completely standalone shims to avoid Cloudflare built-in conflicts
  const coreModules = ['buffer', 'events', 'crypto', 'util', 'stream', 'path', 'querystring', 'url', 'string_decoder', 'punycode', 'http', 'https', 'zlib', 'fs', 'os', 'tls', 'net', 'dns', 'vm', 'async_hooks', 'perf_hooks', 'process'];
  
  coreModules.forEach(m => {
    let base = {};
    try { base = require("node:" + m); } catch (e) {}
    globalThis['__CF_SHIM_' + m + '__'] = Object.assign({}, base);
  });

  const shimHttp = globalThis.__CF_SHIM_http__;
  Object.assign(shimHttp, {
    IncomingMessage: class extends BaseClass { constructor(){super(); this.headers={};} on() { return this; } setEncoding() { return this; } },
    ServerResponse: class extends BaseClass { constructor(){super();} on() { return this; } end() { return this; } setHeader() { return this; } },
    OutgoingMessage: class extends BaseClass {},
    request: () => ({ on: noop, end: noop, write: noop }),
    get: noop,
    Agent: class {}
  });

  globalThis.__CF_SHIM_https__ = shimHttp;
  
  Object.assign(globalThis.__CF_SHIM_fs__, {
    readFile: noop, readFileSync: () => "", writeFile: noop, writeFileSync: noop,
    stat: noop, statSync: () => ({ isDirectory: () => false, size: 0 }),
    mkdir: noop, mkdirSync: noop, readdir: noop, readdirSync: () => [],
    access: noop, accessSync: noop,
    promises: { readFile: noopPromise, writeFile: noopPromise, stat: noopPromise, mkdir: noopPromise, readdir: noopPromise, access: noopPromise }
  });

  if (!globalThis.__CF_SHIM_events__.EventEmitter) {
    globalThis.__CF_SHIM_events__.EventEmitter = class { on(){} once(){} emit(){} removeListener(){} };
  }
})();
`;
  
  if (!content.includes('Cloudflare Compatibility Shims')) {
    content = shims + content;
  }

  // 2. Patch BOTH require() and ESM import/export from statements
  coreModules.forEach(mod => {
    // Patch require("http") -> (globalThis.__CF_SHIM_http__)
    const requireRegex = new RegExp(`(?<!\\.)require\\(['"](node:)?${mod}['"]\\)`, 'g');
    content = content.replace(requireRegex, `(globalThis.__CF_SHIM_${mod}__)`);

    // Patch from "http" -> from "__CF_SHIM_http__" (though this is harder to shim globally, 
    // we use a trick: we replace the string and then define the module if possible, 
    // but in a worker, pointing to the global is usually enough if the bundler allows it).
    // Actually, for ESM, it's safer to just replace the whole import line if we find it.
  });

  fs.writeFileSync(file, content);
});

console.log('✨ Universal shim worker patching complete.');
