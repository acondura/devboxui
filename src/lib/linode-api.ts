import { CloudflareEnv } from './auth';

export interface LinodeInstance {
  id: number;
  label: string;
  status: 'running' | 'offline' | 'booting' | 'rebooting' | 'shutting_down' | 'provisioning' | 'deleting' | 'migrating' | 'rebuilding' | 'cloning' | 'restoring' | 'stopped';
  region: string;
  type: string;
  ipv4: string[];
  image: string | null;
  created: string;
  specs: {
    disk: number;
    memory: number;
    vcpus: number;
  };
}

export interface LinodeDisk {
  id: number;
  label: string;
  status: string;
  filesystem: string;
  size: number;
}

export interface LinodeImage {
  id: string;
  label: string;
  description: string | null;
  is_public: boolean;
  vendor: string | null;
  type: 'manual' | 'automatic';
  status: string;
  size: number;
}

export interface LinodeRegion {
  id: string;
  label: string;
  country: string;
  capabilities: string[];
  status: 'ok' | 'outage';
}

export interface LinodeTypePrice {
  monthly: number;
  hourly: number;
}

export interface LinodeType {
  id: string;
  label: string;
  class: 'nanode' | 'standard' | 'dedicated' | 'premium' | 'high-memory' | 'gpu';
  disk: number;
  memory: number;
  vcpus: number;
  price: LinodeTypePrice;
}

interface LinodePage<T> {
  data: T[];
  page: number;
  pages: number;
  results: number;
}

/**
 * Service for interacting with the Linode (Akamai Cloud Compute) API v4.
 * https://techdocs.akamai.com/linode-api/reference
 */
export class LinodeApiService {
  private token: string;
  private baseUrl = 'https://api.linode.com/v4';

  constructor(env: CloudflareEnv, token?: string) {
    this.token = token || '';
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
      throw new Error(`Linode API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return await response.json() as T;
  }

  /**
   * Creates a Linode instance. Public keys are injected directly via `authorized_keys`
   * (Linode does not require pre-registering SSH keys by ID like Hetzner/DigitalOcean).
   */
  async createInstance(config: {
    label: string;
    region: string;
    type: string;
    image: string;
    rootPassword: string;
    authorizedKeys: string[];
    userData?: string;
  }): Promise<LinodeInstance> {
    const body: Record<string, unknown> = {
      label: config.label,
      region: config.region,
      type: config.type,
      image: config.image,
      root_pass: config.rootPassword,
      authorized_keys: config.authorizedKeys,
      backups_enabled: false,
      booted: true,
    };
    // Linode Metadata service accepts cloud-init user data base64-encoded
    if (config.userData) {
      body.metadata = { user_data: Buffer.from(config.userData).toString('base64') };
    }

    return this.request<LinodeInstance>('/linode/instances', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  async getInstance(instanceId: number): Promise<LinodeInstance> {
    return this.request<LinodeInstance>(`/linode/instances/${instanceId}`);
  }

  async deleteInstance(instanceId: number): Promise<void> {
    await this.request<void>(`/linode/instances/${instanceId}`, { method: 'DELETE' });
  }

  async rebootInstance(instanceId: number): Promise<void> {
    await this.request<void>(`/linode/instances/${instanceId}/reboot`, { method: 'POST' });
  }

  async shutdownInstance(instanceId: number): Promise<void> {
    await this.request<void>(`/linode/instances/${instanceId}/shutdown`, { method: 'POST' });
  }

  async bootInstance(instanceId: number): Promise<void> {
    await this.request<void>(`/linode/instances/${instanceId}/boot`, { method: 'POST' });
  }

  /**
   * Rebuilds (reinstalls) a Linode from an image, replacing its disks.
   */
  async rebuildInstance(instanceId: number, config: {
    image: string;
    rootPassword: string;
    authorizedKeys: string[];
  }): Promise<LinodeInstance> {
    return this.request<LinodeInstance>(`/linode/instances/${instanceId}/rebuild`, {
      method: 'POST',
      body: JSON.stringify({
        image: config.image,
        root_pass: config.rootPassword,
        authorized_keys: config.authorizedKeys,
        booted: true
      })
    });
  }

  async getDisks(instanceId: number): Promise<LinodeDisk[]> {
    const data = await this.request<LinodePage<LinodeDisk>>(`/linode/instances/${instanceId}/disks`);
    return data.data;
  }

  /**
   * Creates a private Image (snapshot) from the instance's primary ext4 disk.
   * The Linode should be powered off first for a consistent snapshot.
   */
  async createSnapshot(instanceId: number, label: string, description?: string): Promise<LinodeImage> {
    const disks = await this.getDisks(instanceId);
    const primaryDisk = disks.find(d => d.filesystem === 'ext4') || disks[0];
    if (!primaryDisk) throw new Error(`No disks found for Linode instance ${instanceId}`);

    return this.request<LinodeImage>('/images', {
      method: 'POST',
      body: JSON.stringify({
        disk_id: primaryDisk.id,
        label,
        description: description || `Snapshot of instance ${instanceId}`
      })
    });
  }

  async getImages(includePrivate = true): Promise<LinodeImage[]> {
    const data = await this.request<LinodePage<LinodeImage>>('/images');
    return includePrivate ? data.data : data.data.filter(i => i.is_public);
  }

  async deleteSnapshot(imageId: string): Promise<void> {
    await this.request<void>(`/images/${encodeURIComponent(imageId)}`, { method: 'DELETE' });
  }

  async getRegions(): Promise<LinodeRegion[]> {
    const data = await this.request<LinodePage<LinodeRegion>>('/regions');
    return data.data.filter(r => r.status === 'ok');
  }

  async getTypes(): Promise<LinodeType[]> {
    const data = await this.request<LinodePage<LinodeType>>('/linode/types');
    return data.data;
  }

  /**
   * Polls instance status until it matches the desired value.
   */
  async waitForInstanceStatus(instanceId: number, targetStatus: LinodeInstance['status'], timeoutMs = 15_000, intervalMs = 2000): Promise<LinodeInstance> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      try {
        const instance = await this.getInstance(instanceId);
        if (instance.status === targetStatus) return instance;
      } catch (err) {
        console.warn(`Error waiting for Linode instance status:`, err);
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Timeout waiting for Linode instance ${instanceId} to reach status ${targetStatus}`);
  }
}
