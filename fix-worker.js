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
const coreModules = ['http', 'https', 'fs', 'os'];

filesToFix.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // Simple, non-intrusive shims
  const shims = `
if (typeof globalThis.http === 'undefined') {
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
if (typeof globalThis.fs === 'undefined') {
  globalThis.fs = { readFileSync: () => "", readFile: () => {}, statSync: () => ({ isDirectory: () => false }), promises: { readFile: () => Promise.resolve("") } };
}
`;
  
  if (!content.includes('globalThis.http')) {
    content = shims + content;
  }

  // Only patch the critical modules
  coreModules.forEach(mod => {
    const regex = new RegExp(`(?<!\\.)require\\(['"](node:)?${mod}['"]\\)`, 'g');
    content = content.replace(regex, `(globalThis.${mod})`);
  });

  fs.writeFileSync(file, content);
});

console.log('✅ Reverted to simple surgical patching.');
