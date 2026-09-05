import { CloudflareEnv } from './auth';

export interface VultrInstance {
  id: string;
  label: string;
  region: string;
  plan: string;
  status: 'active' | 'pending' | 'suspended' | 'resizing';
  power_status: 'running' | 'stopped';
  server_status: 'none' | 'locked' | 'installing' | 'booting' | 'ok';
  main_ip: string;
  os: string;
  os_id: number;
  date_created: string;
}

export interface VultrSnapshot {
  id: string;
  date_created: string;
  description: string;
  size: number;
  status: 'pending' | 'complete';
  os_id: number;
  app_id: number;
}

export interface VultrRegion {
  id: string;
  city: string;
  country: string;
  continent: string;
  options: string[];
}

export interface VultrPlan {
  id: string;
  vcpu_count: number;
  ram: number;
  disk: number;
  monthly_cost: number;
  type: string;
  locations: string[];
}

export interface VultrOs {
  id: number;
  name: string;
  arch: string;
  family: string;
}

export interface VultrSshKey {
  id: string;
  name: string;
  ssh_key: string;
  date_created: string;
}

interface VultrMeta {
  total: number;
  links: { next: string; prev: string };
}

/**
 * Service for interacting with the Vultr API v2.
 * https://www.vultr.com/api/
 */
export class VultrApiService {
  private token: string;
  private baseUrl = 'https://api.vultr.com/v2';

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
      throw new Error(`Vultr API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return await response.json() as T;
  }

  /**
   * Creates a Vultr instance. Either `osId` (fresh OS) or `snapshotId` (restore) must be provided.
   */
  async createInstance(config: {
    label: string;
    region: string;
    plan: string;
    osId?: number;
    snapshotId?: string;
    sshKeyIds: string[];
    userData?: string;
  }): Promise<VultrInstance> {
    const body: Record<string, unknown> = {
      label: config.label,
      region: config.region,
      plan: config.plan,
      sshkey_id: config.sshKeyIds,
      backups: 'disabled',
      enable_ipv6: false,
    };
    if (config.snapshotId) {
      body.snapshot_id = config.snapshotId;
    } else {
      body.os_id = config.osId;
    }
    if (config.userData) {
      body.user_data = Buffer.from(config.userData).toString('base64');
    }

    const data = await this.request<{ instance: VultrInstance }>('/instances', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    return data.instance;
  }

  async getInstance(instanceId: string): Promise<VultrInstance> {
    const data = await this.request<{ instance: VultrInstance }>(`/instances/${instanceId}`);
    return data.instance;
  }

  async deleteInstance(instanceId: string): Promise<void> {
    await this.request<void>(`/instances/${instanceId}`, { method: 'DELETE' });
  }

  async rebootInstance(instanceId: string): Promise<void> {
    await this.request<void>(`/instances/${instanceId}/reboot`, { method: 'POST' });
  }

  async haltInstance(instanceId: string): Promise<void> {
    await this.request<void>(`/instances/${instanceId}/halt`, { method: 'POST' });
  }

  async startInstance(instanceId: string): Promise<void> {
    await this.request<void>(`/instances/${instanceId}/start`, { method: 'POST' });
  }

  /**
   * Reinstalls the OS on an existing instance (wipes disk).
   */
  async reinstallInstance(instanceId: string): Promise<VultrInstance> {
    const data = await this.request<{ instance: VultrInstance }>(`/instances/${instanceId}/reinstall`, {
      method: 'POST'
    });
    return data.instance;
  }

  async createSnapshot(instanceId: string, description: string): Promise<VultrSnapshot> {
    const data = await this.request<{ snapshot: VultrSnapshot }>('/snapshots', {
      method: 'POST',
      body: JSON.stringify({ instance_id: instanceId, description })
    });
    return data.snapshot;
  }

  async getSnapshot(snapshotId: string): Promise<VultrSnapshot> {
    const data = await this.request<{ snapshot: VultrSnapshot }>(`/snapshots/${snapshotId}`);
    return data.snapshot;
  }

  async listSnapshots(): Promise<VultrSnapshot[]> {
    const data = await this.request<{ snapshots: VultrSnapshot[]; meta: VultrMeta }>('/snapshots?per_page=100');
    return data.snapshots;
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    await this.request<void>(`/snapshots/${snapshotId}`, { method: 'DELETE' });
  }

  async getRegions(): Promise<VultrRegion[]> {
    const data = await this.request<{ regions: VultrRegion[]; meta: VultrMeta }>('/regions');
    return data.regions;
  }

  async getPlans(): Promise<VultrPlan[]> {
    const data = await this.request<{ plans: VultrPlan[]; meta: VultrMeta }>('/plans?per_page=500');
    return data.plans;
  }

  async getOsList(): Promise<VultrOs[]> {
    const data = await this.request<{ os: VultrOs[]; meta: VultrMeta }>('/os?per_page=500');
    return data.os;
  }

  async getSSHKeys(): Promise<VultrSshKey[]> {
    const data = await this.request<{ ssh_keys: VultrSshKey[]; meta: VultrMeta }>('/ssh-keys');
    return data.ssh_keys;
  }

  async createSSHKey(name: string, publicKey: string): Promise<VultrSshKey> {
    const data = await this.request<{ ssh_key: VultrSshKey }>('/ssh-keys', {
      method: 'POST',
      body: JSON.stringify({ name, ssh_key: publicKey })
    });
    return data.ssh_key;
  }

  async deleteSSHKey(keyId: string): Promise<void> {
    await this.request<void>(`/ssh-keys/${keyId}`, { method: 'DELETE' });
  }

  /**
   * Polls instance power_status until it matches the desired value.
   */
  async waitForPowerStatus(instanceId: string, targetStatus: VultrInstance['power_status'], timeoutMs = 15_000, intervalMs = 2000): Promise<VultrInstance> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      try {
        const instance = await this.getInstance(instanceId);
        if (instance.power_status === targetStatus && instance.main_ip && instance.main_ip !== '0.0.0.0') return instance;
      } catch (err) {
        console.warn(`Error waiting for Vultr instance status:`, err);
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Timeout waiting for Vultr instance ${instanceId} to reach status ${targetStatus}`);
  }
}
