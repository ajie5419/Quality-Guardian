import { requestClient } from '#/api/request';

export interface SystemMonitorData {
  server: {
    cpu: {
      cores: number;
      cores_usage: number[];
      freq: {
        current: string;
        max: string;
        min: string;
      };
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
        guest?: number;
        guest_nice?: number;
        idle: number;
        iowait?: number;
        irq: number;
        nice: number;
        softirq?: number;
        steal?: number;
        sys: number;
        user: number;
      };
      usagePercent: number;
    };
    disk: {
      ioStats?: {
        read_count: number;
        read_time: number;
        write_count: number;
        write_time: number;
      };
      mounts: {
        device: string;
        free: number;
        fstype: string;
        mount: string;
        percent: number;
        status: string;
        total: number;
        used: number;
      }[];
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
      interfaces: {
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
      }[];
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
      list: {
        cpu: number;
        mem: number;
        name: string;
        pid: number;
        startTime: string;
        status: string;
      }[];
      running: number;
      sleeping: number;
      total: number;
      zombie: number;
    };
  };
  database: {
    activeConnections: number;
    cacheHitRate: number;
    charset: string;
    comCommit: number;
    commitRate: number;
    comRollback: number;
    databaseName: string;
    error?: string;
    handlerDelete: number;
    handlerReadKey: number;
    handlerReadNext: number;
    handlerUpdate: number;
    handlerWrite: number;
    idleConnections: number;
    latency: number;
    maxConnections: number;
    resource: {
      cpuUsage: number;
      ramTotal: number;
      ramUsagePercent: number;
      ramUsed: number;
    };
    size: number;
    status: 'Healthy' | 'Unhealthy';
    threadsRunning: number;
    timezone: string;
    totalQueries: number;
    uptime: number;
    version: string;
  };
  timestamp: string;
}

/**
 * 获取系统监控数据 (服务器与数据库)
 */
export async function getSystemMonitorData() {
  return requestClient.get<SystemMonitorData>('/system/monitor');
}
