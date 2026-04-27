# 🚀 DevBox UI

**DevBox UI** is a powerful, modern platform designed for the programmatic provisioning and management of high-performance remote development environments on **VPS providers**. 

Currently optimized for **Hetzner Cloud** (with more providers to come), DevBox UI transforms raw infrastructure into a fully-configured, secure developer workspace in minutes.

---

## ✨ Core Features

### 🏗 Automated Infrastructure
- **Hetzner Cloud Integration**: Full lifecycle management including rapid instance provisioning, configuration, and state tracking.
- **Dynamic Heartbeats**: Real-time status reporting (e.g., `Installing-Docker`, `Finalizing-Container`) directly to the dashboard.
- **Smart User Management**: Automated user creation, SSH key synchronization, and tailored sudo access.

### 💻 Ready-to-Use Web IDE
- **code-server (VS Code)**: Instant deployment of a containerized IDE, pre-configured with Xdebug and Vim extensions.
- **Modern Developer Shell**:
    - **Oh My Bash**: Pre-configured with the premium `90210` theme.
    - **DDEV & Docker**: Automated setup for container-based development, including optimized PATHs and dependencies.
- **Persistent Configuration**: Consolidated host-side directory structure under `/home/{user}/.code-server` for settings, extensions, and workspaces.

### 🔒 Zero-Trust Security & Connectivity
- **Cloudflare Tunnel**: Secure internet exposure without opening any public ports.
- **Cloudflare Access**: Integrated identity-based authentication policies for every instance.
- **Non-Interactive Sudo**: Secure passwordless sudo specifically for the container environment (`abc` user) for a seamless terminal experience.

---

## 🛠 Technical Specifications

- **Frontend/Backend**: [Next.js 15.5](https://nextjs.org/) (utilizing **App Router**)
- **UI/UX**: [React 19](https://react.dev/) & [Tailwind CSS 4.0](https://tailwindcss.com/)
- **Environment**: [TypeScript 5.7](https://www.typescriptlang.org/)
- **Deployment**: [Cloudflare Pages](https://pages.cloudflare.com/) (via `@opennextjs/cloudflare`)
- **Infrastructure**: Hetzner Cloud API & Cloudflare Zero Trust (Tunnels & Access)

---

## 📦 Getting Started

### Prerequisites

You will need the following API tokens:
- **Hetzner Cloud**: A Read/Write API token.
- **Cloudflare**: API token with `Cloudflare Tunnel` and `Access Policy` permissions.

### Installation & Development

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Local Development**:
   ```bash
   npm run dev
   ```

3. **Build & Preview (Cloudflare Runtime)**:
   ```bash
   npm run pages-build
   npm run preview
   ```

### Deployment

Deploy to Cloudflare Pages using the integrated OpenNext adapter:
```bash
npm run deploy
```

---

## 🏗 Architecture Overview

DevBox UI acts as an orchestrator between your cloud provider and security layer:
1. **Infrastructure**: Creates a VPS and injects a specialized `cloud-init` bootstrap script.
2. **Security**: Programmatically creates Cloudflare Access policies and authorizes service tokens.
3. **Provisioning**: The bootstrap script installs Docker, deploys the `code-server` container, and configures the environment.
4. **Connectivity**: An integrated `cloudflared` agent connects the server to your secure tunnel.

---

## 📜 License

This project is intended for personal/internal use.

---

*Built for speed, security, and developer happiness.*
