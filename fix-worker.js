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
  console.log(`Patching ${file}...`);
  let content = fs.readFileSync(file, 'utf8');

  // 1. Inject Comprehensive Shims at the top
  const shims = `
// Cloudflare Compatibility Shims
(function() {
  const noop = () => {};
  const noopPromise = () => Promise.resolve({});
  const BaseClass = class {};
  
  globalThis.fs = globalThis.fs || {
    readFile: noop, readFileSync: () => "",
    writeFile: noop, writeFileSync: noop,
    stat: noop, statSync: () => ({ isDirectory: () => false, size: 0 }),
    mkdir: noop, mkdirSync: noop,
    readdir: noop, readdirSync: () => [],
    access: noop, accessSync: noop,
    promises: { readFile: noopPromise, writeFile: noopPromise, stat: noopPromise, mkdir: noopPromise, readdir: noopPromise, access: noopPromise }
  };
  
  globalThis.http = globalThis.http || {
    IncomingMessage: class extends BaseClass { on() { return this; } setEncoding() { return this; } },
    ServerResponse: class extends BaseClass { on() { return this; } end() { return this; } setHeader() { return this; } },
    request: noop, get: noop, Agent: class {}
  };

  globalThis.https = globalThis.https || globalThis.http;
  globalThis.os = globalThis.os || { platform: () => 'linux', homedir: () => '/tmp', tmpdir: () => '/tmp' };
  globalThis.path = globalThis.path || { join: (...args) => args.filter(Boolean).join('/'), resolve: (...args) => args[args.length - 1] };
})();
`;
  
  if (!content.includes('Cloudflare Compatibility Shims')) {
    content = shims + content;
  }

  // 2. Patch all require calls to use a "Safe Proxy"
  // Instead of require("http"), we use (globalThis.http || require("node:http"))
  coreModules.forEach(mod => {
    // This regex catches require("http"), require('http'), and require("node:http")
    const regex = new RegExp(`(?<!\\.)require\\(['"](node:)?${mod}['"]\\)`, 'g');
    content = content.replace(regex, `(globalThis.${mod} || (function(){try{return require("node:${mod}")}catch(e){return {}}})())`);
  });

  // 3. Patch ESM imports to use node: prefix
  content = content.replace(
    /from\s+['"](buffer|events|crypto|util|stream|path|querystring|url|string_decoder|punycode|http|https|zlib|fs|os|tls|net|dns|vm|async_hooks|perf_hooks|process)['"]/g,
    'from "node:$1"'
  );

  fs.writeFileSync(file, content);
});

console.log('✨ Ultimate worker patching complete.');
