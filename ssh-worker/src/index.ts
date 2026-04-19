import { Client } from 'ssh2';

export interface Env {
  SSH_SERVICE_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 1. Security Check
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${env.SSH_SERVICE_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const { host, username, password, privateKey, command } = await request.json() as any;

      return new Promise((resolve) => {
        const conn = new Client();
        let output = '';
        let errorOutput = '';

        conn.on('ready', () => {
          conn.exec(command, (err, stream) => {
            if (err) {
              resolve(Response.json({ success: false, error: err.message }, { status: 500 }));
              return;
            }
            stream.on('close', (code: number) => {
              conn.end();
              resolve(Response.json({ 
                success: true, 
                code, 
                stdout: output, 
                stderr: errorOutput 
              }));
            }).on('data', (data: any) => {
              output += data.toString();
            }).stderr.on('data', (data: any) => {
              errorOutput += data.toString();
            });
          });
        }).on('error', (err) => {
          resolve(Response.json({ success: false, error: err.message }, { status: 500 }));
        }).connect({
          host,
          port: 22,
          username,
          password,
          privateKey,
          // Critical: Tell ssh2 to use Cloudflare's socket API
          readyTimeout: 20000,
        });
      });
    } catch (e: any) {
      return Response.json({ success: false, error: e.message }, { status: 400 });
    }
  },
};
