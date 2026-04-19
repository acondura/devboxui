import esbuild from 'esbuild';
import path from 'path';
import { builtinModules } from 'module';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.js',
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  // Mark all built-in modules as external, but with the node: prefix
  external: builtinModules.flatMap(m => [m, `node:${m}`]),
  plugins: [
    {
      name: 'ignore-node-binaries',
      setup(build) {
        build.onResolve({ filter: /\.node$/ }, () => ({
          path: path.resolve('sshcrypto-shim.js'),
        }));
      },
    },
    {
      name: 'prefix-node-builtins',
      setup(build) {
        // Catch any bare node module (e.g. 'http') and prefix it with 'node:'
        const filter = new RegExp(`^(${builtinModules.join('|')})$`);
        build.onResolve({ filter }, args => ({
          path: `node:${args.path}`,
          external: true,
        }));
      },
    }
  ],
}).catch(() => process.exit(1));

console.log('✅ SSH Worker bundled successfully (Built-ins prefixed, Binaries ignored).');
