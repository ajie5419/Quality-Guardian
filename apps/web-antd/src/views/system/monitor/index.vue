<script lang="ts" setup>
import type { SystemMonitorData } from '#/api/system/monitor';

import { computed, onMounted, onUnmounted, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Card,
  Col,
  Descriptions,
  Divider,
  Layout,
  Menu,
  Progress,
  Row,
  Spin,
  Table,
  Tag,
} from 'ant-design-vue';

import { getSystemMonitorData } from '#/api/system/monitor';
import { useErrorHandler } from '#/hooks/useErrorHandler';

const { Sider, Content } = Layout;

const data = ref<null | SystemMonitorData>(null);
const loading = ref(true);
const selectedKey = ref(['overview']);
const { handleApiError } = useErrorHandler();
const MAX_CONSECUTIVE_FAILURES = 3;
const POLL_INTERVAL_MS = 5000;
const consecutiveFailures = ref(0);
const pollingPaused = ref(false);
let timer: null | ReturnType<typeof setInterval> = null;

function isNetworkOrTimeoutError(error: unknown) {
  const err = error as { code?: string; response?: { status?: number } };
  return !err?.response?.status || err?.code === 'ECONNABORTED';
}

function stopPolling() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function startPolling() {
  if (timer || pollingPaused.value) return;
  timer = setInterval(fetchData, POLL_INTERVAL_MS);
}

const fetchData = async () => {
  try {
    const res = await getSystemMonitorData();
    data.value = res;
    consecutiveFailures.value = 0;
    if (pollingPaused.value) {
      pollingPaused.value = false;
      startPolling();
    }
  } catch (error) {
    consecutiveFailures.value += 1;
    const networkError = isNetworkOrTimeoutError(error);
    const shouldPausePolling =
      networkError && consecutiveFailures.value >= MAX_CONSECUTIVE_FAILURES;

    if (shouldPausePolling) {
      pollingPaused.value = true;
      stopPolling();
    }

    // 首次失败和触发暂停时提示，避免后台中断时通知刷屏
    if (consecutiveFailures.value === 1 || shouldPausePolling) {
      handleApiError(error, 'Load System Monitor');
    }
  } finally {
    loading.value = false;
  }
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
};

