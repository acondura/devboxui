import { CloudflareEnv } from './auth';

export interface HetznerServer {
  id: number;
  name: string;
  status: string;
  public_net: {
    ipv4: {
      ip: string;
    };
  };
  server_type: {
    id: number;
    name: string;
    description: string;
    cores: number;
    memory: number;
    disk: number;
    architecture: string;
    deprecated: boolean;
    storage_type: string;
    cpu_type: string;
  };
  datacenter: {
    location: {
      name: string;
      city: string;
    }
  };
  created: string;
  protection: {
    delete: boolean;
    rebuild: boolean;
  };
}

export interface HetznerServerResponse {
  server: HetznerServer;
  action: {
    id: number;
    command: string;
    status: string;
  };
  root_password?: string;
}

export interface HetznerServersResponse {
  servers: HetznerServer[];
}

export interface HetznerSSHKey {
  id: number;
  name: string;
  fingerprint: string;
  public_key: string;
}

export interface HetznerSSHKeysResponse {
  ssh_keys: HetznerSSHKey[];
}

export interface HetznerSSHKeyResponse {
  ssh_key: HetznerSSHKey;
}

export interface HetznerPrice {
  location: string;
  price_monthly: { gross: string; net?: string };
  price_hourly: { gross: string; net?: string };
}

export interface HetznerPriceDetails {
  net: string;
  gross: string;
}

export interface HetznerPrimaryIPTypePricing {
  location: string;
  hourly: HetznerPriceDetails;
  monthly: HetznerPriceDetails;
}

export interface HetznerPrimaryIPPricing {
  type: string;
  pricings: HetznerPrimaryIPTypePricing[];
}

export interface HetznerPricingResponse {
  pricing: {
    currency: string;
    vat_rate: string;
    primary_ips: HetznerPrimaryIPPricing[];
  };
}

export interface HetznerServerType {
  id: number;
  name: string;
  description: string;
  cores: number;
  memory: number;
  disk: number;
  deprecated: boolean;
  prices: HetznerPrice[];
  storage_type: string;
  cpu_type: string;
  architecture: string;
}

export interface HetznerLocation {
  id: number;
  name: string;
  description: string;
  city: string;
  country: string;
  network_zone: string;
}

export interface HetznerImage {
  id: number;
  name: string | null;
  description: string;
  status: string;
  os_flavor: string;
  type: string;
  deprecated: boolean | string | null;
  created: string;
  disk_size: number;
  labels: Record<string, string>;
  architecture: string;
}

export interface HetznerAction {
  id: number;
  command: string;
  status: 'running' | 'success' | 'error';
  progress: number;
  started: string;
  finished: string | null;
  error: { code: string; message: string } | null;
}

export class HetznerApiService {
  private token: string;
  private baseUrl = 'https://api.hetzner.cloud/v1';

  constructor(env: CloudflareEnv, token?: string) {
    this.token = token || env.HETZNER_API_TOKEN || '';
  }

  /**
   * Creates a new Hetzner Cloud Server with Cloud-Init user_data
   */
  async createServer(
    name: string, 
    userData: string, 
    serverType: string = 'cpx21', 
    location: string = 'nbg1',
    image: string | number = 'ubuntu-24.04',
    sshKeys: (string | number)[] = []
  ): Promise<HetznerServerResponse> {
    const imgParam = typeof image === 'string' && /^\d+$/.test(image) ? parseInt(image, 10) : image;
    const response = await fetch(`${this.baseUrl}/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({
        name,
        server_type: serverType,
        image: imgParam,
        location: location,
        user_data: userData,
        start_after_create: true,
        ssh_keys: sshKeys,
        public_net: {
          enable_ipv4: true,
          enable_ipv6: false
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Hetzner API Error: ${response.status} ${response.statusText} - ${error}`);
    }

