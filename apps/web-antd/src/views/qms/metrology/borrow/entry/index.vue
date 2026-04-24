<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useI18n } from '@vben/locales';

import MetrologyBorrowEntryPanel from '../components/MetrologyBorrowEntryPanel.vue';

defineOptions({ name: 'MetrologyBorrowEntryPage' });

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const initialKeyword = computed(() => String(route.query.keyword || '').trim());
const publicToken = computed(() => String(route.query.token || '').trim());

function handleSuccess() {
  const nextQuery = { ...route.query };
  delete nextQuery.keyword;
  void router.replace({ path: route.path, query: nextQuery });
}
</script>

<template>
  <div class="min-h-screen bg-gray-100 px-2 py-3 sm:px-6 sm:py-8">
    <div class="mx-auto flex w-full max-w-4xl flex-col gap-3 sm:gap-4">
      <header class="rounded-xl bg-white px-4 py-3 shadow-sm sm:px-5 sm:py-4">
        <h1 class="text-lg font-semibold text-gray-900 sm:text-xl">
          {{ t('qms.metrology.borrow.entryTitle') }}
        </h1>
      </header>

      <main
        class="rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4"
      >
        <MetrologyBorrowEntryPanel
          :initial-keyword="initialKeyword"
          :public-mode="true"
          :public-token="publicToken"
          @success="handleSuccess"
        />
      </main>
    </div>
  </div>
</template>
