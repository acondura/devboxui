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

    // 5. Manage DNS Record (Idempotent)
    const targetContent = `${tunnelId}.cfargotunnel.com`;
    const records = await this.request<any[]>(`/zones/${this.env.CLOUDFLARE_ZONE_ID}/dns_records?name=${hostname}&type=CNAME`);
    const existing = records.find(r => r.name === hostname);

    if (existing) {
      if (existing.content !== targetContent) {
        console.log(`Updating existing DNS record for ${hostname}...`);
        await this.request(`/zones/${this.env.CLOUDFLARE_ZONE_ID}/dns_records/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            content: targetContent,
            proxied: true,
          }),
        });
      } else {
        console.log(`DNS record for ${hostname} is already correct. Skipping.`);
      }
    } else {
      console.log(`Creating new DNS record for ${hostname}...`);
      await this.request(`/zones/${this.env.CLOUDFLARE_ZONE_ID}/dns_records`, {
        method: "POST",
        body: JSON.stringify({
          type: "CNAME",
          name: hostname,
          content: targetContent,
          proxied: true,
        }),
      });
    }
  }

  /**
   * Protects a hostname with Cloudflare Access (Zero Trust).
   * Creates an Application and an 'Allow' policy for the specified email.
   */
  async setupAccess(hostname: string, allowedEmail: string) {
    // 1. Create Access Application
    const app = await this.request<any>(`/zones/${this.env.CLOUDFLARE_ZONE_ID}/access/apps`, {
      method: "POST",
      body: JSON.stringify({
        name: `DevBox: ${hostname}`,
        domain: hostname,
        type: "self_hosted",
        session_duration: "24h",
        app_launcher_visible: true,
        http_only_cookie_attribute: true,
      }),
    });

    // 2. Create Access Policy
    await this.request(`/zones/${this.env.CLOUDFLARE_ZONE_ID}/access/apps/${app.id}/policies`, {
      method: "POST",
      body: JSON.stringify({
        name: "Allow Creator",
        decision: "allow",
        precedence: 1,
        include: [
          { email: { email: allowedEmail } }
        ]
      }),
    });

    return app.id;
  }

  /**
   * Removes Cloudflare Access protection for a hostname.
   */
  async deleteAccess(hostname: string) {
    // 1. Find the application by domain
    const apps = await this.request<any[]>(`/zones/${this.env.CLOUDFLARE_ZONE_ID}/access/apps`);
    const app = apps.find(a => a.domain === hostname);

    if (app) {
      // 2. Delete the application (policies are deleted automatically)
      await this.request(`/zones/${this.env.CLOUDFLARE_ZONE_ID}/access/apps/${app.id}`, {
        method: "DELETE",
      });
    }
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
