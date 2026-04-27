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
    name: string;
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

export interface HetznerServerType {
  id: number;
  name: string;
  description: string;
  cores: number;
  memory: number;
  disk: number;
  deprecated: boolean;
  prices: unknown[];
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
  name: string;
  status: string;
  os_flavor: string;
  deprecated: boolean | string | null;
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
    image: string = 'ubuntu-24.04',
    sshKeys: (string | number)[] = []
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
        image: image,
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
}
