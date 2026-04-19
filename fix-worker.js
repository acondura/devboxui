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

  // 1. Unique Global Shim Block
  const shims = `
(function() {
  const coreModules = ['buffer', 'events', 'crypto', 'util', 'stream', 'path', 'querystring', 'url', 'string_decoder', 'punycode', 'http', 'https', 'zlib', 'fs', 'os', 'tls', 'net', 'dns', 'vm', 'async_hooks', 'perf_hooks', 'process'];
  coreModules.forEach(m => {
    if (!globalThis['__CF_SHIM_' + m + '__']) {
      try {
        globalThis['__CF_SHIM_' + m + '__'] = require('node:' + m);
      } catch (e) {
        globalThis['__CF_SHIM_' + m + '__'] = {};
      }
    }
  });

  // Specifically fix http/https/fs which are partial in Cloudflare
  const shimHttp = globalThis.__CF_SHIM_http__;
  if (!shimHttp.IncomingMessage) {
    const Base = class {};
    Object.assign(shimHttp, {
      IncomingMessage: class extends Base { constructor(){super(); this.headers={};} on(){return this;} setEncoding(){return this;} },
      ServerResponse: class extends Base { constructor(){super();} on(){return this;} end(){return this;} setHeader(){return this;} },
      OutgoingMessage: class extends Base {},
      Agent: class {},
      request: () => ({ on: () => {}, end: () => {}, write: () => {} })
    });
    globalThis.__CF_SHIM_https__ = shimHttp;
  }
  
  if (!globalThis.__CF_SHIM_fs__.readFile) {
    Object.assign(globalThis.__CF_SHIM_fs__, {
      readFileSync: () => "", readFile: () => {}, 
      statSync: () => ({ isDirectory: () => false }), 
      promises: { readFile: () => Promise.resolve("") }
    });
  }
})();
`;
  
  if (!content.includes('__CF_SHIM_')) {
    content = shims + content;
  }

  // 2. Replace require() with our Unique Global Shims
  coreModules.forEach(mod => {
    const regex = new RegExp(`(?<!\\.)require\\(['"](node:)?${mod}['"]\\)`, 'g');
    content = content.replace(regex, `(globalThis.__CF_SHIM_${mod}__)`);
  });

  fs.writeFileSync(file, content);
});

console.log('✅ Unique Global Shim patching complete.');
