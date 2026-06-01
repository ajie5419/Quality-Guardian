<script lang="ts" setup>
import type { DataNode } from 'ant-design-vue/es/tree';

import type { QmsKnowledgeApi } from '#/api/qms/knowledge';

import {
  Button,
  Card,
  Divider,
  Empty,
  Input,
  Pagination,
  Space,
  Spin,
  Tag,
  Tooltip,
  Tree,
} from 'ant-design-vue';

defineProps<{
  articleDetail: null | QmsKnowledgeApi.KnowledgeItem;
  canCreate: boolean;
  canDelete: boolean;
  canEdit: boolean;
  categoryTreeData: DataNode[];
  currentPage: number;
  detailLoading: boolean;
  isSideBarCollapsed: boolean;
  knowledgeList: QmsKnowledgeApi.KnowledgeItem[];
  loading: boolean;
  pageSize: number;
  searchText: string;
  selectedArticleId: null | string;
  selectedCategoryId: string[];
  selectedCategoryName: string;
  totalCount: number;
}>();

const emit = defineEmits<{
  articleClick: [id: string];
  categorySelect: [keys: unknown];
  collapseSidebar: [collapsed: boolean];
  createArticle: [];
  createCategory: [];
  deleteArticle: [id: string];
  deleteCategoryNode: [nodeKey: string];
  editArticle: [article: QmsKnowledgeApi.KnowledgeItem];
  editCategoryNode: [nodeKey: string];
  pageChange: [page: number, size: number];
  preview: [file: QmsKnowledgeApi.Attachment];
  search: [];
  'update:currentPage': [page: number];
  'update:pageSize': [size: number];
  'update:searchText': [value: string];
}>();
</script>

