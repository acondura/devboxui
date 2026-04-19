import esbuild from 'esbuild';
import path from 'path';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.js',
  format: 'esm',
  platform: 'browser', // Use browser platform to avoid Node-style 'require' in output
  target: 'es2022',
  external: ['node:*'], // Let Cloudflare handle node: built-ins
  plugins: [{
    name: 'ignore-node-binaries',
    setup(build) {
      // Intercept any import/require ending in .node and replace it with an empty module
      build.onResolve({ filter: /\.node$/ }, () => ({
        path: path.resolve('sshcrypto-shim.js'),
      }));
    },
  }],
}).catch(() => process.exit(1));

console.log('✅ SSH Worker bundled successfully (Native binaries ignored).');
