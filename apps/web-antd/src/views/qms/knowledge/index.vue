<script lang="ts" setup>
import type { QmsKnowledgeApi } from '#/api/qms/knowledge';
import type { UploadFileWithResponse } from '#/types';

import { computed, nextTick, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import {
  Button,
  Card,
  Divider,
  Empty,
  Image,
  Input,
  message,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Tree,
  Upload,
} from 'ant-design-vue';

import {
  createCategory,
  createKnowledge,
  deleteCategory,
  deleteKnowledge,
  getCategoryTree,
  getKnowledgeDetail,
  getKnowledgeList,
  updateCategory,
  updateKnowledge,
} from '#/api/qms/knowledge';

const { t } = useI18n();
const userStore = useUserStore();

// ================= 状态管理 =================
const categoryTree = ref<QmsKnowledgeApi.Category[]>([]);
const knowledgeList = ref<QmsKnowledgeApi.KnowledgeItem[]>([]);
const selectedCategoryId = ref<string[]>([]);
const selectedArticleId = ref<null | string>(null);
const articleDetail = ref<null | QmsKnowledgeApi.KnowledgeItem>(null);
const loading = ref(false);
const detailLoading = ref(false);
const searchText = ref('');
const isSideBarCollapsed = ref(false); // 目录折叠状态

// 分类管理弹窗
const categoryModalVisible = ref(false);
const categoryEditMode = ref(false);
// const _currentParentCategoryId = ref<string | null>(null);
const currentCategoryId = ref<null | string>(null);
const categoryForm = ref({
  name: '',
  description: '',
  parentId: undefined as string | undefined,
});

// 选中的分类名称（用于面包屑）
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

// ================= 数据加载 =================
async function loadCategories() {
  try {
    const data = await getCategoryTree();
    categoryTree.value = data;
  } catch {
    message.error('加载分类失败');
  }
}

async function loadKnowledgeList() {
  loading.value = true;
  try {
    const params: QmsKnowledgeApi.QueryParams = {
      categoryId: selectedCategoryId.value[0],
      keyword: searchText.value,
    };
    const data = await getKnowledgeList(params);
    knowledgeList.value = data;
  } catch {
    message.error('加载知识列表失败');
  } finally {
    loading.value = false;
  }
}

async function loadArticleDetail(id: string) {
  detailLoading.value = true;
  try {
    const data = await getKnowledgeDetail(id);
    articleDetail.value = data;
  } catch {
    message.error('加载详情失败');
  } finally {
    detailLoading.value = false;
  }
}

// ================= 事件处理 =================
function handleCategorySelect(keys: unknown) {
  selectedCategoryId.value = keys as string[];
  selectedArticleId.value = null;
  articleDetail.value = null;
  loadKnowledgeList();
}

function handleArticleClick(id: string) {
  selectedArticleId.value = id;
  loadArticleDetail(id);
  // 打开文章后自动折叠目录，为详情页留出更多空间
  isSideBarCollapsed.value = true;
}

function handleSearch() {
  selectedArticleId.value = null;
  articleDetail.value = null;
  loadKnowledgeList();
}

// ================= 分类管理事件 =================
function openCategoryModal(
  parentId?: string,
  category?: QmsKnowledgeApi.Category,
) {
  if (category) {
    categoryEditMode.value = true;
    currentCategoryId.value = category.id;
    categoryForm.value = {
      name: category.name,
      description: category.description || '',
      parentId: category.parentId,
    };
  } else {
    categoryEditMode.value = false;
    currentCategoryId.value = null;
    categoryForm.value = {
      name: '',
      description: '',
      parentId,
    };
  }
  categoryModalVisible.value = true;
}

async function handleSaveCategory() {
  if (!categoryForm.value.name) return message.warning('请输入分类名称');
  try {
    if (categoryEditMode.value && currentCategoryId.value) {
      await updateCategory(currentCategoryId.value, categoryForm.value);
      message.success('分类更新成功');
    } else {
      await createCategory(categoryForm.value);
      message.success('分类创建成功');
    }
    categoryModalVisible.value = false;
    loadCategories();
  } catch {
    message.error('操作失败');
  }
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
      } catch {
        message.error('删除失败');
      }
    },
  });
}

