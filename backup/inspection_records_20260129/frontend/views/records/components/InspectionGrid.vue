<script lang="ts" setup>
import { computed, watch } from 'vue';

import { useVbenVxeGrid, type VxeGridProps } from '#/adapter/vxe-table';
import {
  batchDeleteInspectionRecords,
  deleteInspectionRecord,
  getInspectionRecords,
} from '#/api/qms/inspection';
import { requestClient } from '#/api/request';
import { useAccess } from '@vben/access';
import { useI18n } from '@vben/locales';

import { message, Modal, Tag } from 'ant-design-vue';

import {
  getIncomingColumns,
  getProcessColumns,
  getShipmentColumns,
} from '../columns';

interface Props {
  type: string;
  currentYear: number | string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'create'): void;
  (e: 'edit', row: any): void;
}>();

const { hasAccessByCodes } = useAccess();
const { t } = useI18n();

async function handleDelete(row: any) {
  Modal.confirm({
    title: t('common.confirmDelete'),
    content: t('common.confirmDeleteContent'),
    okText: t('common.confirm'),
    cancelText: t('common.cancel'),
    onOk: async () => {
      await deleteInspectionRecord(row.id);
      message.success(t('common.deleteSuccess'));
      gridApi.reload();
    },
  });
}

async function handleBatchDelete() {
  const records = gridApi.grid?.getCheckboxRecords();
  if (!records || records.length === 0) {
    message.warning(t('common.pleaseSelectData'));
    return;
  }

  Modal.confirm({
    title: t('common.confirmBatchDelete'),
    content: t('common.confirmBatchDeleteContent', { count: records.length }),
    okText: t('common.confirm'),
    cancelText: t('common.cancel'),
    onOk: async () => {
      const ids = records.map((item: any) => item.id);
      await batchDeleteInspectionRecords(ids);
      message.success(t('common.deleteSuccess'));
      gridApi.reload();
    },
  });
}

async function handleImport({ file }: { file: File }) {
  try {
    const formData = new FormData();
    // Vben Import modal usually passes { file } object
    // Depending on backend, we might need to verify the field name
    // Previous index.vue logic:
    // const arrayBuffer = await file.arrayBuffer();
    // ... manual parsing ...
    
    // BUT InspectionGrid was using requestClient.post('/qms/inspection/records/import', formData)
    // The previous index.vue was doing CLIENT-SIDE parsing with XLSX and then sending JSON.
    // I should probably restore that logic or ensure the backend supports file upload.
    // Given the previous code was:
    /*
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
        // ... parsing ...
        const res = await requestClient.post('/qms/inspection/records/import', { items: mappedItems, type: 'incoming' });
    */
    // I should restore the client-side parsing logic to match the backend expectation if I haven't changed the backend.
    
    // Let's stick to the previous implementation logic for import to be safe.
    
    const XLSX = await import('xlsx');
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return;
    const worksheet = workbook.Sheets[sheetName]!;
    const results = XLSX.utils.sheet_to_json(worksheet) as any[];

    const columns = gridApi.grid?.getColumns() || [];
    const mappedItems = results.map((row: any) => {
      const item: any = {};
      columns.forEach((c: any) => {
        if (!c.field || !c.title) return;
        const excelKey = Object.keys(row).find(
          (k) =>
            String(k).replaceAll(/\s+/g, '') ===
            String(c.title).replaceAll(/\s+/g, ''),
        );
        if (excelKey) {
          let val = row[excelKey];
          if (val instanceof Date) {
            val = val.toISOString().split('T')[0];
          }
          item[c.field] = val;
        }
      });
      return item;
    });

    const importType = props.type === 'shipment' ? 'outgoing' : props.type;
    const res = await requestClient.post(
        '/qms/inspection/records/import', 
        { items: mappedItems, type: importType },
        { timeout: 120_000 }
    );

    if (res.successCount > 0) {
        message.success(t('common.importSuccessCount', { count: res.successCount }));
        gridApi.reload();
    }
  } catch (error) {
    console.error(error);
    message.error(t('common.importFailed'));
  }
}

const gridOptions = computed<VxeGridProps>(() => {
  const actions = {
    canEdit: hasAccessByCodes(['QMS:Inspection:Records:Edit']),
    canDelete: hasAccessByCodes(['QMS:Inspection:Records:Delete']),
    onEdit: (row: any) => emit('edit', row),
    onDelete: handleDelete,
  };

  let columns = [];
  switch (props.type) {
    case 'incoming':
      columns = getIncomingColumns(t, actions);
      break;
    case 'process':
      columns = getProcessColumns(t, actions);
      break;
    case 'shipment':
      columns = getShipmentColumns(t, actions);
      break;
    default:
      columns = [];
  }

  return {
    id: `inspection-grid-${props.type}`,
    keepSource: true,
    height: 'auto',
    columns,
    pagerConfig: {
      enabled: true,
      pageSize: 20,
      pageSizes: [10, 20, 50, 100],
    },
    proxyConfig: {
      props: {
        result: 'items',
        total: 'total',
      },
      ajax: {
        query: async ({ page }) => {
          const params = {
            type: props.type,
            year: Number(props.currentYear),
          };
          const data = await getInspectionRecords(params);
          const allItems = data || [];
          
          // Client-side pagination logic
          const { currentPage, pageSize } = page;
          const startIndex = (currentPage - 1) * pageSize;
          const endIndex = startIndex + pageSize;
          const pageItems = allItems.slice(startIndex, endIndex);

          return { items: pageItems, total: allItems.length };
        },
      },
    },
    importConfig: {
      remote: true,
      // types: ['xlsx'], // Vben might not need strict types here if custom method
      importMethod: handleImport,
    },
    toolbarConfig: {
      buttons: [
        {
          code: 'add',
          name: t('common.add'), // Or specific text like in index.vue
          // but generic 'add' is fine, or we can use computed to set specific text
          status: 'primary',
          visible: hasAccessByCodes(['QMS:Inspection:Records:Create']),
        },
        {
          code: 'delete_batch',
          name: t('common.batchDelete'),
          status: 'danger',
          visible: hasAccessByCodes(['QMS:Inspection:Records:Delete']),
        },
      ],
      import: hasAccessByCodes(['QMS:Inspection:Records:Import']),
      export: hasAccessByCodes(['QMS:Inspection:Records:Export']),
      custom: true,
      search: true, // Enable search form
    },
  };
});

function handleToolbarClick({ code }: { code: string }) {
  if (code === 'add') {
    emit('create');
  } else if (code === 'delete_batch') {
    handleBatchDelete();
  }
}

const [Grid, gridApi] = useVbenVxeGrid({ gridOptions });

function reload() {
  gridApi.reload();
}

watch(
  () => props.currentYear,
  () => {
    gridApi.reload();
  },
);

defineExpose({ reload });
</script>

<template>
  <Grid @toolbar-button-click="handleToolbarClick">
    <template #result="{ row }">
      <Tag
        :color="
          String(row.result || '').toUpperCase() === 'PASS'
            ? 'green'
            : String(row.result || '').toUpperCase() === 'FAIL'
              ? 'red'
              : 'orange'
        "
      >
        {{
          String(row.result || '').toUpperCase() === 'PASS'
            ? t('qms.inspection.records.result.pass')
            : String(row.result || '').toUpperCase() === 'FAIL'
              ? t('qms.inspection.records.result.fail')
              : t('qms.inspection.records.result.concession')
        }}
      </Tag>
    </template>
  </Grid>
</template>
