# DevBox UI — Documentation

Welcome to the DevBox UI documentation. This guide covers the general usage of the DevBox UI platform, as well as the technical architecture of our automated SSH Host Verification bypass system.

---

## 📖 Part 1: General Platform Usage

DevBox UI is a self-hosted cloud IDE orchestrator designed to deploy, manage, and secure remote development environments (DevBoxes) with ease.

### 1. Initial Setup & Credentials
Before launching your first DevBox, configure your API credentials and keys in the **Settings** panel:
* **Hetzner Token**: Retrieve a project API token with Read/Write access from your Hetzner Cloud Console.
* **Contabo Credentials**: Enter your Contabo Client ID, Client Secret, API Username, and API Password.
* **SSH Keypair**: The platform automatically generates a secure SSH keypair (Private and Public) for your user profile. This key is used to authenticate with your remote DevBoxes. You can also view or copy your public key to register it on other services.

### 2. Launching a DevBox (Provisioning)
To deploy a new virtual server:
1. Click **Launch DevBox** in the main dashboard.
2. Select your cloud provider (**Hetzner** or **Contabo**).
3. Choose the server name, type (CPU/RAM specifications), and region/location.
4. Select the base OS image (Ubuntu 24.04 recommended).
5. Click **Provision**.

**What happens under the hood:**
* The orchestrator talks to the cloud provider to launch the VPS.
* It injects a custom `cloud-init` bootstrap script.
* It sets up a dedicated secure Cloudflare Tunnel for your instance.
* It configures a Cloudflare Access Application to protect your server.

**Tracking Provisioning Status:**
You can monitor the bootstrap progress in real-time. In the desktop row or mobile card, you'll see a spinning loading circle with status logs:
* *Logs*: Click the **Logs** button to view real-time streaming console logs of the Cloud-Init setup and Docker environment directly from the VPS.

### 3. One-Click IDE Integration
Once the status changes to `READY`, you can open your workspace in your favorite IDE:
* Click the dropdown next to **Open in VS Code** to choose your environment:
  * **VS Code**
  * **Cursor**
  * **Antigravity**
  * **PhpStorm (via JetBrains Gateway)**
* Select the folder you wish to open. By default, it opens the main user workspace (`~/workspace`). If you have created subprojects, they will be listed automatically under the **Projects** section of the dropdown.

### 4. Project & Domain Management
You can easily expose local web applications running inside your DevBox to the internet securely:
1. Click **+ Add Domain** under the server row or card.
2. Choose a subdomain prefix (e.g. `my-app` which becomes `my-app.devboxui.com`) and input the local port number (e.g. `8080`, `3000`, etc. that your server-side dev tool or DDEV is running on).
3. Click **Add**.

**Security**:
Every domain added through DevBox UI is automatically protected by Cloudflare Access Zero Trust. Only authenticated creators matching your identity can reach the service URLs.

### 5. Automated Cost-Saving Scheduler
DevBox UI can automatically spin down resources when not in use to save hosting costs:
1. Click the **Clock/Schedule** button next to your Hetzner DevBox.
2. Enable the schedule and set your local timezone.
3. Configure your times:
   * **Spin-up Time (Morning)**: Recreates the server from your latest snapshot (e.g. 08:00 AM).
   * **Snapshot Time (Evening)**: Powers off the server, takes a secure backup snapshot, deletes the old snapshot, and destroys the active server (e.g. 07:00 PM).
4. **Pause / Vacation Days**:
   * *Pause Until*: Temporarily disable the daily schedule until a specific date.
   * *Skip Dates*: Add specific dates (like weekends or holidays) where the server will not spin up or take snapshots.

---

## 🏗 Part 2: SSH Host Verification Architecture

This section explains how DevBox UI automates SSH host key verification to prevent connection blocks when servers are dynamically recreated.

