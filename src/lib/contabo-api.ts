/**
 * src/lib/contabo-api.ts
 * Service for interacting with the Contabo API V1
 */
export interface ContaboSecret {
  id: number;
  name: string;
  type: string;
  createdAt: string;
}

export interface ContaboInstance {
  instanceId: number;
  name: string;
  ipAddress: string;
  status: string;
  productId: string;
  region: string;
  imageId: string;
}

export class ContaboApiService {
  private token: string | null = null;
  private tokenExpiry: number = 0;

  constructor(
    private env: unknown,
    private credentials: {
      clientId: string;
      clientSecret: string;
      apiUsername: string;
      apiPassword: string;
    }
  ) {}

  private async getAccessToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    const authUrl = 'https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token';
    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('client_id', this.credentials.clientId);
    params.append('client_secret', this.credentials.clientSecret);
    params.append('username', this.credentials.apiUsername);
    params.append('password', this.credentials.apiPassword);

    const response = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!response.ok) {
      throw new Error(`Contabo Auth Failed: ${response.statusText}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    this.token = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
    return this.token;
  }

  async createSecret(name: string, publicKey: string): Promise<ContaboSecret> {
    const token = await this.getAccessToken();
    const response = await fetch('https://api.contabo.com/v1/compute/secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-request-id': crypto.randomUUID()
      },
      body: JSON.stringify({ name, type: 'ssh', value: publicKey })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to create Contabo secret: ${err}`);
    }

    const result = await response.json() as { data: ContaboSecret[] };
    return result.data[0];
  }

  async createInstance(config: {
    productId: string;
    region: string;
    imageId: string;
    name: string;
    userData: string;
    sshKeys: number[];
  }): Promise<ContaboInstance> {
    const token = await this.getAccessToken();
    const response = await fetch('https://api.contabo.com/v1/compute/instances', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-request-id': crypto.randomUUID()
      },
      body: JSON.stringify(config)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to create Contabo instance: ${err}`);
    }

    const result = await response.json() as { data: ContaboInstance[] };
    return result.data[0];
  }
}
