<script lang="ts" setup>
import type { IEditorConfig, IToolbarConfig } from '@wangeditor/editor';

import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';

import { createEditor, createToolbar } from '@wangeditor/editor';

import '@wangeditor/editor/dist/css/style.css';

const props = defineProps({
  value: {
    type: String,
    default: '',
  },
  mode: {
    type: String,
    default: 'default',
  },
  placeholder: {
    type: String,
    default: '请输入内容...',
  },
  readOnly: {
    type: Boolean,
    default: false,
  },
  height: {
    type: String,
    default: '400px',
  },
});

const emit = defineEmits(['update:value', 'change']);

// 编辑器实例，必须用 shallowRef
const editorRef = shallowRef();

// DOM 元素引用
const editorContainerRef = ref<HTMLElement>();
const toolbarContainerRef = ref<HTMLElement>();

// 内容 HTML
const valueHtml = ref('');

// 监听 props.value 变化
watch(
  () => props.value,
  (val) => {
    const editor = editorRef.value;
    if (editor && !editor.isDestroyed() && val !== editor.getHtml()) {
      try {
        editor.setHtml(val);
      } catch (error) {
        console.warn('WangEditor setHtml error:', error);
      }
    }
  },
);

onMounted(() => {
  if (!editorContainerRef.value || !toolbarContainerRef.value) return;

  const editorConfig: Partial<IEditorConfig> = {
    placeholder: props.placeholder,
    readOnly: props.readOnly,
    MENU_CONF: {
      uploadImage: {
        server: '/api/upload',
        fieldName: 'file',
        maxFileSize: 5 * 1024 * 1024,
        allowedFileTypes: ['image/*'],
        meta: {},
        customInsert(res: any, insertFn: any) {
          if (res.code === 0 && res.data?.url) {
            insertFn(res.data.url, '', '');
          } else {
            console.error('上传失败', res);
          }
        },
      },
    },
    onChange(editor) {
      try {
        const html = editor.getHtml();
        valueHtml.value = html;
        emit('update:value', html);
        emit('change', html);
      } catch (error) {
        console.warn('WangEditor onChange error:', error);
      }
    },
  };

  try {
    const editor = createEditor({
      config: editorConfig,
      html: props.value || '',
      mode: props.mode as any,
      selector: editorContainerRef.value,
    });

    const toolbarConfig: Partial<IToolbarConfig> = {};

    createToolbar({
      config: toolbarConfig,
      editor,
      mode: props.mode as any,
      selector: toolbarContainerRef.value,
    });

    editorRef.value = editor;
  } catch (error) {
    console.error('WangEditor creation error:', error);
  }
});

// 组件销毁时，也及时销毁编辑器
onBeforeUnmount(() => {
  const editor = editorRef.value;
  if (!editor) return;
  try {
    editor.destroy();
  } catch (error) {
    console.warn('WangEditor destruction error:', error);
  }
});
</script>

<template>
  <div class="overflow-hidden rounded-sm border border-gray-300 bg-white">
    <!-- 工具栏容器 -->
    <div ref="toolbarContainerRef" class="border-b border-gray-200"></div>
    <!-- 编辑器容器 -->
    <div
      ref="editorContainerRef"
      :style="{ height, overflowY: 'hidden' }"
    ></div>
  </div>
</template>

<style scoped>
/* 修复 WangEditor 在 Modal 中 z-index 问题 */
:deep(.w-e-toolbar) {
  z-index: 10 !important;
}

:deep(.w-e-text-container) {
  z-index: 1 !important;
}
</style>