### The Problem: IP Address Recycling & Host Key Mismatch
DevBox UI is designed to minimize costs by shutting down and destroying development virtual servers in the evening, and recreating them from the latest snapshot in the morning.

Because cloud providers reuse IP addresses, the following issues occur with traditional SSH connections to raw IPs:
1. **IP Reuse Mismatch**: If a new DevBox VPS is allocated an IP address that was previously used by another VPS on your laptop, SSH will detect a host key mismatch. This blocks the connection with the error: **"Remote host key has changed, port forwarding is disabled."**
2. **Manual Cleanup**: The user has to manually clear the stale host key from `~/.ssh/known_hosts` (e.g. running `ssh-keygen -R <IP>`) every time the server is recreated with a reused IP.
3. **Client Configuration Overhead**: Custom workarounds (like adding `StrictHostKeyChecking no` to `~/.ssh/config` or tunneling via `cloudflared` proxies) require manual setup on each developer's laptop, breaking the "one-click, zero-config" experience.

---

### The Solution: Dynamic Cloudflare DNS A Records (`*-direct.devboxui.com`)

DevBox UI solves this natively on the server-side using your Cloudflare zone's DNS capabilities:

```
[ Developer Laptop ] 
       │
       │ (Clicks "Open in VS Code")
       ▼
[ hostname-direct.devboxui.com ] ──(DNS A Record)──► [ Hetzner VPS IP ]
       │                                                 ▲
       ▼                                                 │
(Host key check matches stored key for this host) ───────┘
```

#### 1. Unique Hostname per DevBox Instance
Every DevBox is assigned a unique hostname matching the pattern:
```text
<safe-server-name>-direct.devboxui.com
```
Because this hostname is unique to the specific DevBox instance, it has no record in the local `known_hosts` file on first launch. This avoids any host key collision warnings entirely.

#### 2. Persistent Host Keys Across Restores
- When a DevBox is destroyed in the evening and recreated from a snapshot in the morning, it gets a new IP.
- However, because it is restored from a snapshot, **the SSH host keys (`/etc/ssh/ssh_host_*_key`) are identical to the previous day.**
- The DevBox UI orchestrator automatically updates the DNS A record of `<safe-server-name>-direct.devboxui.com` to point to the new IP.
- When you click "Open in VS Code" on Day 2, your SSH client resolves the unique hostname to the new IP, checks the host key, and finds that it matches the one stored on Day 1. The connection succeeds instantly with **zero prompts** and **zero warnings**.

---

### Codebase Integration

The system is integrated across the following components:

#### 1. Cloudflare DNS Management (`src/lib/cloudflare-api.ts`)
Adds `setupARecord(hostname, ip)` to manage unproxied (`proxied: false`) DNS A records dynamically:
* If the A record exists, it updates its target IP if it has changed.
* If it doesn't exist, it creates a new A record.
* Records are automatically deleted when the server is deleted via `cfApi.deleteDnsRecord`.

#### 2. Provisioning & Deletion Actions (`src/modules/inventory/actions.ts`)
* **Hetzner & Contabo Provisioning**: During server creation, once the public IP is allocated, the orchestrator calls `cfApi.setupARecord` to bind the `<safeName>-direct.devboxui.com` domain to the server's new IP.
* **Server Cleanup**: When `deleteServer` is invoked, the direct DNS A record is removed from your Cloudflare zone to keep your DNS zone clean.

#### 3. Morning Automation Workflow (`src/modules/inventory/schedule-actions.ts`)
* When the morning cron job triggers and recreates the server from its snapshot, a new public IP is obtained.
* The orchestrator automatically calls `cfApi.setupARecord` to point the existing `<safeName>-direct.devboxui.com` record to the new IP.

#### 4. IDE Link Generation (`src/modules/inventory/components/ServerList.tsx`)
The `getIdeUrl` function generates remote protocol URLs (for VS Code, Cursor, Antigravity, and JetBrains Gateway) targeting the direct hostname instead of the raw IP:
```typescript
const displayHostname = server.hostname ? server.hostname.replace('.devboxui.com', '') : '';
const host = displayHostname ? `${displayHostname.replace('-code', '-direct')}.devboxui.com` : server.ip;
```