<template>
  <div
    class="relative flex h-full min-w-0 flex-col gap-3 overflow-hidden lg:flex-row lg:gap-4"
  >
    <div
      class="relative flex min-w-0 flex-col rounded-lg border border-gray-200 bg-white shadow-sm transition-all duration-300 ease-in-out lg:flex-shrink-0"
      :class="
        isSideBarCollapsed
          ? 'hidden overflow-hidden border-none opacity-0 lg:w-0'
          : 'min-h-[220px] opacity-100 lg:w-64'
      "
    >
      <template v-if="!isSideBarCollapsed">
        <div
          class="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/50 p-4"
        >
          <span class="truncate font-bold text-gray-700">知识分类</span>
          <Space :size="8">
            <Tooltip v-if="canCreate" title="新增分类">
              <Button
                type="primary"
                size="small"
                class="flex h-8 w-8 items-center justify-center p-0 shadow-sm"
                @click="emit('createCategory')"
              >
                <span
                  class="text-xl font-bold text-white"
                  style="display: block; margin-top: -2px; line-height: 1"
                  >+</span
                >
              </Button>
            </Tooltip>
            <Button
              type="text"
              size="small"
              class="flex h-7 items-center gap-1 px-2 text-gray-500 hover:text-gray-700"
              @click="emit('collapseSidebar', true)"
            >
              <span class="i-lucide-panel-left-close text-lg"></span>
              <span class="text-xs">收起</span>
            </Button>
          </Space>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-2">
          <Tree
            :tree-data="categoryTreeData"
            :selected-keys="selectedCategoryId"
            block-node
            default-expand-all
            @select="(keys) => emit('categorySelect', keys)"
          >
            <template #title="node">
              <div
                class="group/node flex min-w-0 items-center justify-between py-1 pr-1"
              >
                <span
                  class="min-w-0 flex-1 truncate text-gray-700"
                  :title="String(node.title || '')"
                  >{{ node.title }}</span
                >

                <div
                  v-if="canEdit || canCreate || canDelete"
                  class="flex flex-shrink-0 items-center gap-1 opacity-20 transition-opacity group-hover/node:opacity-100"
                >
                  <Tooltip v-if="canCreate" title="增加子类">
                    <span
                      class="cursor-pointer rounded px-1 text-sm font-bold text-blue-500 hover:bg-blue-100"
                      @click.stop="emit('createCategory')"
                      >+</span
                    >
                  </Tooltip>
                  <Tooltip v-if="canEdit" title="重命名">
                    <span
                      class="cursor-pointer rounded border border-orange-200 px-1 text-[10px] text-orange-500 hover:bg-orange-100"
                      @click.stop="
                        emit('editCategoryNode', String(node.key || ''))
                      "
                    >
                      编辑
                    </span>
                  </Tooltip>
                  <Tooltip v-if="canDelete" title="删除分类">
                    <span
                      class="cursor-pointer rounded border border-red-200 px-1 text-[10px] text-red-500 hover:bg-red-100"
                      @click.stop="
                        emit('deleteCategoryNode', String(node.key || ''))
                      "
                    >
                      删除
                    </span>
                  </Tooltip>
                </div>
              </div>
            </template>
          </Tree>
        </div>
      </template>
    </div>

    <div
      class="flex min-w-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-all duration-300 ease-in-out lg:flex-shrink-0"
      :class="
        isSideBarCollapsed && articleDetail
          ? 'min-h-[300px] lg:w-1/4'
          : 'min-h-[360px] lg:w-1/3'
      "
    >
      <div class="space-y-3 border-b border-gray-100 p-3">
        <div class="flex min-w-0 items-center justify-between gap-2">
          <div class="flex min-w-0 items-center gap-2">
            <Button
              v-if="isSideBarCollapsed"
              type="primary"
              size="small"
              class="flex h-8 flex-shrink-0 items-center gap-1 px-3 shadow-sm"
              @click="emit('collapseSidebar', false)"
            >
              <span class="i-lucide-panel-left-open text-base"></span>
              <span class="font-bold">返回目录</span>
            </Button>
            <span class="min-w-0 truncate font-bold text-gray-700">{{
              selectedCategoryName
            }}</span>
          </div>
          <Button
            v-if="canCreate"
            type="primary"
            size="small"
            class="flex-shrink-0"
            @click="emit('createArticle')"
          >
            + 发布
          </Button>
        </div>
        <Input.Search
          :value="searchText"
          placeholder="搜索标题、内容..."
          enter-button
          @update:value="(value) => emit('update:searchText', value)"
          @search="emit('search')"
        />
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto bg-gray-50/30">
        <Spin :spinning="loading">
          <div v-if="knowledgeList.length > 0" class="divide-y divide-gray-100">
            <div
              v-for="item in knowledgeList"
              :key="item.id"
              class="cursor-pointer p-4 transition-all hover:bg-blue-50/50"
              :class="{
                'border-r-4 border-blue-500 bg-blue-50':
                  selectedArticleId === item.id,
              }"
              @click="emit('articleClick', item.id)"
            >
              <div class="mb-1 line-clamp-1 font-bold text-gray-800">
                {{ item.title }}
              </div>
              <div class="mb-2 line-clamp-2 text-xs text-gray-500">
                {{ item.summary }}
              </div>
              <div class="flex min-w-0 items-center justify-between gap-2">
                <div class="flex min-w-0 flex-wrap gap-1">
                  <Tag
                    v-for="(tag, tagIdx) in item.tags"
                    :key="`${item.id}-tag-${tagIdx}`"
                    size="small"
                  >
                    {{ tag }}
                  </Tag>
                </div>
                <span class="flex-shrink-0 text-[10px] text-gray-400">{{
                  item.publishDate
                }}</span>
              </div>
            </div>
          </div>
          <Empty v-else :image="Empty.PRESENTED_IMAGE_SIMPLE" class="mt-10" />
        </Spin>
      </div>

      <div class="overflow-x-auto border-t border-gray-100 bg-white p-3">
        <Pagination
          :current="currentPage"
          :page-size="pageSize"
          :total="totalCount"
          :show-total="(total: number) => `共 ${total} 条`"
          size="small"
          show-size-changer
          @update:current="(page) => emit('update:currentPage', page)"
          @update:page-size="(size) => emit('update:pageSize', size)"
          @change="(page, size) => emit('pageChange', page, size)"
        />
      </div>
    </div>

    <div
      class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
    >
      <div v-if="detailLoading" class="flex flex-1 items-center justify-center">
        <Spin size="large" />
      </div>

      <template v-else-if="articleDetail">
        <div class="border-b border-gray-100 p-4 sm:p-6">
          <div
            class="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <h1
              class="min-w-0 break-words text-xl font-bold text-gray-800 sm:text-2xl"
            >
              {{ articleDetail.title }}
            </h1>
            <Space class="flex-shrink-0">
              <Button
                v-if="canEdit"
                @click="emit('editArticle', articleDetail)"
              >
                编辑
              </Button>
              <Button
                v-if="canDelete"
                danger
                @click="emit('deleteArticle', articleDetail.id)"
              >
                删除
              </Button>
            </Space>
          </div>

          <div
            class="flex flex-wrap items-center gap-2 text-sm text-gray-500 sm:gap-4"
          >
            <span
              >作者: <b>{{ articleDetail.author }}</b></span
            >
            <Divider type="vertical" />
            <span
              >分类:
              <Tag color="blue">{{ articleDetail.categoryName }}</Tag></span
            >
            <Divider type="vertical" />
            <span>版本: {{ articleDetail.version }}</span>
            <Divider type="vertical" />
            <span>最后更新: {{ articleDetail.updatedAt }}</span>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-8">
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div
            class="prose mb-10 max-w-none"
            v-html="articleDetail.content"
          ></div>

          <div v-if="articleDetail.attachments?.length" class="mt-10">
            <div class="mb-4 flex items-center gap-2 font-bold text-gray-700">
              <span class="i-lucide-paperclip"></span> 相关附件 ({{
                articleDetail.attachments.length
              }})
            </div>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card
                v-for="(file, fileIdx) in articleDetail.attachments"
                :key="`attachment-${fileIdx}-${file.name}`"
                size="small"
                class="hover:bg-gray-50"
              >
                <div class="flex min-w-0 items-center justify-between gap-2">
                  <div class="flex min-w-0 items-center gap-2 overflow-hidden">
                    <span class="text-xl opacity-50">📄</span>
                    <div class="min-w-0 overflow-hidden">
                      <div class="truncate text-sm font-bold">
                        {{ file.name }}
                      </div>
                      <div class="text-[10px] text-gray-400">
                        {{ (file.size / 1024).toFixed(1) }} KB
                      </div>
                    </div>
                  </div>
                  <Button
                    type="link"
                    size="small"
                    class="flex-shrink-0"
                    @click="emit('preview', file)"
                  >
                    预览
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </template>

      <div
        v-else
        class="flex min-h-[260px] flex-1 flex-col items-center justify-center bg-gray-50/20 text-gray-300"
      >
        <div class="mb-4 text-6xl opacity-10">📖</div>
        <p class="text-lg">选择左侧文档查看详情</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.prose h1) {
  @apply mb-4 break-words text-2xl font-bold;
}

:deep(.prose h2) {
  @apply mb-3 mt-6 break-words text-xl font-bold;
}

:deep(.prose h3) {
  @apply mb-2 mt-4 break-words text-lg font-bold;
}

:deep(.prose p) {
  @apply mb-4 break-words leading-relaxed text-gray-600;
}

:deep(.prose img),
:deep(.prose table),
:deep(.prose pre) {
  max-width: 100%;
}
</style>
