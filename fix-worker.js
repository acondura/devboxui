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

  // 1. Unique Shim Block (Avoids conflict with built-ins)
  const shims = `
// Cloudflare Compatibility Shims
(function() {
  const noop = () => {};
  const noopPromise = () => Promise.resolve({});
  const BaseClass = class {};
  
  const coreModules = ['buffer', 'events', 'crypto', 'util', 'stream', 'path', 'querystring', 'url', 'string_decoder', 'punycode', 'http', 'https', 'zlib', 'fs', 'os', 'tls', 'net', 'dns', 'vm', 'async_hooks', 'perf_hooks', 'process'];
  
  coreModules.forEach(m => {
    let base = {};
    try { base = require("node:" + m); } catch (e) {}
    
    // Create a UNIQUE global for this module
    globalThis['__CF_SHIM_' + m + '__'] = Object.assign({}, base);
  });

  // Inject our fixed classes into the SHIM objects, not the native ones
  const shimHttp = globalThis.__CF_SHIM_http__;
  shimHttp.IncomingMessage = class extends BaseClass { on() { return this; } setEncoding() { return this; } };
  shimHttp.ServerResponse = class extends BaseClass { on() { return this; } end() { return this; } setHeader() { return this; } };
  shimHttp.OutgoingMessage = class extends BaseClass {};
  shimHttp.request = noop; shimHttp.get = noop; shimHttp.Agent = class {};

  globalThis.__CF_SHIM_https__ = shimHttp;

  const shimFs = globalThis.__CF_SHIM_fs__;
  Object.assign(shimFs, {
    readFile: noop, readFileSync: () => "", writeFile: noop, writeFileSync: noop,
    stat: noop, statSync: () => ({ isDirectory: () => false, size: 0 }),
    mkdir: noop, mkdirSync: noop, readdir: noop, readdirSync: () => [],
    access: noop, accessSync: noop,
    promises: { readFile: noopPromise, writeFile: noopPromise, stat: noopPromise, mkdir: noopPromise, readdir: noopPromise, access: noopPromise }
  });

  const shimEvents = globalThis.__CF_SHIM_events__;
  if (!shimEvents.EventEmitter) {
    shimEvents.EventEmitter = class { on(){} once(){} emit(){} removeListener(){} };
  }
})();
`;
  
  if (!content.includes('Cloudflare Compatibility Shims')) {
    content = shims + content;
  }

  // 2. Point require calls to our UNIQUE global shims
  coreModules.forEach(mod => {
    const regex = new RegExp(`(?<!\\.)require\\(['"](node:)?${mod}['"]\\)`, 'g');
    content = content.replace(regex, `(globalThis.__CF_SHIM_${mod}__)`);
  });

  fs.writeFileSync(file, content);
});

console.log('✨ Unique shim worker patching complete.');