---

### Developer Experience (DX) Benefits

* **Zero Client Setup**: Developers do not need to install `cloudflared`, edit `~/.ssh/config`, or run command-line commands on their laptops.
* **One-Click Connect**: Clicking "Open in VS Code" connects immediately.
* **Zero Security Prompts (After Day 1)**: The one-time prompt to trust the host key is accepted on Day 1, and never shown again for the lifetime of that DevBox.

---

## 🔒 Part 3: Peer-to-Peer API Authorization via Cloudflare Access

This section explains how DevBox UI manages secure, zero-config communication between applications running on different DevBoxes (e.g., separate VPS environments running Drupal or Node.js) while maintaining full protection against the public internet.

### The Problem: Cross-DevBox API Blocks
When running a multi-application stack where apps are distributed across separate DevBoxes (e.g., project `odb` on DevBox A communicating with projects `cma` and `cmm` on DevBox B):
1. **Cloudflare Access Shields**: Every service domain created via DevBox UI is protected by Cloudflare Access.
2. **Blocked Request Loops**: Standard HTTP calls (e.g., using `curl`, Guzzle, or `fetch`) made from application A to application B will hit Cloudflare Access's login portal, resulting in `302/403` response codes and breaking inter-app API integrations.
3. **Application Modification Overhead**: Alternative security paths (like using custom Cloudflare Service Tokens) require developers to inject credentials and HTTP headers into their codebase. This forces developers to modify application code specifically for the local testing environment.

---

### The Solution: IP-Based Bypass Policies & Dynamic Synchronization

DevBox UI automates Cloudflare Access bypass policies using IP-based routing rules on the server-side:

```
 [ DevBox A (cma-app) ]                     [ DevBox B (odb-app) ]
         │                                             │
         │ (Allowed Peer)                              │
         ▼                                             ▼
 [ Public IP: 192.0.2.1 ] ──(Direct API Request)──► [ Cloudflare Access ]
                                                       │ (Bypasses Login Gate)
                                                       ▼
                                             [ Target DDEV/App Port ]
```

#### 1. Zero-Header IP Bypass Policies
When DevBox B authorizes DevBox A to make API calls, DevBox UI dynamically configures a Cloudflare Access policy for DevBox B's application domains:
* **Bypass Rule**: A policy with the `bypass` decision is created, matching the source IP address of DevBox A (`/32` CIDR block).
* **Code-Free Integration**: DevBox A can call DevBox B's public domain (e.g., `https://odb-app.devboxui.com`) using standard, unmodified HTTP client requests (e.g., PHP Guzzle) without needing to configure or send any Cloudflare Access credentials.

#### 2. Automatic Dynamic IP Alignment
Because DevBoxes are spun down in the evening and recreated from snapshots in the morning, their public IP addresses are dynamic and change daily:
* **IP Update Listener**: Whenever a DevBox (e.g., DevBox A) starts up (or is newly provisioned) and receives a new IP:
  * The DevBox UI orchestrator scans all active DevBoxes to identify which ones have authorized DevBox A in their `allowedPeers` configuration.
  * It automatically updates those target Cloudflare Access bypass policies with DevBox A's new IP address.
* **Instant Re-alignment**: Connections remain authorized with zero manual updates or developer intervention required when IP addresses change.

---

### Dashboard Configuration & Controls

To authorize inter-DevBox communication:
1. Click the **API Auth** (padlock/key) button in the server row or card.
2. Under the list of peer DevBoxes, select the checkboxes for the DevBoxes you wish to authorize to make API requests to the current DevBox.
3. Click **Save Authorization**.
4. The system immediately applies the Cloudflare Access bypass rules to the target server's base domain and all subdomains/projects configured on that server.

