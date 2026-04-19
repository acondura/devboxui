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

// All core modules that need the node: prefix or shimming
const coreModules = [
  'buffer', 'events', 'crypto', 'util', 'stream', 'path', 'querystring', 
  'url', 'string_decoder', 'punycode', 'http', 'https', 'zlib', 'fs', 
  'os', 'tls', 'net', 'dns', 'vm', 'async_hooks', 'perf_hooks', 'process'
];

filesToFix.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // 1. Critical Shims (for http and fs which Cloudflare doesn't fully support)
  const shims = `
if (typeof globalThis.http === 'undefined' || !globalThis.http.IncomingMessage) {
  const Base = class {};
  const httpShim = {
    IncomingMessage: class extends Base { constructor(){super(); this.headers={};} on(){return this;} setEncoding(){return this;} },
    ServerResponse: class extends Base { constructor(){super();} on(){return this;} end(){return this;} setHeader(){return this;} },
    OutgoingMessage: class extends Base {},
    Agent: class {},
    request: () => ({ on: () => {}, end: () => {}, write: () => {} })
  };
  globalThis.http = httpShim;
  globalThis.https = httpShim;
}
if (typeof globalThis.fs === 'undefined' || !globalThis.fs.readFile) {
  globalThis.fs = { 
    readFileSync: () => "", readFile: () => {}, 
    statSync: () => ({ isDirectory: () => false }), 
    promises: { readFile: () => Promise.resolve("") } 
  };
}
`;
  
  if (!content.includes('globalThis.http')) {
    content = shims + content;
  }

  // 2. Patch ALL require calls to use node: prefix or our globals
  coreModules.forEach(mod => {
    const regex = new RegExp(`(?<!\\.)require\\(['"](node:)?${mod}['"]\\)`, 'g');
    
    if (['http', 'https', 'fs'].includes(mod)) {
      // Use our shims for these
      content = content.replace(regex, `(globalThis.${mod})`);
    } else {
      // Force node: prefix for everything else to satisfy wrangler/esbuild
      content = content.replace(regex, `require("node:${mod}")`);
    }
  });

  fs.writeFileSync(file, content);
});

console.log('✅ Surgical patching with node: prefixing complete.');
