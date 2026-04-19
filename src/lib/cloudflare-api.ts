import { CloudflareEnv } from "./auth";

/**
 * Modern Cloudflare API Wrapper for Tunnel and DNS automation.
 */
export class CloudflareApiService {
  private baseUrl = "https://api.cloudflare.com/client/v4";

  constructor(private env: CloudflareEnv) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${this.env.CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    const data = await response.json() as any;
    if (!data.success) {
      throw new Error(`Cloudflare API Error: ${JSON.stringify(data.errors)}`);
    }
    return data.result;
  }

  /**
   * Creates a new Cloudflare Tunnel for a specific VPS.
   */
  async createTunnel(name: string) {
    // 1. Create Tunnel
    const tunnel = await this.request<any>(`/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel`, {
      method: "POST",
      body: JSON.stringify({ name, config_src: "cloudflare" }),
    });

    // 2. Create Tunnel Token
    const token = await this.request<string>(`/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel/${tunnel.id}/token`, {
      method: "GET",
    });

    return { id: tunnel.id, token };
  }

  /**
   * Routes a hostname to the tunnel and creates a DNS record.
   */
  async setupHostname(hostname: string, tunnelId: string) {
    // 1. Update Tunnel Configuration (Ingress Rule)
    await this.request(`/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel/${tunnelId}/configurations`, {
      method: "PUT",
      body: JSON.stringify({
        config: {
          ingress: [
            { hostname, service: "http://localhost:8443" },
            { service: "http_status:404" }
          ]
        }
      }),
    });

    // 2. Create CNAME record in DNS
    await this.request(`/zones/${this.env.CLOUDFLARE_ZONE_ID}/dns_records`, {
      method: "POST",
      body: JSON.stringify({
        type: "CNAME",
        name: hostname,
        content: `${tunnelId}.cfargotunnel.com`,
        proxied: true,
      }),
    });
  }
}
