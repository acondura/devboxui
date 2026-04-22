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
          // Critical: Tell ssh2 to use standard algorithms supported by node:crypto
          // This avoids the library trying to load WebAssembly for Ed25519/Poly1305
          algorithms: {
            kex: [
              'diffie-hellman-group14-sha256',
              'diffie-hellman-group16-sha512',
              'diffie-hellman-group-exchange-sha256',
              'ecdh-sha2-nistp256',
              'ecdh-sha2-nistp384',
              'ecdh-sha2-nistp521',
            ],
            cipher: [
              'aes128-ctr',
              'aes192-ctr',
              'aes256-ctr',
              'aes128-gcm',
              'aes256-gcm',
            ],
            hmac: [
              'hmac-sha2-256',
              'hmac-sha2-512',
            ],
            serverHostKey: [
              'ssh-rsa',
              'ecdsa-sha2-nistp256',
              'ecdsa-sha2-nistp384',
              'ecdsa-sha2-nistp521',
            ],
          },
          readyTimeout: 30000,
        });
      });
    } catch (e: any) {
      return Response.json({ success: false, error: e.message }, { status: 400 });
    }
  },
};
