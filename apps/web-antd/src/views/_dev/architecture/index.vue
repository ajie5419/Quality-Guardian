<script lang="ts" setup>
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Card, Descriptions, Tag, Timeline } from 'ant-design-vue';

const layers = [
  {
    description: 'Vue 3, Vite, Ant Design Vue, and backend-driven menus.',
    icon: 'carbon:application-web',
    title: 'Web Console',
    tone: 'blue',
  },
  {
    description: 'Nitro and H3 file routes keep API entries thin.',
    icon: 'carbon:api-1',
    title: 'Backend API',
    tone: 'green',
  },
  {
    description: 'Business capabilities live in self-contained modules.',
    icon: 'carbon:flow-modeler',
    title: 'Domain Modules',
    tone: 'purple',
  },
  {
    description: 'Prisma owns MySQL schema, migrations, and typed access.',
    icon: 'carbon:data-base',
    title: 'Data Layer',
    tone: 'orange',
  },
];

const guardrails = [
  'Routes stay thin and call module services.',
  'Business logic lives in modules, not shared infrastructure.',
  'Schema changes go through Prisma migrations.',
  'Menu component paths map to real files under src/views.',
];

const checks = [
  {
    color: 'green',
    label: 'Architecture gate',
    text: 'pnpm run check:qms-arch',
  },
  {
    color: 'blue',
    label: 'Type safety',
    text: 'pnpm run check:type',
  },
  {
    color: 'purple',
    label: 'Lint',
    text: 'pnpm lint',
  },
];
</script>

<template>
  <Page>
    <div class="architecture-page">
      <section class="architecture-page__header">
        <div>
          <div class="architecture-page__eyebrow">Quality Guardian</div>
          <h1>Architecture Overview</h1>
          <p>
            Current operating map for the QMS web console, backend modules,
            route resolution, and validation gates.
          </p>
        </div>
        <Tag color="processing">QMS Baseline</Tag>
      </section>

      <section class="architecture-page__layers">
        <Card
          v-for="layer in layers"
          :key="layer.title"
          class="architecture-layer"
          :bordered="false"
        >
          <div class="architecture-layer__icon" :class="`tone-${layer.tone}`">
            <IconifyIcon :icon="layer.icon" />
          </div>
          <h2>{{ layer.title }}</h2>
          <p>{{ layer.description }}</p>
        </Card>
      </section>

      <section class="architecture-page__content">
        <Card title="Module Boundary Rules" :bordered="false">
          <div class="architecture-rule-list">
            <div
              v-for="rule in guardrails"
              :key="rule"
              class="architecture-rule"
            >
              <IconifyIcon icon="carbon:checkmark-filled" />
              <span>{{ rule }}</span>
            </div>
          </div>
        </Card>

        <Card title="Delivery Checks" :bordered="false">
          <Timeline>
            <Timeline.Item
              v-for="check in checks"
              :key="check.label"
              :color="check.color"
            >
              <strong>{{ check.label }}</strong>
              <div class="architecture-check-command">{{ check.text }}</div>
            </Timeline.Item>
          </Timeline>
        </Card>
      </section>

      <Card title="Route Resolution" :bordered="false">
        <Descriptions :column="{ lg: 2, md: 1, sm: 1, xs: 1 }" bordered>
          <Descriptions.Item label="Menu path">
            /system/architecture
          </Descriptions.Item>
          <Descriptions.Item label="Component path">
            _dev/architecture/index
          </Descriptions.Item>
          <Descriptions.Item label="Resolved file">
            apps/web-antd/src/views/_dev/architecture/index.vue
          </Descriptions.Item>
          <Descriptions.Item label="Route source">
            Backend dynamic menu
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  </Page>
</template>

<style scoped>
.architecture-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
}

.architecture-page__header {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 24px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.architecture-page__eyebrow {
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #0f766e;
  text-transform: uppercase;
  letter-spacing: 0;
}

.architecture-page__header h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  color: #111827;
}

.architecture-page__header p {
  max-width: 760px;
  margin: 8px 0 0;
  color: #4b5563;
}

.architecture-page__layers {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.architecture-layer {
  min-height: 180px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.architecture-layer__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin-bottom: 18px;
  font-size: 22px;
  border-radius: 8px;
}

.architecture-layer h2 {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}

.architecture-layer p {
  margin: 0;
  color: #4b5563;
}

.tone-blue {
  color: #1d4ed8;
  background: #dbeafe;
}

.tone-green {
  color: #047857;
  background: #d1fae5;
}

.tone-purple {
  color: #7e22ce;
  background: #f3e8ff;
}

.tone-orange {
  color: #c2410c;
  background: #ffedd5;
}

.architecture-page__content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 0.55fr);
  gap: 16px;
}

.architecture-rule-list {
  display: grid;
  gap: 12px;
}

.architecture-rule {
  display: flex;
  gap: 10px;
  align-items: center;
  min-height: 40px;
  padding: 10px 12px;
  color: #1f2937;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.architecture-rule svg {
  flex: 0 0 auto;
  color: #059669;
}

.architecture-check-command {
  margin-top: 4px;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  color: #4b5563;
}

@media (max-width: 1180px) {
  .architecture-page__layers {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .architecture-page__content {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .architecture-page {
    padding: 12px;
  }

  .architecture-page__header {
    flex-direction: column;
    padding: 18px;
  }

  .architecture-page__layers {
    grid-template-columns: 1fr;
  }
}
</style>
