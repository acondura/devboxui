import esbuild from 'esbuild';
import path from 'path';
import { builtinModules } from 'module';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.js',
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  external: builtinModules.flatMap(m => [m, `node:${m}`]),
  banner: {
    js: `
import { Buffer } from 'node:buffer';
import { Socket } from 'node:net';
import { EventEmitter } from 'node:events';
import assert from 'node:assert';
import crypto from 'node:crypto';
import stream from 'node:stream';
import util from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import zlib from 'node:zlib';
import child_process from 'node:child_process';

// Hardcode these since there is no real filesystem on Workers
const __filename = '/index.js';
const __dirname = '/';

const _node_modules = {
  'node:buffer': { Buffer },
  'node:net': { Socket },
  'node:events': EventEmitter,
  'node:assert': assert,
  'node:crypto': crypto,
  'node:stream': stream,
  'node:util': util,
  'node:path': path,
  'node:fs': fs,
  'node:dns': dns,
  'node:http': http,
  'node:https': https,
  'node:tls': tls,
  'node:zlib': zlib,
  'node:child_process': child_process,
};

Object.keys(_node_modules).forEach(key => {
  _node_modules[key.replace('node:', '')] = _node_modules[key];
});

const require = (name) => {
  if (_node_modules[name]) return _node_modules[name];
  throw new Error('Dynamic require of ' + name + ' is not supported');
};
`,
  },
  plugins: [
    {
      name: 'ignore-node-binaries',
      setup(build) {
        build.onResolve({ filter: /\.node$/ }, () => ({
          path: path.resolve('sshcrypto-shim.js'),
        }));
      },
    },
  ],
}).catch(() => process.exit(1));

console.log('✅ SSH Worker bundled successfully (Require, Static paths injected).');
