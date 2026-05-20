import type { Linter } from 'eslint';

const restrictedImportIgnores = [
  '**/vite.config.mts',
  '**/tailwind.config.mjs',
  '**/postcss.config.mjs',
];

const customConfig: Linter.Config[] = [
  // shadcn-ui 内部组件是自动生成的，不做太多限制
  {
    files: ['packages/@core/ui-kit/shadcn-ui/**/**'],
    rules: {
      'vue/require-default-prop': 'off',
    },
  },
  {
    files: [
      'apps/**/**',
      'packages/effects/**/**',
      'packages/utils/**/**',
      'packages/types/**/**',
      'packages/locales/**/**',
    ],
    ignores: restrictedImportIgnores,
    rules: {
      'perfectionist/sort-interfaces': 'off',
      'perfectionist/sort-objects': 'off',
    },
  },
  {
    files: ['**/**.vue'],
    ignores: restrictedImportIgnores,
    rules: {
      'perfectionist/sort-objects': 'off',
    },
  },
  {
    // apps内部的一些基础规则
    files: ['apps/**/**'],
    ignores: restrictedImportIgnores,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['#/api/*'],
              message:
                'The #/api package cannot be imported, please use the @core package itself',
            },
            {
              group: ['#/layouts/*'],
              message:
                'The #/layouts package cannot be imported, please use the @core package itself',
            },
            {
              group: ['#/locales/*'],
              message:
                'The #/locales package cannot be imported, please use the @core package itself',
            },
            {
              group: ['#/stores/*'],
              message:
                'The #/stores package cannot be imported, please use the @core package itself',
            },
          ],
        },
      ],
      'perfectionist/sort-interfaces': 'off',
    },
  },
  {
    // @core内部组件，不能引入@vben/* 里面的包
    files: ['packages/@core/**/**'],
    ignores: restrictedImportIgnores,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@vben/*'],
              message:
                'The @core package cannot import the @vben package, please use the @core package itself',
            },
          ],
        },
      ],
    },
  },
  {
    // @core/shared内部组件，不能引入@vben/* 或者 @vben-core/* 里面的包
    files: ['packages/@core/base/**/**'],
    ignores: restrictedImportIgnores,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@vben/*', '@vben-core/*'],
              message:
                'The @vben-core/shared package cannot import the @vben package, please use the @core/shared package itself',
            },
          ],
        },
      ],
    },
  },

  {
    // 不能引入@vben/*里面的包
    files: [
      'packages/types/**/**',
      'packages/utils/**/**',
      'packages/icons/**/**',
      'packages/constants/**/**',
      'packages/styles/**/**',
      'packages/stores/**/**',
      'packages/preferences/**/**',
      'packages/locales/**/**',
    ],
    ignores: restrictedImportIgnores,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@vben/*'],
              message:
                'The @vben package cannot be imported, please use the @core package itself',
            },
          ],
        },
      ],
    },
  },
  {
    // 审计日志强制模板化：禁止 details 使用模板字符串直写
    files: ['apps/backend/**/**'],
    ignores: ['apps/backend/constants/audit-templates.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          message:
            'Audit log `details` cannot use template literals directly. Use `detailsTemplate` + `detailsVariables`, or `renderAuditTemplateText`.',
          selector:
            "Property[key.name='details'][value.type='TemplateLiteral'], Property[key.value='details'][value.type='TemplateLiteral']",
        },
      ],
    },
  },
  {
    // 审计日志强制模板化：recordAuditLog/recordBusinessAuditLog 禁止直接传 details
    files: ['apps/backend/api/**/**', 'apps/backend/services/**/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          message:
            'Do not pass raw `details` to recordAuditLog. Use `detailsTemplate` + `detailsVariables`.',
          selector:
            "CallExpression[callee.property.name='recordAuditLog'] Property[key.name='details'], CallExpression[callee.property.name='recordAuditLog'] Property[key.value='details']",
        },
        {
          message:
            'Do not pass raw `details` to recordBusinessAuditLog. Use `detailsTemplate` + `detailsVariables`.',
          selector:
            "CallExpression[callee.name='recordBusinessAuditLog'] Property[key.name='details'], CallExpression[callee.name='recordBusinessAuditLog'] Property[key.value='details']",
        },
      ],
    },
  },
  {
    // 已迁移模块的状态字典强制：禁止继续使用本地 STATUS_OPTIONS 常量
    files: [
      'apps/web-antd/src/views/qms/supplier/**/**',
      'apps/web-antd/src/views/qms/metrology/**/**',
      'apps/web-antd/src/views/qms/after-sales/**/**',
      'apps/web-antd/src/views/qms/inspection/issues/**/**',
      'apps/web-antd/src/views/qms/quality-loss/**/**',
      'apps/web-antd/src/views/qms/supervision/**/**',
      'apps/web-antd/src/views/qms/planning/itp/**/**',
      'apps/web-antd/src/views/qms/planning/dfmea/**/**',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          message:
            'Legacy local status constants are not allowed in migrated modules. Use dictionary options via useDictionaryOptions.',
          selector:
            "VariableDeclarator[id.name='STATUS_OPTIONS'], VariableDeclarator[id.name='PROJECT_STATUS_OPTIONS'], VariableDeclarator[id.name='ISSUE_STATUS_OPTIONS']",
        },
        {
          message:
            'Do not use inline dictType literals in migrated modules. Use QMS_DICTIONARY_TYPE_KEYS from @qgs/shared.',
          selector: "Property[key.name='dictType'][value.type='Literal']",
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/constants', '**/constants.ts'],
              importNames: ['STATUS_OPTIONS'],
              message:
                'Status options in migrated modules must come from dictionary APIs. Do not import local STATUS_OPTIONS constants.',
            },
          ],
        },
      ],
    },
  },
  {
    // 已迁移模块的工序字典强制：必须通过字典 API/共享 composable 加载，不得直接硬编码本地工序列表
    files: [
      'apps/web-antd/src/views/qms/inspection/issues/**/**',
      'apps/web-antd/src/views/qms/inspection/requests/**/**',
      'apps/web-antd/src/views/qms/inspection/records/**/**',
      'apps/web-antd/src/views/qms/planning/bom/**/**',
      'apps/web-antd/src/views/qms/planning/inspection-forms/**/**',
      'apps/web-antd/src/views/qms/workspace/**/**',
      'apps/web-antd/src/views/qms/planning/itp/**/**',
    ],
    ignores: [
      'apps/web-antd/src/views/qms/inspection/records/config.ts',
      'apps/web-antd/src/views/qms/shared/constants/inspection-process-fallback.ts',
      'apps/web-antd/src/views/qms/shared/composables/useDictionaryOptions.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '#/views/qms/inspection/records/config',
                '../records/config',
                '../../records/config',
              ],
              importNames: ['getProcessOptions'],
              message:
                'Migrated modules must not directly use local getProcessOptions fallback list. Use dictionary options via useDictionaryOptions/mapDictionaryOptions helpers.',
            },
          ],
        },
      ],
    },
  },
  {
    // 已迁移 QMS 枚举强制：禁止在迁移入口继续声明本地 enum，统一使用 @qgs/enums
    files: [
      'apps/web-antd/src/views/qms/quality-loss/types.ts',
      'apps/web-antd/src/views/qms/inspection/issues/types/index.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          message:
            'Do not define local `LossSource` enum. Use `LOSS_SOURCE` from @qgs/enums.',
          selector: "TSEnumDeclaration[id.name='LossSource']",
        },
        {
          message:
            'Do not define local `LossType` enum. Use `LOSS_TYPE` from @qgs/enums.',
          selector: "TSEnumDeclaration[id.name='LossType']",
        },
        {
          message:
            'Do not define local `ClaimStatus` enum. Use `CLAIM_STATUS` from @qgs/enums.',
          selector: "TSEnumDeclaration[id.name='ClaimStatus']",
        },
        {
          message:
            'Do not define local `Severity` enum. Use `ISSUE_SEVERITY` from @qgs/enums.',
          selector: "TSEnumDeclaration[id.name='Severity']",
        },
        {
          message:
            'Do not define local `DeptType` enum. Use `ISSUE_DEPT_TYPE` from @qgs/enums.',
          selector: "TSEnumDeclaration[id.name='DeptType']",
        },
        {
          message:
            'Do not define local `DefectType` enum. Use `ISSUE_DEFECT_TYPE` from @qgs/enums.',
          selector: "TSEnumDeclaration[id.name='DefectType']",
        },
      ],
    },
  },
  {
    // 已迁移常量强制：禁止在迁移文件里回退到本地枚举派生常量
    files: [
      'apps/web-antd/src/views/qms/quality-loss/constants.ts',
      'apps/web-antd/src/views/qms/inspection/issues/constants.ts',
      'apps/web-antd/src/views/qms/inspection/records/config.ts',
      'apps/web-antd/src/views/qms/inspection/issues/supplier-constants.ts',
      'apps/web-antd/src/api/qms/enums.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          message:
            'Do not redefine local `LOSS_TYPE_OPTIONS`; use `QUALITY_LOSS_TYPE_OPTIONS` from @qgs/enums.',
          selector: "VariableDeclarator[id.name='LOSS_TYPE_OPTIONS'] > ArrayExpression.init",
        },
        {
          message:
            'Do not redefine local `QUALITY_LOSS_STATUS_FALLBACK_VALUES`; use `@qgs/enums` constants.',
          selector:
            "VariableDeclarator[id.name='QUALITY_LOSS_STATUS_FALLBACK_VALUES'] > ArrayExpression.init",
        },
        {
          message:
            'Do not redefine local `QUALITY_LOSS_STATUS_COLOR_MAP`; use `@qgs/enums` constants.',
          selector:
            "VariableDeclarator[id.name='QUALITY_LOSS_STATUS_COLOR_MAP'] > ObjectExpression.init",
        },
        {
          message:
            'Do not redefine local `SOURCE_STYLE_MAP`; use `QUALITY_LOSS_SOURCE_STYLE_MAP` from @qgs/enums.',
          selector: "VariableDeclarator[id.name='SOURCE_STYLE_MAP'] > ObjectExpression.init",
        },
      ],
    },
  },
  // 后端模拟代码，不需要太多规则
  {
    files: ['apps/backend-mock/**/**', 'docs/**/**'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
      'n/no-extraneous-import': 'off',
      'n/prefer-global/buffer': 'off',
      'n/prefer-global/process': 'off',
      'no-console': 'off',
      'unicorn/prefer-module': 'off',
    },
  },
  {
    files: ['**/**/playwright.config.ts'],
    rules: {
      'n/prefer-global/buffer': 'off',
      'n/prefer-global/process': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['internal/**/**', 'scripts/**/**'],
    rules: {
      'no-console': 'off',
    },
  },
];

export { customConfig };
