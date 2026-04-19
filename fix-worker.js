const fs = require('fs');
const path = require('path');

// We only want to fix the primary entry points, not every file in node_modules
const filesToFix = [
  path.join(process.cwd(), '.open-next', 'worker.js'),
  path.join(process.cwd(), '.open-next', 'server-functions', 'default', 'handler.mjs')
];

const modules = [
  'async_hooks', 'fs', 'path', 'os', 'url', 'vm', 'util', 
  'buffer', 'crypto', 'stream', 'http', 'https', 'events', 
  'net', 'tls', 'zlib'
];

filesToFix.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;

    modules.forEach(mod => {
      const regex = new RegExp(`require\\(["']${mod}["']\\)`, 'g');
      if (regex.test(content)) {
        content = content.replace(regex, `require("node:${mod}")`);
        changed = true;
      }
    });

    if (changed) {
      fs.writeFileSync(file, content);
      console.log(`✅ Fixed entry point: ${path.relative(process.cwd(), file)}`);
    }
  } else {
    console.log(`ℹ️ Skipping (not found): ${path.relative(process.cwd(), file)}`);
  }
});

console.log('✨ Entry point patching complete.');
