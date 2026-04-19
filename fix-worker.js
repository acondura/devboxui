const fs = require('fs');
const path = require('path');

const workerPath = path.join(process.cwd(), '.open-next', 'worker.js');

if (fs.existsSync(workerPath)) {
  let content = fs.readFileSync(workerPath, 'utf8');
  
  // Modules to prefix with node:
  const modules = [
    'async_hooks', 'fs', 'path', 'os', 'url', 'vm', 'util', 
    'buffer', 'crypto', 'stream', 'http', 'https', 'events', 
    'net', 'tls', 'zlib'
  ];

  modules.forEach(mod => {
    const regex = new RegExp(`require\\("${mod}"\\)`, 'g');
    content = content.replace(regex, `require("node:${mod}")`);
  });

  fs.writeFileSync(workerPath, content);
  console.log('✅ Successfully prefixed Node.js modules in worker.js');
} else {
  console.error('❌ Could not find .open-next/worker.js');
  process.exit(1);
}
