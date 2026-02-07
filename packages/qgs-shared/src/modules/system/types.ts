export interface PageResult<T> {
  items: T[];
  total: number;
}

export interface User {
  createTime: string;
  deptId?: string;
  deptName?: string;
  email?: string;
  id: string;
  phone?: string;
  realName: string;
  remark?: string;
  roleIds?: string[];
  roles?: string[];
  status: number;
  username: string;
}

export interface Role {
  createTime: string;
  id: string;
  name: string;
  permissions?: string[];
  remark?: string;
  status: number;
  value: string;
}

export interface Dept {
  children?: Dept[];
  createTime: string;
  id: string;
  name: string;
  pid: string;
  remark?: string;
  status: number;
}

export interface Menu {
  children?: Menu[];
  component: string;
  id: string;
  meta: {
    hideMenu?: boolean;
    icon?: string;
    orderNo?: number;
    title: string;
  };
  name: string;
  path: string;
  pid: string;
  redirect?: string;
}

// ============ Metrics Types ============

export interface ServerMetrics {
  os: {
    platform: string;
    release: string;
    arch: string;
    hostname: string;
    uptime: number;
    ip: string;
    nodeVersion: string;
    startTime: string;
  };
  cpu: {
    model: string;
    cores: number;
    threads: number;
    loadAvg: number[];
    usagePercent: number;
    freq: { current: string; max: string; min: string };
    times: { user: number; nice: number; sys: number; idle: number; irq: number };
    stats: { ctx_switches: number; interrupts: number; soft_interrupts: number; syscalls: number };
    cores_usage: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
    available: number;
    active: number;
    inactive: number;
    buffers: number;
    cached: number;
    shared: number;
    swap: {
      total: number;
      used: number;
      free: number;
      usagePercent: number;
      sin: number;
      sout: number;
    };
  };
  network: {
    upload: number;
    download: number;
    sent: number;
    received: number;
    interfaces: Array<{
      name: string;
      status: string;
      mtu: number;
      speed: number;
      rx_packets: number;
      rx_errors: number;
      rx_bytes: number;
      tx_packets: number;
      tx_errors: number;
      tx_bytes: number;
      rx_drop: number;
      tx_drop: number;
    }>;
  };
  disk: {
    read: number;
    write: number;
    totalRead: number;
    totalWrite: number;
    mounts: Array<{
      device: string;
      mount: string;
      fstype: string;
      total: number;
      used: number;
      free: number;
      percent: number;
      status: string;
    }>;
  };
  processes: {
    total: number;
    running: number;
    sleeping: number;
    zombie: number;
    list: Array<{
      pid: number;
      cpu: number;
      mem: number;
      status: string;
      name: string | undefined;
      startTime: string;
    }>;
  };
}

export interface DatabaseMetrics {
  latency: number;
  status: 'Healthy' | 'Unhealthy';
  version: string;
  uptime: number;
  size: number;
  databaseName: string;
  resource: {
    cpuUsage: number;
    ramUsed: number;
    ramTotal: number;
    ramUsagePercent: number;
  };
  activeConnections?: number;
  threadsRunning?: number;
  maxConnections?: number;
  totalQueries?: number;
  bufferReadRequests?: number;
  bufferReadPhysical?: number;
  comCommit?: number;
  comRollback?: number;
  handlerWrite?: number;
  handlerUpdate?: number;
  handlerDelete?: number;
  handlerReadNext?: number;
  handlerReadKey?: number;
  charset?: string;
  timezone?: string;
  cacheHitRate?: number;
  commitRate?: number;
  idleConnections?: number;
  error?: string;
}

// ============ Login Log Types ============

export interface LoginLog {
  browser: string | null;
  createdAt: string | Date;
  device: string | null;
  id: string;
  ip: string | null;
  message: string | null;
  method: string | null;
  os: string | null;
  status: string;
  username: string;
}

export interface LoginLogParams {
  endDate?: string;
  page?: number;
  pageSize?: number;
  startDate?: string;
  status?: string;
  username?: string;
}

export interface LoginLogPageResult {
  items: LoginLog[];
  total: number;
}