// ================= 弹窗管理 =================
const modalVisible = ref(false);
const editMode = ref(false);
const fileList = ref<UploadFileWithResponse[]>([]); // 附件上传列表

const formState = ref<Partial<QmsKnowledgeApi.KnowledgeItem>>({
  attachments: [],
  categoryId: '',
  content: '',
  status: 'published',
  summary: '',
  tags: [],
  title: '',
  version: 'V1.0',
});

function openModal(item?: any | QmsKnowledgeApi.KnowledgeItem) {
  if (item && item.id) {
    editMode.value = true;
    formState.value = { ...item };
    // 初始化已有的附件列表
    fileList.value = (item.attachments || []).map((att: any) => ({
      name: att.name,
      status: 'done',
      type: att.type,
      uid: att.name,
      url: att.url,
    }));
  } else {
    editMode.value = false;
    // 如果是预填模式（没有 id 但有 attachments）
    fileList.value =
      item && item.attachments
        ? item.attachments.map((att: any) => ({
            name: att.name,
            status: 'done',
            type: att.type,
            uid: att.name,
            url: att.url,
          }))
        : [];

    formState.value = {
      attachments: (item && item.attachments) || [],
      author: userStore.userInfo?.realName || 'Admin',
      categoryId:
        (item && item.categoryId) || selectedCategoryId.value[0] || '',
      content: (item && item.content) || '',
      status: (item && item.status) || 'published',
      summary: (item && item.summary) || '',
      tags: (item && item.tags) || [],
      title: (item && item.title) || '',
      version: (item && item.version) || 'V1.0',
    };
  }
  modalVisible.value = true;
}

// 处理上传状态变化
function handleUploadChange(info: any) {
  const { file, fileList: newFileList } = info;
  fileList.value = newFileList as UploadFileWithResponse[];

  if (file.status === 'done' || (file as UploadFileWithResponse).response) {
    // 模拟后端返回 URL
    const f = file as UploadFileWithResponse;
    const url = f.response?.data?.url || '#';
    f.url = url;
    message.success(`${f.name} 上传成功`);
  } else if (file.status === 'error') {
    message.error(`${file.name} 上传失败`);
  }
}

async function handleSave() {
  try {
    // 转换上传列表为业务附件模型
    const attachments: QmsKnowledgeApi.Attachment[] = fileList.value.map(
      (f) => ({
        name: f.name,
        url: f.url || f.response?.data?.url || '#',
        size: f.size || 0,
        type: f.name.split('.').pop() || 'file',
      }),
    );

    const payload = {
      ...formState.value,
      attachments,
    };

    if (editMode.value && formState.value.id) {
      await updateKnowledge(formState.value.id, payload);
      message.success('更新成功');
    } else {
      await createKnowledge(payload);
      message.success('创建成功');
    }
    modalVisible.value = false;
    loadKnowledgeList();
    if (selectedArticleId.value === formState.value.id) {
      loadArticleDetail(selectedArticleId.value!);
    }
  } catch {
    message.error('保存失败');
  }
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
      } catch {
        message.error('删除失败');
      }
    },
  });
}

// ================= 预览管理 =================
const previewVisible = ref(false);
const previewTitle = ref('');
const previewUrl = ref('');
const previewType = ref('');

