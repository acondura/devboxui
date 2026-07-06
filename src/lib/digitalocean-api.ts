import { CloudflareEnv } from './auth';

export interface DigitalOceanDroplet {
  id: number;
  name: string;
  status: 'new' | 'active' | 'off' | 'archive';
  networks: {
    v4?: {
      ip_address: string;
      type: 'public' | 'private';
    }[];
  };
  region: {
    slug: string;
    name: string;
  };
  size_slug: string;
  image: {
    id: number;
    name: string;
    distribution: string;
  };
  created_at: string;
}

export interface DigitalOceanImage {
  id: number;
  name: string;
  distribution: string;
  slug: string | null;
  public: boolean;
  regions: string[];
  type: 'base' | 'snapshot';
  min_disk_size: number;
  size_gigabytes?: number;
}

export interface DigitalOceanRegion {
  name: string;
  slug: string;
  sizes: string[];
  available: boolean;
}

export interface DigitalOceanSize {
  slug: string;
  memory: number;
  vcpus: number;
  disk: number;
  price_monthly: number;
  regions: string[];
}

export interface DigitalOceanAction {
  id: number;
  status: 'in-progress' | 'completed' | 'errored';
  type: string;
  started_at: string;
}

export interface DigitalOceanSSHKey {
  id: number;
  name: string;
  fingerprint: string;
  public_key: string;
}

export interface DigitalOceanSSHKeysResponse {
  ssh_keys: DigitalOceanSSHKey[];
}

export interface DigitalOceanSSHKeyResponse {
  ssh_key: DigitalOceanSSHKey;
}

export interface DigitalOceanDropletResponse {
  droplet: DigitalOceanDroplet;
  links?: {
    actions?: {
      id: number;
      rel: string;
      href: string;
    }[];
  };
}

export class DigitalOceanApiService {
  private token: string;
  private baseUrl = 'https://api.digitalocean.com/v2';

  constructor(env: CloudflareEnv, token?: string) {
    // If no distinct digitalocean token is configured, fallback to HETZNER_API_TOKEN or CLOUDFLARE_API_TOKEN
    this.token = token || env.CLOUDFLARE_API_TOKEN || '';
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set('Content-Type', 'application/json');
    headers.set('Authorization', `Bearer ${this.token}`);

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DigitalOcean API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return await response.json() as T;
  }

