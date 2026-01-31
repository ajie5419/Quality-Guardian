<script lang="ts" setup>
import { useI18n } from '@vben/locales';

defineProps<{
  columns: Column[];
  dataSource: any[];
  emptyText?: string;
  title: string;
}>();

const { t } = useI18n();

interface Column {
  title: string;
  key: string;
  width?: string;
  align?: 'center' | 'left' | 'right';
  class?: ((record: any) => string) | string;
}
</script>

<template>
  <div>
    <div
      class="mb-0 inline-block bg-gray-800 px-4 py-2 text-xl font-bold text-white"
    >
      {{ title }}
    </div>
    <table class="w-full border-collapse border border-gray-300">
      <thead>
        <tr class="bg-gray-100 text-lg">
          <th
            v-for="col in columns"
            :key="col.key"
            :style="{ width: col.width }"
            class="whitespace-nowrap border p-2 text-center"
          >
            {{ col.title }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="dataSource.length === 0">
          <td
            :colspan="columns.length"
            class="border p-4 text-center text-gray-500"
          >
            {{ emptyText || t('qms.common.noData') }}
          </td>
        </tr>
        <tr
          v-for="(record, index) in dataSource"
          :key="index"
          class="text-lg hover:bg-gray-50"
        >
          <td
            v-for="col in columns"
            :key="col.key"
            class="border p-2"
            :class="[
              col.align === 'center' ? 'text-center' : '',
              typeof col.class === 'function' ? col.class(record) : col.class,
            ]"
          >
            <slot :name="col.key" :record="record" :index="index">
              {{ record[col.key] }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
