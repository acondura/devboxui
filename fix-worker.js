const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.js') || file.endsWith('.mjs')) {
        results.push(file);
      }
    }
  });
  return results;
}

const openNextDir = path.join(process.cwd(), '.open-next');

if (fs.existsSync(openNextDir)) {
  const files = walk(openNextDir);
  console.log(`🔍 Scanning ${files.length} files in .open-next...`);

  const modules = [
    'async_hooks', 'fs', 'path', 'os', 'url', 'vm', 'util', 
    'buffer', 'crypto', 'stream', 'http', 'https', 'events', 
    'net', 'tls', 'zlib'
  ];

  let fixedCount = 0;

  files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;

    modules.forEach(mod => {
      // Handle both require("fs") and require('fs')
      const regex = new RegExp(`require\\(["']${mod}["']\\)`, 'g');
      if (regex.test(content)) {
        content = content.replace(regex, `require("node:${mod}")`);
        changed = true;
      }
    });

    if (changed) {
      fs.writeFileSync(file, content);
      fixedCount++;
      console.log(`✅ Fixed: ${path.relative(openNextDir, file)}`);
    }
  });

  console.log(`✨ Done! Fixed ${fixedCount} files.`);
} else {
  console.error('❌ Could not find .open-next directory');
  process.exit(1);
}
