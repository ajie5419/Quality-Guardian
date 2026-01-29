<script lang="ts" setup>
import { computed, watch } from 'vue';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getColumns } from '../config';
import { useI18n } from '@vben/locales';
import { getInspectionRecords, deleteInspectionRecord } from '#/api/qms/inspection';
import { Button, message, Modal } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';

const props = defineProps<{
  type: string;
  year: number;
}>();

const emit = defineEmits(['create', 'edit']);
const { t } = useI18n();

const gridOptions = computed(() => ({
  columns: getColumns(props.type, t),
  proxyConfig: {
    ajax: {
      query: async ({ page }) => {
        return await getInspectionRecords({
          type: props.type,
          year: props.year,
          page: page.currentPage,
          pageSize: page.pageSize,
        });
      }
    }
  },
  toolbarConfig: {
    refresh: true,
    search: true,
    slots: {
      buttons: 'toolbar-actions',
    },
  },
  pagerConfig: { enabled: true }
}));

const [Grid, gridApi] = useVbenVxeGrid({ gridOptions });

function reload() {
  gridApi.reload();
}

watch(
  () => props.type,
  (newType) => {
    gridApi.setGridOptions({
      columns: getColumns(newType, t),
    });
    reload();
  },
);

watch(() => props.year, () => reload());

defineExpose({ reload });
</script>

<template>
  <Grid>
    <template #toolbar-actions>
      <Button type="primary" @click="emit('create')">
        <template #icon>
          <IconifyIcon icon="lucide:plus" />
        </template>
        {{ t('common.add') }}
      </Button>
    </template>

    <template #action="{ row }">
      <a @click="emit('edit', row)">编辑</a>
      <a class="ml-2 text-red-500" @click="() => {
        Modal.confirm({
          title: '确认删除?',
          onOk: async () => {
            await deleteInspectionRecord(row.id);
            message.success('已删除');
            reload();
          }
        })
      }">删除</a>
    </template>
    
    <template #result="{ row }">
      <span :class="row.result === 'PASS' ? 'text-green-500' : 'text-red-500'">
        {{ t('qms.inspection.resultValue.' + row.result) }}
      </span>
    </template>
  </Grid>
</template>
