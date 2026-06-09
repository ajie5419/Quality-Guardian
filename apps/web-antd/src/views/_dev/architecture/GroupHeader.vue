<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core';

import type { ModuleNodeData } from './data';

defineProps<NodeProps<ModuleNodeData>>();
</script>

<template>
  <div class="group-header" :class="`is-${data.category}`">
    <div class="title">{{ data.title }}</div>
    <div class="subtitle">{{ data.subtitle }}</div>
  </div>
</template>

<style scoped>
.group-header {
  width: 220px;
  padding: 6px 0;
  text-align: center;
  pointer-events: none;
  user-select: none;
}

.title {
  font-size: 13px;
  font-weight: 700;
  color: #cbd5e1;
  letter-spacing: 0.6px;
}

.subtitle {
  margin-top: 1px;
  font-size: 9px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 1.4px;
}

.is-inspection-domain .title {
  color: #34d399;
}

.is-quality-tracking .title {
  color: #fbbf24;
}

.is-operations .title {
  color: #fb7185;
}

.is-visualization .title {
  color: #c084fc;
}

.is-system-base .title {
  color: #60a5fa;
}
</style>
