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

  // 1. Assertive Shims: Overwrite missing pieces even if the module exists
  const shims = `
// Cloudflare Compatibility Shims
(function() {
  const noop = () => {};
  const noopPromise = () => Promise.resolve({});
  const BaseClass = class {};
  
  // Helper to safely extend an object
  const patch = (name, obj) => {
    globalThis[name] = Object.assign(globalThis[name] || {}, obj);
  };

  patch('fs', {
    readFile: noop, readFileSync: () => "",
    writeFile: noop, writeFileSync: noop,
    stat: noop, statSync: () => ({ isDirectory: () => false, size: 0 }),
    mkdir: noop, mkdirSync: noop,
    readdir: noop, readdirSync: () => [],
    access: noop, accessSync: noop,
    promises: { readFile: noopPromise, writeFile: noopPromise, stat: noopPromise, mkdir: noopPromise, readdir: noopPromise, access: noopPromise }
  });
  
  const httpShim = {
    IncomingMessage: class extends BaseClass { on() { return this; } setEncoding() { return this; } },
    ServerResponse: class extends BaseClass { on() { return this; } end() { return this; } setHeader() { return this; } },
    request: noop, get: noop, Agent: class {}
  };
  
  patch('http', httpShim);
  patch('https', httpShim);
  patch('os', { platform: () => 'linux', homedir: () => '/tmp', tmpdir: () => '/tmp' });
  patch('path', { join: (...args) => args.filter(Boolean).join('/'), resolve: (...args) => args[args.length - 1] });
})();
`;
  
  if (!content.includes('Cloudflare Compatibility Shims')) {
    content = shims + content;
  }

  // 2. Patch all require calls to use our patched globals
  coreModules.forEach(mod => {
    const regex = new RegExp(`(?<!\\.)require\\(['"](node:)?${mod}['"]\\)`, 'g');
    // Force the use of the global we just patched
    content = content.replace(regex, `(globalThis.${mod})`);
  });

  // 3. Patch ESM imports to use node: prefix
  content = content.replace(
    /from\s+['"](buffer|events|crypto|util|stream|path|querystring|url|string_decoder|punycode|http|https|zlib|fs|os|tls|net|dns|vm|async_hooks|perf_hooks|process)['"]/g,
    'from "node:$1"'
  );

  fs.writeFileSync(file, content);
});

console.log('✨ Assertive worker patching complete.');
