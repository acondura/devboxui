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
   * This is additive - it fetches existing rules and appends the new one.
   */
  async setupHostname(hostname: string, tunnelId: string, service: string = "http://localhost:8443") {
    // 1. Fetch current configuration
    let currentConfig: any = { ingress: [] };
    try {
      const result = await this.request<any>(`/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel/${tunnelId}/configurations`);
      currentConfig = result?.config || { ingress: [] };
    } catch (e) {
      console.warn("Could not fetch existing tunnel config, starting fresh.");
    }

    // 2. Filter out existing rules for this hostname (to avoid duplicates)
    const otherRules = (currentConfig.ingress || []).filter((rule: any) => 
      rule.hostname !== hostname && rule.service !== "http_status:404"
    );

    // 3. Build new ingress rules
    const newIngress = [
      ...otherRules,
      { hostname, service },
      { service: "http_status:404" } // Always keep 404 as the last rule
    ];

    // 4. Update Tunnel Configuration
    await this.request(`/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel/${tunnelId}/configurations`, {
      method: "PUT",
      body: JSON.stringify({
        config: {
          ingress: newIngress
        }
      }),
    });

    // 5. Create CNAME record in DNS
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

  /**
   * Deletes a tunnel and all associated configurations.
   */
  async deleteTunnel(tunnelId: string) {
    await this.request(`/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel/${tunnelId}`, {
      method: "DELETE",
    });
  }

  /**
   * Searches for a DNS record by name and deletes it.
   */
  async deleteDnsRecord(name: string) {
    // 1. Find the record ID
    const records = await this.request<any[]>(`/zones/${this.env.CLOUDFLARE_ZONE_ID}/dns_records?name=${name}`);
    
    // 2. Delete all matches (usually just one)
    for (const record of records) {
      await this.request(`/zones/${this.env.CLOUDFLARE_ZONE_ID}/dns_records/${record.id}`, {
        method: "DELETE",
      });
    }
  }
}
