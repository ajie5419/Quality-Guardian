<script setup lang="ts">
import type { WorkbenchProjectItem } from '../typing';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  VbenIcon,
} from '@vben-core/shadcn-ui';

interface Props {
  items?: WorkbenchProjectItem[];
  title: string;
}

defineOptions({
  name: 'WorkbenchProject',
});

withDefaults(defineProps<Props>(), {
  items: () => [],
});

defineEmits(['click']);
</script>

<template>
  <Card>
    <CardHeader class="py-4">
      <div class="flex items-center justify-between gap-3">
        <CardTitle class="text-lg">{{ title }}</CardTitle>
        <slot name="extra"></slot>
      </div>
    </CardHeader>
    <CardContent class="flex flex-wrap p-0">
      <template v-for="(item, index) in items" :key="item.title">
        <div
          :class="{
            'border-r-0': index % 3 === 2,
            'border-b-0': index < 3,
            'pb-4': index > 2,
            'rounded-bl-xl': index === items.length - 3,
            'rounded-br-xl': index === items.length - 1,
          }"
          class="border-border group w-full cursor-pointer border-r border-t p-4 transition-all hover:shadow-xl md:w-1/2 lg:w-1/3"
          @click="$emit('click', item)"
        >
          <div class="flex items-center">
            <VbenIcon
              :color="item.color"
              :icon="item.icon"
              class="size-8 transition-all duration-300 group-hover:scale-110"
            />
            <span class="ml-4 text-lg font-medium">{{ item.title }}</span>
          </div>
          <div class="text-foreground/80 mt-4 flex h-10">
            {{ item.content }}
          </div>
          <div
            v-if="
              typeof item.plannedRequirements === 'number' &&
              typeof item.confirmedRequirements === 'number' &&
              typeof item.overdueUnconfirmedRequirements === 'number'
            "
            class="mt-3 grid grid-cols-3 gap-2 rounded-md border border-gray-200 p-2"
          >
            <div class="text-center">
              <div class="text-[20px] font-bold leading-6 text-blue-600">
                {{ item.plannedRequirements }}
              </div>
              <div class="text-[12px] text-blue-600">任务</div>
            </div>
            <div class="text-center">
              <div class="text-[20px] font-bold leading-6 text-green-600">
                {{ item.confirmedRequirements }}
              </div>
              <div class="text-[12px] text-green-600">已完成</div>
            </div>
            <div class="text-center">
              <div class="text-[20px] font-bold leading-6 text-red-600">
                {{ item.overdueUnconfirmedRequirements }}
              </div>
              <div class="text-[12px] text-red-600">超10天</div>
            </div>
          </div>
          <div class="text-foreground/80 flex justify-end">
            <span>{{ item.date }}</span>
          </div>
        </div>
      </template>
    </CardContent>
  </Card>
</template>
