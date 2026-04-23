export interface ServerConfig {
  id: string; // UUID or unique hash
  ip: string;
  userName: string;
  userEmail: string;
  status: 'provisioning' | 'ready' | 'error';
  sshPrivateKey: string;
  sshPublicKey: string;
  createdAt: string;
  updatedAt: string;
  tunnelUrl?: string;
  tunnelId?: string;
  hetznerServerId?: number;
  logs?: string[];
  projects?: {
    name: string;
    domain: string;
    status: 'ready' | 'provisioning' | 'error';
  }[];
}

export interface ProvisioningState {
  step: 'generating_keys' | 'connecting' | 'creating_user' | 'installing_dependencies' | 'setting_up_tunnel' | 'complete' | 'failed';
  message: string;
}
