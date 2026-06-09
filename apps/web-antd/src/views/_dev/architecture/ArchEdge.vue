<script setup lang="ts">
import type { EdgeProps } from '@vue-flow/core';

import type { Ref } from 'vue';

import { computed, inject } from 'vue';

import { BaseEdge, getBezierPath } from '@vue-flow/core';

const props = defineProps<EdgeProps>();

const selectedId = inject<Ref<null | string>>('arch:selectedId');
const animated = inject<Ref<boolean>>('arch:animated');

const highlightState = computed<'dim' | 'in' | 'none' | 'out'>(() => {
  if (!selectedId?.value) return 'none';
  if (props.source === selectedId.value) return 'out';
  if (props.target === selectedId.value) return 'in';
  return 'dim';
});

const path = computed(() => {
  const [d, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    curvature: 0.25,
  });
  return { d, labelX, labelY };
});

const cssClass = computed(() => {
  const cls: string[] = ['arch-edge'];
  if (props.data?.kind) cls.push(`kind-${props.data.kind}`);
  if (highlightState.value !== 'none') cls.push(`hl-${highlightState.value}`);
  if (animated?.value && highlightState.value !== 'dim') {
    cls.push(highlightState.value === 'none' ? 'flow-anim' : 'flow-anim-fast');
  }
  return cls.join(' ');
});
</script>

<template>
  <BaseEdge
    :id="id"
    :path="path.d"
    :marker-end="markerEnd"
    :marker-start="markerStart"
    :style="style"
    :class="cssClass"
  />
  <text
    v-if="label"
    :x="path.labelX"
    :y="path.labelY"
    class="arch-edge-label"
    :class="`hl-${highlightState}`"
    text-anchor="middle"
    dominant-baseline="central"
  >
    {{ label }}
  </text>
</template>
