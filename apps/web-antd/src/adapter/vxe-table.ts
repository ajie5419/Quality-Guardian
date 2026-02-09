import type {
  VxeGridProps,
  VxeTableGridOptions,
} from '@vben/plugins/vxe-table';

import { h, unref } from 'vue';

import { IconifyIcon } from '@vben/icons';
import {
  useVbenVxeGrid as _useVbenVxeGrid,
  setupVbenVxeTable,
} from '@vben/plugins/vxe-table';

import { Button, Image, Tooltip } from 'ant-design-vue';

import { useVbenForm } from './form';

// 引入 vxe-pc-ui 和 vxe-table 的样式，确保样式正确加载
import 'vxe-pc-ui/lib/style.css';
import 'vxe-table/lib/style.css';

// ---------------------------------------------------------
// 临时移除: VXETable.mixin 导致生产环境报错，回退到原生导出
// ---------------------------------------------------------
// import ExcelJS from 'exceljs';
// import { VXETable } from 'vxe-table';
// import { downloadFileFromBlob } from '@vben/utils';
/*
VXETable.mixin({
  exportMethods: { ... }
});
*/

setupVbenVxeTable({
  configVxeTable: (vxeUI) => {
    vxeUI.setConfig({
      grid: {
        align: 'center',
        border: false,
        columnConfig: {
          resizable: true,
        },
        rowConfig: {
          isHover: true,
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
        filterConfig: {
          remote: true,
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
          types: ['csv', 'html', 'txt'], // 暂时移除 xlsx
        },
        importConfig: {},
        printConfig: {},
        round: true,
        showOverflow: true,
        size: 'small',
        scrollY: { enabled: true, gt: 0 },
      } as VxeTableGridOptions,
    });

    // 表格配置项可以用 cellRender: { name: 'CellImage' },
    vxeUI.renderer.add('CellImage', {
      renderTableDefault(_renderOpts, params) {
        const { column, row } = params;
        // 包裹一层 div 避免 vxe-table 生产环境获取不到 DOM
        return [
          h('div', { class: 'flex justify-center items-center' }, [
            h(Image, { src: row[column.field], height: 30 }),
          ]),
        ];
      },
    });

    // 表格配置项可以用 cellRender: { name: 'CellLink' },
    vxeUI.renderer.add('CellLink', {
      renderTableDefault(renderOpts) {
        const { props } = renderOpts;
        // 包裹一层 span 避免 vxe-table 生产环境获取不到 DOM
        return [
          h('span', {}, [
            h(
              Button,
              { size: 'small', type: 'link' },
              { default: () => props?.text },
            ),
          ]),
        ];
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

        // 包裹一层 div 避免 vxe-table 生产环境获取不到 DOM (关键修复)
        return [
          h(
            'div',
            { class: 'flex justify-center items-center gap-1' },
            buttons,
          ),
        ];
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
  const gridOptions = unref(options.gridOptions) || {};
  const mergedOptions = {
    ...options,
    gridOptions: {
      height: 600,
      scrollY: { enabled: true, gt: 0 },
      ...gridOptions,
    },
    showSearchForm: options.showSearchForm ?? false,
  };
  return _useVbenVxeGrid(mergedOptions);
}

export { useVbenVxeGrid };

export type * from '@vben/plugins/vxe-table';
export type { VxeGridListeners } from 'vxe-table';
