import type {
  VxeGridProps,
  VxeTableGridOptions,
} from '@vben/plugins/vxe-table';

import { h } from 'vue';

import { IconifyIcon } from '@vben/icons';
import {
  useVbenVxeGrid as _useVbenVxeGrid,
  setupVbenVxeTable,
} from '@vben/plugins/vxe-table';

import { Button, Image, Tooltip } from 'ant-design-vue';
import ExcelJS from 'exceljs';
import VXETable from 'vxe-table';
import VXETablePluginExportXLSX from 'vxe-table-plugin-export-xlsx';

import { useVbenForm } from './form';

// 注册导出插件，支持 Excel/CSV 导出
// 需要传入 ExcelJS 库
VXETable.use(VXETablePluginExportXLSX, { ExcelJS });

setupVbenVxeTable({
  configVxeTable: (vxeUI) => {
    vxeUI.setConfig({
      grid: {
        align: 'center',
        border: false,
        columnConfig: {
          resizable: true,
        },
        minHeight: 180,
        formConfig: {
          // 全局禁用vxe-table的表单配置，使用formOptions
          enabled: false,
        },
        pagerConfig: {
          enabled: true,
          pageSize: 20,
          pageSizes: [10, 20, 50, 100],
          layouts: ['PrevPage', 'JumpNumber', 'NextPage', 'Sizes', 'Total'],
        },
        proxyConfig: {
          autoLoad: true,
          response: {
            result: 'items',
            total: 'total',
            list: 'items',
          },
          showActiveMsg: true,
          showResponseMsg: false,
        },
        // 全局工具栏配置 - 所有表格默认启用这些功能
        toolbarConfig: {
          title: '', // 隐藏表格标题
          export: true, // 导出
          refresh: true, // 刷新
          zoom: true, // 全屏
          custom: true, // 自定义列
        },
        // 全局导出配置
        exportConfig: {
          types: ['xlsx', 'csv', 'html', 'txt'],
        },
        importConfig: {},
        printConfig: {},
        round: true,
        showOverflow: true,
        size: 'small',
      } as VxeTableGridOptions,
    });

    // 表格配置项可以用 cellRender: { name: 'CellImage' },
    vxeUI.renderer.add('CellImage', {
      renderTableDefault(_renderOpts, params) {
        const { column, row } = params;
        return h(Image, { src: row[column.field] });
      },
    });

    // 表格配置项可以用 cellRender: { name: 'CellLink' },
    vxeUI.renderer.add('CellLink', {
      renderTableDefault(renderOpts) {
        const { props } = renderOpts;
        return h(
          Button,
          { size: 'small', type: 'link' },
          { default: () => props?.text },
        );
      },
    });

    // 注册 CellOperation 渲染器
    vxeUI.renderer.add('CellOperation', {
      renderTableDefault(renderOpts, params) {
        const { props } = renderOpts;
        const { row } = params;
        const { options = [], onClick } = props || {};
        const buttons = [];

        // 预设配置
        const presets: Record<string, any> = {
          edit: {
            text: '编辑',
            icon: 'lucide:edit',
            code: 'edit',
            title: '编辑',
          },
          delete: {
            text: '删除',
            icon: 'lucide:trash-2',
            danger: true,
            code: 'delete',
            title: '删除',
          },
        };

        for (const item of options) {
          let opt = item;
          // 如果是字符串，使用预设
          if (typeof item === 'string') {
            opt = presets[item] || { text: item, code: item };
          }

          // 创建按钮内容（图标）
          const content: any[] = [];
          if (opt.icon) {
            content.push(h(IconifyIcon, { class: 'size-4', icon: opt.icon }));
          } else {
            content.push(opt.text);
          }

          // 按钮属性
          const btnProps: any = {
            danger: opt.danger,
            onClick: () => {
              if (onClick) {
                onClick({ code: opt.code, row });
              }
            },
            size: 'small',
            type: 'link',
          };

          // 包装 Tooltip
          const btn = h(Button, btnProps, { default: () => content });

          if (opt.title) {
            buttons.push(
              h(Tooltip, { title: opt.title }, { default: () => btn }),
            );
          } else {
            buttons.push(btn);
          }
        }

        return buttons;
      },
    });

    // 这里可以自行扩展 vxe-table 的全局配置，比如自定义格式化
    // vxeUI.formats.add
  },
  useVbenForm,
});

// Wrapper to set default options
function useVbenVxeGrid<T extends Record<string, any> = any>(
  options: VxeGridProps<T>,
) {
  // Default showSearchForm to false if not explicitly set
  // This satisfies the user requirement to have search form collapsed/hidden by default
  const mergedOptions = {
    showSearchForm: false, // Default to hidden
    ...options,
  };
  return _useVbenVxeGrid(mergedOptions);
}

export { useVbenVxeGrid };

export type * from '@vben/plugins/vxe-table';
export type { VxeGridListeners } from 'vxe-table';