  /**
   * Creates a Droplet (virtual machine)
   */
  async createDroplet(
    name: string,
    region: string,
    size: string,
    image: string | number,
    sshKeys: (string | number)[],
    userData: string
  ): Promise<DigitalOceanDropletResponse> {
    const imageParam = typeof image === 'string' && /^\d+$/.test(image) ? parseInt(image, 10) : image;
    
    // DigitalOcean expects SSH key IDs as numbers or fingerprints as strings
    const sshKeysParam = sshKeys.map(k => {
      if (typeof k === 'string' && /^\d+$/.test(k)) {
        return parseInt(k, 10);
      }
      return k;
    });

    const body = {
      name,
      region,
      size,
      image: imageParam,
      ssh_keys: sshKeysParam,
      user_data: userData,
      backups: false,
      ipv6: false,
      monitoring: true
    };

    return this.request<DigitalOceanDropletResponse>('/droplets', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  /**
   * Retrieves droplet status and details
   */
  async getDroplet(dropletId: number): Promise<DigitalOceanDroplet> {
    const data = await this.request<{ droplet: DigitalOceanDroplet }>(`/droplets/${dropletId}`);
    return data.droplet;
  }

  /**
   * Deletes a Droplet
   */
  async deleteDroplet(dropletId: number): Promise<void> {
    await this.request<void>(`/droplets/${dropletId}`, {
      method: 'DELETE'
    });
  }

  /**
   * Shuts down or powers off a droplet
   */
  async shutdownDroplet(dropletId: number): Promise<DigitalOceanAction> {
    const data = await this.request<{ action: DigitalOceanAction }>(`/droplets/${dropletId}/actions`, {
      method: 'POST',
      body: JSON.stringify({ type: 'shutdown' })
    });
    return data.action;
  }

  async poweroffDroplet(dropletId: number): Promise<DigitalOceanAction> {
    const data = await this.request<{ action: DigitalOceanAction }>(`/droplets/${dropletId}/actions`, {
      method: 'POST',
      body: JSON.stringify({ type: 'power_off' })
    });
    return data.action;
  }

  /**
   * Creates a snapshot from a powered-off droplet
   */
  async createSnapshot(dropletId: number, name: string): Promise<{ action: DigitalOceanAction }> {
    const data = await this.request<{ action: DigitalOceanAction }>(`/droplets/${dropletId}/actions`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'snapshot',
        name
      })
    });
    return data;
  }

  /**
   * Retrieves an action status
   */
  async getAction(actionId: number): Promise<DigitalOceanAction> {
    const data = await this.request<{ action: DigitalOceanAction }>(`/actions/${actionId}`);
    return data.action;
  }

  /**
   * Polls droplet status until it matches desired value
   */
  async waitForDropletStatus(dropletId: number, targetStatus: string, timeoutMs = 120_000, intervalMs = 5000): Promise<DigitalOceanDroplet> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      try {
        const droplet = await this.getDroplet(dropletId);
        if (droplet.status === targetStatus) return droplet;
      } catch (err) {
        console.warn(`Error waiting for droplet status:`, err);
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Timeout waiting for droplet ${dropletId} to reach status ${targetStatus}`);
  }

  /**
   * Polls action status until it is completed
   */
  async waitForAction(actionId: number, timeoutMs = 300_000, intervalMs = 5000): Promise<DigitalOceanAction> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const action = await this.getAction(actionId);
      if (action.status === 'completed') return action;
      if (action.status === 'errored') throw new Error(`Action ${actionId} failed on DigitalOcean.`);
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Timeout waiting for action ${actionId} to complete.`);
  }

  /**
   * Region/Location list
   */
  async getRegions(): Promise<DigitalOceanRegion[]> {
    const data = await this.request<{ regions: DigitalOceanRegion[] }>('/regions');
    return data.regions.filter(r => r.available);
  }

  /**
   * Size/Instance spec list
   */
  async getSizes(): Promise<DigitalOceanSize[]> {
    const data = await this.request<{ sizes: DigitalOceanSize[] }>('/sizes');
    return data.sizes;
  }

  /**
   * Get SSH Keys
   */
  async getSSHKeys(): Promise<DigitalOceanSSHKey[]> {
    const data = await this.request<DigitalOceanSSHKeysResponse>('/account/keys');
    return data.ssh_keys;
  }

  /**
   * Create SSH Key on DigitalOcean account
   */
  async createSSHKey(name: string, publicKey: string): Promise<DigitalOceanSSHKey> {
    const data = await this.request<DigitalOceanSSHKeyResponse>('/account/keys', {
      method: 'POST',
      body: JSON.stringify({
        name,
        public_key: publicKey
      })
    });
    return data.ssh_key;
  }

  /**
   * Delete SSH Key
   */
  async deleteSSHKey(keyId: number): Promise<void> {
    await this.request<void>(`/account/keys/${keyId}`, {
      method: 'DELETE'
    });
  }

  /**
   * Get distributions and private snapshots
   */
  async getImages(type: 'distribution' | 'private' = 'distribution'): Promise<DigitalOceanImage[]> {
    const path = type === 'private' ? '/images?private=true' : '/images?type=distribution';
    const data = await this.request<{ images: DigitalOceanImage[] }>(path);
    return data.images;
  }

  /**
   * Deletes a private snapshot image
   */
  async deleteSnapshot(imageId: number): Promise<void> {
    await this.request<void>(`/images/${imageId}`, {
      method: 'DELETE'
    });
  }
}
