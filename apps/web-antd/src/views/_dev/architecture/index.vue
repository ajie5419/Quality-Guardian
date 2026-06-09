<script setup lang="ts">
import type { NodeMouseEvent } from '@vue-flow/core';

import { computed, provide, ref } from 'vue';

import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { useVueFlow, VueFlow } from '@vue-flow/core';

import ArchEdge from './ArchEdge.vue';
import { edges, nodes } from './data';
import GroupHeader from './GroupHeader.vue';
import ModuleNode from './ModuleNode.vue';

import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';

const FLOW_ID = 'qg-architecture';

const showDeps = ref(true);
const showFlow = ref(true);
const animated = ref(true);
const selectedId = ref<null | string>(null);

const { fitView, setNodes } = useVueFlow(FLOW_ID);

const initialPositions = new Map(
  nodes.map((node) => [node.id, { ...node.position }]),
);

const visibleEdges = computed(() =>
  edges.filter((edge) => {
    const kind = (edge.data as undefined | { kind?: string })?.kind;
    if (kind === 'dep') return showDeps.value;
    if (kind === 'flow' || kind === 'infra') return showFlow.value;
    return true;
  }),
);

const relatedIds = computed(() => {
  const ids = new Set<string>();
  if (!selectedId.value) return ids;
  ids.add(selectedId.value);
  for (const edge of visibleEdges.value) {
    if (edge.source === selectedId.value) ids.add(String(edge.target));
    if (edge.target === selectedId.value) ids.add(String(edge.source));
  }
  return ids;
});

provide('arch:selectedId', selectedId);
provide('arch:relatedIds', relatedIds);
provide('arch:animated', animated);

function onNodeClick({ node }: NodeMouseEvent) {
  if (node.type === 'group-header') return;
  selectedId.value = selectedId.value === node.id ? null : node.id;
}

function clearSelection() {
  selectedId.value = null;
}

function resetAll() {
  selectedId.value = null;
  showFlow.value = true;
  showDeps.value = true;
  animated.value = true;
  setNodes((current) =>
    current.map((node) => {
      const origin = initialPositions.get(node.id);
      return origin ? { ...node, position: { ...origin } } : node;
    }),
  );
  fitView({ padding: 0.1, duration: 300 });
}

const stats = {
  modules: 24,
  edges: edges.length,
  domains: 5,
};
</script>

<template>
  <div class="arch-page">
    <header class="topbar">
      <div class="brand">
        <div class="brand-title">Quality Guardian · 架构总览</div>
        <div class="brand-sub">
          24 个后端模块 · {{ stats.edges }} 条连线 · 5 个业务域 ·
          点击节点高亮关联
        </div>
      </div>
      <div class="legend">
        <label class="toggle">
          <input v-model="showFlow" type="checkbox" />
          <span class="dot dot-flow"></span>请求流
        </label>
        <label class="toggle">
          <input v-model="showDeps" type="checkbox" />
          <span class="dot dot-dep"></span>模块依赖
        </label>
        <label class="toggle">
          <input v-model="animated" type="checkbox" />
          <span class="dot dot-anim"></span>动态流动
        </label>
        <button
          v-if="selectedId"
          class="reset-btn"
          type="button"
          @click="clearSelection"
        >
          清除选中
        </button>
        <button class="reset-btn reset-all" type="button" @click="resetAll">
          一键复位
        </button>
      </div>
    </header>

    <div class="canvas">
      <VueFlow
        :id="FLOW_ID"
        :nodes="nodes"
        :edges="visibleEdges"
        :default-edge-options="{ type: 'arch' }"
        :min-zoom="0.2"
        :max-zoom="2"
        :fit-view-on-init="true"
        :nodes-draggable="true"
        :nodes-connectable="false"
        :elements-selectable="true"
        @node-click="onNodeClick"
        @pane-click="clearSelection"
      >
        <template #node-module="props">
          <ModuleNode v-bind="props" />
        </template>
        <template #node-group-header="props">
          <GroupHeader v-bind="props" />
        </template>
        <template #edge-arch="props">
          <ArchEdge v-bind="props" />
        </template>
        <Background pattern-color="#1f2937" :gap="22" />
        <Controls position="bottom-right" />
      </VueFlow>
    </div>
  </div>
</template>

<style>
@keyframes dot-flow {
  from {
    background-position: 0% 0;
  }

  to {
    background-position: -200% 0;
  }
}

@keyframes dash-flow {
  to {
    stroke-dashoffset: -20;
  }
}

.arch-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: calc(100vh - 110px);
  min-height: 600px;
  overflow: hidden;
  color: #e5e7eb;
  background: #0b1020;
  border-radius: 8px;
}

