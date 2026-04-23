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
}

export interface HetznerServersResponse {
  servers: HetznerServer[];
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
    serverType: string = 'cx22', 
    location: string = 'nbg1'
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
        image: 'ubuntu-24.04',
        location: location,
        user_data: userData,
        start_after_create: true,
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
}
