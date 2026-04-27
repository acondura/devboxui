export interface ServerConfig {
  id: string; // UUID or unique hash
  ip: string;
  userName: string;
  userEmail: string;
  status: 'provisioning' | 'Initializing' | 'initializing' | 'ready' | 'error' | 'off';
  sshPrivateKey: string;
  sshPublicKey: string;
  rootPassword?: string;
  createdAt: string;
  updatedAt: string;
  tunnelUrl?: string;
  tunnelId?: string;
  hetznerServerId?: number;
  logs?: string[];
  isLocked?: boolean;
  projects?: {
    name: string;
    domain: string;
    status: 'ready' | 'provisioning' | 'error';
  }[];
  detailedStatus?: string;
  provisioningToken?: string;
  statusLog?: string[];
  sshKeyVersion?: string;
}

export interface ProvisioningState {
  step: 'generating_keys' | 'connecting' | 'creating_user' | 'installing_dependencies' | 'setting_up_tunnel' | 'complete' | 'failed';
  message: string;
}
