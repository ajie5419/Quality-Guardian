import { defineOverridesPreferences } from '@vben/preferences';

/**
 * @description 项目配置文件
 * 只需要覆盖项目中的一部分配置，不需要的配置不用覆盖，会自动使用默认配置
 * !!! 更改配置后请清空缓存，否则可能不生效
 */
export const overridesPreferences = defineOverridesPreferences({
  // overrides
  app: {
    accessMode: 'mixed',
    name: import.meta.env.VITE_APP_TITLE,
  },
  // --- 添加下面这段 ---
  logo: {
    enable: true,
    source: '/logo.png', // 这里填写你想显示的图片路径
  },
  // --- 添加下面这段 ---
  theme: {
    mode: 'light', // 设置默认主题为浅色 (可选: 'dark' | 'light' | 'auto')
  },
  copyright: {
    companyName: '质量管理系统',
    companySiteLink: '',
    date: '2026',
    enable: true,
  },
  widget: {
    globalSearch: true,
  },
});
