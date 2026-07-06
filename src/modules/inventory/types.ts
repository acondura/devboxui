export interface ServerConfig {
  id: string; // UUID or unique hash
  ip: string;
  userName: string;
  userEmail: string;
  status: 'provisioning' | 'configuring' | 'Initializing' | 'initializing' | 'ready' | 'error' | 'off' | 'waiting-for-bootstrap' | 'snapshotting';
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
    port?: number;
    status: 'ready' | 'provisioning' | 'error';
  }[];
  detailedStatus?: string;
  provisioningToken?: string;
  statusLog?: string[];
  sshKeyVersion?: string;
  hetznerStatus?: string;
  provider?: 'hetzner' | 'contabo' | 'digitalocean' | 'linode' | 'vultr' | 'custom';
  bootstrapCommand?: string;
  contaboInstanceId?: number;
  contaboSecretId?: number;
  digitalOceanDropletId?: number;
  tunnelToken?: string;
  providerName?: string;
  hostname?: string;
  scheduleConfig?: ScheduleConfig;
  allowedPeers?: string[];
  serverType?: string;
  pendingSnapshotId?: number;
  pendingSnapshotActionId?: number;
  pendingSnapshotDescription?: string;
  pendingSnapshotDate?: string;
  pendingCreateActionId?: number;
  serverSpecs?: string;
  orgId?: string;
  assignedTo?: string;
  collaborators?: CollaboratorInfo[];
}

export interface CollaboratorInfo {
  email: string;
  username: string; // Sanitized POSIX username (e.g. 'john')
  status: 'pending' | 'active';
}

export interface OrgSettings {
  orgId: string;
  orgName: string;
  hetznerToken: string; // Team-wide Hetzner billing token
  digitalOceanToken?: string; // Team-wide DigitalOcean billing token
  adminEmails: string[]; // Administrators who can manage members/billing
}

export interface UserMembership {
  orgId: string;
  role: 'owner' | 'admin' | 'member';
  permissions: {
    canCreateServers: boolean; // Custom flag to grant VM creation rights
    canAssignServers: boolean; // Custom flag to let members assign VMs to others
  };
}

export interface ScheduleConfig {
  enabled: boolean;
  timezone: string;        // e.g. 'Europe/Bucharest'
  spinupTime: string;      // 'HH:MM' in local timezone
  snapshotTime: string;    // 'HH:MM' in local timezone
  serverType: string;      // e.g. 'cpx21'
  location: string;        // e.g. 'nbg1'
  sshKeyIds?: number[];    // Hetzner SSH key IDs to attach on spin-up
  latestSnapshotId?: number;
  latestSnapshotDate?: string;
  latestSnapshotDescription?: string;
  lastEveningRun?: string; // ISO timestamp
  lastMorningRun?: string; // ISO timestamp
  lastRunStatus?: 'success' | 'error' | 'running';
  lastRunError?: string;
  // Vacation / pause controls
  pauseUntil?: string;     // ISO date string 'YYYY-MM-DD' — skip ALL automation until this date (inclusive)
  blockedDates?: string[]; // Array of 'YYYY-MM-DD' strings — skip spin-up AND snapshot on these dates
  spinupEnabled?: boolean;
  snapshotEnabled?: boolean;
  skipWeekends?: boolean;
}

export interface ProvisioningState {
  step: 'generating_keys' | 'connecting' | 'creating_user' | 'installing_dependencies' | 'setting_up_tunnel' | 'complete' | 'failed';
  message: string;
}
