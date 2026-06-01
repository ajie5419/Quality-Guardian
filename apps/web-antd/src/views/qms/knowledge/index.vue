<script lang="ts" setup>
import type { DataNode } from 'ant-design-vue/es/tree';

import type { QmsKnowledgeApi } from '#/api/qms/knowledge';

import { computed, nextTick, onMounted, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import { Button, Image, message, Modal } from 'ant-design-vue';

import {
  deleteCategory,
  deleteKnowledge,
  getCategoryTree,
  getKnowledgeDetail,
  getKnowledgeListPage,
} from '#/api/qms/knowledge';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import QmsPageShell from '#/views/qms/shared/components/QmsPageShell.vue';

import CategoryManageModal from './components/CategoryManageModal.vue';
import KnowledgeEditModal from './components/KnowledgeEditModal.vue';
import KnowledgeWorkspace from './components/KnowledgeWorkspace.vue';

const { t } = useI18n();
const { hasAccessByCodes } = useAccess();
const { handleApiError } = useErrorHandler();

const canCreate = computed(() => hasAccessByCodes(['QMS:Knowledge:Create']));
const canEdit = computed(() => hasAccessByCodes(['QMS:Knowledge:Edit']));
const canDelete = computed(() => hasAccessByCodes(['QMS:Knowledge:Delete']));

const categoryTree = ref<QmsKnowledgeApi.Category[]>([]);
const knowledgeList = ref<QmsKnowledgeApi.KnowledgeItem[]>([]);
const selectedCategoryId = ref<string[]>([]);
const selectedArticleId = ref<null | string>(null);
const articleDetail = ref<null | QmsKnowledgeApi.KnowledgeItem>(null);
const loading = ref(false);
const detailLoading = ref(false);
const searchText = ref('');
const isSideBarCollapsed = ref(false);

const currentPage = ref(1);
const pageSize = ref(10);
const totalCount = ref(0);

const knowledgeEditModalRef = ref();
const categoryManageModalRef = ref();

const categoryTreeData = computed<DataNode[]>(() => {
  const mapTree = (nodes: QmsKnowledgeApi.Category[]): DataNode[] =>
    nodes.map((node) => ({
      key: node.id,
      title: node.name,
      children: node.children ? mapTree(node.children) : undefined,
    }));
  return mapTree(categoryTree.value);
});

function findCategoryById(
  list: QmsKnowledgeApi.Category[],
  id: string,
): null | QmsKnowledgeApi.Category {
  for (const item of list) {
    if (item.id === id) return item;
    if (item.children) {
      const found = findCategoryById(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

const selectedCategoryName = computed(() => {
  if (selectedCategoryId.value.length === 0)
    return t('qms.knowledge.allKnowledge');
  const findName = (list: QmsKnowledgeApi.Category[], id: string): string => {
    for (const item of list) {
      if (item.id === id) return item.name;
      if (item.children) {
        const name = findName(item.children, id);
        if (name) return name;
      }
    }
    return '';
  };
  const id = selectedCategoryId.value[0];
  return id
    ? findName(categoryTree.value, id)
    : t('qms.knowledge.allKnowledge');
});

async function loadCategories() {
  try {
    const data = await getCategoryTree();
    categoryTree.value = data;
  } catch (error) {
    handleApiError(error, 'Load Knowledge Categories');
    message.error('加载分类失败');
  }
}

async function loadKnowledgeList() {
  loading.value = true;
  try {
    const params: QmsKnowledgeApi.QueryParams = {
      categoryId: selectedCategoryId.value[0],
      keyword: searchText.value,
      page: currentPage.value,
      pageSize: pageSize.value,
    };
    const { items, total } = await getKnowledgeListPage(params);
    knowledgeList.value = items;
    totalCount.value = total;
  } catch (error) {
    handleApiError(error, 'Load Knowledge List');
    message.error('加载知识列表失败');
  } finally {
    loading.value = false;
  }
}

function handlePageChange(page: number, size: number) {
  currentPage.value = page;
  pageSize.value = size;
  loadKnowledgeList();
}

async function loadArticleDetail(id: string) {
  detailLoading.value = true;
  try {
    const data = await getKnowledgeDetail(id);
    articleDetail.value = data;
  } catch (error) {
    handleApiError(error, 'Load Knowledge Detail');
    message.error('加载详情失败');
  } finally {
    detailLoading.value = false;
  }
}

function handleCategorySelect(keys: unknown) {
  selectedCategoryId.value = keys as string[];
  selectedArticleId.value = null;
  articleDetail.value = null;
  currentPage.value = 1;
  loadKnowledgeList();
}

function handleArticleClick(id: string) {
  selectedArticleId.value = id;
  loadArticleDetail(id);
  isSideBarCollapsed.value = true;
}

function handleSearch() {
  selectedArticleId.value = null;
  articleDetail.value = null;
  currentPage.value = 1;
  loadKnowledgeList();
}

function openCategoryModal(
  parentId?: string,
  category?: QmsKnowledgeApi.Category,
) {
  categoryManageModalRef.value?.open(parentId, category);
}

function handleDeleteCategory(category: QmsKnowledgeApi.Category) {
  Modal.confirm({
    title: '确认删除分类',
    content: `确定要删除分类 "${category.name}" 吗？这可能导致该分类下的知识条目无法通过目录找到。`,
    onOk: async () => {
      try {
        await deleteCategory(category.id);
        message.success('分类删除成功');
        if (selectedCategoryId.value[0] === category.id) {
          selectedCategoryId.value = [];
        }
        loadCategories();
      } catch (error) {
        handleApiError(error, 'Delete Knowledge Category');
        message.error('删除失败');
      }
    },
  });
}

function handleEditCategoryNode(nodeKey: string) {
  const category = findCategoryById(categoryTree.value, nodeKey);
  if (!category) return;
  openCategoryModal(undefined, category);
}

function handleDeleteCategoryNode(nodeKey: string) {
  const category = findCategoryById(categoryTree.value, nodeKey);
  if (!category) return;
  handleDeleteCategory(category);
}

function openModal(item?: Partial<QmsKnowledgeApi.KnowledgeItem>) {
  knowledgeEditModalRef.value?.open(item, selectedCategoryId.value[0]);
}

function handleDelete(id: string) {
  Modal.confirm({
    title: '确认删除',
    content: '确定要删除此知识条目吗？',
    onOk: async () => {
      try {
        await deleteKnowledge(id);
        message.success('删除成功');
        selectedArticleId.value = null;
        articleDetail.value = null;
        loadKnowledgeList();
      } catch (error) {
        handleApiError(error, 'Delete Knowledge');
        message.error('删除失败');
      }
    },
  });
}

const previewVisible = ref(false);
const previewTitle = ref('');
const previewUrl = ref('');
const previewType = ref('');
const previewMode = ref<'download' | 'embed' | 'empty' | 'image'>('empty');

function resolvePreviewUrl(url: string) {
  const trimmedUrl = String(url || '').trim();
  if (!trimmedUrl || trimmedUrl === '#') return '';
  if (/^https?:\/\//i.test(trimmedUrl)) return trimmedUrl;
  if (trimmedUrl.startsWith('/')) {
    return `${window.location.origin}${trimmedUrl}`;
  }
  return new URL(trimmedUrl, window.location.href).href;
}

function handlePreview(file: QmsKnowledgeApi.Attachment) {
  previewTitle.value = file.name;
  previewType.value = file.type.toLowerCase();
  previewMode.value = 'empty';

  const resolvedUrl = resolvePreviewUrl(file.url);

  if (!resolvedUrl) {
    message.warning('附件地址无效，无法预览。');
    previewUrl.value = '';
    previewVisible.value = true;
    return;
  }

  if (['gif', 'jpeg', 'jpg', 'png', 'webp'].includes(previewType.value)) {
    previewMode.value = 'image';
    previewUrl.value = resolvedUrl;
  } else if (previewType.value === 'pdf') {
    previewMode.value = 'embed';
    previewUrl.value = resolvedUrl;
  } else if (
    ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(previewType.value)
  ) {
    if (/^https?:\/\//i.test(file.url)) {
      previewMode.value = 'embed';
      previewUrl.value = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(resolvedUrl)}`;
    } else {
      previewMode.value = 'download';
      previewUrl.value = resolvedUrl;
    }
  } else {
    previewMode.value = 'download';
    previewUrl.value = resolvedUrl;
  }

  previewVisible.value = true;
}

function findCategoryByIdOrName(
  list: QmsKnowledgeApi.Category[],
  target: string,
): null | string {
  for (const item of list) {
    if (item.id === target) return item.id;
    if (item.children) {
      const found = findCategoryByIdOrName(item.children, target);
      if (found) return found;
    }
  }
  const findByName = (
    items: QmsKnowledgeApi.Category[],
    nameKey: string,
  ): null | string => {
    for (const item of items) {
      if (item.name.includes(nameKey)) return item.id;
      if (item.children) {
        const found = findByName(item.children, nameKey);
        if (found) return found;
      }
    }
    return null;
  };
  return (
    findByName(list, '案例') ||
    findByName(list, '沉淀') ||
    (list.length > 0 ? list[0]?.id || null : null)
  );
}

onMounted(async () => {
  await loadCategories();
  loadKnowledgeList();

  const prefill = window.history.state?.prefill;
  if (prefill) {
    nextTick(() => {
      const finalCategoryId = findCategoryByIdOrName(
        categoryTree.value,
        prefill.categoryId,
      );

      openModal({
        ...prefill,
        categoryId: finalCategoryId || '',
      });

      if (!finalCategoryId) {
        message.warning('未找到匹配的知识分类，请手动选择');
      }

      window.history.replaceState(
        { ...window.history.state, prefill: null },
        '',
      );
    });
  }
});
</script>

<template>
  <Page content-class="h-full p-0">
    <QmsPageShell content-class="h-full">
      <KnowledgeWorkspace
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        v-model:search-text="searchText"
        :article-detail="articleDetail"
        :can-create="canCreate"
        :can-delete="canDelete"
        :can-edit="canEdit"
        :category-tree-data="categoryTreeData"
        :detail-loading="detailLoading"
        :is-side-bar-collapsed="isSideBarCollapsed"
        :knowledge-list="knowledgeList"
        :loading="loading"
        :selected-article-id="selectedArticleId"
        :selected-category-id="selectedCategoryId"
        :selected-category-name="selectedCategoryName"
        :total-count="totalCount"
        @article-click="handleArticleClick"
        @category-select="handleCategorySelect"
        @collapse-sidebar="(collapsed) => (isSideBarCollapsed = collapsed)"
        @create-article="() => openModal()"
        @create-category="() => openCategoryModal()"
        @delete-article="handleDelete"
        @delete-category-node="handleDeleteCategoryNode"
        @edit-article="(article) => openModal(article)"
        @edit-category-node="handleEditCategoryNode"
        @page-change="handlePageChange"
        @preview="handlePreview"
        @search="handleSearch"
      />
    </QmsPageShell>

    <Modal
      v-model:open="previewVisible"
      :title="previewTitle"
      width="90%"
      style="top: 20px"
      :footer="null"
      destroy-on-close
    >
      <div class="flex h-[80vh] flex-col items-center justify-center">
        <div v-if="!previewUrl" class="text-center">
          <div class="mb-4 text-6xl opacity-20">📂</div>
          <p class="text-lg text-gray-500">演示数据不支持远程预览服务</p>
          <p class="text-gray-400">
            请上传真实文件到公网地址或部署私有化预览服务
          </p>
        </div>

        <Image
          v-else-if="previewMode === 'image'"
          :src="previewUrl"
          style="max-height: 75vh; object-fit: contain"
        />

        <iframe
          v-else-if="previewMode === 'embed'"
          :src="previewUrl"
          width="100%"
          height="100%"
          frameborder="0"
        ></iframe>

        <div
          v-else
          class="flex h-full flex-col items-center justify-center gap-4"
        >
          <div class="text-6xl opacity-20">🚫</div>
          <p class="text-gray-500">
            该文件类型暂不支持本地在线预览，请下载后查看
          </p>
          <Button type="primary" :href="previewUrl" target="_blank">
            下载文件
          </Button>
        </div>
      </div>
    </Modal>

    <KnowledgeEditModal
      ref="knowledgeEditModalRef"
      :category-tree="categoryTree"
      @success="
        (id: string) => {
          loadKnowledgeList();
          if (id && selectedArticleId === id) {
            loadArticleDetail(id);
          }
        }
      "
    />

    <CategoryManageModal
      ref="categoryManageModalRef"
      @success="loadCategories"
    />
  </Page>
</template>
