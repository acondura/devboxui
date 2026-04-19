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

// The Omni-Shim: A massive, top-level environment hijack
const omniShim = `
// --- OMNI-SHIM START ---
(function() {
  const noop = () => {};
  const noopPromise = () => Promise.resolve({});
  const BaseClass = class {};
  const EventEmitter = class { on(){return this;} once(){return this;} emit(){return true;} removeListener(){return this;} removeAllListeners(){return this;} setMaxListeners(){return this;} };

  const shims = {
    process: { env: globalThis.process?.env || {}, nextTick: (fn) => setTimeout(fn, 0), platform: 'linux', cwd: () => '/', uptime: () => 0 },
    fs: { 
      readFile: noop, readFileSync: () => "", writeFile: noop, writeFileSync: noop,
      stat: noop, statSync: () => ({ isDirectory: () => false, size: 0 }),
      exists: noop, existsSync: () => false, mkdir: noop, mkdirSync: noop,
      readdir: noop, readdirSync: () => [], access: noop, accessSync: noop,
      lstatSync: () => ({ isDirectory: () => false, size: 0 }),
      promises: { readFile: noopPromise, writeFile: noopPromise, stat: noopPromise, mkdir: noopPromise, readdir: noopPromise, access: noopPromise }
    },
    http: {
      IncomingMessage: class extends EventEmitter { constructor(){super(); this.headers={}; this.method='GET'; this.url='/';} setEncoding(){return this;} },
      ServerResponse: class extends EventEmitter { constructor(){super();} end(){return this;} setHeader(){return this;} write(){return true;} writeHead(){return this;} },
      OutgoingMessage: class extends EventEmitter {},
      request: () => ({ on: noop, end: noop, write: noop, setNoDelay: noop, setSocketKeepAlive: noop }),
      get: noop, Agent: class {}, METHODS: ['GET', 'POST', 'PUT', 'DELETE'], STATUS_CODES: { 200: 'OK' }
    },
    os: { platform: () => 'linux', homedir: () => '/tmp', tmpdir: () => '/tmp', hostname: () => 'localhost', release: () => '1.0.0', type: () => 'Linux', arch: () => 'x64' },
    stream: { Readable: class extends EventEmitter {}, Writable: class extends EventEmitter {}, Transform: class extends EventEmitter {}, PassThrough: class extends EventEmitter {}, Stream: EventEmitter },
    events: { EventEmitter },
    path: { join: (...args) => args.filter(Boolean).join('/').replace(/\\/\\//g, '/'), resolve: (...args) => args[args.length - 1], basename: (p) => p.split('/').pop(), dirname: (p) => p.split('/').slice(0, -1).join('/'), extname: (p) => '.' + p.split('.').pop(), sep: '/', delimiter: ':' },
    util: { debuglog: () => noop, inspect: (v) => v, inherits: noop, promisify: (fn) => fn, types: { isAnyArrayBuffer: () => false, isUint8Array: (v) => v instanceof Uint8Array } },
    buffer: { Buffer: globalThis.Buffer || class {} },
    url: { parse: (u) => ({ protocol: 'https:', host: 'localhost', pathname: u, query: {} }), URL: globalThis.URL },
    querystring: { parse: () => ({}), stringify: () => "" },
    crypto: globalThis.crypto || { randomUUID: () => '1234', createHash: () => ({ update: () => ({ digest: () => "" }) }) },
  };

  shims.https = shims.http;

  // Globally hijack all modules
  Object.keys(shims).forEach(name => {
    const shim = shims[name];
    globalThis['__CF_SHIM_' + name + '__'] = shim;
    if (!globalThis[name]) {
      try {
        const native = require("node:" + name);
        globalThis[name] = Object.assign(Object.create(native), shim);
      } catch (e) {
        globalThis[name] = shim;
      }
    } else {
      Object.assign(globalThis[name], shim);
    }
  });
})();
// --- OMNI-SHIM END ---
`;

filesToFix.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // Prepend the Omni-Shim to EVERY file to ensure it's always there
  if (!content.includes('OMNI-SHIM START')) {
    content = omniShim + content;
  }

  // Replace all require calls with a SAFE global lookup
  coreModules.forEach(mod => {
    const regex = new RegExp(`(?<!\\.)require\\(['"](node:)?${mod}['"]\\)`, 'g');
    content = content.replace(regex, `(globalThis.__CF_SHIM_${mod}__ || globalThis.${mod} || {})`);
  });

  // Aggressive class extension rewrite
  content = content.replace(/extends\s+[a-zA-Z0-9_$]+\.IncomingMessage/g, 'extends (globalThis.__CF_SHIM_http__.IncomingMessage)');
  content = content.replace(/extends\s+[a-zA-Z0-9_$]+\.ServerResponse/g, 'extends (globalThis.__CF_SHIM_http__.ServerResponse)');
  content = content.replace(/extends\s+IncomingMessage/g, 'extends (globalThis.__CF_SHIM_http__.IncomingMessage)');
  content = content.replace(/extends\s+ServerResponse/g, 'extends (globalThis.__CF_SHIM_http__.ServerResponse)');

  fs.writeFileSync(file, content);
});

console.log('🚀 Omni-Shim deployment complete.');
