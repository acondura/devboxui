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

    const data = (await response.json()) as { success: boolean; result: T; errors: unknown[] };
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
    const tunnel = await this.request<{ id: string }>(`/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel`, {
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
    interface IngressRule { hostname?: string; service: string }
    let currentConfig: { ingress: IngressRule[] } = { ingress: [] };
    try {
      const result = await this.request<{ config: { ingress: IngressRule[] } }>(`/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel/${tunnelId}/configurations`);
      currentConfig = result?.config || { ingress: [] };
    } catch {
      console.warn("Could not fetch existing tunnel config, starting fresh.");
    }

    // 2. Filter out existing rules for this hostname (to avoid duplicates)
    const otherRules = (currentConfig.ingress || []).filter((rule: IngressRule) => 
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
    const records = await this.request<{ id: string; name: string; content: string }[]>(`/zones/${this.env.CLOUDFLARE_ZONE_ID}/dns_records?name=${hostname}&type=CNAME`);
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
  async setupAccess(hostname: string, allowedEmail: string): Promise<string> {
    const apps = await this.request<{ id: string; domain: string }[]>(`/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/access/apps`);
    let app = apps.find(a => a.domain === hostname);

    if (!app) {
      console.log(`Creating Access Application for ${hostname}...`);
      app = await this.request<{ id: string; domain: string }>(`/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/access/apps`, {
        method: "POST",
        body: JSON.stringify({
          name: `DevBox: ${hostname}`,
          domain: hostname,
          type: "self_hosted",
          session_duration: "24h",
        }),
      });
    } else {
      console.log(`Access Application for ${hostname} already exists, skipping creation.`);
    }

    // 2. Check if "Allow Creator" policy already exists
    const policies = await this.request<{ name: string }[]>(`/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/access/apps/${app.id}/policies`);
    const hasPolicy = policies.some(p => p.name === "Allow Creator");

    if (!hasPolicy) {
      console.log(`Creating Access Policy for ${allowedEmail}...`);
      await this.request(`/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/access/apps/${app.id}/policies`, {
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
    } else {
      console.log(`Access Policy for ${allowedEmail} already exists, skipping.`);
    }

    return app.id;
  }

  /**
   * Removes Cloudflare Access protection for a hostname.
   */
  async deleteAccess(hostname: string): Promise<void> {
    // 1. Find the application by domain
    const apps = await this.request<{ id: string; domain: string }[]>(`/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/access/apps`);
    const app = apps.find(a => a.domain === hostname);

    if (app) {
      // 2. Delete the application (policies are deleted automatically)
      await this.request(`/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/access/apps/${app.id}`, {
        method: "DELETE",
      });
    }
  }

  /**
   * Deletes a tunnel and all associated configurations.
   */
  async deleteTunnel(tunnelId: string): Promise<void> {
    await this.request(`/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel/${tunnelId}`, {
      method: "DELETE",
    });
  }

  /**
   * Searches for a DNS record by name and deletes it.
   */
  async deleteDnsRecord(name: string): Promise<void> {
    // 1. Find the record ID
    const records = await this.request<{ id: string }[]>(`/zones/${this.env.CLOUDFLARE_ZONE_ID}/dns_records?name=${name}`);
    
    // 2. Delete all matches (usually just one)
    for (const record of records) {
      await this.request(`/zones/${this.env.CLOUDFLARE_ZONE_ID}/dns_records/${record.id}`, {
        method: "DELETE",
      });
    }
  }

  /**
   * Gets or creates a service token for provisioning heartbeats.
   */
  async getOrCreateServiceToken(kv: KVNamespace): Promise<{ id: string; client_id: string; client_secret: string }> {
    const TOKEN_KEY = 'cloudflare:service_token';
    const cached = await kv.get(TOKEN_KEY);
    if (cached) return JSON.parse(cached) as { id: string; client_id: string; client_secret: string };

    // If not in KV, we MUST create a new one because Cloudflare won't give us the secret for an existing token
    console.log("Creating new Cloudflare Access Service Token...");
    const token = await this.request<{ id: string; name: string; client_id: string; client_secret: string }>(`/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/access/service_tokens`, {
      method: "POST",
      body: JSON.stringify({
        name: `DevBox Provisioner (${new Date().toISOString().split('T')[0]})`
      })
    });

    const data = {
      id: token.id,
      client_id: token.client_id,
      client_secret: token.client_secret
    };

    await kv.put(TOKEN_KEY, JSON.stringify(data));
    return data;
  }

  /**
   * Authorizes a service token to bypass Access for a specific hostname.
   */
  async authorizeServiceToken(hostname: string, serviceTokenId: string) {
    const apps = await this.request<{ id: string; domain: string }[]>(`/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/access/apps`);
    // Find app that matches the hostname, root domain, or a wildcard
    const rootDomain = hostname.split('.').slice(-2).join('.');
    const wildcardDomain = `*.${rootDomain}`;
    const app = apps.find(a => 
      a.domain === hostname || 
      a.domain === rootDomain || 
      a.domain === wildcardDomain
    );
    
    if (!app) {
      console.warn(`[Access] No matching App found for ${hostname}, ${rootDomain}, or ${wildcardDomain}. If ${hostname} is public, this is fine.`);
      return;
    }

    const policies = await this.request<{ name: string }[]>(`/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/access/apps/${app.id}/policies`);
    const hasPolicy = policies.some(p => p.name === "Allow Service Tokens");

    if (!hasPolicy) {
      console.log(`Authorizing Service Token for ${app.domain}...`);
      await this.request(`/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/access/apps/${app.id}/policies`, {
        method: "POST",
        body: JSON.stringify({
          name: "Allow Service Tokens",
          decision: "non_identity",
          precedence: 1,
          include: [
            { service_token: { token_id: serviceTokenId } }
          ]
        })
      });
    }
  }
}