function handlePreview(file: QmsKnowledgeApi.Attachment) {
  previewTitle.value = file.name;
  previewType.value = file.type.toLowerCase();

  // 处理 Mock 数据或无效 URL
  const isMockUrl = file.url === '#' || !file.url.startsWith('http');

  if (isMockUrl) {
    message.warning(
      '当前为演示数据，无法通过远程服务预览。请在上传真实文件后重试。',
    );
    previewUrl.value = '';
    previewVisible.value = true;
    return;
  }

  if (['gif', 'jpeg', 'jpg', 'png', 'webp'].includes(previewType.value)) {
    previewUrl.value = file.url;
  } else if (previewType.value === 'pdf') {
    previewUrl.value = file.url;
  } else if (
    ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(previewType.value)
  ) {
    // 仅公网地址支持此预览
    previewUrl.value = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(file.url)}`;
  } else {
    previewUrl.value = file.url;
  }

  previewVisible.value = true;
}

// ================= 辅助函数 =================
function findCategoryByIdOrName(
  list: QmsKnowledgeApi.Category[],
  target: string,
): null | string {
  // 第一优先级：精确匹配 ID
  for (const item of list) {
    if (item.id === target) return item.id;
    if (item.children) {
      const found = findCategoryByIdOrName(item.children, target);
      if (found) return found;
    }
  }
  // 第二优先级：模糊匹配名称（包含“案例”或“沉淀”）
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

  // 处理从其他页面（如工程问题、售后问题）跳转过来的沉淀请求
  const prefill = window.history.state?.prefill;
  if (prefill) {
    nextTick(() => {
      // 动态解析分类：如果传入的 ID 失效，则通过名称模糊匹配或取第一个
      const finalCategoryId = findCategoryByIdOrName(
        categoryTree.value,
        prefill.categoryId,
      );

      // 使用预填数据打开弹窗
      openModal({
        ...prefill,
        categoryId: finalCategoryId || '',
      });

      if (!finalCategoryId) {
        message.warning('未找到匹配的知识分类，请手动选择');
      }

      // 清除 state 防止刷新页面再次弹出
      window.history.replaceState(
        { ...window.history.state, prefill: null },
        '',
      );
    });
  }
});
</script>

<template>
  <Page content-class="p-4 h-full">
    <div class="relative flex h-full gap-4 overflow-hidden">
      <!-- 左侧分类 tree -->
      <div
        class="relative flex flex-shrink-0 flex-col rounded-lg border border-gray-200 bg-white shadow-sm transition-all duration-300 ease-in-out"
        :class="
          isSideBarCollapsed
            ? 'w-0 overflow-hidden border-none opacity-0'
            : 'w-64 opacity-100'
        "
      >
        <div
          class="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 p-4"
        >
          <span class="font-bold text-gray-700">知识分类</span>
          <Space :size="8">
            <Tooltip title="新增分类">
              <Button
                type="primary"
                size="small"
                @click="openCategoryModal()"
                class="flex h-8 w-8 items-center justify-center p-0 shadow-sm"
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
              @click="isSideBarCollapsed = true"
            >
              <span class="i-lucide-panel-left-close text-lg"></span>
              <span class="text-xs">收起</span>
            </Button>
          </Space>
        </div>
        <div class="flex-1 overflow-y-auto p-2">
          <Tree
            :tree-data="categoryTree as any"
            :field-names="{ title: 'name', key: 'id' }"
            @select="handleCategorySelect"
            :selected-keys="selectedCategoryId"
            block-node
            default-expand-all
          >
            <template #title="node">
              <div
                class="group/node flex items-center justify-between py-1 pr-1"
              >
                <span
                  class="flex-1 truncate text-gray-700"
                  :title="node.name"
                  >{{ node.name }}</span
                >

                <!-- 操作区：默认半透明，悬浮高亮 -->
                <div
                  class="flex items-center gap-1 opacity-20 transition-opacity group-hover/node:opacity-100"
                >
                  <Tooltip title="增加子类">
                    <span
                      class="cursor-pointer rounded px-1 text-sm font-bold text-blue-500 hover:bg-blue-100"
                      @click.stop="openCategoryModal(node.id)"
                      >+</span
                    >
                  </Tooltip>
                  <Tooltip title="重命名">
                    <span
                      class="cursor-pointer rounded border border-orange-200 px-1 text-[10px] text-orange-500 hover:bg-orange-100"
                      @click.stop="openCategoryModal(undefined, node)"
                    >
                      编辑
                    </span>
                  </Tooltip>
                  <Tooltip title="删除分类">
                    <span
                      class="cursor-pointer rounded border border-red-200 px-1 text-[10px] text-red-500 hover:bg-red-100"
                      @click.stop="handleDeleteCategory(node)"
                    >
                      删除
                    </span>
                  </Tooltip>
                </div>
              </div>
            </template>
          </Tree>
        </div>
      </div>

      <!-- 中间列表区 -->
      <div
        class="flex flex-shrink-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-all duration-300 ease-in-out"
        :class="isSideBarCollapsed && articleDetail ? 'w-1/4' : 'w-1/3'"
      >
        <div class="space-y-3 border-b border-gray-100 p-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Button
                v-if="isSideBarCollapsed"
                type="primary"
                size="small"
                class="flex h-8 items-center gap-1 px-3 shadow-sm"
                @click="isSideBarCollapsed = false"
              >
                <span class="i-lucide-panel-left-open text-base"></span>
                <span class="font-bold">返回目录</span>
              </Button>
              <span
                class="truncate font-bold text-gray-700"
                :class="isSideBarCollapsed ? 'max-w-[100px]' : 'max-w-[150px]'"
                >{{ selectedCategoryName }}</span
              >
            </div>
            <Button type="primary" size="small" @click="openModal()">
              + 发布
            </Button>
          </div>
          <Input.Search
            v-model:value="searchText"
            placeholder="搜索标题、内容..."
            enter-button
            @search="handleSearch"
          />
        </div>

        <div class="flex-1 overflow-y-auto bg-gray-50/30">
          <Spin :spinning="loading">
            <div
              v-if="knowledgeList.length > 0"
              class="divide-y divide-gray-100"
            >
              <div
                v-for="item in knowledgeList"
                :key="item.id"
                class="cursor-pointer p-4 transition-all hover:bg-blue-50/50"
                :class="{
                  'border-r-4 border-blue-500 bg-blue-50':
                    selectedArticleId === item.id,
                }"
                @click="handleArticleClick(item.id)"
              >
                <div class="mb-1 line-clamp-1 font-bold text-gray-800">
                  {{ item.title }}
                </div>
                <div class="mb-2 line-clamp-2 text-xs text-gray-500">
                  {{ item.summary }}
                </div>
                <div class="flex items-center justify-between">
                  <div class="flex gap-1">
                    <Tag v-for="tag in item.tags" :key="tag" size="small">
                      {{ tag }}
                    </Tag>
                  </div>
                  <span class="text-[10px] text-gray-400">{{
                    item.publishDate
                  }}</span>
                </div>
              </div>
            </div>
            <Empty v-else :image="Empty.PRESENTED_IMAGE_SIMPLE" class="mt-10" />
          </Spin>
        </div>
      </div>

      <!-- 右侧详情/内容区 -->
      <div
        class="flex flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
      >
        <div
          v-if="detailLoading"
          class="flex flex-1 items-center justify-center"
        >
          <Spin size="large" />
        </div>

        <template v-else-if="articleDetail">
          <!-- 详情头部 -->
          <div class="border-b border-gray-100 p-6">
            <div class="mb-4 flex items-start justify-between">
              <h1 class="text-2xl font-bold text-gray-800">
                {{ articleDetail.title }}
              </h1>
              <Space>
                <Button @click="openModal(articleDetail!)">编辑</Button>
                <Button danger @click="handleDelete(articleDetail!.id)">
                  删除
                </Button>
              </Space>
            </div>

            <div
              class="flex flex-wrap items-center gap-4 text-sm text-gray-500"
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

          <!-- 详情内容 -->
          <div class="flex-1 overflow-y-auto p-8">
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div
              class="prose mb-10 max-w-none"
              v-html="articleDetail.content"
            ></div>

            <!-- 附件区 -->
            <div v-if="articleDetail.attachments?.length" class="mt-10">
              <div class="mb-4 flex items-center gap-2 font-bold text-gray-700">
                <span class="i-lucide-paperclip"></span> 相关附件 ({{
                  articleDetail.attachments.length
                }})
              </div>
              <div class="grid grid-cols-2 gap-4">
                <Card
                  v-for="file in articleDetail.attachments"
                  :key="file.name"
                  size="small"
                  class="hover:bg-gray-50"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2 overflow-hidden">
                      <span class="text-xl opacity-50">📄</span>
                      <div class="overflow-hidden">
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
                      @click="handlePreview(file)"
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
          class="flex flex-1 flex-col items-center justify-center bg-gray-50/20 text-gray-300"
        >
          <div class="mb-4 text-6xl opacity-10">📖</div>
          <p class="text-lg">选择左侧文档查看详情</p>
        </div>
      </div>
    </div>

    <!-- 预览弹窗 -->
    <Modal
      v-model:open="previewVisible"
      :title="previewTitle"
      width="90%"
      style="top: 20px"
      :footer="null"
      destroy-on-close
    >
      <div class="flex h-[80vh] flex-col items-center justify-center">
        <!-- 无效/演示数据提示 -->
        <div v-if="!previewUrl" class="text-center">
          <div class="mb-4 text-6xl opacity-20">📂</div>
          <p class="text-lg text-gray-500">演示数据不支持远程预览服务</p>
          <p class="text-gray-400">
            请上传真实文件到公网地址或部署私有化预览服务
          </p>
        </div>

        <!-- 图片预览 -->
        <Image
          v-else-if="
            ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(previewType)
          "
          :src="previewUrl"
          style="max-height: 75vh; object-fit: contain"
        />

        <!-- 文档预览 -->
        <iframe
          v-else-if="
            ['pdf', 'docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt'].includes(
              previewType,
            )
          "
          :src="previewUrl"
          width="100%"
          height="100%"
          frameborder="0"
        ></iframe>

        <!-- 兜底提示 -->
        <div
          v-else
          class="flex h-full flex-col items-center justify-center gap-4"
        >
          <div class="text-6xl opacity-20">🚫</div>
          <p class="text-gray-500">该文件类型不支持在线预览，请下载后查看</p>
          <Button type="primary" :href="previewUrl" target="_blank">
            下载文件
          </Button>
        </div>
      </div>
    </Modal>

    <!-- 发布/编辑弹窗 -->
    <Modal
      v-model:open="modalVisible"
      :title="editMode ? '修订知识文档' : '发布新知识'"
      @ok="handleSave"
      width="800px"
    >
      <div class="space-y-4 pt-4">
        <div>
          <label class="mb-1 block text-sm font-medium">标题</label>
          <Input v-model:value="formState.title" placeholder="请输入文档标题" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="mb-1 block text-sm font-medium">分类</label>
            <TreeSelect
              v-model:value="formState.categoryId"
              :tree-data="categoryTree"
              :field-names="{
                label: 'name',
                value: 'id',
                children: 'children',
              }"
              placeholder="请选择分类"
              tree-default-expand-all
              class="w-full"
            />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium">版本号</label>
            <Input v-model:value="formState.version" placeholder="V1.0" />
          </div>
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium">摘要 (200字以内)</label>
          <Input.TextArea
            v-model:value="formState.summary"
            :rows="2"
            placeholder="简要描述文档内容..."
          />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium">标签</label>
          <Select
            v-model:value="formState.tags"
            mode="tags"
            class="w-full"
            placeholder="请输入标签并回车确认"
            :options="[]"
          />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium"
            >正文内容 (支持 HTML/Markdown)</label
          >
          <Input.TextArea
            v-model:value="formState.content"
            :rows="8"
            placeholder="输入详细知识内容..."
          />
        </div>

        <!-- 附件上传 -->
        <div>
          <label class="mb-2 block text-sm font-medium"
            >附件上传 (支持图片/PDF/Office)</label
          >
          <Upload.Dragger
            v-model:file-list="fileList"
            name="file"
            action="/api/upload"
            :multiple="true"
            @change="handleUploadChange"
          >
            <p class="ant-upload-drag-icon">
              <span class="i-lucide-inbox text-4xl text-blue-500"></span>
            </p>
            <p class="ant-upload-text">点击或将文件拖拽到此区域上传</p>
            <p class="ant-upload-hint">
              支持 PDF、Docx、Xlsx、Pptx 以及各种常用图片格式
            </p>
          </Upload.Dragger>
        </div>
      </div>
    </Modal>

    <!-- 分类管理弹窗 -->
    <Modal
      v-model:open="categoryModalVisible"
      :title="categoryEditMode ? '修改分类' : '新建分类'"
      @ok="handleSaveCategory"
      width="400px"
    >
      <div class="space-y-4 pt-4">
        <div>
          <label class="mb-1 block text-sm font-medium">分类名称</label>
          <Input
            v-model:value="categoryForm.name"
            placeholder="请输入分类名称"
          />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium">备注/描述</label>
          <Input.TextArea
            v-model:value="categoryForm.description"
            :rows="2"
            placeholder="请输入分类描述"
          />
        </div>
      </div>
    </Modal>
  </Page>
</template>

<style scoped>
.prose h1 {
  @apply mb-4 text-2xl font-bold;
}

.prose h2 {
  @apply mb-3 mt-6 text-xl font-bold;
}

.prose h3 {
  @apply mb-2 mt-4 text-lg font-bold;
}

.prose p {
  @apply mb-4 leading-relaxed text-gray-600;
}
</style>