    return await response.json() as HetznerServerResponse;
  }

  /**
   * Gets a list of all servers in the project
   */
  async getAllServers(): Promise<HetznerServer[]> {
    if (!this.token) return [];
    
    const response = await fetch(`${this.baseUrl}/servers`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });

    if (!response.ok) {
      console.error(`Failed to fetch servers: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json() as HetznerServersResponse;
    return data.servers;
  }

  /**
   * Deletes a server (cleanup)
   */
  async deleteServer(serverId: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/servers/${serverId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to delete server ${serverId}:`, error);
    }
  }
  /**
   * Gets available server types
   */
  async getServerTypes(): Promise<HetznerServerType[]> {
    const response = await fetch(`${this.baseUrl}/server_types`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { server_types: HetznerServerType[] };
    return data.server_types.filter((t) => !t.deprecated);
  }

  /**
   * Gets available locations
   */
  async getLocations(): Promise<HetznerLocation[]> {
    const response = await fetch(`${this.baseUrl}/locations`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { locations: HetznerLocation[] };
    return data.locations;
  }

  /**
   * Gets available images (filtered to Ubuntu)
   */
  async getImages(): Promise<HetznerImage[]> {
    const response = await fetch(`${this.baseUrl}/images?type=system`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { images: HetznerImage[] };
    return data.images
      .filter((i) => i.os_flavor === 'ubuntu' && i.status === 'available' && !i.deprecated)
      .sort((a, b) => (b.name || '').localeCompare(a.name || '')); // Latest first
  }

  /**
   * Toggles protection on a server
   */
  async changeProtection(serverId: number, enableDeleteProtection: boolean): Promise<void> {
    const response = await fetch(`${this.baseUrl}/servers/${serverId}/actions/change_protection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({
        delete: enableDeleteProtection,
        rebuild: enableDeleteProtection
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to change protection for server ${serverId}:`, error);
      throw new Error(`Failed to change protection: ${response.statusText}`);
    }
  }

  /**
   * Gets all SSH keys in the project
   */
  async getSSHKeys(): Promise<HetznerSSHKey[]> {
    const response = await fetch(`${this.baseUrl}/ssh_keys`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    if (!response.ok) return [];
    const data = await response.json() as HetznerSSHKeysResponse;
    return data.ssh_keys;
  }

  /**
   * Creates/Registers an SSH key in Hetzner
   */
  async createSSHKey(name: string, publicKey: string): Promise<HetznerSSHKey | null> {
    const response = await fetch(`${this.baseUrl}/ssh_keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({ name, public_key: publicKey })
    });

    if (!response.ok) {
      const error = await response.text();
      // If it already exists, that's fine, but we should handle it
      if (response.status === 409) return null;
      throw new Error(`Failed to create SSH key: ${error}`);
    }

    const data = await response.json() as HetznerSSHKeyResponse;
    return data.ssh_key;
  }

  /**
   * Deletes an SSH key from Hetzner
   */
  async deleteSSHKey(sshKeyId: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/ssh_keys/${sshKeyId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to delete SSH key ${sshKeyId}:`, error);
    }
  }

  /**
   * Rebuilds a server (reinstall OS)
   */
  async rebuildServer(serverId: number, image: string = 'ubuntu-24.04'): Promise<HetznerServerResponse> {
    const response = await fetch(`${this.baseUrl}/servers/${serverId}/actions/rebuild`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({ image })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Hetzner Rebuild Error: ${response.status} - ${error}`);
    }

    return await response.json() as HetznerServerResponse;
  }

  /**
   * Cuts the power to a server hard (unclean shutdown).
   */
  async poweroffServer(serverId: number): Promise<HetznerAction> {
    const response = await fetch(`${this.baseUrl}/servers/${serverId}/actions/poweroff`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Hetzner Poweroff Error: ${response.status} - ${error}`);
    }
    const data = await response.json() as { action: HetznerAction };
    return data.action;
  }

  /**
   * Sends an ACPI shutdown signal to a server (graceful shutdown).
   */
  async shutdownServer(serverId: number): Promise<HetznerAction> {
    const response = await fetch(`${this.baseUrl}/servers/${serverId}/actions/shutdown`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Hetzner Shutdown Error: ${response.status} - ${error}`);
    }
    const data = await response.json() as { action: HetznerAction };
    return data.action;
  }

  /**
   * Gets the live status of a single server.
   */
  async getServerStatus(serverId: number): Promise<string> {
    const response = await fetch(`${this.baseUrl}/servers/${serverId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Hetzner GetServer Error: ${response.status} - ${error}`);
    }
    const data = await response.json() as { server: HetznerServer };
    return data.server.status;
  }

  /**
   * Gets details of a single server.
   */
  async getServer(serverId: number): Promise<HetznerServer> {
    const response = await fetch(`${this.baseUrl}/servers/${serverId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Hetzner GetServer Error: ${response.status} - ${error}`);
    }
    const data = await response.json() as { server: HetznerServer };
    return data.server;
  }

  /**
   * Polls until the server reaches the target status or timeout.
   */
  async waitForServerStatus(
    serverId: number,
    targetStatus: string,
    timeoutMs: number = 120_000,
    pollIntervalMs: number = 5_000
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const status = await this.getServerStatus(serverId);
      if (status === targetStatus) return;
      await new Promise(r => setTimeout(r, pollIntervalMs));
    }
    throw new Error(`Timeout: server ${serverId} did not reach status '${targetStatus}' within ${timeoutMs}ms`);
  }

  /**
   * Creates a snapshot of a server. The server MUST be powered off first.
   * Applies a label so old snapshots can be identified and cleaned up.
   */
  async createSnapshot(
    serverId: number,
    description: string,
    labels: Record<string, string> = {}
  ): Promise<{ image: HetznerImage; action: HetznerAction }> {
    const response = await fetch(`${this.baseUrl}/servers/${serverId}/actions/create_image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({
        description,
        type: 'snapshot',
        labels
      })
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Hetzner Snapshot Error: ${response.status} - ${error}`);
    }
    const data = await response.json() as { image: HetznerImage; action: HetznerAction };
    return { image: data.image, action: data.action };
  }

  /**
   * Gets a single action by ID to check its progress/status.
   */
  async getAction(actionId: number): Promise<HetznerAction> {
    const response = await fetch(`${this.baseUrl}/actions/${actionId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Hetzner GetAction Error: ${response.status} - ${error}`);
    }
    const data = await response.json() as { action: HetznerAction };
    return data.action;
  }

  /**
   * Polls until the snapshot image reaches 'available' status.
   */
  async waitForSnapshot(
    imageId: number,
    timeoutMs: number = 600_000,
    pollIntervalMs: number = 10_000
  ): Promise<HetznerImage> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const image = await this.getImage(imageId);
      if (image.status === 'available') return image;
      await new Promise(r => setTimeout(r, pollIntervalMs));
    }
    throw new Error(`Timeout: snapshot ${imageId} did not become available within ${timeoutMs}ms`);
  }

  /**
   * Gets a single image/snapshot by ID.
   */
  async getImage(imageId: number): Promise<HetznerImage> {
    const response = await fetch(`${this.baseUrl}/images/${imageId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Hetzner GetImage Error: ${response.status} - ${error}`);
    }
    const data = await response.json() as { image: HetznerImage };
    return data.image;
  }

  /**
   * Lists all snapshots, optionally filtered by label selector.
   * e.g. labelSelector = 'devbox-server-id=abc123'
   */
  async getSnapshots(labelSelector?: string): Promise<HetznerImage[]> {
    let url = `${this.baseUrl}/images?type=snapshot`;
    if (labelSelector) url += `&label_selector=${encodeURIComponent(labelSelector)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    if (!response.ok) return [];
    const data = await response.json() as { images: HetznerImage[] };
    return data.images;
  }

  /**
   * Deletes a snapshot image by ID.
   */
  async deleteSnapshot(imageId: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/images/${imageId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Hetzner DeleteSnapshot Error: ${response.status} - ${error}`);
    }
  }

  /**
   * Creates a new server from a snapshot image.
   */
  async createServerFromSnapshot(
    name: string,
    snapshotId: number,
    serverType: string = 'cpx21',
    location: string = 'nbg1',
    sshKeys: (string | number)[] = [],
    userData?: string
  ): Promise<HetznerServerResponse> {
    const response = await fetch(`${this.baseUrl}/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({
        name,
        server_type: serverType,
        image: snapshotId,
        location,
        user_data: userData,
        start_after_create: true,
        ssh_keys: sshKeys,
        public_net: {
          enable_ipv4: true,
          enable_ipv6: false
        }
      })
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Hetzner CreateFromSnapshot Error: ${response.status} - ${error}`);
    }
    return await response.json() as HetznerServerResponse;
  }

  /**
   * Retrieves pricing for all available resources (including Primary IPs) from the Hetzner API.
   */
  async getPricing(): Promise<HetznerPricingResponse | null> {
    if (!this.token) return null;
    const response = await fetch(`${this.baseUrl}/pricing`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });
    if (!response.ok) return null;
    return await response.json() as HetznerPricingResponse;
  }
}
