<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core';

import type { Ref } from 'vue';

import type { ModuleNodeData } from './data';

import { computed, inject } from 'vue';

import { Handle, Position } from '@vue-flow/core';

const props = defineProps<NodeProps<ModuleNodeData>>();

const selectedId = inject<Ref<null | string>>('arch:selectedId');
const relatedIds = inject<Ref<Set<string>>>('arch:relatedIds');

const highlightState = computed<'dim' | 'focus' | 'none' | 'related'>(() => {
  if (!selectedId?.value) return 'none';
  if (props.id === selectedId.value) return 'focus';
  if (relatedIds?.value.has(props.id)) return 'related';
  return 'dim';
});

const wrapClass = computed(() => [
  `is-${props.data.category}`,
  `state-${highlightState.value}`,
]);
</script>

<template>
  <div class="module-node" :class="wrapClass">
    <Handle type="target" :position="Position.Top" class="qg-handle" />
    <div class="title-row">
      <span class="title">{{ data.title }}</span>
      <span v-if="data.badge" class="badge">{{ data.badge }}</span>
    </div>
    <div class="subtitle">{{ data.subtitle }}</div>
    <Handle type="source" :position="Position.Bottom" class="qg-handle" />
  </div>
</template>

<style scoped>
.module-node {
  position: relative;
  width: 220px;
  min-height: 68px;
  padding: 10px 14px;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #e5e7eb;
  background: linear-gradient(180deg, #1f2937 0%, #111827 100%);
  border: 1px solid #374151;
  border-radius: 10px;
  box-shadow:
    0 6px 14px rgb(0 0 0 / 35%),
    inset 0 1px 0 rgb(255 255 255 / 4%);
  transition:
    transform 0.15s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease,
    opacity 0.18s ease,
    filter 0.18s ease;
}

.module-node:hover {
  border-color: #6b7280;
  box-shadow:
    0 10px 20px rgb(0 0 0 / 40%),
    inset 0 1px 0 rgb(255 255 255 / 6%);
  transform: translateY(-1px);
}

.title-row {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-size: 13px;
  font-weight: 600;
  color: #f9fafb;
  letter-spacing: 0.2px;
}

.badge {
  padding: 1px 6px;
  font-size: 10px;
  color: #d1d5db;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: rgb(255 255 255 / 8%);
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 4px;
}

.subtitle {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.4;
  color: #9ca3af;
}

.module-node::before {
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: 0;
  width: 3px;
  content: '';
  background: var(--accent, #6b7280);
  border-radius: 0 2px 2px 0;
}

.is-client {
  --accent: #38bdf8;
}

.is-gateway {
  --accent: #f472b6;

  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  border-color: #be185d;
}

.is-middleware {
  --accent: #a78bfa;
}

.is-inspection-domain {
  --accent: #34d399;
}

.is-quality-tracking {
  --accent: #fbbf24;
}

.is-operations {
  --accent: #fb7185;
}

.is-visualization {
  --accent: #c084fc;
}

.is-system-base {
  --accent: #60a5fa;
}

.is-infrastructure {
  --accent: #f97316;

  background: linear-gradient(180deg, #1c1917 0%, #0c0a09 100%);
  border-color: #7c2d12;
}

.qg-handle {
  width: 7px;
  height: 7px;
  background: #4b5563;
  border: 1px solid #1f2937;
}

.state-focus {
  z-index: 6;
  border-color: #38bdf8 !important;
  box-shadow:
    0 0 0 2px rgb(56 189 248 / 55%),
    0 12px 26px rgb(0 0 0 / 55%) !important;
}

.state-related {
  z-index: 5;
  border-color: #94a3b8 !important;
  box-shadow:
    0 0 0 1px rgb(148 163 184 / 55%),
    0 8px 18px rgb(0 0 0 / 50%) !important;
}

.state-dim {
  opacity: 0.22;
  filter: saturate(0.4);
}
</style>