const formatUptime = (seconds: number) => {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${d}d ${h}h ${m}m ${s}s`;
};

const formatCount = (num: number) => {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
  return num.toString();
};

const connectionUsage = computed(() => {
  if (!data.value?.database.maxConnections) return 0;
  return Number(
    (
      (data.value.database.activeConnections /
        data.value.database.maxConnections) *
      100
    ).toFixed(1),
  );
});

const formatDate = (dateStr: string) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString();
};

onMounted(() => {
  fetchData();
  startPolling();
});

onUnmounted(() => {
  stopPolling();
});
</script>

<template>
  <div class="monitor-container p-4">
    <Layout
      class="monitor-layout min-h-[700px] overflow-hidden rounded-lg bg-white shadow-sm"
    >
      <!-- 侧边栏 -->
      <Sider width="220" theme="light" class="border-r">
        <Menu
          v-model:selected-keys="selectedKey"
          mode="inline"
          class="h-full border-0"
        >
          <Menu.ItemGroup key="db_group">
            <template #title>
              <div class="flex items-center gap-2 px-1 font-bold text-blue-500">
                <IconifyIcon icon="ant-design:database-outlined" />
                <span>数据库监控</span>
              </div>
            </template>
            <Menu.Item key="overview">
              <template #icon
                ><IconifyIcon icon="ant-design:dashboard-outlined"
              /></template>
              概览信息
            </Menu.Item>
            <Menu.Item key="connections">
              <template #icon
                ><IconifyIcon icon="ant-design:api-outlined"
              /></template>
              连接信息
            </Menu.Item>
            <Menu.Item key="performance">
              <template #icon
                ><IconifyIcon icon="ant-design:bar-chart-outlined"
              /></template>
              性能统计
            </Menu.Item>
          </Menu.ItemGroup>

          <Divider class="my-1" />

          <Menu.ItemGroup key="server_group">
            <template #title>
              <div
                class="flex items-center gap-2 px-1 font-bold text-indigo-500"
              >
                <IconifyIcon icon="ant-design:desktop-outlined" />
                <span>服务器监控</span>
              </div>
            </template>
            <Menu.Item key="server">
              <template #icon
                ><IconifyIcon icon="ant-design:info-circle-outlined"
              /></template>
              系统信息
            </Menu.Item>
            <Menu.Item key="cpu_info">
              <template #icon
                ><IconifyIcon icon="ant-design:cluster-outlined"
              /></template>
              CPU 信息
            </Menu.Item>
            <Menu.Item key="mem_info">
              <template #icon
                ><IconifyIcon icon="ant-design:pie-chart-outlined"
              /></template>
              内存信息
            </Menu.Item>
            <Menu.Item key="disk_info">
              <template #icon
                ><IconifyIcon icon="ant-design:hdd-outlined"
              /></template>
              磁盘信息
            </Menu.Item>
            <Menu.Item key="net_info">
              <template #icon
                ><IconifyIcon icon="ant-design:global-outlined"
              /></template>
              网络信息
            </Menu.Item>
            <Menu.Item key="proc_info">
              <template #icon
                ><IconifyIcon icon="ant-design:bars-outlined"
              /></template>
              进程信息
            </Menu.Item>
          </Menu.ItemGroup>
        </Menu>
      </Sider>

      <!-- 主内容区 -->
      <Content class="bg-[#f9f9f9] p-6">
        <div
          v-if="loading && !data"
          class="flex h-full items-center justify-center"
        >
          <Spin size="large" tip="加载数据中..." />
        </div>

        <div v-else-if="data" class="h-full overflow-y-auto">
          <template v-if="selectedKey[0] === 'overview'">
            <!-- 概览标题页眉 -->
            <div class="mb-6 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <IconifyIcon
                  icon="ant-design:bar-chart-outlined"
                  class="text-xl text-blue-500"
                />
                <h1 class="m-0 text-xl font-bold text-gray-800">概览信息</h1>
              </div>
              <div class="flex items-center gap-4">
                <span class="text-sm text-gray-400"
                  >实例：{{ data.database.databaseName }} (2 Core / 2G)</span
                >
                <Tag color="green" class="rounded-full">自动刷新中</Tag>
                <Tag color="blue" class="rounded-full">已连接</Tag>
              </div>
            </div>

            <!-- RDS 资源估算 -->
            <div
              class="mb-4 flex items-center gap-2 text-sm font-bold text-gray-500"
            >
              <IconifyIcon
                icon="ant-design:cluster-outlined"
                class="text-indigo-500"
              />
              <span>资源使用估算 (RDS 2核/2G 实例)</span>
            </div>
            <Row :gutter="16" class="mb-6">
              <Col :span="12">
                <Card
                  :bordered="false"
                  class="kpi-card h-[130px] bg-gradient-to-br from-white to-blue-50/30"
                >
                  <div class="mb-2 flex items-start justify-between">
                    <span class="text-sm text-gray-500">CPU负载 (2核估算)</span>
                    <IconifyIcon
                      icon="ant-design:cluster-outlined"
                      class="rounded bg-blue-100 p-2 text-blue-600"
                    />
                  </div>
                  <div class="mb-2 flex items-end gap-3">
                    <div class="text-3xl font-bold">
                      {{ data.database.resource.cpuUsage }}%
                    </div>
                    <Tag
                      :color="
                        data.database.resource.cpuUsage > 80 ? 'red' : 'green'
                      "
                      class="mb-1 rounded-full"
                    >
                      {{ data.database.threadsRunning }} 活动线程
                    </Tag>
                  </div>
                  <Progress
                    :percent="data.database.resource.cpuUsage"
                    :show-info="false"
                    stroke-color="#096dd9"
                    size="small"
                  />
                  <div class="mt-2 text-[10px] text-gray-400">
                    负载率 = (活动线程 / 2核) %，反映引擎核心压力
                  </div>
                </Card>
              </Col>
              <Col :span="12">
                <Card
                  :bordered="false"
                  class="kpi-card h-[130px] bg-gradient-to-br from-white to-green-50/30"
                >
                  <div class="mb-2 flex items-start justify-between">
                    <span class="text-sm text-gray-500">内存使用 (2G占比)</span>
                    <IconifyIcon
                      icon="ant-design:pie-chart-outlined"
                      class="rounded bg-green-100 p-2 text-green-600"
                    />
                  </div>
                  <div class="mb-2 flex items-end gap-3">
                    <div class="text-3xl font-bold">
                      {{ data.database.resource.ramUsagePercent }}%
                    </div>
                    <div class="mb-1 font-mono text-xs text-gray-400">
                      {{ formatBytes(data.database.resource.ramUsed) }} /
                      {{ formatBytes(data.database.resource.ramTotal) }}
                    </div>
                  </div>
                  <Progress
                    :percent="data.database.resource.ramUsagePercent"
                    :show-info="false"
                    stroke-color="#52c41a"
                    size="small"
                  />
                  <div class="mt-2 text-[10px] text-gray-400">
                    结合 Buffer Pool 与引擎基础开销的 2GB 占比
                  </div>
                </Card>
              </Col>
            </Row>

            <div
              class="mb-4 flex items-center gap-2 text-sm font-bold text-gray-500"
            >
              <IconifyIcon
                icon="ant-design:dashboard-outlined"
                class="text-blue-500"
              />
              <span>状态指标概览</span>
            </div>
            <Row :gutter="16" class="mb-6">
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[145px]">
                  <div class="mb-2 flex items-start justify-between">
                    <span class="text-sm text-gray-500">连接使用率</span>
                    <IconifyIcon
                      icon="ant-design:api-outlined"
                      class="rounded bg-blue-50 p-2 text-blue-500"
                    />
                  </div>
                  <div class="mb-1 text-2xl font-bold">
                    {{ connectionUsage }}%
                  </div>
                  <Progress
                    :percent="connectionUsage"
                    :show-info="false"
                    stroke-color="#52c41a"
                    size="small"
                  />
                  <div class="mt-2 text-xs text-gray-400">
                    限制：{{ data.database.maxConnections }}
                  </div>
                </Card>
              </Col>
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[145px]">
                  <div class="mb-2 flex items-start justify-between">
                    <span class="text-sm text-gray-500">数据库大小</span>
                    <IconifyIcon
                      icon="ant-design:database-outlined"
                      class="rounded bg-purple-50 p-2 text-purple-500"
                    />
                  </div>
                  <div class="mb-1 text-2xl font-bold">
                    {{ formatBytes(data.database.size).split(' ')[0] }}
                    <span class="text-sm font-normal text-gray-400">{{
                      formatBytes(data.database.size).split(' ')[1]
                    }}</span>
                  </div>
                  <div class="h-[12px] w-full"></div>
                  <!-- 占位对齐 -->
                  <div class="mt-2 text-xs text-gray-400">物理占用量</div>
                </Card>
              </Col>
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[145px]">
                  <div class="mb-2 flex items-start justify-between">
                    <span class="text-sm text-gray-500">缓存命中率</span>
                    <IconifyIcon
                      icon="ant-design:bar-chart-outlined"
                      class="rounded bg-green-50 p-2 text-green-500"
                    />
                  </div>
                  <div class="mb-1 text-2xl font-bold">
                    {{ data.database.cacheHitRate }}%
                  </div>
                  <Progress
                    :percent="data.database.cacheHitRate"
                    :show-info="false"
                    stroke-color="#1890ff"
                    size="small"
                  />
                  <div class="mt-2 text-xs text-gray-400">Buffer Pool 效率</div>
                </Card>
              </Col>
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[145px]">
                  <div class="mb-2 flex items-start justify-between">
                    <span class="text-sm text-gray-500">活动连接</span>
                    <IconifyIcon
                      icon="ant-design:api-outlined"
                      class="rounded bg-orange-50 p-2 text-orange-500"
                    />
                  </div>
                  <div class="mb-1 text-2xl font-bold">
                    {{ data.database.activeConnections }}
                  </div>
                  <div class="h-[12px] w-full"></div>
                  <!-- 占位对齐 -->
                  <div class="mt-2 text-xs text-gray-400">当前活动连接数</div>
                </Card>
              </Col>
            </Row>

            <Row :gutter="16">
              <!-- 基本信息 -->
              <Col :span="14">
                <Card title="基本信息" :bordered="false">
                  <template #extra
                    ><IconifyIcon
                      icon="ant-design:database-outlined"
                      class="text-blue-500"
                  /></template>
                  <Descriptions :column="1" bordered size="small">
                    <Descriptions.Item label="数据库类型"
                      ><Tag color="green">MYSQL / RDS</Tag></Descriptions.Item
                    >
                    <Descriptions.Item label="版本号">{{
                      data.database.version
                    }}</Descriptions.Item>
                    <Descriptions.Item label="运行时间">{{
                      formatUptime(data.database.uptime)
                    }}</Descriptions.Item>
                    <Descriptions.Item label="时区配置">{{
                      data.database.timezone || 'SYSTEM'
                    }}</Descriptions.Item>
                    <Descriptions.Item label="字符集">{{
                      data.database.charset
                    }}</Descriptions.Item>
                    <Descriptions.Item label="最后刷新">{{
                      data.timestamp.split(' ')[1]
                    }}</Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
              <!-- 连接详情 -->
              <Col :span="10">
                <Card title="连接信息" :bordered="false">
                  <template #extra
                    ><IconifyIcon
                      icon="ant-design:api-outlined"
                      class="text-blue-500"
                  /></template>
                  <Descriptions :column="1" bordered size="small">
                    <Descriptions.Item label="总连接数">{{
                      data.database.activeConnections
                    }}</Descriptions.Item>
                    <Descriptions.Item label="最大连接数">{{
                      data.database.maxConnections
                    }}</Descriptions.Item>
                    <Descriptions.Item label="正在运行">{{
                      data.database.threadsRunning
                    }}</Descriptions.Item>
                    <Descriptions.Item label="空闲连接">{{
                      data.database.idleConnections
                    }}</Descriptions.Item>
                    <Descriptions.Item label="应用延迟"
                      ><span
                        :class="
                          data.database.latency > 50
                            ? 'text-red-500'
                            : 'text-green-500'
                        "
                        >{{ data.database.latency }} ms</span
                      ></Descriptions.Item
                    >
                  </Descriptions>
                </Card>
              </Col>
            </Row>
          </template>

          <!-- 连接信息页 -->
          <template v-else-if="selectedKey[0] === 'connections'">
            <div class="mb-6 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <IconifyIcon
                  icon="ant-design:api-outlined"
                  class="text-xl text-blue-500"
                />
                <h1 class="m-0 text-xl font-bold text-gray-800">连接信息</h1>
              </div>
            </div>

            <Row :gutter="16" class="mb-6">
              <Col
                v-for="item in [
                  {
                    label: '总连接数',
                    value: data.database.activeConnections,
                    icon: 'ant-design:cluster-outlined',
                    color: 'blue',
                  },
                  {
                    label: '最大连接数',
                    value: data.database.maxConnections,
                    icon: 'ant-design:deployment-unit-outlined',
                    color: 'purple',
                  },
                  {
                    label: '活动连接',
                    value: data.database.threadsRunning,
                    icon: 'ant-design:pulse-outlined',
                    color: 'green',
                    sub: '实时活动连接数',
                  },
                  {
                    label: '空闲连接',
                    value: data.database.idleConnections,
                    icon: 'ant-design:team-outlined',
                    color: 'gray',
                    sub: '当前空闲连接数',
                  },
                ]"
                :key="item.label"
                :span="6"
              >
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="flex items-start justify-between">
                    <div class="flex flex-col">
                      <span class="mb-1 text-sm text-gray-500">{{
                        item.label
                      }}</span>
                      <span class="text-2xl font-bold">{{ item.value }}</span>
                      <span
                        v-if="item.sub"
                        class="mt-1 text-xs text-gray-400"
                        >{{ item.sub }}</span
                      >
                    </div>
                    <IconifyIcon
                      :icon="item.icon"
                      :class="`text-${item.color}-500 bg-${item.color}-50 rounded-lg p-3 text-xl`"
                    />
                  </div>
                </Card>
              </Col>
            </Row>

            <Row :gutter="16">
              <Col :span="12">
                <Card title="连接 pool 状态" :bordered="false">
                  <template #extra
                    ><IconifyIcon
                      icon="ant-design:deployment-unit-outlined"
                      class="text-blue-500"
                  /></template>
                  <div class="mb-6">
                    <div class="mb-2 flex justify-between">
                      <span class="text-gray-500">连接使用率</span>
                      <span class="font-bold">{{ connectionUsage }}%</span>
                    </div>
                    <Progress
                      :percent="connectionUsage"
                      stroke-color="#52c41a"
                    />
                  </div>
                  <div class="space-y-4">
                    <div class="flex items-center justify-between text-sm">
                      <div class="flex items-center gap-2">
                        <div class="h-3 w-3 rounded-full bg-green-500"></div>
                        <span>活动连接</span>
                      </div>
                      <span class="font-medium">{{
                        data.database.threadsRunning
                      }}</span>
                    </div>
                    <div class="flex items-center justify-between text-sm">
                      <div class="flex items-center gap-2">
                        <div class="h-3 w-3 rounded-full bg-gray-300"></div>
                        <span>空闲连接</span>
                      </div>
                      <span class="font-medium">{{
                        data.database.idleConnections
                      }}</span>
                    </div>
                    <div class="flex items-center justify-between text-sm">
                      <div class="flex items-center gap-2">
                        <div class="h-3 w-3 rounded-full bg-blue-500"></div>
                        <span>总连接数</span>
                      </div>
                      <span class="font-medium">{{
                        data.database.activeConnections
                      }}</span>
                    </div>
                  </div>
                  <Divider />
                  <div class="flex items-center justify-between">
                    <span class="text-gray-500">连接 pool 容量</span>
                    <span class="text-lg font-bold"
                      >{{ data.database.activeConnections }} /
                      {{ data.database.maxConnections }}</span
                    >
                  </div>
                  <Progress
                    :percent="connectionUsage"
                    :show-info="false"
                    stroke-color="#52c41a"
                    size="small"
                  />
                </Card>
              </Col>
              <Col :span="12">
                <Card title="连接详细信息" :bordered="false">
                  <template #extra
                    ><IconifyIcon
                      icon="ant-design:pulse-outlined"
                      class="text-blue-500"
                  /></template>
                  <Descriptions :column="1" bordered size="small">
                    <Descriptions.Item label="总连接数">{{
                      data.database.activeConnections
                    }}</Descriptions.Item>
                    <Descriptions.Item label="最大连接数">{{
                      data.database.maxConnections
                    }}</Descriptions.Item>
                    <Descriptions.Item label="活动连接">
                      <span class="font-bold text-green-500">{{
                        data.database.threadsRunning
                      }}</span>
                      <Tag color="green" class="ml-2 scale-90">是</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="空闲连接">{{
                      data.database.idleConnections
                    }}</Descriptions.Item>
                    <Descriptions.Item label="已使用连接">{{
                      data.database.activeConnections
                    }}</Descriptions.Item>
                    <Descriptions.Item label="连接使用率">
                      <div class="flex w-full items-center gap-4">
                        <Progress
                          :percent="connectionUsage"
                          :show-info="false"
                          stroke-color="#52c41a"
                          class="flex-1"
                        />
                        <span class="min-w-[40px]">{{ connectionUsage }}%</span>
                      </div>
                    </Descriptions.Item>
                    <Descriptions.Item label="可用连接">{{
                      data.database.maxConnections -
                      data.database.activeConnections
                    }}</Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
            </Row>
          </template>

          <!-- 性能统计页 -->
          <template v-else-if="selectedKey[0] === 'performance'">
            <div class="mb-6 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <IconifyIcon
                  icon="ant-design:bar-chart-outlined"
                  class="text-xl text-blue-500"
                />
                <h1 class="m-0 text-xl font-bold text-gray-800">性能统计</h1>
              </div>
            </div>

            <Row :gutter="16" class="mb-6">
              <Col :span="8">
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="flex items-start justify-between">
                    <div class="flex flex-col">
                      <span class="mb-1 text-sm text-gray-500">缓存命中率</span>
                      <span class="text-2xl font-bold"
                        >{{ data.database.cacheHitRate }}%</span
                      >
                      <Progress
                        :percent="data.database.cacheHitRate"
                        :show-info="false"
                        stroke-color="#52c41a"
                        size="small"
                        class="mt-2 w-40"
                      />
                      <span class="mt-2 text-xs text-gray-400">缓存命中率</span>
                    </div>
                    <IconifyIcon
                      icon="ant-design:thunderbolt-outlined"
                      class="rounded-lg bg-green-50 p-3 text-xl text-green-500"
                    />
                  </div>
                </Card>
              </Col>
              <Col :span="8">
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="flex items-start justify-between">
                    <div class="flex flex-col">
                      <span class="mb-1 text-sm text-gray-500">事务提交</span>
                      <span class="text-2xl font-bold">{{
                        formatCount(data.database.comCommit)
                      }}</span>
                      <span class="mt-4 text-xs text-gray-400"
                        >累计提交事务数</span
                      >
                    </div>
                    <IconifyIcon
                      icon="ant-design:line-chart-outlined"
                      class="rounded-lg bg-blue-50 p-3 text-xl text-blue-500"
                    />
                  </div>
                </Card>
              </Col>
              <Col :span="8">
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="flex items-start justify-between">
                    <div class="flex flex-col">
                      <span class="mb-1 text-sm text-gray-500">事务回滚</span>
                      <span class="text-2xl font-bold">{{
                        formatCount(data.database.comRollback)
                      }}</span>
                      <span class="mt-4 text-xs text-gray-400"
                        >累计回滚事务数</span
                      >
                    </div>
                    <IconifyIcon
                      icon="ant-design:stock-outlined"
                      class="rounded-lg bg-orange-50 p-3 text-xl text-orange-500"
                    />
                  </div>
                </Card>
              </Col>
            </Row>

            <Row :gutter="16">
              <Col :span="12">
                <Card title="事务统计" :bordered="false">
                  <template #extra
                    ><IconifyIcon
                      icon="ant-design:line-chart-outlined"
                      class="text-blue-500"
                  /></template>
                  <Descriptions :column="1" bordered size="small">
                    <Descriptions.Item label="事务提交">{{
                      formatCount(data.database.comCommit)
                    }}</Descriptions.Item>
                    <Descriptions.Item label="事务回滚">{{
                      formatCount(data.database.comRollback)
                    }}</Descriptions.Item>
                    <Descriptions.Item label="提交率">
                      <div class="flex w-full items-center gap-4">
                        <Progress
                          :percent="data.database.commitRate"
                          :show-info="false"
                          stroke-color="#52c41a"
                          class="flex-1"
                        />
                        <span class="min-w-[40px] text-xs"
                          >{{ data.database.commitRate }}%</span
                        >
                      </div>
                    </Descriptions.Item>
                    <Descriptions.Item label="缓存命中率">
                      <div class="flex w-full items-center gap-4">
                        <Progress
                          :percent="data.database.cacheHitRate"
                          :show-info="false"
                          stroke-color="#1890ff"
                          class="flex-1"
                        />
                        <span class="min-w-[40px] text-xs"
                          >{{ data.database.cacheHitRate }}%</span
                        >
                      </div>
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
              <Col :span="12">
                <Card title="元组操作" :bordered="false">
                  <template #extra
                    ><IconifyIcon
                      icon="ant-design:bar-chart-outlined"
                      class="text-blue-500"
                  /></template>
                  <Descriptions :column="1" bordered size="small">
                    <Descriptions.Item label="元组返回"
                      ><span class="text-gray-600">{{
                        formatCount(data.database.handlerReadNext)
                      }}</span></Descriptions.Item
                    >
                    <Descriptions.Item label="元组获取">{{
                      formatCount(data.database.handlerReadKey)
                    }}</Descriptions.Item>
                    <Descriptions.Item label="元组插入"
                      ><span class="font-medium text-green-600">{{
                        formatCount(data.database.handlerWrite)
                      }}</span></Descriptions.Item
                    >
                    <Descriptions.Item label="元组更新"
                      ><span class="font-medium text-blue-600">{{
                        formatCount(data.database.handlerUpdate)
                      }}</span></Descriptions.Item
                    >
                    <Descriptions.Item label="元组删除"
                      ><span class="font-medium text-red-500">{{
                        formatCount(data.database.handlerDelete)
                      }}</span></Descriptions.Item
                    >
                  </Descriptions>
                </Card>
              </Col>
            </Row>
          </template>

          <template v-else-if="selectedKey[0] === 'server'">
            <div class="mb-6 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <IconifyIcon
                  icon="ant-design:desktop-outlined"
                  class="text-xl text-blue-500"
                />
                <h1 class="m-0 text-xl font-bold text-gray-800">系统信息</h1>
              </div>
              <Tag color="green" class="rounded-full">自动刷新中</Tag>
            </div>

            <Row :gutter="16" class="mb-6">
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[135px]">
                  <div class="mb-2 flex items-start justify-between">
                    <span class="text-sm text-gray-500">CPU使用率</span>
                    <IconifyIcon
                      icon="ant-design:cluster-outlined"
                      class="rounded bg-blue-50 p-2 text-blue-500"
                    />
                  </div>
                  <div class="text-2xl font-bold">
                    {{ data.server.cpu.usagePercent }}%
                  </div>
                  <Progress
                    :percent="data.server.cpu.usagePercent"
                    :show-info="false"
                    stroke-color="#1890ff"
                    size="small"
                  />
                  <div class="mt-2 text-xs text-gray-400">
                    {{ data.server.cpu.cores }}核心 /
                    {{ data.server.cpu.threads }}线程数量
                  </div>
                </Card>
              </Col>
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[135px]">
                  <div class="mb-2 flex items-start justify-between">
                    <span class="text-sm text-gray-500">内存使用率</span>
                    <IconifyIcon
                      icon="ant-design:pie-chart-outlined"
                      class="rounded bg-green-50 p-2 text-green-500"
                    />
                  </div>
                  <div class="text-2xl font-bold">
                    {{ data.server.memory.usagePercent }}%
                  </div>
                  <Progress
                    :percent="data.server.memory.usagePercent"
                    :show-info="false"
                    stroke-color="#52c41a"
                    size="small"
                  />
                  <div class="mt-2 text-xs text-gray-400">
                    已使用: {{ formatBytes(data.server.memory.used) }} / 总计:
                    {{ formatBytes(data.server.memory.total) }}
                  </div>
                </Card>
              </Col>
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[135px]">
                  <div class="mb-2 flex items-start justify-between">
                    <span class="text-sm text-gray-500">磁盘IO</span>
                    <IconifyIcon
                      icon="ant-design:hdd-outlined"
                      class="rounded bg-purple-50 p-2 text-purple-500"
                    />
                  </div>
                  <div class="flex flex-col gap-1">
                    <div class="flex justify-between text-xs">
                      <span>读取:</span
                      ><b>{{ formatBytes(data.server.disk.read) }}/s</b>
                    </div>
                    <div class="flex justify-between text-xs">
                      <span>写入:</span
                      ><b>{{ formatBytes(data.server.disk.write) }}/s</b>
                    </div>
                  </div>
                  <div class="mt-2 text-xs text-gray-400">
                    总读取: {{ formatBytes(data.server.disk.totalRead) }} /
                    总写入: {{ formatBytes(data.server.disk.totalWrite) }}
                  </div>
                </Card>
              </Col>
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[135px]">
                  <div class="mb-2 flex items-start justify-between">
                    <span class="text-sm text-gray-500">网络IO</span>
                    <IconifyIcon
                      icon="ant-design:global-outlined"
                      class="rounded bg-orange-50 p-2 text-orange-500"
                    />
                  </div>
                  <div class="flex flex-col gap-1">
                    <div class="flex justify-between text-xs">
                      <span>上传:</span
                      ><b>{{ formatBytes(data.server.network.upload) }}/s</b>
                    </div>
                    <div class="flex justify-between text-xs">
                      <span>下载:</span
                      ><b>{{ formatBytes(data.server.network.download) }}/s</b>
                    </div>
                  </div>
                  <div class="mt-2 text-xs text-gray-400">
                    总发送: {{ formatBytes(data.server.network.sent) }} /
                    总接收: {{ formatBytes(data.server.network.received) }}
                  </div>
                </Card>
              </Col>
            </Row>

            <!-- 系统状态 -->
            <Row :gutter="16">
              <Col :span="13">
                <Card title="基本信息" :bordered="false">
                  <template #extra>
                    <IconifyIcon
                      icon="ant-design:info-circle-outlined"
                      class="text-blue-500"
                    />
                  </template>
                  <Descriptions
                    :column="1"
                    bordered
                    size="small"
                    :label-style="{ width: '120px' }"
                  >
                    <Descriptions.Item label="主机名">
                      <div
                        class="max-w-[300px] truncate"
                        :title="data.server.os.hostname"
                      >
                        {{ data.server.os.hostname }}
                      </div>
                    </Descriptions.Item>
                    <Descriptions.Item label="IP地址">{{
                      data.server.os.ip
                    }}</Descriptions.Item>
                    <Descriptions.Item label="操作系统">
                      <Tag color="blue" class="m-0"
                        >{{ data.server.os.platform }}
                        {{ data.server.os.release }}</Tag
                      >
                    </Descriptions.Item>
                    <Descriptions.Item label="架构">{{
                      data.server.os.arch
                    }}</Descriptions.Item>
                    <Descriptions.Item label="处理器">
                      <div
                        class="max-w-[300px] truncate"
                        :title="data.server.cpu.model"
                      >
                        {{ data.server.cpu.model }}
                      </div>
                    </Descriptions.Item>
                    <Descriptions.Item label="Node.js版本">{{
                      data.server.os.nodeVersion
                    }}</Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
              <Col :span="11">
                <Card title="系统状态" :bordered="false">
                  <template #extra
                    ><IconifyIcon
                      icon="ant-design:pulse-outlined"
                      class="text-blue-500"
                  /></template>
                  <div class="flex flex-col gap-3">
                    <!-- 系统负载 -->
                    <div
                      class="flex items-stretch overflow-hidden rounded-lg border bg-gray-50/30"
                    >
                      <div
                        class="flex w-24 shrink-0 items-center justify-center border-r bg-gray-50/80 px-2 py-4 text-center text-xs font-bold leading-tight text-gray-600"
                      >
                        系统负载
                      </div>
                      <div
                        class="flex min-w-0 flex-1 flex-wrap items-center gap-2 p-3"
                      >
                        <div
                          v-for="(val, idx) in [1, 5, 15]"
                          :key="val"
                          class="flex min-w-[80px] flex-1 items-center justify-between whitespace-nowrap rounded border bg-white p-1.5 px-2"
                        >
                          <span class="font-mono text-[10px] text-gray-400"
                            >{{ val }}m:</span
                          >
                          <span class="ml-1 font-mono text-xs font-bold">{{
                            data.server.cpu.loadAvg[idx]?.toFixed(2) ?? '0.00'
                          }}</span>
                        </div>
                      </div>
                    </div>
                    <!-- 运行时长 -->
                    <div
                      class="flex items-stretch overflow-hidden rounded-lg border bg-gray-50/30"
                    >
                      <div
                        class="flex w-24 shrink-0 items-center justify-center border-r bg-gray-50/80 px-2 py-3 text-center text-xs font-bold leading-tight text-gray-600"
                      >
                        运行时间
                      </div>
                      <div
                        class="flex flex-1 items-center p-3 font-mono text-xs"
                      >
                        {{ formatUptime(data.server.os.uptime) }}
                      </div>
                    </div>
                    <!-- 启动时间 -->
                    <div
                      class="flex items-stretch overflow-hidden rounded-lg border bg-gray-50/30"
                    >
                      <div
                        class="flex w-24 shrink-0 items-center justify-center border-r bg-gray-50/80 px-2 py-3 text-center text-xs font-bold leading-tight text-gray-600"
                      >
                        启动时间
                      </div>
                      <div
                        class="flex flex-1 items-center truncate p-3 font-mono text-xs"
                        :title="formatDate(data.server.os.startTime)"
                      >
                        {{ formatDate(data.server.os.startTime) }}
                      </div>
                    </div>
                    <!-- 进程数量 -->
                    <div
                      class="flex items-stretch overflow-hidden rounded-lg border bg-gray-50/30"
                    >
                      <div
                        class="flex w-24 shrink-0 items-center justify-center border-r bg-gray-50/80 px-2 py-3 text-center text-xs font-bold leading-tight text-gray-600"
                      >
                        进程数
                      </div>
                      <div
                        class="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 p-3"
                      >
                        <div class="flex items-center gap-1.5">
                          <span class="text-[10px] text-gray-400">总计:</span>
                          <span class="text-xs font-bold">{{
                            data.server.processes.total
                          }}</span>
                        </div>
                        <div class="flex items-center gap-1.5 text-blue-500">
                          <span class="text-[10px]">运行:</span>
                          <span class="text-xs font-bold">{{
                            data.server.processes.running
                          }}</span>
                        </div>
                        <div class="flex items-center gap-1.5 text-gray-500">
                          <span class="text-[10px]">休眠:</span>
                          <span class="text-xs font-bold">{{
                            data.server.processes.sleeping
                          }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </Col>
            </Row>
          </template>

          <!-- CPU信息页 -->
          <template v-else-if="selectedKey[0] === 'cpu_info'">
            <div class="mb-6 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <IconifyIcon
                  icon="ant-design:cluster-outlined"
                  class="text-xl text-blue-500"
                />
                <h1 class="m-0 text-xl font-bold text-gray-800">CPU信息</h1>
              </div>
              <Tag color="green" class="rounded-full">自动刷新中</Tag>
            </div>

            <Row :gutter="16" class="mb-6">
              <Col :span="8">
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="mb-2 flex items-start justify-between">
                    <div class="flex items-center gap-2">
                      <IconifyIcon
                        icon="ant-design:cluster-outlined"
                        class="rounded bg-blue-50 p-1.5 text-blue-500"
                      />
                      <span class="text-sm text-gray-500">总体使用率</span>
                    </div>
                  </div>
                  <div class="mt-2 text-3xl font-bold">
                    {{ data.server.cpu.usagePercent }}%
                  </div>
                  <Progress
                    :percent="data.server.cpu.usagePercent"
                    :show-info="false"
                    stroke-color="#1890ff"
                    size="small"
                  />
                </Card>
              </Col>
              <Col :span="8">
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="mb-2 flex items-start justify-between">
                    <div class="flex items-center gap-2">
                      <IconifyIcon
                        icon="ant-design:number-outlined"
                        class="rounded bg-green-50 p-1.5 text-green-500"
                      />
                      <span class="text-sm text-gray-500">物理核心</span>
                    </div>
                  </div>
                  <div class="mt-2 text-3xl font-bold">
                    {{ data.server.cpu.cores }}
                  </div>
                  <div class="mt-2 text-xs text-gray-400">核心数量</div>
                </Card>
              </Col>
              <Col :span="8">
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="mb-2 flex items-start justify-between">
                    <div class="flex items-center gap-2">
                      <IconifyIcon
                        icon="ant-design:branches-outlined"
                        class="rounded bg-purple-50 p-1.5 text-purple-500"
                      />
                      <span class="text-sm text-gray-500">逻辑处理器</span>
                    </div>
                  </div>
                  <div class="mt-2 text-3xl font-bold">
                    {{ data.server.cpu.threads }}
                  </div>
                  <div class="mt-2 text-xs text-gray-400">线程数量</div>
                </Card>
              </Col>
            </Row>

            <Row :gutter="16" class="mb-6">
              <Col :span="12">
                <Card title="基本信息" :bordered="false" size="small">
                  <template #extra
                    ><IconifyIcon
                      icon="ant-design:info-circle-outlined"
                      class="text-blue-500"
                  /></template>
                  <Descriptions :column="1" bordered size="small">
                    <Descriptions.Item label="处理器型号">{{
                      data.server.cpu.model
                    }}</Descriptions.Item>
                    <Descriptions.Item label="架构">{{
                      data.server.os.arch
                    }}</Descriptions.Item>
                    <Descriptions.Item label="物理核心数">{{
                      data.server.cpu.cores
                    }}</Descriptions.Item>
                    <Descriptions.Item label="逻辑处理器数">{{
                      data.server.cpu.threads
                    }}</Descriptions.Item>
                    <Descriptions.Item label="当前使用率">
                      <Tag color="green"
                        >{{ data.server.cpu.usagePercent.toFixed(2) }}%</Tag
                      >
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
              <Col :span="12">
                <Card title="频率信息" :bordered="false" size="small">
                  <template #extra
                    ><IconifyIcon
                      icon="ant-design:dashboard-outlined"
                      class="text-blue-500"
                  /></template>
                  <Descriptions :column="1" bordered size="small">
                    <Descriptions.Item label="当前频率">
                      <Tag color="blue">{{ data.server.cpu.freq.current }}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="最大频率">{{
                      data.server.cpu.freq.max
                    }}</Descriptions.Item>
                    <Descriptions.Item label="最小频率">{{
                      data.server.cpu.freq.min
                    }}</Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
            </Row>

            <Card
              title="各核心使用率"
              :bordered="false"
              class="mb-6"
              size="small"
            >
              <template #extra
                ><IconifyIcon
                  icon="ant-design:appstore-outlined"
                  class="text-blue-500"
              /></template>
              <div class="grid grid-cols-4 gap-4">
                <div
                  v-for="(usage, index) in data.server.cpu.cores_usage"
                  :key="index"
                  class="rounded border bg-gray-50/30 p-3"
                >
                  <div class="mb-2 flex justify-between text-xs">
                    <span class="text-gray-500">核心 {{ index }}</span>
                    <span class="font-bold text-green-500">{{ usage }}%</span>
                  </div>
                  <Progress
                    :percent="usage"
                    :show-info="false"
                    stroke-color="#1890ff"
                    size="small"
                  />
                </div>
              </div>
            </Card>

            <Card
              title="CPU 时间统计"
              :bordered="false"
              class="mb-6"
              size="small"
            >
              <template #extra
                ><IconifyIcon
                  icon="ant-design:history-outlined"
                  class="text-blue-500"
              /></template>
              <div class="grid grid-cols-4 gap-4">
                <div
                  v-for="(val, key) in data.server.cpu.times"
                  :key="key"
                  class="rounded border p-3 transition-shadow hover:shadow-md"
                >
                  <div class="mb-1 text-xs text-gray-400">{{ key }}</div>
                  <div class="font-mono text-lg font-bold">
                    {{ ((val || 0) / 1000).toFixed(2) }}
                  </div>
                </div>
              </div>
            </Card>

            <Card
              title="CPU 统计信息"
              :bordered="false"
              class="mb-6"
              size="small"
            >
              <template #extra
                ><IconifyIcon
                  icon="ant-design:line-chart-outlined"
                  class="text-blue-500"
              /></template>
              <div class="grid grid-cols-4 gap-4">
                <div class="rounded border p-3">
                  <div class="mb-1 text-xs text-gray-400">ctx_switches</div>
                  <div class="font-mono text-lg font-bold">
                    {{ formatCount(data.server.cpu.stats.ctx_switches) }}
                  </div>
                </div>
                <div class="rounded border p-3">
                  <div class="mb-1 text-xs text-gray-400">interrupts</div>
                  <div class="font-mono text-lg font-bold">
                    {{ formatCount(data.server.cpu.stats.interrupts) }}
                  </div>
                </div>
                <div class="rounded border p-3">
                  <div class="mb-1 text-xs text-gray-400">soft_interrupts</div>
                  <div class="font-mono text-lg font-bold">
                    {{ formatCount(data.server.cpu.stats.soft_interrupts) }}
                  </div>
                </div>
                <div class="rounded border p-3">
                  <div class="mb-1 text-xs text-gray-400">syscalls</div>
                  <div class="font-mono text-lg font-bold">
                    {{ formatCount(data.server.cpu.stats.syscalls) }}
                  </div>
                </div>
              </div>
            </Card>
          </template>

          <!-- 内存信息页 -->
          <template v-else-if="selectedKey[0] === 'mem_info'">
            <div class="mb-6 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <IconifyIcon
                  icon="ant-design:pie-chart-outlined"
                  class="text-xl text-green-500"
                />
                <h1 class="m-0 text-xl font-bold text-gray-800">内存信息</h1>
              </div>
              <Tag color="green" class="rounded-full">自动刷新中</Tag>
            </div>

            <Row :gutter="16" class="mb-6">
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="mb-2 flex items-center gap-2">
                    <IconifyIcon
                      icon="ant-design:database-outlined"
                      class="rounded bg-blue-50 p-1.5 text-blue-500"
                    />
                    <span class="text-sm text-gray-500">总内存</span>
                  </div>
                  <div class="text-2xl font-bold">
                    {{ formatBytes(data.server.memory.total) }}
                  </div>
                  <div class="mt-2 text-xs text-gray-400">物理内存总量</div>
                </Card>
              </Col>
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="mb-2 flex items-center gap-2">
                    <IconifyIcon
                      icon="ant-design:cloud-upload-outlined"
                      class="rounded bg-orange-50 p-1.5 text-orange-500"
                    />
                    <span class="text-sm text-gray-500">已使用</span>
                  </div>
                  <div class="text-2xl font-bold">
                    {{ formatBytes(data.server.memory.used) }}
                  </div>
                  <div class="mt-2 text-xs text-gray-400">
                    {{ data.server.memory.usagePercent }}% 内存使用率
                  </div>
                </Card>
              </Col>
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="mb-2 flex items-center gap-2">
                    <IconifyIcon
                      icon="ant-design:check-circle-outlined"
                      class="rounded bg-green-50 p-1.5 text-green-500"
                    />
                    <span class="text-sm text-gray-500">可用内容</span>
                  </div>
                  <div class="text-2xl font-bold">
                    {{ formatBytes(data.server.memory.available) }}
                  </div>
                  <div class="mt-2 text-xs text-gray-400">可立即使用</div>
                </Card>
              </Col>
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="mb-2 flex items-center gap-2">
                    <IconifyIcon
                      icon="ant-design:dashboard-outlined"
                      class="rounded bg-purple-50 p-1.5 text-purple-500"
                    />
                    <span class="text-sm text-gray-500">内存使用率</span>
                  </div>
                  <div class="text-2xl font-bold">
                    {{ data.server.memory.usagePercent }}%
                  </div>
                  <Progress
                    :percent="data.server.memory.usagePercent"
                    :show-info="false"
                    stroke-color="#722ed1"
                    size="small"
                  />
                </Card>
              </Col>
            </Row>

            <Card
              title="虚拟内存 (RAM)"
              :bordered="false"
              class="mb-6"
              size="small"
            >
              <template #extra
                ><IconifyIcon
                  icon="ant-design:radar-chart-outlined"
                  class="text-blue-500"
              /></template>
              <div class="mb-4">
                <div class="mb-1 flex items-end justify-between">
                  <span class="text-xs font-bold text-gray-500"
                    >内存使用情况</span
                  >
                  <Tag color="blue" plain size="small" class="m-0 text-[10px]"
                    >{{ data.server.memory.usagePercent }}%</Tag
                  >
                </div>
                <Progress
                  :percent="data.server.memory.usagePercent"
                  :show-info="false"
                  stroke-color="#1890ff"
                  :stroke-width="12"
                />
                <div
                  class="mt-1 flex justify-between font-mono text-[10px] text-gray-400"
                >
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-x-8">
                <div class="flex flex-col gap-2">
                  <div class="flex justify-between border-b pb-1 text-xs">
                    <span class="text-gray-500">总内存</span
                    ><b class="font-mono">{{
                      formatBytes(data.server.memory.total)
                    }}</b>
                  </div>
                  <div class="flex justify-between border-b pb-1 text-xs">
                    <span class="text-gray-500">已使用</span
                    ><b class="font-mono">{{
                      formatBytes(data.server.memory.used)
                    }}</b>
                  </div>
                  <div class="flex justify-between border-b pb-1 text-xs">
                    <span class="text-gray-500">活跃内存</span
                    ><b class="font-mono">{{
                      formatBytes(data.server.memory.active)
                    }}</b>
                  </div>
                  <div class="flex justify-between border-b pb-1 text-xs">
                    <span class="text-gray-500">缓冲区</span
                    ><b class="font-mono">{{
                      formatBytes(data.server.memory.buffers)
                    }}</b>
                  </div>
                  <div class="flex justify-between border-b pb-1 text-xs">
                    <span class="text-gray-500">共享内存</span
                    ><b class="font-mono">{{
                      formatBytes(data.server.memory.shared)
                    }}</b>
                  </div>
                </div>
                <div class="flex flex-col gap-2">
                  <div class="flex justify-between border-b pb-1 text-xs">
                    <span class="text-gray-500">可用内存</span
                    ><b class="font-mono">{{
                      formatBytes(data.server.memory.available)
                    }}</b>
                  </div>
                  <div class="flex justify-between border-b pb-1 text-xs">
                    <span class="text-gray-500">空闲内存</span
                    ><b class="font-mono">{{
                      formatBytes(data.server.memory.free)
                    }}</b>
                  </div>
                  <div class="flex justify-between border-b pb-1 text-xs">
                    <span class="text-gray-500">非活跃内存</span
                    ><b class="font-mono">{{
                      formatBytes(data.server.memory.inactive)
                    }}</b>
                  </div>
                  <div class="flex justify-between border-b pb-1 text-xs">
                    <span class="text-gray-500">缓存</span
                    ><b class="font-mono">{{
                      formatBytes(data.server.memory.cached)
                    }}</b>
                  </div>
                  <div class="flex justify-between border-b pb-1 text-xs">
                    <span class="text-gray-500">内存使用率</span
                    ><Tag color="green" size="small" class="m-0 font-mono"
                      >{{ data.server.memory.usagePercent }}%</Tag
                    >
                  </div>
                </div>
              </div>
            </Card>

            <Card
              title="交换分区 (Swap)"
              :bordered="false"
              class="mb-6"
              size="small"
            >
              <template #extra
                ><IconifyIcon
                  icon="ant-design:swap-outlined"
                  class="text-blue-500"
              /></template>
              <div class="mb-4">
                <div class="mb-1 flex items-end justify-between">
                  <span class="text-xs font-bold text-gray-500"
                    >交换分区使用情况</span
                  >
                  <Tag color="green" size="small" class="m-0 text-[10px]"
                    >{{ data.server.memory.swap.usagePercent }}%</Tag
                  >
                </div>
                <Progress
                  :percent="data.server.memory.swap.usagePercent"
                  :show-info="false"
                  stroke-color="#52c41a"
                  :stroke-width="12"
                />
                <div
                  class="mt-1 flex justify-between font-mono text-[10px] text-gray-400"
                >
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-x-8">
                <div class="flex flex-col gap-2">
                  <div class="flex justify-between border-b pb-1 text-xs">
                    <span class="text-gray-500">交换分区总量</span
                    ><b class="font-mono">{{
                      formatBytes(data.server.memory.swap.total)
                    }}</b>
                  </div>
                  <div class="flex justify-between border-b pb-1 text-xs">
                    <span class="text-gray-500">可用交换分区</span
                    ><b class="font-mono">{{
                      formatBytes(data.server.memory.swap.free)
                    }}</b>
                  </div>
                  <div class="flex justify-between border-b pb-1 text-xs">
                    <span class="text-gray-500">交换调入 (In)</span
                    ><b class="font-mono">0 GB</b>
                  </div>
                </div>
                <div class="flex flex-col gap-2">
                  <div class="flex justify-between border-b pb-1 text-xs">
                    <span class="text-gray-500">已使用</span
                    ><b class="font-mono">{{
                      formatBytes(data.server.memory.swap.used)
                    }}</b>
                  </div>
                  <div class="flex justify-between border-b pb-1 text-xs">
                    <span class="text-gray-500">内存使用率</span
                    ><Tag color="green" size="small" class="m-0 font-mono"
                      >{{ data.server.memory.swap.usagePercent }}%</Tag
                    >
                  </div>
                  <div class="flex justify-between border-b pb-1 text-xs">
                    <span class="text-gray-500">交换调出 (Out)</span
                    ><b class="font-mono">0 GB</b>
                  </div>
                </div>
              </div>
            </Card>

            <Card title="内存分布" :bordered="false" class="mb-6" size="small">
              <template #extra
                ><IconifyIcon
                  icon="ant-design:appstore-outlined"
                  class="text-blue-500"
              /></template>
              <div class="grid grid-cols-3 gap-4">
                <div
                  v-for="(val, label) in {
                    已使用: data.server.memory.used,
                    缓存: data.server.memory.cached,
                    缓冲区: data.server.memory.buffers,
                    活跃内存: data.server.memory.active,
                    非活跃内存: data.server.memory.inactive,
                    空闲内存: data.server.memory.free,
                  }"
                  :key="label"
                  class="rounded border bg-gray-50/20 p-3"
                >
                  <div class="mb-2 flex items-center justify-between">
                    <span class="text-xs text-gray-500">{{ label }}</span>
                    <Tag size="small" plain class="m-0 text-[10px]"
                      >{{
                        label === '已使用'
                          ? data.server.memory.usagePercent
                          : ((val / data.server.memory.total) * 100).toFixed(1)
                      }}%</Tag
                    >
                  </div>
                  <div class="mb-2 font-mono text-lg font-bold">
                    {{
                      label === '缓冲区' || label === '空闲内存'
                        ? formatBytes(val)
                        : formatBytes(val)
                    }}
                  </div>
                  <Progress
                    :percent="
                      Number(
                        ((val / data.server.memory.total) * 100).toFixed(1),
                      )
                    "
                    :show-info="false"
                    :stroke-color="label === '已使用' ? '#faad14' : '#1890ff'"
                    size="small"
                  />
                </div>
              </div>
            </Card>

            <Card title="实时内存详情" :bordered="false" size="small">
              <div class="grid grid-cols-4 gap-4">
                <Card
                  v-for="(val, label) in {
                    total: data.server.memory.total,
                    available: data.server.memory.available,
                    used: data.server.memory.used,
                    free: data.server.memory.free,
                  }"
                  :key="label"
                  size="small"
                  :bordered="true"
                  class="bg-gray-50/10"
                >
                  <div class="mb-1 font-mono text-xs uppercase text-gray-400">
                    {{ label }}
                  </div>
                  <div class="text-lg font-bold">{{ formatBytes(val) }}</div>
                </Card>
              </div>
            </Card>
          </template>
          <!-- 磁盘信息页 -->
          <template v-else-if="selectedKey[0] === 'disk_info'">
            <div class="mb-6 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <IconifyIcon
                  icon="ant-design:hdd-outlined"
                  class="text-xl text-blue-500"
                />
                <h1 class="m-0 text-xl font-bold text-gray-800">磁盘信息</h1>
              </div>
              <Tag color="green" class="rounded-full">自动刷新中</Tag>
            </div>

            <Row :gutter="16" class="mb-6">
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="mb-2 flex items-center gap-2">
                    <IconifyIcon
                      icon="ant-design:read-outlined"
                      class="rounded bg-blue-50 p-1.5 text-blue-500"
                    />
                    <span class="text-sm text-gray-500">读取速度</span>
                  </div>
                  <div class="text-2xl font-bold">
                    {{ formatBytes(data.server.disk.read) }}/s
                  </div>
                  <div class="mt-2 text-xs text-gray-400">当前读取速率</div>
                </Card>
              </Col>
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="mb-2 flex items-center gap-2">
                    <IconifyIcon
                      icon="ant-design:edit-outlined"
                      class="rounded bg-green-50 p-1.5 text-green-500"
                    />
                    <span class="text-sm text-gray-500">写入速度</span>
                  </div>
                  <div class="text-2xl font-bold">
                    {{ formatBytes(data.server.disk.write) }}/s
                  </div>
                  <div class="mt-2 text-xs text-gray-400">当前写入速率</div>
                </Card>
              </Col>
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="mb-2 flex items-center gap-2">
                    <IconifyIcon
                      icon="ant-design:file-protect-outlined"
                      class="rounded bg-purple-50 p-1.5 text-purple-500"
                    />
                    <span class="text-sm text-gray-500">总量读</span>
                  </div>
                  <div class="text-2xl font-bold">
                    {{ formatBytes(data.server.disk.totalRead) }}
                  </div>
                  <div class="mt-2 text-xs text-gray-400">累计读取数据</div>
                </Card>
              </Col>
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="mb-2 flex items-center gap-2">
                    <IconifyIcon
                      icon="ant-design:save-outlined"
                      class="rounded bg-orange-50 p-1.5 text-orange-500"
                    />
                    <span class="text-sm text-gray-500">总量写</span>
                  </div>
                  <div class="text-2xl font-bold">
                    {{ formatBytes(data.server.disk.totalWrite) }}
                  </div>
                  <div class="mt-2 text-xs text-gray-400">累计写入数据</div>
                </Card>
              </Col>
            </Row>

            <!-- 挂载点列表 -->
            <div class="mb-6 flex flex-col gap-4">
              <Card
                v-for="mount in data.server.disk.mounts"
                :key="mount.mount"
                :bordered="false"
                size="small"
              >
                <div class="mb-4 flex items-center gap-3">
                  <IconifyIcon
                    icon="ant-design:hdd-outlined"
                    class="text-lg text-blue-500"
                  />
                  <span class="font-bold text-gray-700">{{ mount.mount }}</span>
                  <Tag color="green" size="small">{{ mount.status }}</Tag>
                  <div class="flex-1"></div>
                  <span class="text-xs font-bold text-green-500"
                    >{{ mount.percent }}% 已使用</span
                  >
                </div>
                <div class="mb-4">
                  <div
                    class="mb-1 flex items-end justify-between font-mono text-[10px] text-gray-400"
                  >
                    <span>磁盘使用率</span>
                    <span
                      >{{ formatBytes(mount.used) }} /
                      {{ formatBytes(mount.total) }}</span
                    >
                  </div>
                  <Progress
                    :percent="mount.percent"
                    :show-info="false"
                    stroke-color="#1890ff"
                    :stroke-width="12"
                  />
                  <div
                    class="mt-1 flex justify-between font-mono text-[10px] text-gray-400"
                  >
                    <span>0%</span>
                    <span>{{ mount.percent }}%</span>
                  </div>
                </div>
                <div class="grid grid-cols-4 gap-4 rounded bg-gray-50/50 p-3">
                  <div class="flex flex-col">
                    <span class="text-xs text-gray-400">设备:</span>
                    <span class="truncate text-xs font-bold">{{
                      mount.device
                    }}</span>
                  </div>
                  <div class="flex flex-col">
                    <span class="text-xs text-gray-400">文件系统:</span>
                    <span class="text-xs font-bold">{{ mount.fstype }}</span>
                  </div>
                  <div class="flex flex-col">
                    <span class="text-xs text-gray-400">总容量:</span>
                    <span class="text-xs font-bold">{{
                      formatBytes(mount.total)
                    }}</span>
                  </div>
                  <div class="flex flex-col">
                    <span class="text-xs text-gray-400">剩余空间:</span>
                    <span class="text-xs font-bold text-green-500">{{
                      formatBytes(mount.free)
                    }}</span>
                  </div>
                </div>
              </Card>
            </div>

            <Card
              title="磁盘 IO 统计"
              :bordered="false"
              class="mb-6"
              size="small"
            >
              <template #extra
                ><IconifyIcon
                  icon="ant-design:bar-chart-outlined"
                  class="text-blue-500"
              /></template>
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-3 rounded border p-4">
                  <div class="mb-2 flex items-center gap-2">
                    <IconifyIcon
                      icon="ant-design:cloud-download-outlined"
                      class="text-blue-500"
                    />
                    <span class="font-bold">读取统计</span>
                  </div>
                  <div class="flex justify-between border-b pb-2 text-xs">
                    <span class="text-gray-500">当前速度:</span
                    ><b>{{ formatBytes(data.server.disk.read) }}/s</b>
                  </div>
                  <div class="flex justify-between border-b pb-2 text-xs">
                    <span class="text-gray-500">总读取量:</span
                    ><b>{{ formatBytes(data.server.disk.totalRead) }}</b>
                  </div>
                  <div class="flex justify-between text-xs">
                    <span class="text-gray-500">读取时长:</span
                    ><b>{{ data.server.disk.ioStats?.read_time || '0' }} ms</b>
                  </div>
                </div>
                <div class="flex flex-col gap-3 rounded border p-4">
                  <div class="mb-2 flex items-center gap-2">
                    <IconifyIcon
                      icon="ant-design:cloud-upload-outlined"
                      class="text-green-500"
                    />
                    <span class="font-bold">写入统计</span>
                  </div>
                  <div class="flex justify-between border-b pb-2 text-xs">
                    <span class="text-gray-500">当前速度:</span
                    ><b>{{ formatBytes(data.server.disk.write) }}/s</b>
                  </div>
                  <div class="flex justify-between border-b pb-2 text-xs">
                    <span class="text-gray-500">总写入量:</span
                    ><b>{{ formatBytes(data.server.disk.totalWrite) }}</b>
                  </div>
                  <div class="flex justify-between text-xs">
                    <span class="text-gray-500">写入时长:</span
                    ><b>{{ data.server.disk.ioStats?.write_time || '0' }} ms</b>
                  </div>
                </div>
              </div>
            </Card>

            <Card title="实时磁盘 IO" :bordered="false" size="small">
              <div class="grid grid-cols-2 gap-4">
                <div class="rounded border p-4">
                  <div class="mb-1 text-xs text-gray-400">读取速度</div>
                  <div class="text-xl font-bold text-blue-500">
                    {{ formatBytes(data.server.disk.read) }}/s
                  </div>
                  <div class="mt-1 text-[10px] uppercase text-gray-400">
                    Current Read Speed
                  </div>
                </div>
                <div class="rounded border p-4">
                  <div class="mb-1 text-xs text-gray-400">写入速度</div>
                  <div class="text-xl font-bold text-green-500">
                    {{ formatBytes(data.server.disk.write) }}/s
                  </div>
                  <div class="mt-1 text-[10px] uppercase text-gray-400">
                    Current Write Speed
                  </div>
                </div>
              </div>
            </Card>
          </template>

          <!-- 网络信息页 -->
          <template v-else-if="selectedKey[0] === 'net_info'">
            <div class="mb-6 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <IconifyIcon
                  icon="ant-design:global-outlined"
                  class="text-xl text-orange-500"
                />
                <h1 class="m-0 text-xl font-bold text-gray-800">网络信息</h1>
              </div>
              <Tag color="green" class="rounded-full">自动刷新中</Tag>
            </div>

            <Row :gutter="16" class="mb-6">
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="mb-2 flex items-center gap-2">
                    <IconifyIcon
                      icon="ant-design:arrow-up-outlined"
                      class="rounded bg-blue-50 p-1.5 text-blue-500"
                    />
                    <span class="text-sm text-gray-500">上传速度</span>
                  </div>
                  <div class="text-2xl font-bold">
                    {{ formatBytes(data.server.network.upload) }}/s
                  </div>
                  <div class="mt-2 text-xs text-gray-400">当前上传速率</div>
                </Card>
              </Col>
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="mb-2 flex items-center gap-2">
                    <IconifyIcon
                      icon="ant-design:arrow-down-outlined"
                      class="rounded bg-green-50 p-1.5 text-green-500"
                    />
                    <span class="text-sm text-gray-500">下载速度</span>
                  </div>
                  <div class="text-2xl font-bold">
                    {{ formatBytes(data.server.network.download) }}/s
                  </div>
                  <div class="mt-2 text-xs text-gray-400">当前下载速率</div>
                </Card>
              </Col>
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="mb-2 flex items-center gap-2">
                    <IconifyIcon
                      icon="ant-design:cloud-upload-outlined"
                      class="rounded bg-purple-50 p-1.5 text-purple-500"
                    />
                    <span class="text-sm text-gray-500">总发送</span>
                  </div>
                  <div class="text-2xl font-bold">
                    {{ formatBytes(data.server.network.sent) }}
                  </div>
                  <div class="mt-2 text-xs text-gray-400">累计发送数据</div>
                </Card>
              </Col>
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="mb-2 flex items-center gap-2">
                    <IconifyIcon
                      icon="ant-design:cloud-download-outlined"
                      class="rounded bg-orange-50 p-1.5 text-orange-500"
                    />
                    <span class="text-sm text-gray-500">总接收</span>
                  </div>
                  <div class="text-2xl font-bold">
                    {{ formatBytes(data.server.network.received) }}
                  </div>
                  <div class="mt-2 text-xs text-gray-400">累计接收数据</div>
                </Card>
              </Col>
            </Row>

            <!-- 网卡列表 -->
            <div class="mb-6 flex flex-col gap-4">
              <Card
                v-for="iface in data.server.network.interfaces"
                :key="iface.name"
                :bordered="false"
                size="small"
              >
                <div class="mb-4 flex items-center gap-3">
                  <IconifyIcon
                    icon="ant-design:global-outlined"
                    class="text-lg text-blue-500"
                  />
                  <span class="font-bold text-gray-700">{{ iface.name }}</span>
                  <Tag color="green" size="small">{{ iface.status }}</Tag>
                  <div class="flex-1"></div>
                  <span class="text-xs text-gray-400"
                    >{{ iface.speed }} Mbps</span
                  >
                </div>
                <div class="w-full">
                  <Descriptions
                    :column="3"
                    size="small"
                    bordered
                    :label-style="{ width: '90px', fontSize: '10px' }"
                    :content-style="{
                      fontSize: '10px',
                      fontFamily: 'monospace',
                    }"
                  >
                    <Descriptions.Item label="接口名称">{{
                      iface.name
                    }}</Descriptions.Item>
                    <Descriptions.Item label="状态"
                      ><Tag color="green" size="small"
                        >在线</Tag
                      ></Descriptions.Item
                    >
                    <Descriptions.Item label="速度"
                      >{{ iface.speed }} Mbps</Descriptions.Item
                    >
                    <Descriptions.Item label="MTU">{{
                      iface.mtu
                    }}</Descriptions.Item>
                    <Descriptions.Item label="发送字节">{{
                      formatBytes(iface.tx_bytes || 0)
                    }}</Descriptions.Item>
                    <Descriptions.Item label="接收字节">{{
                      formatBytes(iface.rx_bytes || 0)
                    }}</Descriptions.Item>
                    <Descriptions.Item label="发送包数">{{
                      formatCount(iface.tx_packets || 0)
                    }}</Descriptions.Item>
                    <Descriptions.Item label="接收包数">{{
                      formatCount(iface.rx_packets || 0)
                    }}</Descriptions.Item>
                    <Descriptions.Item label="发送错误">{{
                      iface.tx_errors || 0
                    }}</Descriptions.Item>
                    <Descriptions.Item label="接收错误">{{
                      iface.rx_errors || 0
                    }}</Descriptions.Item>
                    <Descriptions.Item label="发送丢包">{{
                      iface.tx_drop || 0
                    }}</Descriptions.Item>
                    <Descriptions.Item label="接收丢包">{{
                      iface.rx_drop || 0
                    }}</Descriptions.Item>
                  </Descriptions>
                </div>
              </Card>
            </div>

            <Card
              title="网络总计统计"
              :bordered="false"
              class="mb-6"
              size="small"
            >
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-3 rounded border p-4">
                  <div class="mb-2 flex items-center gap-2">
                    <IconifyIcon
                      icon="ant-design:arrow-up-outlined"
                      class="text-blue-500"
                    />
                    <span class="font-bold">发送统计</span>
                  </div>
                  <div class="flex justify-between border-b pb-2 text-xs">
                    <span class="text-gray-500">当前速度:</span
                    ><b>{{ formatBytes(data.server.network.upload) }}/s</b>
                  </div>
                  <div class="flex justify-between border-b pb-2 text-xs">
                    <span class="text-gray-500">总发送量:</span
                    ><b>{{ formatBytes(data.server.network.sent) }}</b>
                  </div>
                  <div class="flex justify-between border-b pb-2 text-xs">
                    <span class="text-gray-500">发送包数:</span
                    ><b class="font-mono">{{
                      formatCount(
                        data.server.network.interfaces.reduce(
                          (a, b) => a + (b.tx_packets || 0),
                          0,
                        ),
                      )
                    }}</b>
                  </div>
                </div>
                <div class="flex flex-col gap-3 rounded border p-4">
                  <div class="mb-2 flex items-center gap-2">
                    <IconifyIcon
                      icon="ant-design:arrow-down-outlined"
                      class="text-green-500"
                    />
                    <span class="font-bold">接收统计</span>
                  </div>
                  <div class="flex justify-between border-b pb-2 text-xs">
                    <span class="text-gray-500">当前速度:</span
                    ><b>{{ formatBytes(data.server.network.download) }}/s</b>
                  </div>
                  <div class="flex justify-between border-b pb-2 text-xs">
                    <span class="text-gray-500">总接收量:</span
                    ><b>{{ formatBytes(data.server.network.received) }}</b>
                  </div>
                  <div class="flex justify-between border-b pb-2 text-xs">
                    <span class="text-gray-500">接收包数:</span
                    ><b class="font-mono">{{
                      formatCount(
                        data.server.network.interfaces.reduce(
                          (a, b) => a + (b.rx_packets || 0),
                          0,
                        ),
                      )
                    }}</b>
                  </div>
                </div>
              </div>
            </Card>

            <Card title="实时网络 IO" :bordered="false" size="small">
              <div class="grid grid-cols-2 gap-4">
                <div class="rounded border p-4">
                  <div class="mb-1 text-xs text-gray-400">上传速度</div>
                  <div class="text-xl font-bold text-blue-500">
                    {{ formatBytes(data.server.network.upload) }}/s
                  </div>
                </div>
                <div class="rounded border p-4">
                  <div class="mb-1 text-xs text-gray-400">下载速度</div>
                  <div class="text-xl font-bold text-green-500">
                    {{ formatBytes(data.server.network.download) }}/s
                  </div>
                </div>
              </div>
            </Card>
          </template>

          <!-- 进程信息页 -->
          <template v-else-if="selectedKey[0] === 'proc_info'">
            <div class="mb-6 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <IconifyIcon
                  icon="ant-design:bars-outlined"
                  class="text-xl text-blue-500"
                />
                <h1 class="m-0 text-xl font-bold text-gray-800">进程信息</h1>
              </div>
              <Tag color="green" class="rounded-full">自动刷新中</Tag>
            </div>

            <Row :gutter="16" class="mb-6">
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="mb-2 flex items-center gap-2">
                    <IconifyIcon
                      icon="ant-design:profile-outlined"
                      class="rounded bg-blue-50 p-1.5 text-blue-500"
                    />
                    <span class="text-sm text-gray-500">总进程数</span>
                  </div>
                  <div class="mt-2 text-3xl font-bold">
                    {{ data.server.processes.total }}
                  </div>
                  <div class="mt-2 text-xs text-gray-400">系统进程总数</div>
                </Card>
              </Col>
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="mb-2 flex items-center gap-2">
                    <IconifyIcon
                      icon="ant-design:play-circle-outlined"
                      class="rounded bg-green-50 p-1.5 text-green-500"
                    />
                    <span class="text-sm text-gray-500">运行中</span>
                  </div>
                  <div class="mt-2 text-3xl font-bold">
                    {{ data.server.processes.running }}
                  </div>
                  <div class="mt-2 text-xs text-gray-400">正在运行的进程</div>
                </Card>
              </Col>
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="mb-2 flex items-center gap-2">
                    <IconifyIcon
                      icon="ant-design:pause-circle-outlined"
                      class="rounded bg-purple-50 p-1.5 text-purple-500"
                    />
                    <span class="text-sm text-gray-500">休眠中</span>
                  </div>
                  <div class="mt-2 text-3xl font-bold">
                    {{ data.server.processes.sleeping }}
                  </div>
                  <div class="mt-2 text-xs text-gray-400">休眠状态的进程</div>
                </Card>
              </Col>
              <Col :span="6">
                <Card :bordered="false" class="kpi-card h-[130px]">
                  <div class="mb-2 flex items-center gap-2">
                    <IconifyIcon
                      icon="ant-design:stop-outlined"
                      class="rounded bg-orange-50 p-1.5 text-orange-500"
                    />
                    <span class="text-sm text-gray-500">其他状态</span>
                  </div>
                  <div class="mt-2 text-3xl font-bold">
                    {{ data.server.processes.zombie }}
                  </div>
                  <div class="mt-2 text-xs text-gray-400">停止/僵尸等状态</div>
                </Card>
              </Col>
            </Row>

            <Card
              title="Top 进程 (按CPU使用率排序)"
              :bordered="false"
              class="mb-6"
              size="small"
            >
              <template #extra
                ><IconifyIcon
                  icon="ant-design:ordered-list-outlined"
                  class="text-blue-500"
              /></template>
              <Table
                :data-source="data.server.processes.list"
                :columns="[
                  {
                    title: 'PID',
                    dataIndex: 'pid',
                    key: 'pid',
                    width: 80,
                    align: 'center',
                  },
                  {
                    title: '进程名',
                    dataIndex: 'name',
                    key: 'name',
                    ellipsis: true,
                  },
                  {
                    title: 'CPU %',
                    dataIndex: 'cpu',
                    key: 'cpu',
                    width: 100,
                    align: 'right',
                  },
                  {
                    title: '内存 %',
                    dataIndex: 'mem',
                    key: 'mem',
                    width: 100,
                    align: 'right',
                  },
                  {
                    title: '状态',
                    dataIndex: 'status',
                    key: 'status',
                    width: 100,
                    align: 'center',
                  },
                  {
                    title: '创建时间',
                    dataIndex: 'startTime',
                    key: 'startTime',
                    width: 180,
                  },
                ]"
                :pagination="false"
                size="small"
                bordered
              >
                <template #bodyCell="{ column, text }">
                  <template v-if="column.key === 'cpu'">
                    <Tag
                      color="green"
                      plain
                      size="small"
                      class="m-0 font-mono text-[10px]"
                      >{{ text.toFixed(1) }}%</Tag
                    >
                  </template>
                  <template v-else-if="column.key === 'mem'">
                    <Tag
                      color="blue"
                      plain
                      size="small"
                      class="m-0 font-mono text-[10px]"
                      >{{ text.toFixed(1) }}%</Tag
                    >
                  </template>
                  <template v-else-if="column.key === 'status'">
                    <Tag
                      :color="text === 'running' ? 'green' : 'gray'"
                      size="small"
                      >{{ text }}</Tag
                    >
                  </template>
                </template>
              </Table>
            </Card>

            <Row :gutter="16">
              <Col :span="12">
                <Card
                  title="进程状态分布"
                  :bordered="false"
                  size="small"
                  class="h-full"
                >
                  <div class="flex flex-col gap-4 py-4">
                    <div
                      class="flex items-center justify-between border-b pb-2"
                    >
                      <div class="flex items-center gap-2">
                        <div class="h-3 w-3 rounded-full bg-green-500"></div>
                        <span class="text-xs text-gray-600">运行中</span>
                      </div>
                      <div class="flex items-center gap-4">
                        <b class="font-mono">{{
                          data.server.processes.running
                        }}</b>
                        <span class="text-[10px] text-gray-400"
                          >{{
                            (
                              (data.server.processes.running /
                                data.server.processes.total) *
                              100
                            ).toFixed(1)
                          }}%</span
                        >
                      </div>
                    </div>
                    <div
                      class="flex items-center justify-between border-b pb-2"
                    >
                      <div class="flex items-center gap-2">
                        <div class="h-3 w-3 rounded-full bg-blue-500"></div>
                        <span class="text-xs text-gray-600">休眠中</span>
                      </div>
                      <div class="flex items-center gap-4">
                        <b class="font-mono">{{
                          data.server.processes.sleeping
                        }}</b>
                        <span class="text-[10px] text-gray-400"
                          >{{
                            (
                              (data.server.processes.sleeping /
                                data.server.processes.total) *
                              100
                            ).toFixed(1)
                          }}%</span
                        >
                      </div>
                    </div>
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <div class="h-3 w-3 rounded-full bg-gray-400"></div>
                        <span class="text-xs text-gray-600">其他状态</span>
                      </div>
                      <div class="flex items-center gap-4">
                        <b class="font-mono">{{
                          data.server.processes.zombie
                        }}</b>
                        <span class="text-[10px] text-gray-400"
                          >{{
                            (
                              (data.server.processes.zombie /
                                data.server.processes.total) *
                              100
                            ).toFixed(1)
                          }}%</span
                        >
                      </div>
                    </div>
                    <Divider plain class="m-0 text-xs">总计</Divider>
                    <div class="text-center text-xl font-bold">
                      {{ data.server.processes.total }}
                    </div>
                  </div>
                </Card>
              </Col>
              <Col :span="12">
                <Card title="资源使用排行" :bordered="false" size="small">
                  <div class="flex flex-col gap-3">
                    <div
                      v-for="(proc, index) in data.server.processes.list.slice(
                        0,
                        5,
                      )"
                      :key="proc.pid"
                      class="rounded border p-3 transition-colors hover:bg-gray-50"
                    >
                      <div class="mb-1 flex items-center justify-between">
                        <div class="flex items-center gap-2">
                          <div
                            class="flex h-6 w-6 items-center justify-center rounded bg-gray-100 text-[10px] font-bold text-gray-500"
                          >
                            {{ index + 1 }}
                          </div>
                          <span
                            class="max-w-[120px] truncate font-mono text-xs font-bold"
                            :title="proc.name"
                            >{{ proc.name }}</span
                          >
                        </div>
                        <span class="font-mono text-[10px] text-gray-400"
                          >PID: {{ proc.pid }}</span
                        >
                      </div>
                      <div class="flex gap-4">
                        <div class="flex-1">
                          <div class="mb-1 flex justify-between text-[10px]">
                            <span>CPU:</span><b>{{ proc.cpu.toFixed(1) }}%</b>
                          </div>
                          <Progress
                            :percent="proc.cpu"
                            :show-info="false"
                            stroke-color="#52c41a"
                            size="small"
                          />
                        </div>
                        <div class="flex-1">
                          <div class="mb-1 flex justify-between text-[10px]">
                            <span>内存:</span><b>{{ proc.mem.toFixed(1) }}%</b>
                          </div>
                          <Progress
                            :percent="proc.mem"
                            :show-info="false"
                            stroke-color="#1890ff"
                            size="small"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </Col>
            </Row>
          </template>
        </div>
      </Content>
    </Layout>
  </div>
</template>

<style scoped>
.monitor-container {
  height: 100%;
}

.monitor-layout {
  border: 1px solid #f0f0f0;
}

.kpi-card {
  box-shadow: 0 1px 2px rgb(0 0 0 / 3%);
  transition: transform 0.2s;
}

.kpi-card:hover {
  box-shadow: 0 4px 12px rgb(0 0 0 / 5%);
  transform: translateY(-2px);
}

:deep(.ant-descriptions-item-label) {
  min-width: 120px;
  background-color: #fafafa !important;
}

:deep(.ant-menu-item-selected) {
  background-color: #e6f7ff !important;
}
</style>
