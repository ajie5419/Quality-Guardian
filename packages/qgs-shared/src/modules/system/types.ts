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
  cpu: {
    cores: number;
    cores_usage: number[];
    freq: { current: string; max: string; min: string };
    loadAvg: number[];
    model: string;
    stats: {
      ctx_switches: number;
      interrupts: number;
      soft_interrupts: number;
      syscalls: number;
    };
    threads: number;
    times: {
      idle: number;
      irq: number;
      nice: number;
      sys: number;
      user: number;
    };
    usagePercent: number;
  };
  disk: {
    mounts: Array<{
      device: string;
      free: number;
      fstype: string;
      mount: string;
      percent: number;
      status: string;
      total: number;
      used: number;
    }>;
    read: number;
    totalRead: number;
    totalWrite: number;
    write: number;
  };
  memory: {
    active: number;
    available: number;
    buffers: number;
    cached: number;
    free: number;
    inactive: number;
    shared: number;
    swap: {
      free: number;
      sin: number;
      sout: number;
      total: number;
      usagePercent: number;
      used: number;
    };
    total: number;
    usagePercent: number;
    used: number;
  };
  network: {
    download: number;
    interfaces: Array<{
      mtu: number;
      name: string;
      rx_bytes: number;
      rx_drop: number;
      rx_errors: number;
      rx_packets: number;
      speed: number;
      status: string;
      tx_bytes: number;
      tx_drop: number;
      tx_errors: number;
      tx_packets: number;
    }>;
    received: number;
    sent: number;
    upload: number;
  };
  os: {
    arch: string;
    hostname: string;
    ip: string;
    nodeVersion: string;
    platform: string;
    release: string;
    startTime: string;
    uptime: number;
  };
  processes: {
    list: Array<{
      cpu: number;
      mem: number;
      name: string | undefined;
      pid: number;
      startTime: string;
      status: string;
    }>;
    running: number;
    sleeping: number;
    total: number;
    zombie: number;
  };
}

export interface DatabaseMetrics {
  activeConnections?: number;
  bufferReadPhysical?: number;
  bufferReadRequests?: number;
  cacheHitRate?: number;
  charset?: string;
  comCommit?: number;
  commitRate?: number;
  comRollback?: number;
  databaseName: string;
  error?: string;
  handlerDelete?: number;
  handlerReadKey?: number;
  handlerReadNext?: number;
  handlerUpdate?: number;
  handlerWrite?: number;
  idleConnections?: number;
  latency: number;
  maxConnections?: number;
  resource: {
    cpuUsage: number;
    ramTotal: number;
    ramUsagePercent: number;
    ramUsed: number;
  };
  size: number;
  status: 'Healthy' | 'Unhealthy';
  threadsRunning?: number;
  timezone?: string;
  totalQueries?: number;
  uptime: number;
  version: string;
}

// ============ Login Log Types ============

export interface LoginLog {
  browser: null | string;
  createdAt: Date | string;
  device: null | string;
  id: string;
  ip: null | string;
  message: null | string;
  method: null | string;
  os: null | string;
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
// ============ Audit Log Types ============

export interface AuditLog {
  action: string;
  createdAt: Date | string;
  details: null | string;
  id: string;
  ipAddress: null | string;
  targetId: string;
  targetType: string;
  timestamp?: bigint | number | string;
  userAgent: null | string;
  userId: string;
  username?: string; // Optional: for display purposes
}

export interface AuditLogParams {
  action?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
  startDate?: string;
  targetType?: string;
  userId?: string;
}

export interface AuditLogPageResult {
  items: AuditLog[];
  total: number;
}