.topbar {
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 22px;
  background: rgb(8 12 24 / 85%);
  border-bottom: 1px solid #1f2937;
  backdrop-filter: blur(8px);
}

.brand-title {
  font-size: 16px;
  font-weight: 700;
  color: #f9fafb;
  letter-spacing: 0.3px;
}

.brand-sub {
  margin-top: 2px;
  font-size: 12px;
  color: #6b7280;
}

.legend {
  display: flex;
  gap: 18px;
  align-items: center;
}

.toggle {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: #d1d5db;
  cursor: pointer;
  user-select: none;
}

.toggle input {
  accent-color: #38bdf8;
}

.dot {
  display: inline-block;
  width: 18px;
  height: 3px;
  border-radius: 2px;
}

.dot-flow {
  background: #38bdf8;
}

.dot-dep {
  background: #475569;
}

.dot-anim {
  background: linear-gradient(90deg, #38bdf8, #c084fc, #38bdf8);
  background-size: 200% 100%;
  animation: dot-flow 1.6s linear infinite;
}

.reset-btn {
  padding: 3px 10px;
  font-size: 12px;
  color: #e5e7eb;
  cursor: pointer;
  background: rgb(56 189 248 / 12%);
  border: 1px solid rgb(56 189 248 / 40%);
  border-radius: 4px;
  transition: background 0.15s ease;
}

.reset-btn:hover {
  background: rgb(56 189 248 / 22%);
}

.reset-btn.reset-all {
  color: #fde68a;
  background: rgb(251 191 36 / 12%);
  border-color: rgb(251 191 36 / 45%);
}

.reset-btn.reset-all:hover {
  background: rgb(251 191 36 / 22%);
}

.canvas {
  position: relative;
  flex: 1;
}

.arch-page .vue-flow__edge-path {
  stroke-width: 1.4px;
}

.arch-page .arch-edge.kind-flow {
  filter: drop-shadow(0 0 4px rgb(56 189 248 / 40%));
  fill: none;
  stroke: #38bdf8;
  stroke-width: 1.6px;
}

.arch-page .arch-edge.kind-infra {
  opacity: 0.85;
  fill: none;
  stroke: #f97316;
  stroke-width: 1.4px;
  stroke-dasharray: 4 3;
}

.arch-page .arch-edge.kind-dep {
  opacity: 0.6;
  fill: none;
  stroke: #475569;
  stroke-width: 1px;
}

.arch-page .arch-edge.hl-dim {
  opacity: 0.18 !important;
  filter: none !important;
  stroke: #1f2937 !important;
  stroke-width: 1px !important;
  stroke-dasharray: none !important;
}

.arch-page .arch-edge.hl-out {
  opacity: 1 !important;
  filter: drop-shadow(0 0 6px rgb(56 189 248 / 70%)) !important;
  stroke: #38bdf8 !important;
  stroke-width: 2.4px !important;
  stroke-dasharray: none !important;
}

.arch-page .arch-edge.hl-in {
  opacity: 1 !important;
  filter: drop-shadow(0 0 6px rgb(244 114 182 / 65%)) !important;
  stroke: #f472b6 !important;
  stroke-width: 2.4px !important;
  stroke-dasharray: none !important;
}

.arch-page .arch-edge-label {
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 10px;
  pointer-events: none;
  fill: #94a3b8;
}

.arch-page .arch-edge-label.hl-dim {
  opacity: 0.2;
}

.arch-page .arch-edge-label.hl-out,
.arch-page .arch-edge-label.hl-in {
  font-weight: 600;
  fill: #f9fafb;
}

.arch-page .vue-flow__edge-textbg {
  fill: #0b1020;
}

/* Animated dash flow */
.arch-page .arch-edge.flow-anim {
  stroke-dasharray: 6 4;
  animation: dash-flow 1.4s linear infinite;
}

.arch-page .arch-edge.flow-anim-fast {
  stroke-dasharray: 8 4 !important;
  animation: dash-flow 0.7s linear infinite !important;
}

/* Infra edges already have a dash pattern — keep it but flow it */
.arch-page .arch-edge.kind-infra.flow-anim {
  stroke-dasharray: 4 3;
}

.arch-page .vue-flow__controls {
  background: rgb(15 23 42 / 90%);
  border: 1px solid #1f2937;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgb(0 0 0 / 40%);
}

.arch-page .vue-flow__controls-button {
  color: #d1d5db;
  background: transparent;
  border-bottom: 1px solid #1f2937;
  fill: #d1d5db;
}

.arch-page .vue-flow__controls-button:hover {
  background: #1f2937;
}

.arch-page .vue-flow__node {
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.arch-page .vue-flow__minimap {
  background: #0f172a;
  border: 1px solid #1f2937;
}
</style>
