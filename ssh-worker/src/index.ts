import { Client } from 'ssh2';
import { connect } from 'cloudflare:sockets';

export interface Env {
  SSH_SERVICE_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 1. Auth Check
    const authHeader = request.headers.get('Authorization');
    if (!env.SSH_SERVICE_SECRET || authHeader !== `Bearer ${env.SSH_SERVICE_SECRET}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const body = await request.json() as any;
      const { host, username, password, privateKey, command } = body;

      if (!host || !username || !command) {
        return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400 });
      }

      // 2. Create raw TCP socket via connect()
      const socket = connect({ hostname: host, port: 22 });

      // 3. Connect ssh2 via the socket
      const result = await new Promise((resolve, reject) => {
        const conn = new Client();
        let stdout = '';
        let stderr = '';

        conn.on('ready', () => {
          conn.exec(command, (err, stream) => {
            if (err) {
              conn.end();
              return reject(err);
            }
            stream.on('close', (code: number, signal: string) => {
              conn.end();
              resolve({ success: true, stdout, stderr, code, signal });
            }).on('data', (data: any) => {
              stdout += data.toString();
            }).stderr.on('data', (data: any) => {
              stderr += data.toString();
            });
          });
        }).on('error', (err) => {
          reject(err);
        });

        // Use the connect() socket as the underlying transport
        // ssh2 expects a stream-like object
        conn.connect({
          sock: socket as any,
          username,
          password,
          privateKey,
          readyTimeout: 30000,
        });
      });

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message || 'SSH connection failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
};
