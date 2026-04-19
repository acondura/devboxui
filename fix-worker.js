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

  // 1. Injected Shim Block (as a fallback)
  const shims = `
// Cloudflare Compatibility Shims
(function() {
  const noop = () => {};
  const BaseClass = class {};
  const coreModules = ['buffer', 'events', 'crypto', 'util', 'stream', 'path', 'querystring', 'url', 'string_decoder', 'punycode', 'http', 'https', 'zlib', 'fs', 'os', 'tls', 'net', 'dns', 'vm', 'async_hooks', 'perf_hooks', 'process'];
  coreModules.forEach(m => {
    try { globalThis['__CF_SHIM_' + m + '__'] = Object.assign({}, require("node:" + m)); } catch (e) { globalThis['__CF_SHIM_' + m + '__'] = {}; }
  });
  const shimHttp = globalThis.__CF_SHIM_http__;
  shimHttp.IncomingMessage = class extends BaseClass { constructor(){super(); this.headers={};} on(){return this;} setEncoding(){return this;} };
  shimHttp.ServerResponse = class extends BaseClass { constructor(){super();} on(){return this;} end(){return this;} setHeader(){return this;} };
  shimHttp.OutgoingMessage = class extends BaseClass {};
  shimHttp.request = () => ({ on: noop, end: noop, write: noop });
  globalThis.__CF_SHIM_https__ = shimHttp;
})();
`;
  
  if (!content.includes('Cloudflare Compatibility Shims')) {
    content = shims + content;
  }

  // 2. Point require calls to shims
  coreModules.forEach(mod => {
    const regex = new RegExp(`(?<!\\.)require\\(['"](node:)?${mod}['"]\\)`, 'g');
    content = content.replace(regex, `(globalThis.__CF_SHIM_${mod}__)`);
  });

  // 3. THE SLEDGEHAMMER: Search and replace the class extension patterns directly
  // This catches cases where the class is extended from a variable
  content = content.replace(/extends\s+[a-zA-Z0-9_$]+\.IncomingMessage/g, 'extends class { constructor(){ this.headers={}; } on(){return this;} setEncoding(){return this;} }');
  content = content.replace(/extends\s+[a-zA-Z0-9_$]+\.ServerResponse/g, 'extends class { constructor(){} on(){return this;} end(){return this;} setHeader(){return this;} }');
  content = content.replace(/extends\s+[a-zA-Z0-9_$]+\.OutgoingMessage/g, 'extends class {}');
  
  // Also catch direct extensions if they exist
  content = content.replace(/extends\s+IncomingMessage/g, 'extends class { constructor(){ this.headers={}; } on(){return this;} setEncoding(){return this;} }');
  content = content.replace(/extends\s+ServerResponse/g, 'extends class { constructor(){} on(){return this;} end(){return this;} setHeader(){return this;} }');

  fs.writeFileSync(file, content);
});

console.log('✨ Sledgehammer worker patching complete.');
